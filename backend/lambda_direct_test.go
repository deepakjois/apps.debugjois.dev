package main

import (
	"context"
	"encoding/base64"
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

func TestHandleDirectLambdaEventGetDailyLog(t *testing.T) {
	originalLoad := loadDailyLogContentFunc
	originalDate := currentDailyDateFunc
	loadDailyLogContentFunc = func(_ context.Context, date string) (string, error) {
		if date != "2026-04-29" {
			t.Fatalf("expected current date, got %q", date)
		}
		return "### 2026-04-29\n\nhello", nil
	}
	currentDailyDateFunc = func() string {
		return "2026-04-29"
	}
	t.Cleanup(func() {
		loadDailyLogContentFunc = originalLoad
		currentDailyDateFunc = originalDate
	})

	body, err := handleDirectLambdaEvent(context.Background(), json.RawMessage(`{"action":"get-daily-log"}`))
	if err != nil {
		t.Fatalf("get daily log: %v", err)
	}

	var got dailyLogResponse
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("unmarshal daily log response: %v", err)
	}
	if got.Title != "2026-04-29.md" {
		t.Fatalf("expected title, got %q", got.Title)
	}
	decoded, err := base64.StdEncoding.DecodeString(got.Contents)
	if err != nil {
		t.Fatalf("decode contents: %v", err)
	}
	if string(decoded) != "### 2026-04-29\n\nhello" {
		t.Fatalf("expected loaded content, got %q", string(decoded))
	}
}

func TestHandleDirectLambdaEventPostDailyLog(t *testing.T) {
	originalSave := saveDailyLogContentFunc
	originalDate := currentDailyDateFunc
	currentDailyDateFunc = func() string {
		return "2026-04-29"
	}

	var savedTitle string
	var savedContents string
	saveDailyLogContentFunc = func(_ context.Context, title, contents string) error {
		savedTitle = title
		savedContents = contents
		return nil
	}
	t.Cleanup(func() {
		saveDailyLogContentFunc = originalSave
		currentDailyDateFunc = originalDate
	})

	body, err := handleDirectLambdaEvent(context.Background(), json.RawMessage(`{
		"action":"post-daily-log",
		"title":"2026-04-29.md",
		"contents":"aGVsbG8="
	}`))
	if err != nil {
		t.Fatalf("post daily log: %v", err)
	}

	var got dailyLogResponse
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("unmarshal daily log response: %v", err)
	}
	if got.Title != "2026-04-29.md" || got.Contents != "aGVsbG8=" {
		t.Fatalf("unexpected response: %#v", got)
	}
	if savedTitle != "2026-04-29.md" || savedContents != "hello" {
		t.Fatalf("unexpected saved note: title=%q contents=%q", savedTitle, savedContents)
	}
}

func TestHandleDirectLambdaEventPostDailyLogRejectsInvalidPayloads(t *testing.T) {
	originalSave := saveDailyLogContentFunc
	originalDate := currentDailyDateFunc
	currentDailyDateFunc = func() string {
		return "2026-04-29"
	}
	saveDailyLogContentFunc = func(context.Context, string, string) error {
		t.Fatal("did not expect save for invalid payload")
		return nil
	}
	t.Cleanup(func() {
		saveDailyLogContentFunc = originalSave
		currentDailyDateFunc = originalDate
	})

	for name, payload := range map[string]json.RawMessage{
		"title mismatch": json.RawMessage(`{"action":"post-daily-log","title":"2026-04-28.md","contents":"aGVsbG8="}`),
		"bad base64":     json.RawMessage(`{"action":"post-daily-log","title":"2026-04-29.md","contents":"%%%"}`),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := handleDirectLambdaEvent(context.Background(), payload)
			if err == nil {
				t.Fatal("expected invalid payload to be rejected")
			}
			if transcribe.HTTPStatus(err) != 400 {
				t.Fatalf("expected HTTP 400 classification, got %d", transcribe.HTTPStatus(err))
			}
		})
	}
}

func TestHandleDirectLambdaEventDailyLogPropagatesStorageErrors(t *testing.T) {
	originalLoad := loadDailyLogContentFunc
	expected := errors.New("drive failed")
	loadDailyLogContentFunc = func(context.Context, string) (string, error) {
		return "", expected
	}
	t.Cleanup(func() {
		loadDailyLogContentFunc = originalLoad
	})

	_, err := handleDirectLambdaEvent(context.Background(), json.RawMessage(`{"action":"get-daily-log"}`))
	if !errors.Is(err, expected) {
		t.Fatalf("expected storage error, got %v", err)
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
