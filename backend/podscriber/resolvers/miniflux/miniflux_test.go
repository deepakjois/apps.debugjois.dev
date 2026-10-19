package miniflux

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
)

func newTestClient(t *testing.T, baseURL string) *Client {
	t.Helper()
	client, err := New(Config{BaseURL: baseURL, Token: "secret"})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	return client
}

func readEntryFixture(t *testing.T) Entry {
	t.Helper()
	data, err := os.ReadFile("testdata/planet-money-entry.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var entry Entry
	if err := json.Unmarshal(data, &entry); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}
	return entry
}

func TestParseEntryPodcastEpisode(t *testing.T) {
	client := newTestClient(t, "https://reader.miniflux.app/v1/")
	entry := readEntryFixture(t)

	got, err := client.ParseEntry("", entry)
	if err != nil {
		t.Fatalf("ParseEntry() error = %v", err)
	}

	// The fixture's first enclosure is a proxied cover image; the audio is second.
	if !strings.HasPrefix(got.Media.URL, "https://tracking.swap.fm/") || !strings.HasSuffix(got.Media.URL, "&size=30878911") {
		t.Fatalf("media URL = %q, want the audio/mpeg enclosure", got.Media.URL)
	}
	if want := "https://reader.miniflux.app/feed/" + strconv.FormatInt(entry.FeedID, 10) + "/entry/219276503"; got.Source.Input != want {
		t.Fatalf("source input = %q, want %q", got.Source.Input, want)
	}
	if want := "https://www.npr.org/2026/10/16/nx-s1-6005392/sundance-hollywood-movies-apple-disney"; got.Source.URL != want {
		t.Fatalf("source URL = %q, want %q", got.Source.URL, want)
	}
	if got.Metadata.PublishedDate != "2026-10-16" || got.Metadata.PublishedAt == nil {
		t.Fatalf("published = %v / %q", got.Metadata.PublishedAt, got.Metadata.PublishedDate)
	}
	// reading_time 32 minutes comes from itunes:duration (1929 seconds).
	if got.Metadata.DurationSeconds != 1920 {
		t.Fatalf("duration = %v, want 1920", got.Metadata.DurationSeconds)
	}
	if got.Metadata.Series == nil || got.Metadata.Series.Title != "Planet Money" || got.Metadata.Series.URL != "https://www.npr.org/podcasts/510289/planet-money" {
		t.Fatalf("series = %#v", got.Metadata.Series)
	}
	// <br/><br/> separates paragraphs in this feed's show notes.
	if !strings.HasSuffix(got.Metadata.Description, "around the world.\n\nFor more episodes about the entertainment industry:") {
		t.Fatalf("description = %q", got.Metadata.Description)
	}
	if got.Metadata.Extra["enclosure_size_bytes"] != int64(30878911) {
		t.Fatalf("extra = %#v", got.Metadata.Extra)
	}
}

func TestParseEntryEnclosures(t *testing.T) {
	client := newTestClient(t, "https://reader.example.com/miniflux")
	original := "https://cdn.example.com/episode.mp3?id=1"
	proxied := "https://reader.example.com/miniflux/proxy/aGFzaA==/" + base64.URLEncoding.EncodeToString([]byte(original))

	tests := []struct {
		name       string
		enclosures []Enclosure
		wantURL    string
		wantErr    bool
	}{
		{name: "no enclosures", wantErr: true},
		{name: "image only", enclosures: []Enclosure{{URL: "https://cdn.example.com/cover.mp3.jpg", MimeType: "image/jpeg"}}, wantErr: true},
		{name: "proxied audio", enclosures: []Enclosure{{URL: proxied, MimeType: "audio/mpeg"}}, wantURL: original},
		{
			name: "audio MIME beats earlier extension match",
			enclosures: []Enclosure{
				{URL: "https://cdn.example.com/a.mp3", MimeType: "application/octet-stream"},
				{URL: "https://cdn.example.com/b", MimeType: "audio/x-m4a"},
			},
			wantURL: "https://cdn.example.com/b",
		},
		{name: "extension fallback", enclosures: []Enclosure{{URL: "https://cdn.example.com/a.MP3?x=1", MimeType: ""}}, wantURL: "https://cdn.example.com/a.MP3?x=1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entry := Entry{ID: 7, FeedID: 3, Title: "Episode", Enclosures: tt.enclosures}
			got, err := client.ParseEntry("", entry)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ParseEntry() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}
			if got.Media.URL != tt.wantURL {
				t.Fatalf("media URL = %q, want %q", got.Media.URL, tt.wantURL)
			}
			// Entries without a web URL fall back to their Miniflux page.
			if got.Source.URL != "https://reader.example.com/miniflux/feed/3/entry/7" {
				t.Fatalf("source URL = %q", got.Source.URL)
			}
		})
	}
}

func TestEntryID(t *testing.T) {
	client := newTestClient(t, "https://reader.example.com/miniflux/")
	tests := []struct {
		input string
		want  int64
	}{
		{"https://reader.example.com/miniflux/starred/entry/42", 42},
		{"https://READER.example.com/miniflux/unread/category/5/entry/42/", 42},
		{"https://reader.example.com/miniflux/v1/entries/42", 42},
		{"https://reader.example.com/miniflux/feed/42", 0},
		{"https://reader.example.com/starred/entry/42", 0},
		{"https://other.example.com/miniflux/starred/entry/42", 0},
		{"42", 0},
	}
	for _, tt := range tests {
		got, ok := client.EntryID(tt.input)
		if got != tt.want || ok != (tt.want != 0) {
			t.Errorf("EntryID(%q) = %d, %v; want %d", tt.input, got, ok, tt.want)
		}
	}
}

func TestStarredEntriesPaginates(t *testing.T) {
	const total = pageSize + 3
	var offsets []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Auth-Token") != "secret" {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error_message":"access unauthorized"}`))
			return
		}
		if r.URL.Path != "/v1/entries" || r.URL.Query().Get("starred") != "true" {
			t.Errorf("unexpected request %s", r.URL)
		}
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
		offsets = append(offsets, r.URL.Query().Get("offset"))
		page := entriesPage{Total: total}
		for id := offset; id < min(offset+pageSize, total); id++ {
			page.Entries = append(page.Entries, Entry{ID: int64(id + 1)})
		}
		_ = json.NewEncoder(w).Encode(page)
	}))
	defer server.Close()

	entries, err := newTestClient(t, server.URL).StarredEntries(context.Background())
	if err != nil {
		t.Fatalf("StarredEntries() error = %v", err)
	}
	if len(entries) != total || entries[total-1].ID != total {
		t.Fatalf("got %d entries, last %d", len(entries), entries[len(entries)-1].ID)
	}
	if strings.Join(offsets, ",") != "0,100" {
		t.Fatalf("offsets = %v", offsets)
	}

	unauthorized, err := New(Config{BaseURL: server.URL, Token: "wrong"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := unauthorized.StarredEntries(context.Background()); err == nil || !strings.Contains(err.Error(), "401: access unauthorized") {
		t.Fatalf("unauthorized error = %v", err)
	}
}
