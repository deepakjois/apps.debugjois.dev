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
	"html"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber"
	"github.com/deepakjois/apps.debugjois.dev/backend/transcripts"
)

const maxSlugLength = 120

var slugPattern = regexp.MustCompile(`[^a-z0-9]+`)

// urlPattern finds bare HTTP(S) links in plain-text descriptions, excluding
// trailing punctuation that usually ends the surrounding sentence.
var urlPattern = regexp.MustCompile(`https?://[^\s<>"']+[^\s<>"'.,;:!?)\]]`)

// paragraphBreakPattern splits plain-text descriptions on blank lines.
var paragraphBreakPattern = regexp.MustCompile(`\n[ \t]*\n+`)

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
	if err := result.Validate(); err != nil {
		return fmt.Errorf("publish transcript: %w", err)
	}

	body, err := json.Marshal(newDocument(result))
	if err != nil {
		return fmt.Errorf("encode transcript for publishing: %w", err)
	}
	key, err := objectKey(result)
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
	Type       podscriber.SourceType `json:"type"`
	ShareTitle string                `json:"share_title,omitempty"`
	EpisodeURL string                `json:"episode_url"`
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
	metadata := result.Metadata
	doc := document{
		Podcast: podcastDocument{
			Source: sourceDocument{
				Type:       result.Source.Type,
				ShareTitle: extraString(metadata.Extra, "share_title"),
				EpisodeURL: result.Source.URL,
			},
			Episode: episodeDocument{
				Title:           metadata.Title,
				PublishedAt:     metadata.PublishedAt,
				PublishedDate:   metadata.PublishedDate,
				Duration:        durationDisplay(metadata),
				DescriptionHTML: descriptionHTML(metadata),
			},
		},
		Deepgram: result.Transcript.Raw,
	}
	if metadata.Series != nil {
		doc.Podcast.Podcast = seriesDocument{Title: metadata.Series.Title, URL: metadata.Series.URL}
	}
	return doc
}

// durationDisplay prefers the provider's own label (Podcast Addict) and falls
// back to formatting DurationSeconds (YouTube) in the same "N mins" style.
func durationDisplay(metadata podscriber.Metadata) string {
	if display := extraString(metadata.Extra, "duration_display"); display != "" {
		return display
	}
	if metadata.DurationSeconds <= 0 {
		return ""
	}
	totalSeconds := int(math.Round(metadata.DurationSeconds))
	if totalSeconds < 60 {
		return plural(totalSeconds, "sec")
	}
	totalMinutes := int(math.Round(float64(totalSeconds) / 60))
	hours, minutes := totalMinutes/60, totalMinutes%60
	switch {
	case hours == 0:
		return plural(minutes, "min")
	case minutes == 0:
		return fmt.Sprintf("%d hr", hours)
	default:
		return fmt.Sprintf("%d hr %s", hours, plural(minutes, "min"))
	}
}

// plural formats a count with its unit, adding "s" unless the count is one.
func plural(count int, unit string) string {
	if count == 1 {
		return fmt.Sprintf("%d %s", count, unit)
	}
	return fmt.Sprintf("%d %ss", count, unit)
}

// descriptionHTML prefers provider HTML and otherwise converts a plain-text
// description (YouTube) into safe HTML for the reader's show notes. Blank
// lines become paragraphs, single newlines become <br>, and bare URLs become
// links. Every text and URL fragment is escaped because the reader renders the
// result as raw HTML.
func descriptionHTML(metadata podscriber.Metadata) string {
	if strings.TrimSpace(metadata.DescriptionHTML) != "" {
		return metadata.DescriptionHTML
	}
	text := strings.TrimSpace(strings.ReplaceAll(metadata.Description, "\r\n", "\n"))
	if text == "" {
		return ""
	}
	var builder strings.Builder
	for _, paragraph := range paragraphBreakPattern.Split(text, -1) {
		paragraph = strings.TrimSpace(paragraph)
		if paragraph == "" {
			continue
		}
		builder.WriteString("<p>")
		// Links are located in the raw text so escaping cannot split or extend them.
		last := 0
		for _, match := range urlPattern.FindAllStringIndex(paragraph, -1) {
			builder.WriteString(escapeLines(paragraph[last:match[0]]))
			link := html.EscapeString(paragraph[match[0]:match[1]])
			builder.WriteString(`<a href="` + link + `" target="_blank" rel="noreferrer">` + link + `</a>`)
			last = match[1]
		}
		builder.WriteString(escapeLines(paragraph[last:]))
		builder.WriteString("</p>")
	}
	return builder.String()
}

// escapeLines escapes plain text and preserves its single line breaks.
func escapeLines(text string) string {
	return strings.ReplaceAll(html.EscapeString(text), "\n", "<br>")
}

func extraString(extra map[string]any, key string) string {
	value, ok := extra[key].(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func objectKey(result podscriber.TranscriptionResult) (string, error) {
	payload, err := json.Marshal(struct {
		SchemaVersion int                 `json:"schema_version"`
		Source        podscriber.Source   `json:"source"`
		Metadata      podscriber.Metadata `json:"metadata"`
	}{result.SchemaVersion, result.Source, result.Metadata})
	if err != nil {
		return "", fmt.Errorf("encode transcript identity: %w", err)
	}
	sum := sha256.Sum256(payload)
	return fmt.Sprintf("%s%s--%s.json", transcripts.ObjectPrefix, readableSlug(result), hex.EncodeToString(sum[:])), nil
}

func readableSlug(result podscriber.TranscriptionResult) string {
	var parts []string
	if result.Metadata.Series != nil {
		parts = append(parts, slugPart(result.Metadata.Series.Title))
	}
	parts = append(parts, slugPart(result.Metadata.Title))

	nonempty := parts[:0]
	for _, part := range parts {
		if part != "" {
			nonempty = append(nonempty, part)
		}
	}
	slug := strings.Join(nonempty, "--")
	if slug == "" {
		slug = slugPart(result.Source.URL)
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
