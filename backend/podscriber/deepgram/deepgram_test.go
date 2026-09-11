package deepgram

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	deepgramresponse "github.com/deepgram/deepgram-go-sdk/v3/pkg/api/listen/v1/rest/interfaces"
	deepgraminterfaces "github.com/deepgram/deepgram-go-sdk/v3/pkg/client/interfaces"

	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber"
)

type fakeClient struct {
	gotURL     string
	gotFile    string
	gotOptions *deepgraminterfaces.PreRecordedTranscriptionOptions
	response   *deepgramresponse.PreRecordedResponse
	err        error
}

func (f *fakeClient) FromFile(_ context.Context, file string, options *deepgraminterfaces.PreRecordedTranscriptionOptions) (*deepgramresponse.PreRecordedResponse, error) {
	f.gotFile = file
	f.gotOptions = options
	return f.response, f.err
}

func (f *fakeClient) FromURL(_ context.Context, url string, options *deepgraminterfaces.PreRecordedTranscriptionOptions) (*deepgramresponse.PreRecordedResponse, error) {
	f.gotURL = url
	f.gotOptions = options
	return f.response, f.err
}

func responseWithTranscript(text string) *deepgramresponse.PreRecordedResponse {
	return &deepgramresponse.PreRecordedResponse{
		Metadata: &deepgramresponse.Metadata{RequestID: "request-1"},
		Results: &deepgramresponse.Result{
			Channels: []deepgramresponse.Channel{{
				Alternatives: []deepgramresponse.Alternative{{Transcript: text}},
			}},
		},
	}
}

func remoteInput() podscriber.TranscriptionInput {
	return podscriber.TranscriptionInput{
		SchemaVersion: podscriber.SchemaVersion,
		Source: podscriber.Source{
			Type:  podscriber.SourceTypeAudioURL,
			Input: "https://example.com/audio.mp3",
			URL:   "https://example.com/audio.mp3",
		},
		Media:    podscriber.Media{Type: podscriber.MediaTypeRemoteURL, URL: "https://example.com/audio.mp3"},
		Metadata: podscriber.Metadata{Title: "Episode"},
	}
}

func TestTranscribeRemoteURL(t *testing.T) {
	client := &fakeClient{response: responseWithTranscript("Hello world.")}
	got, err := newTranscriber(client).Transcribe(context.Background(), remoteInput())
	if err != nil {
		t.Fatalf("Transcribe() error = %v", err)
	}
	if client.gotURL != "https://example.com/audio.mp3" || client.gotFile != "" {
		t.Fatalf("client got URL %q and file %q", client.gotURL, client.gotFile)
	}
	assertOptions(t, client.gotOptions)
	if got.Transcript.Text != "Hello world." || got.Transcript.RequestID != "request-1" {
		t.Fatalf("transcript = %#v", got.Transcript)
	}
	if len(got.Transcript.Raw) == 0 || got.Input.Metadata.Title != "Episode" {
		t.Fatalf("result = %#v", got)
	}
}

func TestTranscribeLocalFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audio.webm")
	if err := os.WriteFile(path, []byte("audio"), 0o600); err != nil {
		t.Fatalf("os.WriteFile() error = %v", err)
	}
	input := remoteInput()
	input.Media = podscriber.Media{Type: podscriber.MediaTypeLocalFile, Path: path}
	client := &fakeClient{response: responseWithTranscript("Local transcript")}

	_, err := newTranscriber(client).Transcribe(context.Background(), input)
	if err != nil {
		t.Fatalf("Transcribe() error = %v", err)
	}
	if client.gotFile != path || client.gotURL != "" {
		t.Fatalf("client got URL %q and file %q", client.gotURL, client.gotFile)
	}
}

func TestTranscribeErrors(t *testing.T) {
	providerErr := errors.New("provider unavailable")
	tests := []struct {
		name   string
		client *fakeClient
		want   error
	}{
		{
			name:   "provider failure",
			client: &fakeClient{err: providerErr},
			want:   providerErr,
		},
		{
			name:   "missing alternatives",
			client: &fakeClient{response: &deepgramresponse.PreRecordedResponse{Results: &deepgramresponse.Result{}}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := newTranscriber(tt.client).Transcribe(context.Background(), remoteInput())
			if err == nil {
				t.Fatal("Transcribe() error = nil")
			}
			if tt.want != nil && !errors.Is(err, tt.want) {
				t.Fatalf("Transcribe() error = %v, want wrapped %v", err, tt.want)
			}
		})
	}
}

func TestNewRequiresAPIKey(t *testing.T) {
	_, err := New(" ")
	if err == nil {
		t.Fatal("New() error = nil")
	}
}

func assertOptions(t *testing.T, options *deepgraminterfaces.PreRecordedTranscriptionOptions) {
	t.Helper()
	if options == nil {
		t.Fatal("options = nil")
	}
	if options.Model != "nova-3" || options.Language != "en" {
		t.Fatalf("model/language = %q/%q", options.Model, options.Language)
	}
	if !options.Diarize || !options.Paragraphs || !options.Punctuate || !options.Numerals || !options.SmartFormat || !options.Utterances {
		t.Fatalf("options = %#v", options)
	}
}
