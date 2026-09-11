// Package audiourl prepares direct HTTP(S) audio URLs for transcription.
package audiourl

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber"
)

// Extractor is the generic URL fallback and should be registered after all
// host-specific extractors.
type Extractor struct{}

func New() *Extractor { return &Extractor{} }

func (e *Extractor) CanHandle(input string) bool {
	u, err := url.Parse(strings.TrimSpace(input))
	if err != nil {
		return false
	}
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func (e *Extractor) Extract(ctx context.Context, input string) (podscriber.TranscriptionInput, error) {
	if err := ctx.Err(); err != nil {
		return podscriber.TranscriptionInput{}, err
	}
	input = strings.TrimSpace(input)
	u, err := url.Parse(input)
	if err != nil {
		return podscriber.TranscriptionInput{}, fmt.Errorf("parse audio URL: %w", err)
	}
	if (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return podscriber.TranscriptionInput{}, errors.New("parse audio URL: expected an HTTP(S) URL")
	}
	u.Fragment = ""
	u.Host = strings.ToLower(u.Host)
	canonical := u.String()

	return podscriber.TranscriptionInput{
		SchemaVersion: podscriber.SchemaVersion,
		Source: podscriber.Source{
			Type:  podscriber.SourceTypeAudioURL,
			Input: input,
			URL:   canonical,
		},
		Media: podscriber.Media{Type: podscriber.MediaTypeRemoteURL, URL: canonical},
	}, nil
}
