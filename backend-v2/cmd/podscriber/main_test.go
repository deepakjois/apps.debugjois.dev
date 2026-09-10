package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/deepakjois/apps.debugjois.dev/backend-v2/podscriber"
)

func TestRunParsePrintsPreparedPayloadWithoutDeepgramKey(t *testing.T) {
	t.Setenv(deepgramAPIKeyEnv, "")
	var stdout bytes.Buffer
	if err := run(
		context.Background(),
		[]string{"-parse", "https://CDN.Example.com/episode.mp3#fragment"},
		strings.NewReader(""),
		&stdout,
	); err != nil {
		t.Fatalf("run() error = %v", err)
	}

	var got podscriber.TranscriptionInput
	if err := json.Unmarshal(stdout.Bytes(), &got); err != nil {
		t.Fatalf("decode parsed payload: %v", err)
	}
	if got.Source.Type != podscriber.SourceTypeAudioURL || got.Media.URL != "https://cdn.example.com/episode.mp3" {
		t.Fatalf("parsed payload = %#v", got)
	}
}

func TestRunTranscriptionRequiresDeepgramKey(t *testing.T) {
	t.Setenv(deepgramAPIKeyEnv, "")
	err := run(
		context.Background(),
		[]string{"https://example.com/episode.mp3"},
		strings.NewReader(""),
		&bytes.Buffer{},
	)
	if err == nil || !strings.Contains(err.Error(), deepgramAPIKeyEnv) {
		t.Fatalf("run() error = %v", err)
	}
}

func TestParseArgsReadsArgument(t *testing.T) {
	got, err := parseArgs([]string{"-publish", "-output", "transcript.txt", " https://example.com/audio.mp3 "}, strings.NewReader("ignored"))
	if err != nil {
		t.Fatalf("parseArgs() error = %v", err)
	}
	if got.parseOnly || !got.publish || got.output != "transcript.txt" || got.input != "https://example.com/audio.mp3" {
		t.Fatalf("parseArgs() = %#v", got)
	}
}

func TestParseArgsReadsMultilineStdin(t *testing.T) {
	stdin := "\n[Podcast] Episode\nhttps://podcastaddict.com/show/episode/123\n"
	got, err := parseArgs(nil, strings.NewReader(stdin))
	if err != nil {
		t.Fatalf("parseArgs() error = %v", err)
	}
	if got.parseOnly || got.input != strings.TrimSpace(stdin) {
		t.Fatalf("parseArgs() = %#v", got)
	}
}

func TestParseArgsRejectsInvalidInput(t *testing.T) {
	tests := []struct {
		name string
		args []string
	}{
		{name: "empty"},
		{name: "too many arguments", args: []string{"one", "two"}},
		{name: "unknown flag", args: []string{"-unknown"}},
		{name: "parse and publish", args: []string{"-parse", "-publish", "https://example.com/audio.mp3"}},
		{name: "parse and output", args: []string{"-parse", "-output", "transcript.txt", "https://example.com/audio.mp3"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := parseArgs(tt.args, strings.NewReader("")); err == nil {
				t.Fatal("parseArgs() error = nil")
			}
		})
	}
}

func TestParseArgsPropagatesStdinError(t *testing.T) {
	want := errors.New("read failed")
	if _, err := parseArgs(nil, errorReader{err: want}); !errors.Is(err, want) {
		t.Fatalf("parseArgs() error = %v, want wrapped %v", err, want)
	}
}

func TestWriteTranscriptSelectsStdoutOrFile(t *testing.T) {
	var stdout bytes.Buffer
	if err := writeTranscript(&stdout, "", "stdout transcript"); err != nil {
		t.Fatalf("writeTranscript() stdout error = %v", err)
	}
	if stdout.String() != "stdout transcript\n" {
		t.Fatalf("stdout = %q", stdout.String())
	}

	path := filepath.Join(t.TempDir(), "transcript.txt")
	stdout.Reset()
	if err := writeTranscript(&stdout, path, "file transcript"); err != nil {
		t.Fatalf("writeTranscript() file error = %v", err)
	}
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read transcript file: %v", err)
	}
	if string(body) != "file transcript\n" || stdout.Len() != 0 {
		t.Fatalf("file = %q, stdout = %q", body, stdout.String())
	}
}

// errorReader provides a deterministic stdin failure for argument parsing.
type errorReader struct {
	err error
}

func (r errorReader) Read([]byte) (int, error) {
	return 0, r.err
}
