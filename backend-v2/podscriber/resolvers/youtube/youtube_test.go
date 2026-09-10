package youtube

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/deepakjois/apps.debugjois.dev/backend-v2/podscriber"
)

type fakeRunner struct {
	name   string
	args   []string
	stdout []byte
	stderr []byte
	err    error
}

func (f *fakeRunner) Run(_ context.Context, name string, args ...string) ([]byte, []byte, error) {
	f.name = name
	f.args = append([]string(nil), args...)
	return f.stdout, f.stderr, f.err
}

func TestCanHandle(t *testing.T) {
	extractor := &Extractor{}
	for _, input := range []string{
		"https://www.youtube.com/watch?v=abc",
		"https://youtu.be/abc",
		"https://music.youtube.com/watch?v=abc",
	} {
		if !extractor.CanHandle(input) {
			t.Errorf("CanHandle(%q) = false", input)
		}
	}
	if extractor.CanHandle("https://example.com/watch?v=abc") {
		t.Error("CanHandle() = true for unrelated host")
	}
}

func TestExtractorDownloadsAudioAndMapsMetadata(t *testing.T) {
	dir := t.TempDir()
	audioPath := filepath.Join(dir, "abc.webm")
	if err := os.WriteFile(audioPath, []byte("audio"), 0o600); err != nil {
		t.Fatalf("os.WriteFile() error = %v", err)
	}
	metadata := ytMetadata{
		ID:          "abc",
		Title:       "An interview",
		Description: "Show notes",
		WebpageURL:  "https://www.youtube.com/watch?v=abc",
		UploadDate:  "20260825",
		Duration:    125.5,
		Channel:     "Example Channel",
		ChannelURL:  "https://www.youtube.com/@example",
		Uploader:    "Example",
		Thumbnail:   "https://img.example.com/abc.jpg",
	}
	metadata.RequestedDownloads = append(metadata.RequestedDownloads, struct {
		Filepath string `json:"filepath"`
	}{Filepath: audioPath})
	body, err := json.Marshal(metadata)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	runner := &fakeRunner{stdout: body}
	extractor, err := newExtractor(Config{Executable: "/usr/bin/yt-dlp", OutputDir: dir}, runner)
	if err != nil {
		t.Fatalf("newExtractor() error = %v", err)
	}

	got, err := extractor.Extract(context.Background(), "https://youtu.be/abc")
	if err != nil {
		t.Fatalf("Extract() error = %v", err)
	}
	if runner.name != "/usr/bin/yt-dlp" {
		t.Fatalf("runner name = %q", runner.name)
	}
	for _, arg := range []string{"--no-playlist", "--no-simulate", "--dump-single-json", "bestaudio"} {
		if !slices.Contains(runner.args, arg) {
			t.Errorf("yt-dlp args %q do not contain %q", runner.args, arg)
		}
	}
	if got.Media.Type != podscriber.MediaTypeLocalFile || got.Media.Path != audioPath {
		t.Fatalf("media = %#v", got.Media)
	}
	if got.Metadata.Title != metadata.Title || got.Metadata.PublishedDate != "2026-08-25" {
		t.Fatalf("metadata = %#v", got.Metadata)
	}
	if got.Metadata.Series == nil || got.Metadata.Series.Title != metadata.Channel {
		t.Fatalf("series = %#v", got.Metadata.Series)
	}
	if got.Metadata.Extra["video_id"] != "abc" {
		t.Fatalf("extra = %#v", got.Metadata.Extra)
	}
}

func TestExtractorReportsCommandFailure(t *testing.T) {
	want := errors.New("exit status 1")
	runner := &fakeRunner{stderr: []byte("video unavailable"), err: want}
	extractor, err := newExtractor(Config{Executable: "yt-dlp", OutputDir: t.TempDir()}, runner)
	if err != nil {
		t.Fatalf("newExtractor() error = %v", err)
	}

	_, err = extractor.Extract(context.Background(), "https://youtu.be/abc")
	if err == nil {
		t.Fatal("Extract() error = nil")
	}
	if !errors.Is(err, want) {
		t.Fatalf("Extract() error = %v, want wrapped command error", err)
	}
}

func TestExtractorRequiresDownloadedFile(t *testing.T) {
	runner := &fakeRunner{stdout: []byte(`{"id":"abc","_filename":"missing.webm"}`)}
	extractor, err := newExtractor(Config{Executable: "yt-dlp", OutputDir: t.TempDir()}, runner)
	if err != nil {
		t.Fatalf("newExtractor() error = %v", err)
	}

	_, err = extractor.Extract(context.Background(), "https://youtu.be/abc")
	if err == nil {
		t.Fatal("Extract() error = nil")
	}
}

func TestMissingExecutableReturnsError(t *testing.T) {
	extractor, err := New(Config{Executable: filepath.Join(t.TempDir(), "missing-yt-dlp"), OutputDir: t.TempDir()})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	_, err = extractor.Extract(context.Background(), "https://youtu.be/abc")
	if err == nil {
		t.Fatal("Extract() error = nil")
	}
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("Extract() error = %v, want os.ErrNotExist", err)
	}
}
