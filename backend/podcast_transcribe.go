package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	awsmiddleware "github.com/aws/aws-sdk-go-v2/aws/middleware"
	"github.com/aws/aws-sdk-go-v2/config"
	awslambdasdk "github.com/aws/aws-sdk-go-v2/service/lambda"
	awslambdatypes "github.com/aws/aws-sdk-go-v2/service/lambda/types"

	"github.com/deepakjois/apps.debugjois.dev/backend/internal/podcastaddict"
	"github.com/deepakjois/apps.debugjois.dev/backend/internal/transcribe"
)

// podcastTranscriptionQueuedResponse mirrors the deployed Lambda accepted response.
type podcastTranscriptionQueuedResponse struct {
	Podcast               podcastaddict.Result `json:"podcast"`
	TranscriptionLambdaID string               `json:"transcription_lambda_id"`
}

var (
	parsePodcastForTranscriptionFunc = func(ctx context.Context, text string) (podcastaddict.Result, error) {
		return podcastaddict.ParseEpisode(ctx, podcastaddict.NewHTTPClient(), text)
	}
	invokeSelfForPodcastTranscriptionFunc = invokeSelfForPodcastTranscription
	runLocalPodcastTranscriptionFunc      = func(ctx context.Context, podcast podcastaddict.Result) (transcribe.Result, error) {
		return transcribe.TranscribePodcast(ctx, podcast, nil)
	}
	newLocalTranscriptionIDFunc = func() string {
		return fmt.Sprintf("local-%d", time.Now().UnixNano())
	}
)

func handleQueuePodcastTranscription(ctx context.Context, text string) (json.RawMessage, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, &transcribe.Error{
			Kind: transcribe.ErrorKindInvalidInput,
			Err:  fmt.Errorf("text parameter is required"),
		}
	}

	podcast, err := parsePodcastForTranscriptionFunc(ctx, text)
	if err != nil {
		return nil, err
	}

	transcriptionID, err := podcastTranscriptionDispatcher()(ctx, podcast)
	if err != nil {
		return nil, err
	}

	return json.Marshal(podcastTranscriptionQueuedResponse{
		Podcast:               podcast,
		TranscriptionLambdaID: transcriptionID,
	})
}

func podcastTranscriptionDispatcher() func(context.Context, podcastaddict.Result) (string, error) {
	if isLambdaRuntime() {
		return func(ctx context.Context, podcast podcastaddict.Result) (string, error) {
			return invokeSelfForPodcastTranscriptionFunc(ctx, podcast)
		}
	}

	return func(_ context.Context, podcast podcastaddict.Result) (string, error) {
		id := newLocalTranscriptionIDFunc()
		go func(podcast podcastaddict.Result) {
			if _, err := runLocalPodcastTranscriptionFunc(context.Background(), podcast); err != nil {
				log.Printf("local podcast transcription failed: %v", err)
			}
		}(podcast)
		return id, nil
	}
}

func invokeSelfForPodcastTranscription(ctx context.Context, podcast podcastaddict.Result) (string, error) {
	functionName := strings.TrimSpace(os.Getenv("AWS_LAMBDA_FUNCTION_NAME"))
	if functionName == "" {
		return "", fmt.Errorf("AWS_LAMBDA_FUNCTION_NAME must be set in Lambda")
	}

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return "", fmt.Errorf("load AWS config for Lambda invoke: %w", err)
	}

	payload, err := json.Marshal(transcribe.DirectRequest{
		Action:  actionProcessPodcastTranscription,
		Podcast: podcast,
	})
	if err != nil {
		return "", fmt.Errorf("marshal transcription payload: %w", err)
	}

	client := awslambdasdk.NewFromConfig(cfg)
	output, err := client.Invoke(ctx, &awslambdasdk.InvokeInput{
		FunctionName:   &functionName,
		InvocationType: awslambdatypes.InvocationTypeEvent,
		Payload:        payload,
	})
	if err != nil {
		return "", fmt.Errorf("invoke Lambda for transcription: %w", err)
	}

	requestID, ok := awsmiddleware.GetRequestIDMetadata(output.ResultMetadata)
	if !ok || strings.TrimSpace(requestID) == "" {
		return "", fmt.Errorf("invoke Lambda for transcription: missing request ID")
	}

	return requestID, nil
}
