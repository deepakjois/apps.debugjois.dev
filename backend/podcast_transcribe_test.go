package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/deepakjois/apps.debugjois.dev/backend/internal/podcastaddict"
	"github.com/deepakjois/apps.debugjois.dev/backend/internal/transcribe"
)

func TestHandleQueuePodcastTranscription(t *testing.T) {
	originalParser := parsePodcastForTranscriptionFunc
	originalLocalTranscribe := runLocalPodcastTranscriptionFunc
	originalID := newLocalTranscriptionIDFunc
	localTranscribeCalled := make(chan podcastaddict.Result, 1)

	parsePodcastForTranscriptionFunc = func(_ context.Context, text string) (podcastaddict.Result, error) {
		if text != "Shared from Podcast Addict" {
			t.Fatalf("expected frontend text to pass through, got %q", text)
		}
		return podcastaddict.Result{
			Source:  podcastaddict.Source{Input: text, EpisodeURL: "https://podcastaddict.com/example/episode/123"},
			Podcast: podcastaddict.Podcast{Title: "Debug Jams"},
			Episode: podcastaddict.Episode{Title: "The Payload Episode", AudioURL: "https://example.com/audio.mp3"},
		}, nil
	}
	runLocalPodcastTranscriptionFunc = func(_ context.Context, podcast podcastaddict.Result) (transcribe.Result, error) {
		localTranscribeCalled <- podcast
		return transcribe.Result{}, nil
	}
	newLocalTranscriptionIDFunc = func() string { return "local-test-transcription" }
	t.Cleanup(func() {
		parsePodcastForTranscriptionFunc = originalParser
		runLocalPodcastTranscriptionFunc = originalLocalTranscribe
		newLocalTranscriptionIDFunc = originalID
	})

	body, err := handleDirectLambdaEvent(context.Background(), json.RawMessage(`{"action":"queue-podcast-transcription","text":" Shared from Podcast Addict "}`))
	if err != nil {
		t.Fatalf("queue podcast transcription: %v", err)
	}

	var got podcastTranscriptionQueuedResponse
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("unmarshal accepted response: %v", err)
	}
	if got.TranscriptionLambdaID != "local-test-transcription" {
		t.Fatalf("expected local transcription ID, got %q", got.TranscriptionLambdaID)
	}
	if got.Podcast.Episode.Title != "The Payload Episode" {
		t.Fatalf("expected parsed podcast in response, got %#v", got.Podcast)
	}

	select {
	case podcast := <-localTranscribeCalled:
		if podcast.Episode.AudioURL == "" {
			t.Fatal("expected podcast metadata to be sent to local transcriber")
		}
	case <-time.After(time.Second):
		t.Fatal("local transcription goroutine was not called")
	}
}

func TestHandleQueuePodcastTranscriptionRejectsMissingText(t *testing.T) {
	_, err := handleDirectLambdaEvent(context.Background(), json.RawMessage(`{"action":"queue-podcast-transcription","text":"   "}`))
	if err == nil {
		t.Fatal("expected missing text error")
	}
	if transcribe.HTTPStatus(err) != 400 {
		t.Fatalf("expected HTTP 400 classification, got %d", transcribe.HTTPStatus(err))
	}
}

func TestHandleQueuePodcastTranscriptionParserError(t *testing.T) {
	originalParser := parsePodcastForTranscriptionFunc
	expected := errors.New("bad podcast input")
	parsePodcastForTranscriptionFunc = func(context.Context, string) (podcastaddict.Result, error) {
		return podcastaddict.Result{}, expected
	}
	t.Cleanup(func() { parsePodcastForTranscriptionFunc = originalParser })

	_, err := handleDirectLambdaEvent(context.Background(), json.RawMessage(`{"action":"queue-podcast-transcription","text":"bad"}`))
	if !errors.Is(err, expected) {
		t.Fatalf("expected parser error, got %v", err)
	}
}
