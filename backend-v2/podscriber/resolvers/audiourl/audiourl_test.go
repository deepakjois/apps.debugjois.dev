package audiourl

import (
	"context"
	"testing"

	"github.com/deepakjois/apps.debugjois.dev/backend-v2/podscriber"
)

func TestExtractor(t *testing.T) {
	extractor := New()
	input := "https://CDN.Example.com/path/audio?signature=abc#fragment"
	if !extractor.CanHandle(input) {
		t.Fatal("CanHandle() = false")
	}

	got, err := extractor.Extract(context.Background(), input)
	if err != nil {
		t.Fatalf("Extract() error = %v", err)
	}
	if got.Media.Type != podscriber.MediaTypeRemoteURL {
		t.Fatalf("media type = %q", got.Media.Type)
	}
	if got.Media.URL != "https://cdn.example.com/path/audio?signature=abc" {
		t.Fatalf("media URL = %q", got.Media.URL)
	}
	if got.Metadata.Title != "" {
		t.Fatalf("metadata = %#v, want empty", got.Metadata)
	}
}

func TestCanHandleRejectsNonHTTPURL(t *testing.T) {
	if New().CanHandle("file:///tmp/audio.mp3") {
		t.Fatal("CanHandle() = true for file URL")
	}
}
