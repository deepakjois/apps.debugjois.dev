package podcastaddict

import (
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/PuerkitoBio/goquery"
)

func TestParseInput(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantTitle string
		wantURL   string
		wantErr   bool
	}{
		{
			name:    "raw URL",
			input:   "https://podcastaddict.com/better-offline/episode/221030037",
			wantURL: "https://podcastaddict.com/better-offline/episode/221030037",
		},
		{
			name:      "multiline share payload",
			input:     readFixture(t, "overthink-share.txt"),
			wantTitle: "[Overthink] Closer Look: Levinas, On Escape",
			wantURL:   "https://podcastaddict.com/overthink/episode/221058424",
		},
		{
			name:    "Markdown URL",
			input:   `[Show] Episode - [Episode](https://podcastaddict.com/show/episode/123) via`,
			wantURL: "https://podcastaddict.com/show/episode/123",
		},
		{name: "HTTP URL", input: "http://podcastaddict.com/show/episode/123", wantErr: true},
		{name: "non-episode path", input: "https://podcastaddict.com/show", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseInput(tt.input)
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseInput() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}
			if got.shareTitle != tt.wantTitle || got.episodeURL != tt.wantURL {
				t.Fatalf("parseInput() = %#v", got)
			}
		})
	}
}

func TestNewUsesDefaultTimeout(t *testing.T) {
	if got := New(nil).client.Timeout; got != 15*time.Second {
		t.Fatalf("default client timeout = %v", got)
	}
}

func TestExtractorFetchesAndParsesEpisode(t *testing.T) {
	body := readFixture(t, "better-offline.html")
	var gotUserAgent string
	client := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		gotUserAgent = req.Header.Get("User-Agent")
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(body)),
			Header:     make(http.Header),
			Request:    req,
		}, nil
	})}

	got, err := New(client).Extract(context.Background(), "https://podcastaddict.com/better-offline/episode/221030037")
	if err != nil {
		t.Fatalf("Extract() error = %v", err)
	}
	if gotUserAgent != UserAgent {
		t.Fatalf("User-Agent = %q", gotUserAgent)
	}
	if got.Metadata.Title != "Better Offline - The Reality of AI Economics With Paul Kedrosky" {
		t.Fatalf("title = %q", got.Metadata.Title)
	}
	if got.Metadata.Series == nil || got.Metadata.Series.Title != "Better Offline" {
		t.Fatalf("series = %#v", got.Metadata.Series)
	}
	if got.Metadata.PublishedAt == nil || got.Metadata.PublishedDate != "2026-04-06" {
		t.Fatalf("publication metadata = %#v", got.Metadata)
	}
	if got.Metadata.DurationSeconds != 51*60 {
		t.Fatalf("duration seconds = %v", got.Metadata.DurationSeconds)
	}
	if !strings.Contains(got.Metadata.Description, "Paul Kedrosky") {
		t.Fatalf("plain description = %q", got.Metadata.Description)
	}
	if !strings.Contains(got.Metadata.DescriptionHTML, "paulkedrosky.com") {
		t.Fatalf("HTML description = %q", got.Metadata.DescriptionHTML)
	}
	if got.Media.URL == "" {
		t.Fatal("media URL is empty")
	}
}

func TestParseEpisodeDocumentDenseDescription(t *testing.T) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(readFixture(t, "we-was-watching.html")))
	if err != nil {
		t.Fatalf("NewDocumentFromReader() error = %v", err)
	}
	got, err := parseEpisodeDocument(doc, parsedInput{
		input:      "https://podcastaddict.com/we-was-watching-an-invincible-podcast/episode/221018105",
		episodeURL: "https://podcastaddict.com/we-was-watching-an-invincible-podcast/episode/221018105",
	})
	if err != nil {
		t.Fatalf("parseEpisodeDocument() error = %v", err)
	}
	if got.Metadata.DurationSeconds != 70*60 {
		t.Fatalf("duration seconds = %v", got.Metadata.DurationSeconds)
	}
	if !strings.Contains(got.Metadata.DescriptionHTML, "#Invincible") {
		t.Fatalf("HTML description = %q", got.Metadata.DescriptionHTML)
	}
}

func TestParseEpisodeDocumentErrors(t *testing.T) {
	tests := []struct {
		name string
		html string
	}{
		{name: "missing JSON-LD", html: `<div id="episode_body"><p>hello</p></div>`},
		{name: "missing description", html: `<script type="application/ld+json">{"@type":"PodcastEpisode","associatedMedia":{"contentUrl":"https://example.com/a.mp3"}}</script>`},
		{name: "missing audio", html: `<script type="application/ld+json">{"@type":"PodcastEpisode"}</script><div id="episode_body"><p>hello</p></div>`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc, err := goquery.NewDocumentFromReader(strings.NewReader(tt.html))
			if err != nil {
				t.Fatalf("NewDocumentFromReader() error = %v", err)
			}
			_, err = parseEpisodeDocument(doc, parsedInput{input: "input", episodeURL: "https://podcastaddict.com/show/episode/1"})
			if err == nil {
				t.Fatal("parseEpisodeDocument() error = nil")
			}
		})
	}
}

func TestDurationSeconds(t *testing.T) {
	if got := durationSeconds("1 hr 2 mins 3 secs"); got != 3723 {
		t.Fatalf("durationSeconds() = %v", got)
	}
}

func readFixture(t *testing.T, name string) string {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("os.ReadFile() error = %v", err)
	}
	return string(body)
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}
