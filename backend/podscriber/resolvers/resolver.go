// Package resolvers selects a source-specific extractor for user input.
package resolvers

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber"
)

// ErrUnsupportedSource is wrapped when no registered extractor accepts input.
var ErrUnsupportedSource = errors.New("unsupported source")

// Extractor converts one supported user input into transcription media.
type Extractor interface {
	CanHandle(input string) bool
	Extract(ctx context.Context, input string) (podscriber.TranscriptionInput, error)
}

// Resolver prepares user input for a transcriber.
type Resolver interface {
	Resolve(ctx context.Context, input string) (podscriber.TranscriptionInput, error)
}

// Chain checks extractors in registration order and uses the first match.
// Generic fallback extractors should therefore be registered last.
type Chain struct {
	extractors []Extractor
}

// New constructs an ordered resolver chain.
func New(extractors ...Extractor) *Chain {
	registered := make([]Extractor, len(extractors))
	copy(registered, extractors)
	return &Chain{extractors: registered}
}

func (r *Chain) Resolve(ctx context.Context, input string) (podscriber.TranscriptionInput, error) {
	if err := ctx.Err(); err != nil {
		return podscriber.TranscriptionInput{}, err
	}
	if r == nil {
		return podscriber.TranscriptionInput{}, errors.New("resolve source: resolver is nil")
	}
	input = strings.TrimSpace(input)
	if input == "" {
		return podscriber.TranscriptionInput{}, errors.New("resolve source: input is empty")
	}

	for _, extractor := range r.extractors {
		if extractor == nil || !extractor.CanHandle(input) {
			continue
		}

		result, err := extractor.Extract(ctx, input)
		if err != nil {
			return podscriber.TranscriptionInput{}, err
		}
		if err := result.Validate(); err != nil {
			return podscriber.TranscriptionInput{}, fmt.Errorf("validate extracted source: %w", err)
		}
		return result, nil
	}

	return podscriber.TranscriptionInput{}, fmt.Errorf("resolve source: %w", ErrUnsupportedSource)
}
