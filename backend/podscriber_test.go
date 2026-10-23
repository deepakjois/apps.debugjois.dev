package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"

	awsmiddleware "github.com/aws/aws-sdk-go-v2/aws/middleware"
	awslambda "github.com/aws/aws-sdk-go-v2/service/lambda"
	"github.com/aws/aws-sdk-go-v2/service/lambda/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber/resolvers/miniflux"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber/resolvers/podcastaddict"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber/starred"
	"github.com/deepakjois/apps.debugjois.dev/backend/transcripts"
)

const legacyPodcast = `{"source":{"input":"https://podcastaddict.com/show/episode/123","episode_url":"https://podcastaddict.com/show/episode/123"},"podcast":{"title":"A Show","url":"https://example.com/show"},"episode":{"title":"Episode Two","published_at":"2026-04-29T12:34:56.123+00:00","published_date":"2026-04-29","audio_url":"https://example.com/audio.mp3","description_html":"Notes"}}`
const legacyWorker = `{"action":"process-podcast-transcription","podcast":` + legacyPodcast + `}`
const typedPodcast = `{"source":{"type":"podcast_addict","input":"https://podcastaddict.com/show/episode/123","episode_url":"https://podcastaddict.com/show/episode/123"},"podcast":{"title":"A Show","url":"https://example.com/show"},"episode":{"title":"Episode Two","published_at":"2026-04-29T12:34:56.123+00:00","published_date":"2026-04-29","audio_url":"https://example.com/audio.mp3","description_html":"Notes"}}`
const typedWorker = `{"action":"process-podcast-transcription","podcast":` + typedPodcast + `}`

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type invokeFunc func(*awslambda.InvokeInput) (*awslambda.InvokeOutput, error)

func (f invokeFunc) Invoke(_ context.Context, in *awslambda.InvokeInput, _ ...func(*awslambda.Options)) (*awslambda.InvokeOutput, error) {
	return f(in)
}

type completedPublisherFunc func(context.Context, podscriber.TranscriptionResult) error

func (f completedPublisherFunc) Publish(ctx context.Context, result podscriber.TranscriptionResult) error {
	return f(ctx, result)
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
			if *in.FunctionName != "backend-function" || in.InvocationType != types.InvocationTypeEvent || string(in.Payload) != typedWorker {
				t.Fatalf("unexpected invocation: %+v payload=%s", in, in.Payload)
			}
			out := &awslambda.InvokeOutput{}
			awsmiddleware.SetRequestIDMetadata(&out.ResultMetadata, "aws-request-123")
			return out, nil
		}), "backend-function", podcast)
	}
	body, err := dispatchBackendEvent(context.Background(), json.RawMessage(`{"action":"queue-podcast-transcription","text":"  https://podcastaddict.com/show/episode/123  "}`))
	want := `{"podcast":` + typedPodcast + `,"transcription_lambda_id":"aws-request-123"}`
	if err != nil || string(body) != want {
		t.Fatalf("got %s err=%v; want %s", body, err, want)
	}
	if _, err := handleQueuePodcastTranscription(context.Background(), queuePodcastTranscriptionRequest{Text: "  "}); err == nil {
		t.Fatal("accepted empty text")
	}
	wantErr := errors.New("invoke failed")
	invokePodcastWorker = func(context.Context, podcastPayload) (string, error) { return "", wantErr }
	if _, err := handleQueuePodcastTranscription(context.Background(), queuePodcastTranscriptionRequest{Text: "https://podcastaddict.com/show/episode/123"}); !errors.Is(err, wantErr) {
		t.Fatalf("lost invoke error: %v", err)
	}
}

func TestQueueRejectsUnsupportedSourcesBeforeFetching(t *testing.T) {
	oldClient := newMinifluxClient
	t.Cleanup(func() { newMinifluxClient = oldClient })
	noNetwork := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		t.Fatalf("fetched %s for an unsupported source", r.URL)
		return nil, nil
	})}
	newMinifluxClient = func() (*miniflux.Client, error) {
		return miniflux.New(miniflux.Config{BaseURL: "https://reader.example.com", Token: "secret", HTTPClient: noNetwork})
	}

	for _, input := range []string{
		"https://www.youtube.com/watch?v=example",
		"https://cdn.example.com/episode.mp3",
		"https://reader.example.com/feed/3",
		"https://other.example.com/feed/3/entry/7",
	} {
		_, err := handleQueuePodcastTranscription(context.Background(), queuePodcastTranscriptionRequest{Text: input})
		if !errors.Is(err, errUnsupportedQueueSource) {
			t.Fatalf("input %q: error = %v", input, err)
		}
	}

	t.Setenv(miniflux.TokenEnv, "")
	newMinifluxClient = oldClient
	_, err := handleQueuePodcastTranscription(context.Background(), queuePodcastTranscriptionRequest{Text: "https://reader.miniflux.app/starred/entry/7"})
	if !errors.Is(err, errUnsupportedQueueSource) || !strings.Contains(err.Error(), miniflux.TokenEnv) {
		t.Fatalf("unconfigured Miniflux error = %v", err)
	}
}

func TestQueueMinifluxStarredLoop(t *testing.T) {
	fixture, err := os.ReadFile("podscriber/resolvers/miniflux/testdata/planet-money-entry.json")
	if err != nil {
		t.Fatal(err)
	}
	var podcastEntry miniflux.Entry
	if err := json.Unmarshal(fixture, &podcastEntry); err != nil {
		t.Fatal(err)
	}
	article := miniflux.Entry{ID: 5, FeedID: 9, Title: "An article", URL: "https://example.com/article"}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Header.Get("X-Auth-Token") != "secret":
			w.WriteHeader(http.StatusUnauthorized)
		case r.URL.Path == "/v1/entries" && r.URL.Query().Get("starred") == "true":
			_ = json.NewEncoder(w).Encode(map[string]any{"total": 2, "entries": []miniflux.Entry{podcastEntry, article}})
		case r.URL.Path == fmt.Sprintf("/v1/entries/%d", podcastEntry.ID):
			_, _ = w.Write(fixture)
		default:
			t.Errorf("unexpected Miniflux request %s", r.URL)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(server.Close)

	oldClient, oldDispatcher, oldInvoke, oldExists := newMinifluxClient, newSelfQueueDispatcher, invokePodcastWorker, transcriptExists
	oldTranscribe, oldPersist, oldUnstar := transcribePodcast, persistPodcastTranscript, unstarMinifluxEntry
	t.Cleanup(func() {
		newMinifluxClient, newSelfQueueDispatcher, invokePodcastWorker, transcriptExists = oldClient, oldDispatcher, oldInvoke, oldExists
		transcribePodcast, persistPodcastTranscript, unstarMinifluxEntry = oldTranscribe, oldPersist, oldUnstar
	})
	newMinifluxClient = func() (*miniflux.Client, error) {
		return miniflux.New(miniflux.Config{BaseURL: server.URL, Token: "secret"})
	}
	var selfPayloads []string
	newSelfQueueDispatcher = func(context.Context) (starred.Dispatcher, error) {
		return starred.LambdaDispatcher(invokeFunc(func(in *awslambda.InvokeInput) (*awslambda.InvokeOutput, error) {
			selfPayloads = append(selfPayloads, string(in.Payload))
			body, err := dispatchBackendEvent(context.Background(), in.Payload)
			if err != nil {
				return &awslambda.InvokeOutput{FunctionError: aws.String("Unhandled"), Payload: []byte(strconv.Quote(err.Error()))}, nil
			}
			return &awslambda.InvokeOutput{Payload: body}, nil
		}), "backend"), nil
	}
	var queued []podcastPayload
	invokePodcastWorker = func(_ context.Context, podcast podcastPayload) (string, error) {
		queued = append(queued, podcast)
		return "worker-1", nil
	}
	published := map[string]bool{}
	transcriptExists = func(_ context.Context, key string) (bool, error) { return published[key], nil }

	runStarred := func() starred.Report {
		t.Helper()
		body, err := dispatchBackendEvent(context.Background(), json.RawMessage(`{"action":"queue-miniflux-starred"}`))
		if err != nil {
			t.Fatal(err)
		}
		var report starred.Report
		if err := json.Unmarshal(body, &report); err != nil {
			t.Fatal(err)
		}
		return report
	}

	report := runStarred()
	entryURL := fmt.Sprintf("%s/feed/%d/entry/%d", server.URL, podcastEntry.FeedID, podcastEntry.ID)
	wantSelf := `{"action":"queue-podcast-transcription","text":"` + entryURL + `","skip_existing":true}`
	if len(selfPayloads) != 1 || selfPayloads[0] != wantSelf {
		t.Fatalf("self invocations = %q, want [%s]", selfPayloads, wantSelf)
	}
	if report.Counts[starred.StatusQueued] != 1 || report.Counts[starred.StatusNoAudio] != 1 || report.Entries[0].TranscriptionLambdaID != "worker-1" {
		t.Fatalf("first report = %+v", report)
	}
	if len(queued) != 1 {
		t.Fatalf("queued %d workers", len(queued))
	}
	podcast := queued[0]
	if podcast.Source.Type != podscriber.SourceTypeMiniflux || podcast.Source.Input != entryURL || podcast.Podcast.Title != "Planet Money" ||
		!strings.HasPrefix(podcast.Episode.AudioURL, "https://tracking.swap.fm/") || podcast.Episode.Duration != "32 mins" {
		t.Fatalf("queued podcast = %+v", podcast)
	}

	workerEvent, err := json.Marshal(processPodcastTranscriptionRequest{Action: actionProcessPodcastTranscription, Podcast: podcast})
	if err != nil {
		t.Fatal(err)
	}
	transcribePodcast = func(_ context.Context, input podscriber.TranscriptionInput) (podscriber.TranscriptionResult, error) {
		if input.Source.Type != podscriber.SourceTypeMiniflux || input.Source.Input != entryURL {
			t.Fatalf("worker input source = %+v", input.Source)
		}
		return podscriber.TranscriptionResult{Transcript: podscriber.Transcript{Raw: json.RawMessage(`{}`)}}, nil
	}
	persistPodcastTranscript = func(_ context.Context, action string, p podcastPayload, body []byte) error {
		var document transcriptResponse
		if err := json.Unmarshal(body, &document); err != nil {
			t.Fatal(err)
		}
		if document.Podcast.Source.Type != podscriber.SourceTypeMiniflux {
			t.Fatalf("published source type = %q", document.Podcast.Source.Type)
		}
		key, err := transcriptObjectKey(action, p)
		published[key] = true
		return err
	}
	var unstarred []string
	unstarMinifluxEntry = func(_ context.Context, entryURL string) error {
		if len(published) != 1 {
			t.Fatal("unstarred before the transcript was persisted")
		}
		unstarred = append(unstarred, entryURL)
		return errors.New("Miniflux unavailable")
	}
	if _, err := dispatchBackendEvent(context.Background(), workerEvent); err != nil || len(published) != 1 {
		t.Fatalf("worker err=%v published=%v", err, published)
	}
	if len(unstarred) != 1 || unstarred[0] != entryURL {
		t.Fatalf("unstarred = %q, want [%s]", unstarred, entryURL)
	}

	report = runStarred()
	if len(queued) != 1 || report.Counts[starred.StatusAlreadyTranscribed] != 1 ||
		!strings.HasPrefix(report.Entries[0].ExistingTranscript, transcripts.LocationPrefix+"planet-money--anatomy-of-a-movie-market--") {
		t.Fatalf("second run queued=%d report=%+v", len(queued), report)
	}

	newSelfQueueDispatcher = func(context.Context) (starred.Dispatcher, error) {
		t.Fatal("dry run created a dispatcher")
		return nil, nil
	}
	body, err := dispatchBackendEvent(context.Background(), json.RawMessage(`{"action":"queue-miniflux-starred","dry_run":true}`))
	if err != nil || !strings.Contains(string(body), `"counts":{"dry_run":1,"no_audio":1}`) {
		t.Fatalf("dry run body=%s err=%v", body, err)
	}
}

func TestPublishCompletedTranscriptionAction(t *testing.T) {
	oldFactory := newCompletedPublisher
	t.Cleanup(func() { newCompletedPublisher = oldFactory })
	var published podscriber.TranscriptionResult
	newCompletedPublisher = func(context.Context) (completedTranscriptPublisher, error) {
		return completedPublisherFunc(func(_ context.Context, result podscriber.TranscriptionResult) error {
			published = result
			return nil
		}), nil
	}
	payload := `{"action":"publish-completed-transcription","transcription":{"schema_version":1,"source":{"type":"youtube","input":"https://youtu.be/example","url":"https://www.youtube.com/watch?v=example"},"metadata":{"title":"Video","published_date":"2026-09-10"},"transcript":{"text":"Transcript","provider":"deepgram","raw":{"results":{}}}}}`
	body, err := dispatchBackendEvent(context.Background(), json.RawMessage(payload))
	if err != nil || string(body) != `{"ok":true}` {
		t.Fatalf("body=%s err=%v", body, err)
	}
	if published.Source.Type != podscriber.SourceTypeYouTube || published.Metadata.Title != "Video" || string(published.Transcript.Raw) != `{"results":{}}` {
		t.Fatalf("published = %#v", published)
	}

	called := false
	newCompletedPublisher = func(context.Context) (completedTranscriptPublisher, error) {
		called = true
		return nil, errors.New("must not be called")
	}
	if _, err := dispatchBackendEvent(context.Background(), json.RawMessage(`{"action":"publish-completed-transcription","transcription":{}}`)); err == nil || !strings.Contains(err.Error(), "unsupported schema version") {
		t.Fatalf("invalid payload error = %v", err)
	}
	if called {
		t.Fatal("created publisher for invalid payload")
	}
}

func TestWorkerLegacyContract(t *testing.T) {
	oldTranscribe, oldPersist, oldUnstar := transcribePodcast, persistPodcastTranscript, unstarMinifluxEntry
	t.Cleanup(func() {
		transcribePodcast, persistPodcastTranscript, unstarMinifluxEntry = oldTranscribe, oldPersist, oldUnstar
	})
	unstarMinifluxEntry = func(context.Context, string) error {
		t.Fatal("unstarred a Podcast Addict episode")
		return nil
	}
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
	want := `{"podcast":` + typedPodcast + `,"deepgram":{"metadata":{"request_id":"dg-456"},"results":{}}}`
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
