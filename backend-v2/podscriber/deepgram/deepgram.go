// Package deepgram implements prerecorded transcription with Deepgram.
package deepgram

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"

	deepgramapi "github.com/deepgram/deepgram-go-sdk/v3/pkg/api/listen/v1/rest"
	deepgramresponse "github.com/deepgram/deepgram-go-sdk/v3/pkg/api/listen/v1/rest/interfaces"
	deepgraminterfaces "github.com/deepgram/deepgram-go-sdk/v3/pkg/client/interfaces"
	deepgramclient "github.com/deepgram/deepgram-go-sdk/v3/pkg/client/listen"

	"github.com/deepakjois/apps.debugjois.dev/backend-v2/podscriber"
)

const Provider = "deepgram"

var initOnce sync.Once

type prerecordedClient interface {
	FromFile(ctx context.Context, file string, options *deepgraminterfaces.PreRecordedTranscriptionOptions) (*deepgramresponse.PreRecordedResponse, error)
	FromURL(ctx context.Context, url string, options *deepgraminterfaces.PreRecordedTranscriptionOptions) (*deepgramresponse.PreRecordedResponse, error)
}

// Transcriber synchronously transcribes local files and remote URLs.
type Transcriber struct {
	client prerecordedClient
}

func New(apiKey string) (*Transcriber, error) {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return nil, errors.New("configure Deepgram: API key is empty")
	}
	initOnce.Do(func() {
		deepgramclient.InitWithDefault()
	})
	restClient := deepgramclient.NewREST(apiKey, &deepgraminterfaces.ClientOptions{})
	return &Transcriber{client: deepgramapi.New(restClient)}, nil
}

func newTranscriber(client prerecordedClient) *Transcriber {
	return &Transcriber{client: client}
}

func (t *Transcriber) Transcribe(ctx context.Context, input podscriber.TranscriptionInput) (podscriber.TranscriptionResult, error) {
	if err := ctx.Err(); err != nil {
		return podscriber.TranscriptionResult{}, err
	}
	if err := input.Validate(); err != nil {
		return podscriber.TranscriptionResult{}, fmt.Errorf("transcribe media: %w", err)
	}
	if t == nil || t.client == nil {
		return podscriber.TranscriptionResult{}, errors.New("transcribe media: Deepgram client is nil")
	}

	var (
		response *deepgramresponse.PreRecordedResponse
		err      error
	)
	switch input.Media.Type {
	case podscriber.MediaTypeRemoteURL:
		response, err = t.client.FromURL(ctx, input.Media.URL, transcriptionOptions())
	case podscriber.MediaTypeLocalFile:
		info, statErr := os.Stat(input.Media.Path)
		if statErr != nil {
			return podscriber.TranscriptionResult{}, fmt.Errorf("transcribe media: stat local media: %w", statErr)
		}
		if !info.Mode().IsRegular() {
			return podscriber.TranscriptionResult{}, errors.New("transcribe media: local media is not a regular file")
		}
		response, err = t.client.FromFile(ctx, input.Media.Path, transcriptionOptions())
	default:
		return podscriber.TranscriptionResult{}, fmt.Errorf("transcribe media: unsupported media type %q", input.Media.Type)
	}
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return podscriber.TranscriptionResult{}, ctxErr
		}
		return podscriber.TranscriptionResult{}, fmt.Errorf("transcribe media with Deepgram: %w", deepgramError(err))
	}
	if response == nil || response.Results == nil || len(response.Results.Channels) == 0 || len(response.Results.Channels[0].Alternatives) == 0 {
		return podscriber.TranscriptionResult{}, errors.New("transcribe media with Deepgram: response does not contain a transcript alternative")
	}

	raw, err := json.Marshal(response)
	if err != nil {
		return podscriber.TranscriptionResult{}, fmt.Errorf("encode Deepgram response: %w", err)
	}
	requestID := response.RequestID
	if response.Metadata != nil && response.Metadata.RequestID != "" {
		requestID = response.Metadata.RequestID
	}
	return podscriber.TranscriptionResult{
		Input: input,
		Transcript: podscriber.Transcript{
			Text:      response.Results.Channels[0].Alternatives[0].Transcript,
			Provider:  Provider,
			RequestID: requestID,
			Raw:       json.RawMessage(raw),
		},
	}, nil
}

func transcriptionOptions() *deepgraminterfaces.PreRecordedTranscriptionOptions {
	return &deepgraminterfaces.PreRecordedTranscriptionOptions{
		Model:       "nova-3",
		Language:    "en",
		Diarize:     true,
		Paragraphs:  true,
		Punctuate:   true,
		Numerals:    true,
		SmartFormat: true,
		Utterances:  true,
	}
}

func deepgramError(err error) error {
	var statusErr *deepgraminterfaces.StatusError
	if errors.As(err, &statusErr) && statusErr.DeepgramError != nil && statusErr.DeepgramError.ErrMsg != "" {
		return errors.New(statusErr.DeepgramError.ErrMsg)
	}
	return err
}
