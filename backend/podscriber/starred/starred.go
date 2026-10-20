// Package starred queues transcription of the podcast episodes starred in
// Miniflux. It lists starred entries and hands each entry URL, one at a time,
// to a Dispatcher such as the backend Lambda's queue-podcast-transcription
// action, so the Lambda and local CLIs share the same iteration.
package starred

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	awslambda "github.com/aws/aws-sdk-go-v2/service/lambda"

	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber/resolvers/miniflux"
)

// QueueAction is the backend Lambda action that queues one source URL.
const QueueAction = "queue-podcast-transcription"

// Status is the outcome of one starred entry.
type Status string

const (
	// StatusQueued means the dispatcher started a transcription.
	StatusQueued Status = "queued"
	// StatusAlreadyTranscribed means a transcript of the episode already exists.
	StatusAlreadyTranscribed Status = "already_transcribed"
	// StatusNoAudio means the entry is not a podcast episode and was not dispatched.
	StatusNoAudio Status = "no_audio"
	// StatusDryRun means the entry would have been dispatched.
	StatusDryRun Status = "dry_run"
	// StatusFailed means dispatching the entry failed.
	StatusFailed Status = "failed"
)

// Dispatcher queues one Miniflux entry URL and returns the queue action's
// JSON response.
type Dispatcher func(ctx context.Context, entryURL string) (json.RawMessage, error)

// EntryResult reports what happened to one starred entry.
type EntryResult struct {
	EntryID               int64  `json:"entry_id"`
	Feed                  string `json:"feed,omitempty"`
	Title                 string `json:"title,omitempty"`
	URL                   string `json:"url"`
	Status                Status `json:"status"`
	TranscriptionLambdaID string `json:"transcription_lambda_id,omitempty"`
	ExistingTranscript    string `json:"existing_transcript,omitempty"`
	Error                 string `json:"error,omitempty"`
}

// Report lists every starred entry's outcome, newest first, with totals.
type Report struct {
	Entries []EntryResult  `json:"entries"`
	Counts  map[Status]int `json:"counts"`
}

// Failed is the number of entries whose dispatch failed.
func (r Report) Failed() int { return r.Counts[StatusFailed] }

type queueResponse struct {
	TranscriptionLambdaID string `json:"transcription_lambda_id"`
	ExistingTranscript    string `json:"existing_transcript"`
}

// Queue dispatches every starred entry with an audio enclosure, sequentially.
// A nil dispatch performs a dry run. Per-entry failures are recorded in the
// report rather than stopping the run; only listing failures return an error.
func Queue(ctx context.Context, client *miniflux.Client, dispatch Dispatcher) (Report, error) {
	if client == nil {
		return Report{}, errors.New("queue starred Miniflux entries: client is nil")
	}
	entries, err := client.StarredEntries(ctx)
	if err != nil {
		return Report{}, err
	}
	report := Report{Entries: make([]EntryResult, 0, len(entries)), Counts: map[Status]int{}}
	for _, entry := range entries {
		result := EntryResult{
			EntryID: entry.ID,
			Feed:    strings.TrimSpace(entry.Feed.Title),
			Title:   strings.TrimSpace(entry.Title),
			URL:     client.EntryURL(entry),
		}
		switch {
		case !miniflux.HasAudio(entry):
			result.Status = StatusNoAudio
		case dispatch == nil:
			result.Status = StatusDryRun
		default:
			dispatchEntry(ctx, dispatch, &result)
		}
		report.Entries = append(report.Entries, result)
		report.Counts[result.Status]++
	}
	return report, nil
}

func dispatchEntry(ctx context.Context, dispatch Dispatcher, result *EntryResult) {
	body, err := dispatch(ctx, result.URL)
	if err != nil {
		result.Status, result.Error = StatusFailed, err.Error()
		return
	}
	var response queueResponse
	if err := json.Unmarshal(body, &response); err != nil {
		result.Status, result.Error = StatusFailed, fmt.Sprintf("decode queue response: %v", err)
		return
	}
	result.TranscriptionLambdaID = response.TranscriptionLambdaID
	result.ExistingTranscript = response.ExistingTranscript
	result.Status = StatusQueued
	if response.ExistingTranscript != "" {
		result.Status = StatusAlreadyTranscribed
	}
}

// LambdaInvoker is the AWS Lambda client operation used by LambdaDispatcher.
type LambdaInvoker interface {
	Invoke(context.Context, *awslambda.InvokeInput, ...func(*awslambda.Options)) (*awslambda.InvokeOutput, error)
}

// QueueRequest is the queue-podcast-transcription payload sent per entry.
type QueueRequest struct {
	Action string `json:"action"`
	Text   string `json:"text"`
	// SkipExisting makes the action return the existing transcript instead of
	// transcribing an episode again.
	SkipExisting bool `json:"skip_existing,omitempty"`
}

// LambdaDispatcher synchronously invokes functionName's queue action for each
// entry URL, skipping episodes that already have a transcript. The action
// itself returns once the transcription worker is started asynchronously.
func LambdaDispatcher(client LambdaInvoker, functionName string) Dispatcher {
	return func(ctx context.Context, entryURL string) (json.RawMessage, error) {
		payload, err := json.Marshal(QueueRequest{Action: QueueAction, Text: entryURL, SkipExisting: true})
		if err != nil {
			return nil, fmt.Errorf("marshal %s payload: %w", QueueAction, err)
		}
		output, err := client.Invoke(ctx, &awslambda.InvokeInput{FunctionName: &functionName, Payload: payload})
		if err != nil {
			return nil, fmt.Errorf("invoke %s: %w", QueueAction, err)
		}
		if output.FunctionError != nil {
			return nil, fmt.Errorf("%s failed (%s): %s", QueueAction, *output.FunctionError, strings.TrimSpace(string(output.Payload)))
		}
		if len(output.Payload) == 0 || !json.Valid(output.Payload) {
			return nil, fmt.Errorf("%s returned an empty or invalid JSON response", QueueAction)
		}
		return json.RawMessage(output.Payload), nil
	}
}
