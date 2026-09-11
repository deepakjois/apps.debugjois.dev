package resolvers

import (
	"context"
	"errors"
	"testing"

	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber"
)

type fakeExtractor struct {
	match  bool
	result podscriber.TranscriptionInput
	err    error
	calls  int
}

func (f *fakeExtractor) CanHandle(string) bool { return f.match }

func (f *fakeExtractor) Extract(context.Context, string) (podscriber.TranscriptionInput, error) {
	f.calls++
	return f.result, f.err
}

func validInput() podscriber.TranscriptionInput {
	return podscriber.TranscriptionInput{
		SchemaVersion: podscriber.SchemaVersion,
		Source: podscriber.Source{
			Type:  podscriber.SourceTypeAudioURL,
			Input: "https://example.com/audio.mp3",
			URL:   "https://example.com/audio.mp3",
		},
		Media: podscriber.Media{Type: podscriber.MediaTypeRemoteURL, URL: "https://example.com/audio.mp3"},
	}
}

func TestResolverUsesFirstMatchingExtractor(t *testing.T) {
	first := &fakeExtractor{match: true, result: validInput()}
	second := &fakeExtractor{match: true, result: validInput()}

	result, err := New(first, second).Resolve(context.Background(), "input")
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if result.Source.URL != "https://example.com/audio.mp3" {
		t.Fatalf("Resolve() source URL = %q", result.Source.URL)
	}
	if first.calls != 1 || second.calls != 0 {
		t.Fatalf("extractor calls = first %d, second %d", first.calls, second.calls)
	}
}

func TestResolverRejectsUnsupportedInput(t *testing.T) {
	_, err := New(&fakeExtractor{}).Resolve(context.Background(), "not a URL")
	if !errors.Is(err, ErrUnsupportedSource) {
		t.Fatalf("Resolve() error = %v, want ErrUnsupportedSource", err)
	}
}

func TestResolverDoesNotFallThroughAfterMatchedError(t *testing.T) {
	want := errors.New("recognized source failed")
	first := &fakeExtractor{match: true, err: want}
	second := &fakeExtractor{match: true, result: validInput()}

	_, err := New(first, second).Resolve(context.Background(), "input")
	if !errors.Is(err, want) {
		t.Fatalf("Resolve() error = %v, want %v", err, want)
	}
	if second.calls != 0 {
		t.Fatalf("fallback calls = %d, want 0", second.calls)
	}
}

func TestResolverHonorsCanceledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := New(&fakeExtractor{match: true, result: validInput()}).Resolve(ctx, "input")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Resolve() error = %v, want context.Canceled", err)
	}
}
