package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/deepakjois/apps.debugjois.dev/backend/internal/podcastaddict"
	"github.com/deepakjois/apps.debugjois.dev/backend/internal/transcribe"
)

func TestHandleDirectLambdaEventHealthCheck(t *testing.T) {
	body, err := handleDirectLambdaEvent(context.Background(), json.RawMessage(`{"action":"health-check"}`))
	if err != nil {
		t.Fatalf("health check: %v", err)
	}

	var got map[string]bool
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("unmarshal health response: %v", err)
	}
	if !got["ok"] {
		t.Fatalf("expected ok response, got %s", string(body))
	}
}

func TestHandleDirectLambdaEventRejectsMissingOrEmptyAction(t *testing.T) {
	for name, payload := range map[string]json.RawMessage{
		"missing": json.RawMessage(`{"text":"payload without action"}`),
		"empty":   json.RawMessage(`{"action":"  ","text":"payload with empty action"}`),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := handleDirectLambdaEvent(context.Background(), payload)
			if err == nil {
				t.Fatal("expected action to be rejected")
			}
			if transcribe.HTTPStatus(err) != 400 {
				t.Fatalf("expected HTTP 400 classification, got %d", transcribe.HTTPStatus(err))
			}
		})
	}
}

func TestHandleDirectLambdaEventRejectsOldActionNames(t *testing.T) {
	for _, action := range []string{"podcast-transcribe", "transcribe"} {
		t.Run(action, func(t *testing.T) {
			payload, err := json.Marshal(map[string]string{"action": action, "text": "payload"})
			if err != nil {
				t.Fatalf("marshal payload: %v", err)
			}

			_, err = handleDirectLambdaEvent(context.Background(), payload)
			if err == nil {
				t.Fatal("expected old action name to be rejected")
			}
			if transcribe.HTTPStatus(err) != 400 {
				t.Fatalf("expected HTTP 400 classification, got %d", transcribe.HTTPStatus(err))
			}
		})
	}
}

func TestHandleDirectLambdaEventUnknownAction(t *testing.T) {
	_, err := handleDirectLambdaEvent(context.Background(), json.RawMessage(`{"action":"unknown"}`))
	if err == nil {
		t.Fatal("expected unknown action error")
	}
	if transcribe.HTTPStatus(err) != 400 {
		t.Fatalf("expected HTTP 400 classification, got %d", transcribe.HTTPStatus(err))
	}
}

func TestHandleDirectLambdaEventProcessPodcastTranscriptionPersistsInLambdaRuntime(t *testing.T) {
	originalTranscribe := transcribePodcastFunc
	originalPersist := persistTranscriptResultFunc
	t.Setenv("AWS_LAMBDA_RUNTIME_API", "127.0.0.1")

	var persistedAction string
	var persistedPodcast podcastaddict.Result

	transcribePodcastFunc = func(_ context.Context, request transcribe.DirectRequest) (transcribe.Result, error) {
		if request.Action != actionProcessPodcastTranscription {
			t.Fatalf("expected process action, got %q", request.Action)
		}
		return transcribe.Result{Podcast: request.Podcast, Deepgram: json.RawMessage(`{"ok":true}`)}, nil
	}
	persistTranscriptResultFunc = func(_ context.Context, action string, podcast podcastaddict.Result, body []byte) error {
		persistedAction = action
		persistedPodcast = podcast
		if !json.Valid(body) {
			t.Fatalf("persisted body is not JSON: %s", string(body))
		}
		return nil
	}
	t.Cleanup(func() {
		transcribePodcastFunc = originalTranscribe
		persistTranscriptResultFunc = originalPersist
	})

	body, err := handleDirectLambdaEvent(context.Background(), json.RawMessage(`{
		"action":"process-podcast-transcription",
		"podcast":{"episode":{"title":"Episode","audio_url":"https://example.com/audio.mp3"}}
	}`))
	if err != nil {
		t.Fatalf("process podcast transcription: %v", err)
	}

	var got transcribe.Result
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("unmarshal process response: %v", err)
	}
	if got.Podcast.Episode.Title != "Episode" {
		t.Fatalf("expected episode title, got %#v", got.Podcast.Episode)
	}
	if persistedAction != actionProcessPodcastTranscription {
		t.Fatalf("expected persisted process action, got %q", persistedAction)
	}
	if persistedPodcast.Episode.Title != "Episode" {
		t.Fatalf("expected persisted podcast metadata, got %#v", persistedPodcast)
	}
}

func TestHandleDirectLambdaEventProcessPodcastTranscriptionSkipsPersistenceOutsideLambda(t *testing.T) {
	originalTranscribe := transcribePodcastFunc
	originalPersist := persistTranscriptResultFunc
	transcribePodcastFunc = func(_ context.Context, request transcribe.DirectRequest) (transcribe.Result, error) {
		return transcribe.Result{Podcast: request.Podcast, Deepgram: json.RawMessage(`{"ok":true}`)}, nil
	}
	persistTranscriptResultFunc = func(context.Context, string, podcastaddict.Result, []byte) error {
		t.Fatal("did not expect persistence outside Lambda runtime")
		return nil
	}
	t.Cleanup(func() {
		transcribePodcastFunc = originalTranscribe
		persistTranscriptResultFunc = originalPersist
	})

	if _, err := handleDirectLambdaEvent(context.Background(), json.RawMessage(`{"action":"process-podcast-transcription","podcast":{"episode":{"audio_url":"https://example.com/audio.mp3"}}}`)); err != nil {
		t.Fatalf("process podcast transcription: %v", err)
	}
}

func TestHandleDirectLambdaEventProcessPodcastTranscriptionPropagatesErrors(t *testing.T) {
	originalTranscribe := transcribePodcastFunc
	expected := errors.New("transcription failed")
	transcribePodcastFunc = func(context.Context, transcribe.DirectRequest) (transcribe.Result, error) {
		return transcribe.Result{}, expected
	}
	t.Cleanup(func() { transcribePodcastFunc = originalTranscribe })

	_, err := handleDirectLambdaEvent(context.Background(), json.RawMessage(`{"action":"process-podcast-transcription"}`))
	if !errors.Is(err, expected) {
		t.Fatalf("expected propagated error, got %v", err)
	}
}
