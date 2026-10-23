package transcripts

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

type fakeAPIError struct {
	code string
	msg  string
}

func (e *fakeAPIError) Error() string {
	return e.msg
}

func (e *fakeAPIError) ErrorCode() string {
	return e.code
}

func (e *fakeAPIError) ErrorMessage() string {
	return e.msg
}

func (e *fakeAPIError) ErrorFault() smithy.ErrorFault {
	return smithy.FaultClient
}

type fakeClient struct {
	listOutputs         []*s3.ListObjectsV2Output
	listCalls           int
	objects             map[string]fakeObject
	conditionalFailures int
	indexPutCalls       int
	lastIfMatch         string
	lastIfNoneMatch     string
	deletedKeys         []string
}

type fakeObject struct {
	body string
	etag string
}

func (f *fakeClient) ListObjectsV2(_ context.Context, _ *s3.ListObjectsV2Input, _ ...func(*s3.Options)) (*s3.ListObjectsV2Output, error) {
	if f.listCalls >= len(f.listOutputs) {
		return &s3.ListObjectsV2Output{}, nil
	}
	output := f.listOutputs[f.listCalls]
	f.listCalls++
	return output, nil
}

func (f *fakeClient) GetObject(_ context.Context, input *s3.GetObjectInput, _ ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	object, ok := f.objects[aws.ToString(input.Key)]
	if !ok {
		return nil, &fakeAPIError{code: "NoSuchKey", msg: "missing"}
	}
	return &s3.GetObjectOutput{
		Body: io.NopCloser(strings.NewReader(object.body)),
		ETag: aws.String(object.etag),
	}, nil
}

func (f *fakeClient) PutObject(_ context.Context, input *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	body, err := io.ReadAll(input.Body)
	if err != nil {
		return nil, err
	}

	key := aws.ToString(input.Key)
	if key == IndexObjectKey {
		f.indexPutCalls++
		f.lastIfMatch = aws.ToString(input.IfMatch)
		f.lastIfNoneMatch = aws.ToString(input.IfNoneMatch)
		if f.conditionalFailures > 0 {
			f.conditionalFailures--
			if current, ok := f.objects[IndexObjectKey]; ok {
				current.etag = fmt.Sprintf("etag-retry-%d", f.indexPutCalls)
				f.objects[IndexObjectKey] = current
			}
			return nil, &fakeAPIError{code: "ConditionalRequestConflict", msg: "conflict"}
		}
	}

	f.objects[key] = fakeObject{body: string(body), etag: fmt.Sprintf("etag-%d", f.indexPutCalls)}
	return &s3.PutObjectOutput{}, nil
}

func (f *fakeClient) DeleteObject(_ context.Context, input *s3.DeleteObjectInput, _ ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
	key := aws.ToString(input.Key)
	f.deletedKeys = append(f.deletedKeys, key)
	delete(f.objects, key)
	return &s3.DeleteObjectOutput{}, nil
}

func TestBuildIndexPreservesSourceMetadata(t *testing.T) {
	for _, tt := range []struct {
		name        string
		body        string
		sourceType  string
		podcastName string
	}{
		{"legacy podcast", `{"podcast":{"podcast":{"title":" The Town "}}}`, "", "The Town"},
		{"podcast addict", `{"podcast":{"source":{"type":"podcast_addict"},"podcast":{"title":"Signals and Threads"}}}`, "podcast_addict", "Signals and Threads"},
		{"miniflux", `{"input":{"source":{"type":"miniflux"},"metadata":{"series":{"title":"Oxide and Friends"}}}}`, "miniflux", "Oxide and Friends"},
		{"youtube channel", `{"podcast":{"source":{"type":"youtube"},"podcast":{"title":"Channel name"}}}`, "youtube", "Channel name"},
		{"v2 youtube", `{"input":{"source":{"type":"youtube"},"metadata":{"series":{"title":"Channel name"}}}}`, "youtube", "Channel name"},
		{"audio", `{"podcast":{"source":{"type":"audio_url"}}}`, "audio_url", ""},
		{"v2 audio", `{"input":{"source":{"type":"audio_url"}}}`, "audio_url", ""},
		{"missing metadata", `{}`, "", ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			client := &fakeClient{
				listOutputs: []*s3.ListObjectsV2Output{{
					Contents: []s3types.Object{{Key: aws.String("transcripts/example.json")}},
				}},
				objects: map[string]fakeObject{"transcripts/example.json": {body: tt.body}},
			}
			index, err := BuildIndex(context.Background(), client, BucketName, Index{})
			if err != nil {
				t.Fatal(err)
			}
			body, err := MarshalIndex(index)
			if err != nil {
				t.Fatal(err)
			}
			var published map[string][]map[string]any
			if err := json.Unmarshal(body, &published); err != nil {
				t.Fatal(err)
			}
			for key, want := range map[string]string{"source_type": tt.sourceType, "podcast_name": tt.podcastName} {
				got, present := published["transcripts"][0][key]
				if want == "" && present || want != "" && got != want {
					t.Fatalf("%s = %v, want %q (omitted if empty)", key, got, want)
				}
			}
		})
	}
}

func TestBuildIndexPrefersEpisodeTitleAndPublishedDate(t *testing.T) {
	client := &fakeClient{
		listOutputs: []*s3.ListObjectsV2Output{{
			Contents: []s3types.Object{{Key: aws.String("transcripts/example-episode.json")}, {Key: aws.String(IndexObjectKey)}},
		}},
		objects: map[string]fakeObject{
			"transcripts/example-episode.json": {
				body: mustMarshalDoc(t, map[string]any{
					"podcast": map[string]any{
						"source":  map[string]any{"share_title": "[Example Podcast] Shared title"},
						"podcast": map[string]any{"title": "Example Podcast"},
						"episode": map[string]any{"title": "Example Episode", "published_date": "2026-04-06"},
					},
					"deepgram": map[string]any{"metadata": map[string]any{"created": "2026-04-08T19:18:58.618Z"}},
				}),
			},
		},
	}

	index, err := BuildIndex(context.Background(), client, "debugjois-dev-site", Index{})
	if err != nil {
		t.Fatalf("BuildIndex returned error: %v", err)
	}

	if len(index.Transcripts) != 1 {
		t.Fatalf("expected 1 transcript, got %d", len(index.Transcripts))
	}

	got := index.Transcripts[0]
	if got.Title != "Example Episode" {
		t.Fatalf("unexpected title %q", got.Title)
	}
	if got.Location != "https://www.debugjois.dev/transcripts/example-episode.json" {
		t.Fatalf("unexpected location %q", got.Location)
	}
	if got.Date != "2026-04-06" {
		t.Fatalf("unexpected date %q", got.Date)
	}
}

func TestBuildIndexReadsBackendV2Payload(t *testing.T) {
	client := &fakeClient{
		listOutputs: []*s3.ListObjectsV2Output{{
			Contents: []s3types.Object{{Key: aws.String("transcripts/youtube-episode.json")}},
		}},
		objects: map[string]fakeObject{
			"transcripts/youtube-episode.json": {
				body: mustMarshalDoc(t, map[string]any{
					"input": map[string]any{
						"metadata": map[string]any{
							"title":          "YouTube Episode",
							"published_date": "2026-09-10",
						},
					},
					"transcript": map[string]any{
						"raw": map[string]any{"metadata": map[string]any{"created": "2026-09-11T12:00:00Z"}},
					},
				}),
			},
		},
	}

	index, err := BuildIndex(context.Background(), client, BucketName, Index{})
	if err != nil {
		t.Fatalf("BuildIndex() error = %v", err)
	}
	if len(index.Transcripts) != 1 {
		t.Fatalf("transcript count = %d", len(index.Transcripts))
	}
	if got := index.Transcripts[0]; got.Title != "YouTube Episode" || got.Date != "2026-09-10" {
		t.Fatalf("index item = %#v", got)
	}
}

func TestBuildIndexFallsBackToDeepgramCreatedDate(t *testing.T) {
	client := &fakeClient{
		listOutputs: []*s3.ListObjectsV2Output{{
			Contents: []s3types.Object{{Key: aws.String("transcripts/sample.json")}},
		}},
		objects: map[string]fakeObject{
			"transcripts/sample.json": {
				body: mustMarshalDoc(t, map[string]any{
					"podcast": map[string]any{
						"podcast": map[string]any{"title": "SampleLib Demo Podcast"},
						"episode": map[string]any{"title": "3 Second Audio Sample"},
					},
					"deepgram": map[string]any{"metadata": map[string]any{"created": "2026-04-08T18:30:10.753Z"}},
				}),
			},
		},
	}

	index, err := BuildIndex(context.Background(), client, "debugjois-dev-site", Index{})
	if err != nil {
		t.Fatalf("BuildIndex returned error: %v", err)
	}

	if got := index.Transcripts[0].Date; got != "2026-04-08" {
		t.Fatalf("unexpected fallback date %q", got)
	}
}

func TestBuildIndexSortsByDateStringDescending(t *testing.T) {
	client := &fakeClient{
		listOutputs: []*s3.ListObjectsV2Output{{
			Contents: []s3types.Object{
				{Key: aws.String("transcripts/older.json")},
				{Key: aws.String("transcripts/newer.json")},
				{Key: aws.String("transcripts/same-date.json")},
			},
		}},
		objects: map[string]fakeObject{
			"transcripts/older.json": {
				body: mustMarshalDoc(t, map[string]any{
					"podcast":  map[string]any{"episode": map[string]any{"title": "Older Episode", "published_date": "2026-04-06"}},
					"deepgram": map[string]any{"metadata": map[string]any{"created": "2026-04-08T18:30:10.753Z"}},
				}),
			},
			"transcripts/newer.json": {
				body: mustMarshalDoc(t, map[string]any{
					"podcast":  map[string]any{"episode": map[string]any{"title": "Newer Episode", "published_date": "2026-04-08"}},
					"deepgram": map[string]any{"metadata": map[string]any{"created": "2026-04-09T18:30:10.753Z"}},
				}),
			},
			"transcripts/same-date.json": {
				body: mustMarshalDoc(t, map[string]any{
					"podcast":  map[string]any{"episode": map[string]any{"title": "Alphabetical Tie", "published_date": "2026-04-08"}},
					"deepgram": map[string]any{"metadata": map[string]any{"created": "2026-04-09T19:30:10.753Z"}},
				}),
			},
		},
	}

	index, err := BuildIndex(context.Background(), client, BucketName, Index{})
	if err != nil {
		t.Fatalf("BuildIndex returned error: %v", err)
	}

	if len(index.Transcripts) != 3 {
		t.Fatalf("expected 3 transcripts, got %d", len(index.Transcripts))
	}

	gotTitles := []string{
		index.Transcripts[0].Title,
		index.Transcripts[1].Title,
		index.Transcripts[2].Title,
	}
	wantTitles := []string{"Alphabetical Tie", "Newer Episode", "Older Episode"}
	for i := range wantTitles {
		if gotTitles[i] != wantTitles[i] {
			t.Fatalf("unexpected title order %v", gotTitles)
		}
	}
}

func TestRefreshIndexUsesIfNoneMatchWhenIndexMissing(t *testing.T) {
	client := &fakeClient{
		listOutputs: []*s3.ListObjectsV2Output{{
			Contents: []s3types.Object{{Key: aws.String("transcripts/example.json")}},
		}},
		objects: map[string]fakeObject{
			"transcripts/example.json": {
				body: mustMarshalDoc(t, map[string]any{
					"podcast":  map[string]any{"episode": map[string]any{"title": "Example", "published_date": "2026-04-06"}},
					"deepgram": map[string]any{"metadata": map[string]any{"created": "2026-04-08T18:30:10.753Z"}},
				}),
			},
		},
	}

	if _, err := RefreshIndex(context.Background(), client, "debugjois-dev-site"); err != nil {
		t.Fatalf("RefreshIndex returned error: %v", err)
	}

	if client.lastIfNoneMatch != "*" {
		t.Fatalf("expected If-None-Match, got %q", client.lastIfNoneMatch)
	}
	if client.lastIfMatch != "" {
		t.Fatalf("expected no If-Match, got %q", client.lastIfMatch)
	}
}

func TestRefreshIndexRetriesConditionalConflictOnce(t *testing.T) {
	client := &fakeClient{
		listOutputs: []*s3.ListObjectsV2Output{{
			Contents: []s3types.Object{{Key: aws.String("transcripts/example.json")}},
		}, {
			Contents: []s3types.Object{{Key: aws.String("transcripts/example.json")}},
		}},
		objects: map[string]fakeObject{
			IndexObjectKey: {
				body: `{"transcripts":[]}`,
				etag: `"etag-1"`,
			},
			"transcripts/example.json": {
				body: mustMarshalDoc(t, map[string]any{
					"podcast":  map[string]any{"episode": map[string]any{"title": "Example", "published_date": "2026-04-06"}},
					"deepgram": map[string]any{"metadata": map[string]any{"created": "2026-04-08T18:30:10.753Z"}},
				}),
			},
		},
		conditionalFailures: 1,
	}

	if _, err := RefreshIndex(context.Background(), client, "debugjois-dev-site"); err != nil {
		t.Fatalf("RefreshIndex returned error: %v", err)
	}

	if client.indexPutCalls != 2 {
		t.Fatalf("expected 2 index writes, got %d", client.indexPutCalls)
	}
	if client.lastIfMatch != "etag-retry-1" {
		t.Fatalf("expected retry to use refreshed ETag, got %q", client.lastIfMatch)
	}
}

func TestRefreshIndexFailsAfterSecondConditionalConflict(t *testing.T) {
	client := &fakeClient{
		listOutputs: []*s3.ListObjectsV2Output{{
			Contents: []s3types.Object{{Key: aws.String("transcripts/example.json")}},
		}, {
			Contents: []s3types.Object{{Key: aws.String("transcripts/example.json")}},
		}},
		objects: map[string]fakeObject{
			IndexObjectKey: {
				body: `{"transcripts":[]}`,
				etag: `"etag-1"`,
			},
			"transcripts/example.json": {
				body: mustMarshalDoc(t, map[string]any{
					"podcast":  map[string]any{"episode": map[string]any{"title": "Example", "published_date": "2026-04-06"}},
					"deepgram": map[string]any{"metadata": map[string]any{"created": "2026-04-08T18:30:10.753Z"}},
				}),
			},
		},
		conditionalFailures: 2,
	}

	_, err := RefreshIndex(context.Background(), client, "debugjois-dev-site")
	if err == nil {
		t.Fatal("expected RefreshIndex to fail")
	}
	if !strings.Contains(err.Error(), "after retry") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRefreshIndexKeepsArchivedFlagsAndBackfillsLegacySourceTypes(t *testing.T) {
	episode := func(title, sourceType string) fakeObject {
		return fakeObject{body: mustMarshalDoc(t, map[string]any{
			"podcast": map[string]any{
				"source":  map[string]any{"type": sourceType},
				"episode": map[string]any{"title": title, "published_date": "2026-04-06"},
			},
		})}
	}
	client := &fakeClient{
		listOutputs: []*s3.ListObjectsV2Output{{
			Contents: []s3types.Object{{Key: aws.String("transcripts/a.json")}, {Key: aws.String("transcripts/b.json")}},
		}},
		objects: map[string]fakeObject{
			IndexObjectKey: {
				body: `{"transcripts":[{"title":"A","location":"` + LocationPrefix + `a.json","date":"2026-04-06","source_type":"podcast"},` +
					`{"title":"B","location":"` + LocationPrefix + `b.json","date":"2026-04-06","archived":true,"source_type":"podcast"}]}`,
				etag: `"etag-1"`,
			},
			"transcripts/a.json": episode("A", ""),
			"transcripts/b.json": episode("B", "youtube"),
		},
	}

	if _, err := RefreshIndex(context.Background(), client, "debugjois-dev-site"); err != nil {
		t.Fatalf("RefreshIndex returned error: %v", err)
	}

	written := client.objects[IndexObjectKey].body
	if strings.Contains(written, `"archived":false`) {
		t.Fatalf("unarchived items should omit the field: %s", written)
	}
	var index Index
	if err := json.Unmarshal([]byte(written), &index); err != nil {
		t.Fatalf("unmarshal written index: %v", err)
	}
	archived := map[string]bool{}
	for _, item := range index.Transcripts {
		archived[item.Title] = item.Archived
		wantSourceType := "podcast"
		if item.Title == "B" {
			wantSourceType = "youtube"
		}
		if item.SourceType != wantSourceType {
			t.Fatalf("source type = %q, want %q", item.SourceType, wantSourceType)
		}
	}
	if len(archived) != 2 || archived["A"] || !archived["B"] {
		t.Fatalf("unexpected archived flags %v", archived)
	}
}

func editFixture() (*fakeClient, IndexSnapshot) {
	items := []ListItem{
		{Title: "Keep", Location: LocationPrefix + "keep.json"},
		{Title: "Archive", Location: LocationPrefix + "archive.json"},
		{Title: "Unarchive", Location: LocationPrefix + "unarchive.json", Archived: true},
		{Title: "Delete", Location: LocationPrefix + "delete.json", Archived: true},
	}
	objects := map[string]fakeObject{IndexObjectKey: {body: "{}", etag: `"etag-1"`}}
	for _, item := range items {
		objects[ObjectPrefix+strings.TrimPrefix(item.Location, LocationPrefix)] = fakeObject{body: "{}"}
	}
	return &fakeClient{objects: objects}, IndexSnapshot{Index: Index{Transcripts: items}, ETag: `"etag-1"`, Exists: true}
}

var editChanges = map[string]ItemState{
	LocationPrefix + "archive.json":   Archived,
	LocationPrefix + "unarchive.json": Active,
	LocationPrefix + "delete.json":    Deleted,
}

func TestEditIndexArchivesUnarchivesAndDeletes(t *testing.T) {
	client, _ := editFixture()
	client.objects[IndexObjectKey] = fakeObject{
		body: `{"transcripts":[
			{"title":"Keep","location":"` + LocationPrefix + `keep.json","source_type":"youtube"},
			{"title":"Archive","location":"` + LocationPrefix + `archive.json","source_type":"miniflux","podcast_name":"The LRB Podcast"},
			{"title":"Unarchive","location":"` + LocationPrefix + `unarchive.json","source_type":"podcast_addict","podcast_name":"Overthink","archived":true},
			{"title":"Delete","location":"` + LocationPrefix + `delete.json","source_type":"audio_url","archived":true}
		]}`,
		etag: `"etag-1"`,
	}
	snapshot, err := ReadIndex(context.Background(), client, "debugjois-dev-site")
	if err != nil {
		t.Fatalf("ReadIndex returned error: %v", err)
	}

	if _, err := EditIndex(context.Background(), client, "debugjois-dev-site", snapshot, editChanges); err != nil {
		t.Fatalf("EditIndex returned error: %v", err)
	}

	if client.lastIfMatch != `"etag-1"` {
		t.Fatalf("expected If-Match on the snapshot ETag, got %q", client.lastIfMatch)
	}
	var index Index
	if err := json.Unmarshal([]byte(client.objects[IndexObjectKey].body), &index); err != nil {
		t.Fatalf("unmarshal written index: %v", err)
	}
	wantSources := map[string][2]string{
		"Keep":      {"youtube", ""},
		"Archive":   {"miniflux", "The LRB Podcast"},
		"Unarchive": {"podcast_addict", "Overthink"},
	}
	got := map[string]bool{}
	for _, item := range index.Transcripts {
		got[item.Title] = item.Archived
		if source := [2]string{item.SourceType, item.PodcastName}; source != wantSources[item.Title] {
			t.Fatalf("source metadata for %s = %v, want %v", item.Title, source, wantSources[item.Title])
		}
	}
	want := map[string]bool{"Keep": false, "Archive": true, "Unarchive": false}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("written index archived flags = %v, want %v", got, want)
	}
	if fmt.Sprint(client.deletedKeys) != "[transcripts/delete.json]" {
		t.Fatalf("unexpected deleted keys %v", client.deletedKeys)
	}
}

func TestEditIndexWritesNothingWhenIndexChanged(t *testing.T) {
	client, snapshot := editFixture()
	client.conditionalFailures = 1

	_, err := EditIndex(context.Background(), client, "debugjois-dev-site", snapshot, editChanges)
	if !errors.Is(err, ErrIndexChanged) {
		t.Fatalf("expected ErrIndexChanged, got %v", err)
	}
	if client.objects[IndexObjectKey].body != "{}" {
		t.Fatalf("index was overwritten: %s", client.objects[IndexObjectKey].body)
	}
	if len(client.deletedKeys) != 0 {
		t.Fatalf("deleted %v after a conflict", client.deletedKeys)
	}
}

func mustMarshalDoc(t *testing.T, doc map[string]any) string {
	t.Helper()
	body, err := json.Marshal(doc)
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}
	return string(body)
}
