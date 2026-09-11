package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

const (
	actionHealthCheck                 = "health-check"
	actionGetDailyLog                 = "get-daily-log"
	actionPostDailyLog                = "post-daily-log"
	actionQueuePodcastTranscription   = "queue-podcast-transcription"
	actionProcessPodcastTranscription = "process-podcast-transcription"
)

// directRequest reads the discriminator shared by every direct invocation.
type directRequest struct {
	Action string `json:"action"`
}

// eventType separates transport envelopes before dispatching application actions.
type eventType int

const (
	eventTypeAPIGateway eventType = iota
	eventTypeScheduled
	eventTypeDirect
)

// eventProbe reads only envelope discriminators, leaving action decoding separate.
type eventProbe struct {
	RequestContext *struct {
		HTTP *struct{} `json:"http"`
	} `json:"requestContext"`
	Source     string `json:"source"`
	DetailType string `json:"detail-type"`
}

func main() {
	lambda.Start(dispatchBackendEvent)
}

func classifyEvent(payload json.RawMessage) eventType {
	var probe eventProbe
	if err := json.Unmarshal(payload, &probe); err != nil {
		return eventTypeDirect
	}
	if probe.RequestContext != nil && probe.RequestContext.HTTP != nil {
		return eventTypeAPIGateway
	}
	if probe.Source != "" && probe.DetailType != "" {
		return eventTypeScheduled
	}
	return eventTypeDirect
}

func dispatchBackendEvent(ctx context.Context, payload json.RawMessage) (json.RawMessage, error) {
	switch classifyEvent(payload) {
	case eventTypeAPIGateway:
		return nil, errors.New("API Gateway events are not supported by the local backend port")
	case eventTypeScheduled:
		var event events.EventBridgeEvent
		if err := json.Unmarshal(payload, &event); err != nil {
			return nil, fmt.Errorf("unmarshal EventBridge event: %w", err)
		}
		log.Printf("Received scheduled event: source=%s detail-type=%s id=%s", event.Source, event.DetailType, event.ID)
		return json.Marshal(map[string]bool{"ok": true})
	default:
		return handleDirectLambdaEvent(ctx, payload)
	}
}

func handleDirectLambdaEvent(ctx context.Context, payload json.RawMessage) (json.RawMessage, error) {
	var request directRequest
	if err := json.Unmarshal(payload, &request); err != nil {
		return nil, fmt.Errorf("unmarshal direct invocation payload: %w", err)
	}
	switch strings.TrimSpace(request.Action) {
	case actionHealthCheck:
		return json.Marshal(map[string]bool{"ok": true})
	case actionGetDailyLog:
		return handleGetDailyLog(ctx)
	case actionPostDailyLog:
		var post postDailyLogRequest
		if err := json.Unmarshal(payload, &post); err != nil {
			return nil, fmt.Errorf("unmarshal %s payload: %w", actionPostDailyLog, err)
		}
		return handlePostDailyLog(ctx, post.Title, post.Contents)
	case actionQueuePodcastTranscription:
		var queue queuePodcastTranscriptionRequest
		if err := json.Unmarshal(payload, &queue); err != nil {
			return nil, fmt.Errorf("unmarshal %s payload: %w", actionQueuePodcastTranscription, err)
		}
		return handleQueuePodcastTranscription(ctx, queue.Text)
	case actionProcessPodcastTranscription:
		var process processPodcastTranscriptionRequest
		if err := json.Unmarshal(payload, &process); err != nil {
			return nil, fmt.Errorf("unmarshal %s payload: %w", actionProcessPodcastTranscription, err)
		}
		return handleProcessPodcastTranscription(ctx, process)
	default:
		return nil, errors.New("unknown direct invocation action")
	}
}
