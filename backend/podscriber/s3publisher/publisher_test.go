package s3publisher

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"

	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber"
	"github.com/deepakjois/apps.debugjois.dev/backend/transcripts"
)

// fakeObject is an in-memory S3 object used by publisher tests.
type fakeObject struct {
	body string
	etag string
}

// fakeClient records writes and supports index refresh reads.
type fakeClient struct {
	objects map[string]fakeObject
	puts    []*s3.PutObjectInput
}

func (f *fakeClient) PutObject(_ context.Context, input *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	body, err := io.ReadAll(input.Body)
	if err != nil {
		return nil, err
	}
	f.puts = append(f.puts, input)
	key := aws.ToString(input.Key)
	f.objects[key] = fakeObject{body: string(body), etag: fmt.Sprintf("etag-%d", len(f.puts))}
	return &s3.PutObjectOutput{}, nil
}

func (f *fakeClient) ListObjectsV2(_ context.Context, input *s3.ListObjectsV2Input, _ ...func(*s3.Options)) (*s3.ListObjectsV2Output, error) {
	keys := make([]string, 0, len(f.objects))
	for key := range f.objects {
		if strings.HasPrefix(key, aws.ToString(input.Prefix)) {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	objects := make([]s3types.Object, 0, len(keys))
	for _, key := range keys {
		objects = append(objects, s3types.Object{Key: aws.String(key)})
	}
	return &s3.ListObjectsV2Output{Contents: objects}, nil
}

func (f *fakeClient) GetObject(_ context.Context, input *s3.GetObjectInput, _ ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	object, ok := f.objects[aws.ToString(input.Key)]
	if !ok {
		return nil, fakeAPIError{code: "NoSuchKey"}
	}
	return &s3.GetObjectOutput{
		Body: io.NopCloser(strings.NewReader(object.body)),
		ETag: aws.String(object.etag),
	}, nil
}

// fakeAPIError supplies the AWS error code used for missing index objects.
type fakeAPIError struct {
	code string
}

func (e fakeAPIError) Error() string                 { return e.code }
func (e fakeAPIError) ErrorCode() string             { return e.code }
func (e fakeAPIError) ErrorMessage() string          { return e.code }
func (e fakeAPIError) ErrorFault() smithy.ErrorFault { return smithy.FaultClient }

func TestPublishWritesCompatibleDocumentAndRefreshesIndex(t *testing.T) {
	client := &fakeClient{objects: make(map[string]fakeObject)}
	result := testResult()

	if err := newPublisher(client, "test-bucket").Publish(context.Background(), result); err != nil {
		t.Fatalf("Publish() error = %v", err)
	}
	if len(client.puts) != 2 {
		t.Fatalf("PutObject calls = %d, want transcript and index", len(client.puts))
	}

	transcriptKey := aws.ToString(client.puts[0].Key)
	identity := `{"schema_version":1,"source":{"type":"podcast_addict","input":"shared payload","url":"https://podcastaddict.com/show/episode/123"},"metadata":{"title":"Example Episode","published_date":"2026-09-09","series":{"title":"Example Show","url":"https://example.com/show"},"extra":{"duration_display":"42 mins","share_title":"Shared title"}}}`
	wantKey := fmt.Sprintf("transcripts/example-show--example-episode--%x.json", sha256.Sum256([]byte(identity)))
	if transcriptKey != wantKey {
		t.Fatalf("transcript key = %q, want %q", transcriptKey, wantKey)
	}
	if got := aws.ToString(client.puts[0].ContentType); got != "application/json" {
		t.Fatalf("content type = %q", got)
	}

	var published document
	if err := json.Unmarshal([]byte(client.objects[transcriptKey].body), &published); err != nil {
		t.Fatalf("decode published transcript: %v", err)
	}
	if published.Podcast.Episode.Title != "Example Episode" || published.Podcast.Podcast.Title != "Example Show" {
		t.Fatalf("published metadata = %#v", published.Podcast)
	}
	if published.Podcast.Source.Type != podscriber.SourceTypePodcastAddict {
		t.Fatalf("published source type = %q", published.Podcast.Source.Type)
	}
	if string(published.Deepgram) != `{"metadata":{"created":"2026-09-10T12:00:00Z"}}` {
		t.Fatalf("published Deepgram payload = %s", published.Deepgram)
	}
	wantBody := `{"podcast":{"source":{"type":"podcast_addict","share_title":"Shared title","episode_url":"https://podcastaddict.com/show/episode/123"},"podcast":{"title":"Example Show","url":"https://example.com/show"},"episode":{"title":"Example Episode","published_date":"2026-09-09","duration":"42 mins"}},"deepgram":{"metadata":{"created":"2026-09-10T12:00:00Z"}}}`
	if got := client.objects[transcriptKey].body; got != wantBody {
		t.Fatalf("published body = %s, want %s", got, wantBody)
	}

	var index transcripts.Index
	if err := json.Unmarshal([]byte(client.objects[transcripts.IndexObjectKey].body), &index); err != nil {
		t.Fatalf("decode published index: %v", err)
	}
	if len(index.Transcripts) != 1 || index.Transcripts[0].Title != "Example Episode" || index.Transcripts[0].Date != "2026-09-09" {
		t.Fatalf("published index = %#v", index)
	}
}

func TestNewDocumentPreservesYouTubeSourceType(t *testing.T) {
	result := testResult()
	result.Source.Type = podscriber.SourceTypeYouTube
	result.Source.URL = "https://www.youtube.com/watch?v=example"
	// YouTube supplies plain text and seconds rather than HTML and a display label.
	result.Metadata.Extra = map[string]any{"video_id": "example"}
	result.Metadata.DurationSeconds = 3725
	result.Metadata.Description = "Intro <b>&</b> more\r\nSee \"https://example.com/a?x=1&y=2\".\n\n\nSponsor: https://sponsor.example/deal."

	got := newDocument(result)
	if got.Podcast.Source.Type != podscriber.SourceTypeYouTube {
		t.Fatalf("source type = %q", got.Podcast.Source.Type)
	}
	if got.Podcast.Episode.Duration != "1 hr 2 mins" {
		t.Fatalf("duration = %q", got.Podcast.Episode.Duration)
	}
	wantDescription := `<p>Intro &lt;b&gt;&amp;&lt;/b&gt; more<br>See &#34;<a href="https://example.com/a?x=1&amp;y=2" target="_blank" rel="noreferrer">https://example.com/a?x=1&amp;y=2</a>&#34;.</p>` +
		`<p>Sponsor: <a href="https://sponsor.example/deal" target="_blank" rel="noreferrer">https://sponsor.example/deal</a>.</p>`
	if got.Podcast.Episode.DescriptionHTML != wantDescription {
		t.Fatalf("description HTML = %s\nwant %s", got.Podcast.Episode.DescriptionHTML, wantDescription)
	}
}

func TestDurationDisplay(t *testing.T) {
	for _, tc := range []struct {
		metadata podscriber.Metadata
		want     string
	}{
		{podscriber.Metadata{DurationSeconds: 45}, "45 secs"},
		{podscriber.Metadata{DurationSeconds: 2550}, "43 mins"},
		{podscriber.Metadata{DurationSeconds: 3599}, "1 hr"},
		{podscriber.Metadata{DurationSeconds: 7260}, "2 hr 1 min"},
		{podscriber.Metadata{DurationSeconds: 7260, Extra: map[string]any{"duration_display": "121 mins"}}, "121 mins"},
		{podscriber.Metadata{}, ""},
	} {
		if got := durationDisplay(tc.metadata); got != tc.want {
			t.Errorf("durationDisplay(%v) = %q, want %q", tc.metadata.DurationSeconds, got, tc.want)
		}
	}
}

func TestPublishRejectsInvalidResult(t *testing.T) {
	client := &fakeClient{objects: make(map[string]fakeObject)}
	if err := newPublisher(client, "test-bucket").Publish(context.Background(), podscriber.TranscriptionResult{}); err == nil {
		t.Fatal("Publish() error = nil")
	}
	if len(client.puts) != 0 {
		t.Fatalf("PutObject calls = %d", len(client.puts))
	}
}

func testResult() podscriber.TranscriptionResult {
	return podscriber.TranscriptionResult{
		SchemaVersion: podscriber.SchemaVersion,
		Source: podscriber.Source{
			Type:  podscriber.SourceTypePodcastAddict,
			Input: "shared payload",
			URL:   "https://podcastaddict.com/show/episode/123",
		},
		Metadata: podscriber.Metadata{
			Title:         "Example Episode",
			PublishedDate: "2026-09-09",
			Series:        &podscriber.Series{Title: "Example Show", URL: "https://example.com/show"},
			Extra:         map[string]any{"share_title": "Shared title", "duration_display": "42 mins"},
		},
		Transcript: podscriber.Transcript{
			Text:     "Transcript text",
			Provider: "deepgram",
			Raw:      json.RawMessage(`{"metadata":{"created":"2026-09-10T12:00:00Z"}}`),
		},
	}
}
