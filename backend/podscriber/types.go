package podscriber

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const SchemaVersion = 1

// SourceType identifies the service from which an input originated.
type SourceType string

const (
	SourceTypePodcastAddict SourceType = "podcast_addict"
	SourceTypeYouTube       SourceType = "youtube"
	SourceTypeAudioURL      SourceType = "audio_url"
)

// MediaType describes how Deepgram can access media.
type MediaType string

const (
	MediaTypeRemoteURL MediaType = "remote_url"
	MediaTypeLocalFile MediaType = "local_file"
)

// Media is a JSON-safe, tagged reference to audio. Exactly one of URL and Path
// is set, as determined by Type.
type Media struct {
	Type MediaType `json:"type"`
	URL  string    `json:"url,omitempty"`
	Path string    `json:"path,omitempty"`
}

// Validate checks that a media reference is internally consistent.
func (m Media) Validate() error {
	switch m.Type {
	case MediaTypeRemoteURL:
		if strings.TrimSpace(m.Path) != "" {
			return errors.New("remote media must not contain a local path")
		}
		u, err := url.Parse(strings.TrimSpace(m.URL))
		if err != nil {
			return fmt.Errorf("parse remote media URL: %w", err)
		}
		if (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return errors.New("remote media must contain an HTTP(S) URL")
		}
	case MediaTypeLocalFile:
		if strings.TrimSpace(m.URL) != "" {
			return errors.New("local media must not contain a remote URL")
		}
		if strings.TrimSpace(m.Path) == "" {
			return errors.New("local media path is empty")
		}
	default:
		return fmt.Errorf("unknown media type %q", m.Type)
	}
	return nil
}

// Source records the original input and the canonical URL extracted from it.
type Source struct {
	Type  SourceType `json:"type"`
	Input string     `json:"input"`
	URL   string     `json:"url"`
}

// Series describes a podcast, channel, or other collection containing media.
type Series struct {
	Title string `json:"title,omitempty"`
	URL   string `json:"url,omitempty"`
}

// Metadata contains common source metadata. Extra is reserved for curated,
// JSON-compatible provider fields without forcing them into the common model.
type Metadata struct {
	Title           string         `json:"title,omitempty"`
	Description     string         `json:"description,omitempty"`
	DescriptionHTML string         `json:"description_html,omitempty"`
	PublishedAt     *time.Time     `json:"published_at,omitempty"`
	PublishedDate   string         `json:"published_date,omitempty"`
	DurationSeconds float64        `json:"duration_seconds,omitempty"`
	Series          *Series        `json:"series,omitempty"`
	Extra           map[string]any `json:"extra,omitempty"`
}

// TranscriptionInput is the JSON-safe handoff between source extraction and
// transcription. It can be serialized for a later worker invocation.
type TranscriptionInput struct {
	SchemaVersion int      `json:"schema_version"`
	Source        Source   `json:"source"`
	Media         Media    `json:"media"`
	Metadata      Metadata `json:"metadata"`
}

// Validate checks the stable handoff contract.
func (in TranscriptionInput) Validate() error {
	if in.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported schema version %d", in.SchemaVersion)
	}
	if strings.TrimSpace(string(in.Source.Type)) == "" {
		return errors.New("source type is empty")
	}
	if strings.TrimSpace(in.Source.Input) == "" {
		return errors.New("source input is empty")
	}
	if strings.TrimSpace(in.Source.URL) == "" {
		return errors.New("canonical source URL is empty")
	}
	if err := in.Media.Validate(); err != nil {
		return fmt.Errorf("validate media: %w", err)
	}
	return nil
}

// Transcript contains provider-neutral text and the lossless provider result.
type Transcript struct {
	Text      string          `json:"text"`
	Provider  string          `json:"provider"`
	RequestID string          `json:"request_id,omitempty"`
	Raw       json.RawMessage `json:"raw"`
}

// TranscriptionResult combines the prepared input with its transcript.
type TranscriptionResult struct {
	Input      TranscriptionInput `json:"input"`
	Transcript Transcript         `json:"transcript"`
}

// Transcriber turns prepared media into a transcript.
type Transcriber interface {
	Transcribe(ctx context.Context, input TranscriptionInput) (TranscriptionResult, error)
}
