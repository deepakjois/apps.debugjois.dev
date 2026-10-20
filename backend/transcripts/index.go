package transcripts

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
)

const (
	BucketName     = "debugjois-dev-site"
	ObjectPrefix   = "transcripts/"
	IndexObjectKey = ObjectPrefix + "transcripts.json"
	LocationPrefix = "https://www.debugjois.dev/transcripts/"
)

type S3Client interface {
	ListObjectsV2(ctx context.Context, params *s3.ListObjectsV2Input, optFns ...func(*s3.Options)) (*s3.ListObjectsV2Output, error)
	GetObject(ctx context.Context, params *s3.GetObjectInput, optFns ...func(*s3.Options)) (*s3.GetObjectOutput, error)
	PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error)
}

// DeleteClient is the S3Client that EditIndex needs to delete transcripts.
type DeleteClient interface {
	S3Client
	DeleteObject(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error)
}

type Index struct {
	Transcripts []ListItem `json:"transcripts"`
}

type ListItem struct {
	Title    string `json:"title"`
	Location string `json:"location"`
	Date     string `json:"date"`
	Archived bool   `json:"archived,omitempty"`
}

type ItemState int

const (
	Active ItemState = iota
	Archived
	Deleted
)

func (item ListItem) State() ItemState {
	if item.Archived {
		return Archived
	}
	return Active
}

// ErrIndexChanged reports that the index object in S3 no longer matches the
// snapshot an edit was based on.
var ErrIndexChanged = errors.New("transcript index changed since it was read")

// IndexSnapshot is the index object as read from S3. Its ETag guards
// conditional writes based on it.
type IndexSnapshot struct {
	Index  Index
	ETag   string
	Exists bool
}

type document struct {
	Input struct {
		Metadata struct {
			Title         string `json:"title"`
			PublishedAt   string `json:"published_at"`
			PublishedDate string `json:"published_date"`
			Series        struct {
				Title string `json:"title"`
			} `json:"series"`
			Extra struct {
				ShareTitle string `json:"share_title"`
			} `json:"extra"`
		} `json:"metadata"`
	} `json:"input"`
	Transcript struct {
		Raw json.RawMessage `json:"raw"`
	} `json:"transcript"`

	Podcast struct {
		Source struct {
			ShareTitle string `json:"share_title"`
		} `json:"source"`
		Podcast struct {
			Title string `json:"title"`
		} `json:"podcast"`
		Episode struct {
			Title         string `json:"title"`
			PublishedAt   string `json:"published_at"`
			PublishedDate string `json:"published_date"`
		} `json:"episode"`
	} `json:"podcast"`
	Deepgram json.RawMessage `json:"deepgram"`
}

type deepgramMetadataEnvelope struct {
	Metadata struct {
		Created string `json:"created"`
	} `json:"metadata"`
}

// BuildIndex lists the transcript objects. Archived flags come from previous,
// because the transcript objects do not record them.
func BuildIndex(ctx context.Context, client S3Client, bucketName string, previous Index) (Index, error) {
	archived := make(map[string]bool)
	for _, item := range previous.Transcripts {
		if item.Archived {
			archived[item.Location] = true
		}
	}

	keys, err := listTranscriptKeys(ctx, client, bucketName)
	if err != nil {
		return Index{}, err
	}

	items := make([]ListItem, 0, len(keys))
	for _, key := range keys {
		doc, err := readTranscriptDocument(ctx, client, bucketName, key)
		if err != nil {
			return Index{}, err
		}

		location := LocationPrefix + path.Base(key)
		items = append(items, ListItem{
			Title:    transcriptTitle(doc, key),
			Location: location,
			Date:     transcriptDate(doc),
			Archived: archived[location],
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Date != items[j].Date {
			return items[i].Date > items[j].Date
		}
		return items[i].Title < items[j].Title
	})

	return Index{Transcripts: items}, nil
}

func MarshalIndex(index Index) ([]byte, error) {
	body, err := json.Marshal(index)
	if err != nil {
		return nil, fmt.Errorf("marshal transcript index: %w", err)
	}
	return body, nil
}

// RefreshIndex rebuilds the index from the transcript objects and writes it
// only if no one else wrote it meanwhile. It retries once on a conflict.
func RefreshIndex(ctx context.Context, client S3Client, bucketName string) (Index, error) {
	var lastErr error

	for attempt := 0; attempt < 2; attempt++ {
		snapshot, err := ReadIndex(ctx, client, bucketName)
		if err != nil {
			return Index{}, err
		}

		index, err := BuildIndex(ctx, client, bucketName, snapshot.Index)
		if err != nil {
			return Index{}, err
		}

		err = putIndexConditionally(ctx, client, bucketName, index, snapshot)
		if err == nil {
			return index, nil
		}
		if !errors.Is(err, ErrIndexChanged) {
			return Index{}, err
		}

		lastErr = err
	}

	return Index{}, fmt.Errorf("refresh transcript index after retry: %w", lastErr)
}

// EditIndex sets each item in changes, keyed by location, to its new state.
// It writes the index only if the object still matches snapshot, and returns
// ErrIndexChanged otherwise. It then deletes the transcript objects of the
// deleted items, so that a later rebuild does not list them again.
func EditIndex(ctx context.Context, client DeleteClient, bucketName string, snapshot IndexSnapshot, changes map[string]ItemState) (Index, error) {
	if !snapshot.Exists {
		return Index{}, fmt.Errorf("edit transcript index: s3://%s/%s does not exist", bucketName, IndexObjectKey)
	}

	known := make(map[string]bool, len(snapshot.Index.Transcripts))
	for _, item := range snapshot.Index.Transcripts {
		known[item.Location] = true
	}
	for location := range changes {
		if !known[location] {
			return Index{}, fmt.Errorf("edit transcript index: %s is not in the index", location)
		}
	}

	var edited Index
	var deleteKeys []string
	for _, item := range snapshot.Index.Transcripts {
		switch changes[item.Location] {
		case Deleted:
			key, err := objectKeyForLocation(item.Location)
			if err != nil {
				return Index{}, err
			}
			deleteKeys = append(deleteKeys, key)
			continue
		case Archived:
			item.Archived = true
		case Active:
			if _, changed := changes[item.Location]; changed {
				item.Archived = false
			}
		}
		edited.Transcripts = append(edited.Transcripts, item)
	}

	if err := putIndexConditionally(ctx, client, bucketName, edited, snapshot); err != nil {
		return Index{}, err
	}

	var errs []error
	for _, key := range deleteKeys {
		if _, err := client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: aws.String(bucketName),
			Key:    aws.String(key),
		}); err != nil {
			errs = append(errs, fmt.Errorf("delete s3://%s/%s: %w", bucketName, key, err))
		}
	}
	if err := errors.Join(errs...); err != nil {
		return edited, fmt.Errorf("index updated, but deleting transcripts failed: %w", err)
	}

	return edited, nil
}

func objectKeyForLocation(location string) (string, error) {
	name, ok := strings.CutPrefix(location, LocationPrefix)
	if !ok || name == "" || strings.Contains(name, "/") {
		return "", fmt.Errorf("transcript location %q is not under %s", location, LocationPrefix)
	}
	return ObjectPrefix + name, nil
}

func listTranscriptKeys(ctx context.Context, client S3Client, bucketName string) ([]string, error) {
	var keys []string
	var continuationToken *string

	for {
		output, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(bucketName),
			Prefix:            aws.String(ObjectPrefix),
			ContinuationToken: continuationToken,
		})
		if err != nil {
			return nil, fmt.Errorf("list transcript objects in s3://%s/%s: %w", bucketName, ObjectPrefix, err)
		}

		for _, object := range output.Contents {
			key := strings.TrimSpace(aws.ToString(object.Key))
			if key == "" || key == IndexObjectKey || !strings.HasSuffix(key, ".json") {
				continue
			}
			keys = append(keys, key)
		}

		if !aws.ToBool(output.IsTruncated) || output.NextContinuationToken == nil {
			break
		}
		continuationToken = output.NextContinuationToken
	}

	sort.Strings(keys)
	return keys, nil
}

func readTranscriptDocument(ctx context.Context, client S3Client, bucketName, key string) (document, error) {
	output, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(key),
	})
	if err != nil {
		return document{}, fmt.Errorf("read transcript from s3://%s/%s: %w", bucketName, key, err)
	}
	defer func() { _ = output.Body.Close() }()

	body, err := io.ReadAll(output.Body)
	if err != nil {
		return document{}, fmt.Errorf("read transcript body from s3://%s/%s: %w", bucketName, key, err)
	}

	var doc document
	if err := json.Unmarshal(body, &doc); err != nil {
		return document{}, fmt.Errorf("decode transcript JSON from s3://%s/%s: %w", bucketName, key, err)
	}

	return doc, nil
}

// ReadIndex reads the index object. A missing object yields an empty
// snapshot whose Exists is false.
func ReadIndex(ctx context.Context, client S3Client, bucketName string) (IndexSnapshot, error) {
	output, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(IndexObjectKey),
	})
	if err != nil {
		if isMissingObjectError(err) {
			return IndexSnapshot{}, nil
		}
		return IndexSnapshot{}, fmt.Errorf("read transcript index from s3://%s/%s: %w", bucketName, IndexObjectKey, err)
	}
	defer func() { _ = output.Body.Close() }()

	body, err := io.ReadAll(output.Body)
	if err != nil {
		return IndexSnapshot{}, fmt.Errorf("read transcript index from s3://%s/%s: %w", bucketName, IndexObjectKey, err)
	}

	var index Index
	if err := json.Unmarshal(body, &index); err != nil {
		return IndexSnapshot{}, fmt.Errorf("decode transcript index from s3://%s/%s: %w", bucketName, IndexObjectKey, err)
	}

	return IndexSnapshot{
		Index:  index,
		ETag:   strings.TrimSpace(aws.ToString(output.ETag)),
		Exists: true,
	}, nil
}

func putIndexConditionally(ctx context.Context, client S3Client, bucketName string, index Index, state IndexSnapshot) error {
	body, err := MarshalIndex(index)
	if err != nil {
		return err
	}

	input := &s3.PutObjectInput{
		Bucket:      aws.String(bucketName),
		Key:         aws.String(IndexObjectKey),
		Body:        bytes.NewReader(body),
		ContentType: aws.String("application/json"),
	}

	if state.Exists {
		input.IfMatch = aws.String(state.ETag)
	} else {
		input.IfNoneMatch = aws.String("*")
	}

	if _, err := client.PutObject(ctx, input); err != nil {
		if isConditionalWriteConflict(err) {
			return fmt.Errorf("write transcript index to s3://%s/%s: %w: %w", bucketName, IndexObjectKey, ErrIndexChanged, err)
		}
		return fmt.Errorf("write transcript index to s3://%s/%s: %w", bucketName, IndexObjectKey, err)
	}

	return nil
}

// NewS3Client returns an S3 client for the region that holds bucketName.
func NewS3Client(ctx context.Context, bucketName string) (*s3.Client, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("load AWS config: %w", err)
	}

	region, err := manager.GetBucketRegion(ctx, s3.NewFromConfig(cfg), bucketName)
	if err != nil {
		return nil, fmt.Errorf("resolve bucket region for %q: %w", bucketName, err)
	}
	cfg.Region = region

	return s3.NewFromConfig(cfg), nil
}

func transcriptTitle(doc document, key string) string {
	for _, candidate := range []string{
		strings.TrimSpace(doc.Input.Metadata.Title),
		strings.TrimSpace(doc.Podcast.Episode.Title),
		strings.TrimSpace(doc.Input.Metadata.Extra.ShareTitle),
		strings.TrimSpace(doc.Podcast.Source.ShareTitle),
		strings.TrimSpace(doc.Input.Metadata.Series.Title),
		strings.TrimSpace(doc.Podcast.Podcast.Title),
	} {
		if candidate != "" {
			return candidate
		}
	}

	return strings.TrimSuffix(path.Base(key), ".json")
}

func transcriptDate(doc document) string {
	for _, publishedDate := range []string{
		strings.TrimSpace(doc.Input.Metadata.PublishedDate),
		strings.TrimSpace(doc.Podcast.Episode.PublishedDate),
	} {
		if _, err := time.Parse(time.DateOnly, publishedDate); err == nil {
			return publishedDate
		}
	}

	for _, publishedAt := range []string{
		strings.TrimSpace(doc.Input.Metadata.PublishedAt),
		strings.TrimSpace(doc.Podcast.Episode.PublishedAt),
	} {
		if timestamp, ok := parseTimestamp(publishedAt); ok {
			return timestamp.Format(time.DateOnly)
		}
	}

	var deepgram deepgramMetadataEnvelope
	deepgramPayload := doc.Transcript.Raw
	if len(deepgramPayload) == 0 {
		deepgramPayload = doc.Deepgram
	}
	if len(deepgramPayload) == 0 || json.Unmarshal(deepgramPayload, &deepgram) != nil {
		return ""
	}

	if createdAt, ok := parseTimestamp(strings.TrimSpace(deepgram.Metadata.Created)); ok {
		return createdAt.Format(time.DateOnly)
	}

	return ""
}

func parseTimestamp(value string) (time.Time, bool) {
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		timestamp, err := time.Parse(layout, value)
		if err == nil {
			return timestamp, true
		}
	}

	return time.Time{}, false
}

func isMissingObjectError(err error) bool {
	var apiErr smithy.APIError
	if !errors.As(err, &apiErr) {
		return false
	}

	switch apiErr.ErrorCode() {
	case "NoSuchKey", "NotFound":
		return true
	default:
		return false
	}
}

func isConditionalWriteConflict(err error) bool {
	var apiErr smithy.APIError
	if !errors.As(err, &apiErr) {
		return false
	}

	switch apiErr.ErrorCode() {
	case "PreconditionFailed", "ConditionalRequestConflict":
		return true
	default:
		return false
	}
}

// ObjectExists reports whether key is present in bucketName. It requests a
// single byte so checking a large transcript does not download it.
func ObjectExists(ctx context.Context, client S3Client, bucketName, key string) (bool, error) {
	output, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(key),
		Range:  aws.String("bytes=0-0"),
	})
	if err != nil {
		if isMissingObjectError(err) {
			return false, nil
		}
		return false, fmt.Errorf("check s3://%s/%s: %w", bucketName, key, err)
	}
	if output.Body != nil {
		if err := output.Body.Close(); err != nil {
			return false, fmt.Errorf("close s3://%s/%s: %w", bucketName, key, err)
		}
	}
	return true, nil
}
