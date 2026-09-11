package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsmiddleware "github.com/aws/aws-sdk-go-v2/aws/middleware"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	awslambda "github.com/aws/aws-sdk-go-v2/service/lambda"
	"github.com/aws/aws-sdk-go-v2/service/lambda/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber/deepgram"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber/resolvers/podcastaddict"
	"github.com/deepakjois/apps.debugjois.dev/backend/transcripts"
)

// podcastPayload retains the original public and asynchronous worker JSON schema.
type podcastPayload struct {
	Source  podcastSource  `json:"source"`
	Podcast podcastSeries  `json:"podcast"`
	Episode podcastEpisode `json:"episode"`
}

// podcastSource retains the share input and canonical episode page.
type podcastSource struct {
	Input      string `json:"input"`
	ShareTitle string `json:"share_title,omitempty"`
	EpisodeURL string `json:"episode_url"`
}

// podcastSeries is the deployed podcast metadata shape.
type podcastSeries struct {
	Title string `json:"title"`
	URL   string `json:"url,omitempty"`
}

// podcastEpisode includes the audio URL required by already-queued worker events.
type podcastEpisode struct {
	Title           string `json:"title"`
	PublishedAt     string `json:"published_at,omitempty"`
	PublishedDate   string `json:"published_date,omitempty"`
	Duration        string `json:"duration,omitempty"`
	AudioURL        string `json:"audio_url,omitempty"`
	DescriptionHTML string `json:"description_html"`
}

// queuedResponse is the accepted response consumed by the admin UI.
type queuedResponse struct {
	Podcast               podcastPayload `json:"podcast"`
	TranscriptionLambdaID string         `json:"transcription_lambda_id"`
}

// transcriptResponse is both the worker response and the persisted document.
type transcriptResponse struct {
	Podcast  podcastPayload  `json:"podcast"`
	Deepgram json.RawMessage `json:"deepgram"`
}

var (
	extractPodcast      = podcastaddict.New(nil).Extract
	invokePodcastWorker = invokeSelfForPodcastTranscription
	transcribePodcast   = func(ctx context.Context, input podscriber.TranscriptionInput) (podscriber.TranscriptionResult, error) {
		client, err := deepgram.New(os.Getenv("DEEPGRAM_API_KEY"))
		if err != nil {
			return podscriber.TranscriptionResult{}, err
		}
		return client.Transcribe(ctx, input)
	}
	persistPodcastTranscript = persistTranscript
	newTranscriptS3Client    = func(ctx context.Context) (transcripts.S3Client, error) {
		cfg, err := config.LoadDefaultConfig(ctx)
		if err != nil {
			return nil, fmt.Errorf("load AWS config for transcript upload: %w", err)
		}
		region, err := manager.GetBucketRegion(ctx, s3.NewFromConfig(cfg), transcripts.BucketName)
		if err != nil {
			return nil, fmt.Errorf("resolve transcript bucket region for %q: %w", transcripts.BucketName, err)
		}
		cfg.Region = region
		return s3.NewFromConfig(cfg), nil
	}
)

func handleQueuePodcastTranscription(ctx context.Context, text string) (json.RawMessage, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, errors.New("text parameter is required")
	}
	// Lambda queues only the deployed Podcast Addict workflow. The CLI owns
	// resolution for additional source types such as YouTube and audio URLs.
	if !podcastaddict.New(nil).CanHandle(text) {
		return nil, errors.New("unsupported Lambda transcription source: only Podcast Addict URLs are supported")
	}
	input, err := extractPodcast(ctx, text)
	if err != nil {
		return nil, err
	}
	podcast := podcastFromInput(input)
	id, err := invokePodcastWorker(ctx, podcast)
	if err != nil {
		return nil, err
	}
	return json.Marshal(queuedResponse{Podcast: podcast, TranscriptionLambdaID: id})
}

func handleProcessPodcastTranscription(ctx context.Context, request directRequest) (json.RawMessage, error) {
	if strings.TrimSpace(request.Podcast.Episode.AudioURL) == "" {
		return nil, errors.New("podcast episode audio URL is missing")
	}
	result, err := transcribePodcast(ctx, request.Podcast.transcriptionInput())
	if err != nil {
		return nil, err
	}
	body, err := json.Marshal(transcriptResponse{Podcast: request.Podcast, Deepgram: result.Transcript.Raw})
	if err != nil {
		return nil, fmt.Errorf("marshal transcript result: %w", err)
	}
	if err := persistPodcastTranscript(ctx, request.Action, request.Podcast, body); err != nil {
		return nil, err
	}
	return body, nil
}

func podcastFromInput(input podscriber.TranscriptionInput) podcastPayload {
	metadata := input.Metadata
	shareTitle, _ := metadata.Extra["share_title"].(string)
	duration, _ := metadata.Extra["duration_display"].(string)
	publishedAt, _ := metadata.Extra["published_at_raw"].(string)
	if publishedAt == "" && metadata.PublishedAt != nil {
		publishedAt = metadata.PublishedAt.Format(time.RFC3339Nano)
	}
	podcast := podcastPayload{
		Source: podcastSource{Input: input.Source.Input, ShareTitle: shareTitle, EpisodeURL: input.Source.URL},
		Episode: podcastEpisode{Title: metadata.Title, PublishedAt: publishedAt, PublishedDate: metadata.PublishedDate,
			Duration: duration, AudioURL: input.Media.URL, DescriptionHTML: metadata.DescriptionHTML},
	}
	if metadata.Series != nil {
		podcast.Podcast = podcastSeries{Title: metadata.Series.Title, URL: metadata.Series.URL}
	}
	return podcast
}

func (p podcastPayload) transcriptionInput() podscriber.TranscriptionInput {
	// Old worker events only required audio_url. Fill missing source identity for
	// the stricter internal contract without changing the echoed public payload.
	sourceURL := p.Source.EpisodeURL
	if strings.TrimSpace(sourceURL) == "" {
		sourceURL = p.Episode.AudioURL
	}
	input := p.Source.Input
	if strings.TrimSpace(input) == "" {
		input = sourceURL
	}
	return podscriber.TranscriptionInput{
		SchemaVersion: podscriber.SchemaVersion,
		Source:        podscriber.Source{Type: podscriber.SourceTypePodcastAddict, Input: input, URL: sourceURL},
		Media:         podscriber.Media{Type: podscriber.MediaTypeRemoteURL, URL: p.Episode.AudioURL},
		Metadata: podscriber.Metadata{Title: p.Episode.Title, DescriptionHTML: p.Episode.DescriptionHTML,
			PublishedDate: p.Episode.PublishedDate, Series: &podscriber.Series{Title: p.Podcast.Title, URL: p.Podcast.URL}},
	}
}

// lambdaInvoker allows the asynchronous AWS request to be verified without AWS writes.
type lambdaInvoker interface {
	Invoke(context.Context, *awslambda.InvokeInput, ...func(*awslambda.Options)) (*awslambda.InvokeOutput, error)
}

func invokeSelfForPodcastTranscription(ctx context.Context, podcast podcastPayload) (string, error) {
	functionName := strings.TrimSpace(os.Getenv("AWS_LAMBDA_FUNCTION_NAME"))
	if functionName == "" {
		return "", errors.New("AWS_LAMBDA_FUNCTION_NAME must be set in Lambda")
	}
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return "", fmt.Errorf("load AWS config for Lambda invoke: %w", err)
	}
	return invokeWorker(ctx, awslambda.NewFromConfig(cfg), functionName, podcast)
}

func invokeWorker(ctx context.Context, client lambdaInvoker, functionName string, podcast podcastPayload) (string, error) {
	payload, err := json.Marshal(directRequest{Action: actionProcessPodcastTranscription, Podcast: podcast})
	if err != nil {
		return "", fmt.Errorf("marshal transcription payload: %w", err)
	}
	output, err := client.Invoke(ctx, &awslambda.InvokeInput{
		FunctionName: &functionName, InvocationType: types.InvocationTypeEvent, Payload: payload,
	})
	if err != nil {
		return "", fmt.Errorf("invoke Lambda for transcription: %w", err)
	}
	id, ok := awsmiddleware.GetRequestIDMetadata(output.ResultMetadata)
	if !ok || strings.TrimSpace(id) == "" {
		return "", errors.New("invoke Lambda for transcription: missing request ID")
	}
	return id, nil
}

var transcriptSlugPattern = regexp.MustCompile(`[^a-z0-9]+`)

func transcriptObjectKey(action string, podcast podcastPayload) (string, error) {
	// Keep the legacy hash input and field order: changing these changes public URLs.
	payload, err := json.Marshal(struct {
		Action  string         `json:"action"`
		Podcast podcastPayload `json:"podcast"`
	}{action, podcast})
	if err != nil {
		return "", fmt.Errorf("marshal transcript payload hash input: %w", err)
	}
	slugPart := func(s string) string {
		return strings.Trim(transcriptSlugPattern.ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), "-"), "-")
	}
	var parts []string
	for _, title := range []string{podcast.Podcast.Title, podcast.Episode.Title} {
		if part := slugPart(title); part != "" {
			parts = append(parts, part)
		}
	}
	if len(parts) == 0 {
		for _, candidate := range []string{podcast.Source.ShareTitle, podcast.Source.EpisodeURL, podcast.Source.Input} {
			if part := slugPart(candidate); part != "" {
				parts = append(parts, part)
				break
			}
		}
	}
	slug := strings.Join(parts, "--")
	if len(slug) > 120 {
		slug = strings.Trim(slug[:120], "-")
	}
	if slug == "" {
		slug = "podcast-transcript"
	}
	return fmt.Sprintf("%s%s--%x.json", transcripts.ObjectPrefix, slug, sha256.Sum256(payload)), nil
}

func persistTranscript(ctx context.Context, action string, podcast podcastPayload, body []byte) error {
	key, err := transcriptObjectKey(action, podcast)
	if err != nil {
		return err
	}
	client, err := newTranscriptS3Client(ctx)
	if err != nil {
		return err
	}
	// The general v2 publisher intentionally has a different identity/document;
	// this transport retains the deployed document and retry-stable object key.
	_, err = client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(transcripts.BucketName), Key: aws.String(key),
		Body: bytes.NewReader(body), ContentType: aws.String("application/json"),
	})
	if err != nil {
		return fmt.Errorf("write transcript to s3://%s/%s: %w", transcripts.BucketName, key, err)
	}
	return transcripts.RefreshIndex(ctx, client, transcripts.BucketName)
}
