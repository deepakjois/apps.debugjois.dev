package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/aws/aws-lambda-go/events"

	"github.com/deepakjois/apps.debugjois.dev/backend/internal/podcastaddict"
	"github.com/deepakjois/apps.debugjois.dev/backend/internal/transcribe"
)

const (
	actionHealthCheck                 = "health-check"
	actionQueuePodcastTranscription   = "queue-podcast-transcription"
	actionProcessPodcastTranscription = "process-podcast-transcription"
)

var transcribePodcastFunc = func(ctx context.Context, podcastPayload transcribe.DirectRequest) (transcribe.Result, error) {
	return transcribe.TranscribePodcast(ctx, podcastPayload.Podcast, nil)
}

var persistTranscriptResultFunc = podcastaddict.PersistTranscript

func dispatchBackendEvent(ctx context.Context, payload json.RawMessage) (json.RawMessage, error) {
	switch classifyEvent(payload) {
	case eventTypeAPIGateway:
		return nil, errors.New("API Gateway events are not supported by the local backend port")
	case eventTypeScheduled:
		var event events.EventBridgeEvent
		if err := json.Unmarshal(payload, &event); err != nil {
			return nil, fmt.Errorf("unmarshal EventBridge event: %w", err)
		}
		return handleScheduledLambdaEvent(event)
	default:
		return handleDirectLambdaEvent(ctx, payload)
	}
}

func handleScheduledLambdaEvent(event events.EventBridgeEvent) (json.RawMessage, error) {
	log.Printf("Received scheduled event: source=%s detail-type=%s id=%s", event.Source, event.DetailType, event.ID)

	return json.Marshal(map[string]bool{"ok": true})
}

func handleDirectLambdaEvent(ctx context.Context, payload json.RawMessage) (json.RawMessage, error) {
	log.Printf("Received direct invocation: %s", string(payload))

	var directRequest transcribe.DirectRequest
	if err := json.Unmarshal(payload, &directRequest); err != nil {
		return nil, fmt.Errorf("unmarshal direct invocation payload: %w", err)
	}

	switch strings.TrimSpace(directRequest.Action) {
	case actionHealthCheck:
		return json.Marshal(map[string]bool{"ok": true})
	case actionQueuePodcastTranscription:
		return handleQueuePodcastTranscription(ctx, directRequest.Text)
	case actionProcessPodcastTranscription:
		result, err := transcribePodcastFunc(ctx, directRequest)
		if err != nil {
			return nil, err
		}
		body, err := json.Marshal(result)
		if err != nil {
			return nil, fmt.Errorf("marshal transcript result: %w", err)
		}
		if isLambdaRuntime() {
			if err := persistTranscriptResultFunc(ctx, directRequest.Action, directRequest.Podcast, body); err != nil {
				return nil, err
			}
		}
		return body, nil
	default:
		return nil, &transcribe.Error{
			Kind: transcribe.ErrorKindInvalidInput,
			Err:  errors.New("unknown direct invocation action"),
		}
	}
}
