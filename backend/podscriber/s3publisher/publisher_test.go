package s3publisher

import (
	"context"
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
	if !strings.HasPrefix(transcriptKey, "transcripts/example-show--example-episode--") || !strings.HasSuffix(transcriptKey, ".json") {
		t.Fatalf("transcript key = %q", transcriptKey)
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
	if string(published.Deepgram) != `{"metadata":{"created":"2026-09-10T12:00:00Z"}}` {
		t.Fatalf("published Deepgram payload = %s", published.Deepgram)
	}

	var index transcripts.Index
	if err := json.Unmarshal([]byte(client.objects[transcripts.IndexObjectKey].body), &index); err != nil {
		t.Fatalf("decode published index: %v", err)
	}
	if len(index.Transcripts) != 1 || index.Transcripts[0].Title != "Example Episode" || index.Transcripts[0].Date != "2026-09-09" {
		t.Fatalf("published index = %#v", index)
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
		Input: podscriber.TranscriptionInput{
			SchemaVersion: podscriber.SchemaVersion,
			Source: podscriber.Source{
				Type:  podscriber.SourceTypePodcastAddict,
				Input: "shared payload",
				URL:   "https://podcastaddict.com/show/episode/123",
			},
			Media: podscriber.Media{Type: podscriber.MediaTypeRemoteURL, URL: "https://cdn.example.com/audio.mp3"},
			Metadata: podscriber.Metadata{
				Title:         "Example Episode",
				PublishedDate: "2026-09-09",
				Series:        &podscriber.Series{Title: "Example Show", URL: "https://example.com/show"},
				Extra:         map[string]any{"share_title": "Shared title", "duration_display": "42 mins"},
			},
		},
		Transcript: podscriber.Transcript{
			Text:     "Transcript text",
			Provider: "deepgram",
			Raw:      json.RawMessage(`{"metadata":{"created":"2026-09-10T12:00:00Z"}}`),
		},
	}
}
