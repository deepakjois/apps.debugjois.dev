// Package s3publisher publishes transcripts and their public index to S3.
package s3publisher

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/deepakjois/apps.debugjois.dev/backend-v2/podscriber"
	"github.com/deepakjois/apps.debugjois.dev/backend-v2/transcripts"
)

const maxSlugLength = 120

var slugPattern = regexp.MustCompile(`[^a-z0-9]+`)

// Publisher writes compatibility-shaped transcript documents and refreshes the index.
type Publisher struct {
	client transcripts.S3Client
	bucket string
}

// New creates a publisher for the site's transcript bucket using ambient AWS credentials.
func New(ctx context.Context) (*Publisher, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("load AWS config for transcript publishing: %w", err)
	}

	region, err := manager.GetBucketRegion(ctx, s3.NewFromConfig(cfg), transcripts.BucketName)
	if err != nil {
		return nil, fmt.Errorf("resolve transcript bucket region for %q: %w", transcripts.BucketName, err)
	}
	cfg.Region = region

	return newPublisher(s3.NewFromConfig(cfg), transcripts.BucketName), nil
}

func newPublisher(client transcripts.S3Client, bucket string) *Publisher {
	return &Publisher{client: client, bucket: bucket}
}

// Publish writes the transcript document and updates the public index.
func (p *Publisher) Publish(ctx context.Context, result podscriber.TranscriptionResult) error {
	if p == nil || p.client == nil || strings.TrimSpace(p.bucket) == "" {
		return errors.New("publish transcript: S3 publisher is not configured")
	}
	if err := result.Input.Validate(); err != nil {
		return fmt.Errorf("publish transcript: %w", err)
	}

	body, err := json.Marshal(newDocument(result))
	if err != nil {
		return fmt.Errorf("encode transcript for publishing: %w", err)
	}
	key, err := objectKey(result.Input)
	if err != nil {
		return err
	}

	_, err = p.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(p.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(body),
		ContentType: aws.String("application/json"),
	})
	if err != nil {
		return fmt.Errorf("publish transcript to s3://%s/%s: %w", p.bucket, key, err)
	}

	if err := transcripts.RefreshIndex(ctx, p.client, p.bucket); err != nil {
		return fmt.Errorf("publish transcript index: %w", err)
	}
	return nil
}

// document preserves the payload shape consumed by the existing transcript reader.
type document struct {
	Podcast  podcastDocument `json:"podcast"`
	Deepgram json.RawMessage `json:"deepgram"`
}

// podcastDocument maps provider-neutral metadata to the existing public schema.
type podcastDocument struct {
	Source  sourceDocument  `json:"source"`
	Podcast seriesDocument  `json:"podcast"`
	Episode episodeDocument `json:"episode"`
}

// sourceDocument identifies the original public episode page.
type sourceDocument struct {
	ShareTitle string `json:"share_title,omitempty"`
	EpisodeURL string `json:"episode_url"`
}

// seriesDocument identifies the podcast or channel.
type seriesDocument struct {
	Title string `json:"title,omitempty"`
	URL   string `json:"url,omitempty"`
}

// episodeDocument contains display metadata for the transcript reader.
type episodeDocument struct {
	Title           string     `json:"title,omitempty"`
	PublishedAt     *time.Time `json:"published_at,omitempty"`
	PublishedDate   string     `json:"published_date,omitempty"`
	Duration        string     `json:"duration,omitempty"`
	DescriptionHTML string     `json:"description_html,omitempty"`
}

func newDocument(result podscriber.TranscriptionResult) document {
	metadata := result.Input.Metadata
	doc := document{
		Podcast: podcastDocument{
			Source: sourceDocument{
				ShareTitle: extraString(metadata.Extra, "share_title"),
				EpisodeURL: result.Input.Source.URL,
			},
			Episode: episodeDocument{
				Title:           metadata.Title,
				PublishedAt:     metadata.PublishedAt,
				PublishedDate:   metadata.PublishedDate,
				Duration:        extraString(metadata.Extra, "duration_display"),
				DescriptionHTML: metadata.DescriptionHTML,
			},
		},
		Deepgram: result.Transcript.Raw,
	}
	if metadata.Series != nil {
		doc.Podcast.Podcast = seriesDocument{Title: metadata.Series.Title, URL: metadata.Series.URL}
	}
	return doc
}

func extraString(extra map[string]any, key string) string {
	value, ok := extra[key].(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func objectKey(input podscriber.TranscriptionInput) (string, error) {
	payload, err := json.Marshal(input)
	if err != nil {
		return "", fmt.Errorf("encode transcript identity: %w", err)
	}
	sum := sha256.Sum256(payload)
	return fmt.Sprintf("%s%s--%s.json", transcripts.ObjectPrefix, readableSlug(input), hex.EncodeToString(sum[:])), nil
}

func readableSlug(input podscriber.TranscriptionInput) string {
	var parts []string
	if input.Metadata.Series != nil {
		parts = append(parts, slugPart(input.Metadata.Series.Title))
	}
	parts = append(parts, slugPart(input.Metadata.Title))

	nonempty := parts[:0]
	for _, part := range parts {
		if part != "" {
			nonempty = append(nonempty, part)
		}
	}
	slug := strings.Join(nonempty, "--")
	if slug == "" {
		slug = slugPart(input.Source.URL)
	}
	if slug == "" {
		slug = "podcast-transcript"
	}
	if len(slug) > maxSlugLength {
		slug = strings.Trim(slug[:maxSlugLength], "-")
	}
	return slug
}

func slugPart(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = slugPattern.ReplaceAllString(value, "-")
	return strings.Trim(value, "-")
}
