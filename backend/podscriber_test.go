package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	awsmiddleware "github.com/aws/aws-sdk-go-v2/aws/middleware"
	awslambda "github.com/aws/aws-sdk-go-v2/service/lambda"
	"github.com/aws/aws-sdk-go-v2/service/lambda/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber/resolvers/podcastaddict"
	"github.com/deepakjois/apps.debugjois.dev/backend/transcripts"
)

// Literal legacy JSON pins field order, omission rules, and nested envelopes.
const legacyPodcast = `{"source":{"input":"https://podcastaddict.com/show/episode/123","episode_url":"https://podcastaddict.com/show/episode/123"},"podcast":{"title":"A Show","url":"https://example.com/show"},"episode":{"title":"Episode Two","published_at":"2026-04-29T12:34:56.123+00:00","published_date":"2026-04-29","audio_url":"https://example.com/audio.mp3","description_html":"Notes"}}`
const legacyWorker = `{"action":"process-podcast-transcription","podcast":` + legacyPodcast + `}`

// roundTripFunc serves a synthetic Podcast Addict page without network access.
type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

// invokeFunc records AWS invocation options and returns request metadata.
type invokeFunc func(*awslambda.InvokeInput) (*awslambda.InvokeOutput, error)

func (f invokeFunc) Invoke(_ context.Context, in *awslambda.InvokeInput, _ ...func(*awslambda.Options)) (*awslambda.InvokeOutput, error) {
	return f(in)
}

func TestQueueLegacyContract(t *testing.T) {
	oldExtract, oldInvoke := extractPodcast, invokePodcastWorker
	t.Cleanup(func() { extractPodcast, invokePodcastWorker = oldExtract, oldInvoke })
	extractPodcast = podcastaddict.New(&http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://podcastaddict.com/show/episode/123" {
			t.Fatal(r.URL)
		}
		page := `<script type="application/ld+json">{"@type":"PodcastEpisode","name":"Episode Two","datePublished":"2026-04-29T12:34:56.123+00:00","associatedMedia":{"contentUrl":"https://example.com/audio.mp3"},"partOfSeries":{"name":"A Show","url":"https://example.com/show"}}</script><div id="episode_body">Notes</div>`
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(page))}, nil
	})}).Extract
	invokePodcastWorker = func(ctx context.Context, podcast podcastPayload) (string, error) {
		return invokeWorker(ctx, invokeFunc(func(in *awslambda.InvokeInput) (*awslambda.InvokeOutput, error) {
			if *in.FunctionName != "backend-function" || in.InvocationType != types.InvocationTypeEvent || string(in.Payload) != legacyWorker {
				t.Fatalf("unexpected invocation: %+v payload=%s", in, in.Payload)
			}
			out := &awslambda.InvokeOutput{}
			awsmiddleware.SetRequestIDMetadata(&out.ResultMetadata, "aws-request-123")
			return out, nil
		}), "backend-function", podcast)
	}
	body, err := dispatchBackendEvent(context.Background(), json.RawMessage(`{"action":"queue-podcast-transcription","text":"  https://podcastaddict.com/show/episode/123  "}`))
	want := `{"podcast":` + legacyPodcast + `,"transcription_lambda_id":"aws-request-123"}`
	if err != nil || string(body) != want {
		t.Fatalf("got %s err=%v; want %s", body, err, want)
	}
	if _, err := handleQueuePodcastTranscription(context.Background(), "  "); err == nil {
		t.Fatal("accepted empty text")
	}
	wantErr := errors.New("invoke failed")
	invokePodcastWorker = func(context.Context, podcastPayload) (string, error) { return "", wantErr }
	if _, err := handleQueuePodcastTranscription(context.Background(), "https://podcastaddict.com/show/episode/123"); !errors.Is(err, wantErr) {
		t.Fatalf("lost invoke error: %v", err)
	}
}

func TestQueueRejectsNonPodcastAddictSourcesBeforeResolution(t *testing.T) {
	oldExtract := extractPodcast
	t.Cleanup(func() { extractPodcast = oldExtract })
	extractPodcast = func(context.Context, string) (podscriber.TranscriptionInput, error) {
		t.Fatal("resolved an unsupported Lambda source")
		return podscriber.TranscriptionInput{}, nil
	}

	for _, input := range []string{
		"https://www.youtube.com/watch?v=example",
		"https://cdn.example.com/episode.mp3",
	} {
		_, err := handleQueuePodcastTranscription(context.Background(), input)
		if err == nil || err.Error() != "unsupported Lambda transcription source: only Podcast Addict URLs are supported" {
			t.Fatalf("input %q: error = %v", input, err)
		}
	}
}

func TestWorkerLegacyContract(t *testing.T) {
	oldTranscribe, oldPersist := transcribePodcast, persistPodcastTranscript
	t.Cleanup(func() { transcribePodcast, persistPodcastTranscript = oldTranscribe, oldPersist })
	transcribePodcast = func(_ context.Context, input podscriber.TranscriptionInput) (podscriber.TranscriptionResult, error) {
		if err := input.Validate(); err != nil {
			t.Fatal(err)
		}
		if input.Media.URL != "https://example.com/audio.mp3" {
			t.Fatalf("wrong audio: %+v", input)
		}
		return podscriber.TranscriptionResult{Transcript: podscriber.Transcript{Raw: json.RawMessage(`{"metadata":{"request_id":"dg-456"},"results":{}}`)}}, nil
	}
	var saved []byte
	persistPodcastTranscript = func(_ context.Context, action string, p podcastPayload, body []byte) error {
		if action != actionProcessPodcastTranscription || p.Episode.Title != "Episode Two" {
			t.Fatalf("wrong persistence identity: %s %+v", action, p)
		}
		saved = body
		return nil
	}
	body, err := dispatchBackendEvent(context.Background(), json.RawMessage(legacyWorker))
	want := `{"podcast":` + legacyPodcast + `,"deepgram":{"metadata":{"request_id":"dg-456"},"results":{}}}`
	if err != nil || string(body) != want || string(saved) != want {
		t.Fatalf("body=%s saved=%s err=%v", body, saved, err)
	}
	wantErr := errors.New("S3 failed")
	persistPodcastTranscript = func(context.Context, string, podcastPayload, []byte) error { return wantErr }
	if body, err := dispatchBackendEvent(context.Background(), json.RawMessage(legacyWorker)); !errors.Is(err, wantErr) || body != nil {
		t.Fatalf("swallowed publish error: %s %v", body, err)
	}
	transcribePodcast = func(context.Context, podscriber.TranscriptionInput) (podscriber.TranscriptionResult, error) {
		return podscriber.TranscriptionResult{}, errors.New("Deepgram failed")
	}
	persistPodcastTranscript = func(context.Context, string, podcastPayload, []byte) error {
		t.Fatal("persisted failed transcription")
		return nil
	}
	if _, err := dispatchBackendEvent(context.Background(), json.RawMessage(legacyWorker)); err == nil || err.Error() != "Deepgram failed" {
		t.Fatalf("lost transcription error: %v", err)
	}
	if _, err := dispatchBackendEvent(context.Background(), json.RawMessage(`{"action":"process-podcast-transcription"}`)); err == nil || err.Error() != "podcast episode audio URL is missing" {
		t.Fatalf("missing audio: %v", err)
	}
	minimal := podcastPayload{Episode: podcastEpisode{AudioURL: "https://example.com/audio.mp3"}}
	if err := minimal.transcriptionInput().Validate(); err != nil {
		t.Fatalf("legacy audio-only worker rejected: %v", err)
	}
}

func TestInvokeWorkerErrors(t *testing.T) {
	t.Setenv("AWS_LAMBDA_FUNCTION_NAME", " ")
	if _, err := invokeSelfForPodcastTranscription(context.Background(), podcastPayload{}); err == nil {
		t.Fatal("missing function accepted")
	}
	for _, id := range []string{"", "  "} {
		_, err := invokeWorker(context.Background(), invokeFunc(func(*awslambda.InvokeInput) (*awslambda.InvokeOutput, error) {
			out := &awslambda.InvokeOutput{}
			awsmiddleware.SetRequestIDMetadata(&out.ResultMetadata, id)
			return out, nil
		}), "backend", podcastPayload{})
		if err == nil || !strings.Contains(err.Error(), "missing request ID") {
			t.Fatalf("err=%v", err)
		}
	}
}

// transcriptStore captures document writes and simulates index refresh failure.
type transcriptStore struct {
	key, body string
	listErr   error
}

func (s *transcriptStore) PutObject(_ context.Context, in *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	body, err := io.ReadAll(in.Body)
	s.key, s.body = *in.Key, string(body)
	return &s3.PutObjectOutput{}, err
}
func (s *transcriptStore) ListObjectsV2(context.Context, *s3.ListObjectsV2Input, ...func(*s3.Options)) (*s3.ListObjectsV2Output, error) {
	return nil, s.listErr
}
func (s *transcriptStore) GetObject(context.Context, *s3.GetObjectInput, ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	return nil, s.listErr
}

func TestLegacyPersistenceIdentity(t *testing.T) {
	var podcast podcastPayload
	if err := json.Unmarshal([]byte(legacyPodcast), &podcast); err != nil {
		t.Fatal(err)
	}
	// Hash literal legacy bytes, not the implementation's marshaled request.
	want := fmt.Sprintf("transcripts/a-show--episode-two--%x.json", sha256.Sum256([]byte(legacyWorker)))
	key, err := transcriptObjectKey(actionProcessPodcastTranscription, podcast)
	if err != nil || key != want {
		t.Fatalf("key=%s err=%v; want %s", key, err, want)
	}
	old := newTranscriptS3Client
	t.Cleanup(func() { newTranscriptS3Client = old })
	store := &transcriptStore{listErr: errors.New("index unavailable")}
	newTranscriptS3Client = func(context.Context) (transcripts.S3Client, error) { return store, nil }
	err = persistTranscript(context.Background(), actionProcessPodcastTranscription, podcast, []byte(`{"unchanged":true}`))
	if !errors.Is(err, store.listErr) || store.key != want || store.body != `{"unchanged":true}` {
		t.Fatalf("store=%+v err=%v", store, err)
	}
}
