// Package miniflux reads entries from a Miniflux instance's REST API and
// extracts podcast episode metadata and audio enclosures from them.
package miniflux

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber"
)

// DefaultBaseURL is the hosted Miniflux instance.
const DefaultBaseURL = "https://reader.miniflux.app"

const (
	// TokenEnv names the environment variable holding the Miniflux API token.
	TokenEnv = "MINIFLUX_API_TOKEN"
	// BaseURLEnv names the optional environment override for DefaultBaseURL.
	BaseURLEnv = "MINIFLUX_URL"
)

const pageSize = 100

var (
	uiEntryPathPattern  = regexp.MustCompile(`^(?:/[^/]+)*/entry/(\d+)/?$`)
	apiEntryPathPattern = regexp.MustCompile(`^/v1/entries/(\d+)/?$`)
	audioExtensions     = map[string]bool{
		".mp3": true, ".m4a": true, ".aac": true, ".ogg": true, ".oga": true,
		".opus": true, ".wav": true, ".flac": true,
	}
)

// Entry is the subset of the Miniflux API entry object used for extraction.
type Entry struct {
	ID          int64       `json:"id"`
	FeedID      int64       `json:"feed_id"`
	Status      string      `json:"status"`
	Title       string      `json:"title"`
	URL         string      `json:"url"`
	Author      string      `json:"author"`
	Content     string      `json:"content"`
	PublishedAt string      `json:"published_at"`
	Starred     bool        `json:"starred"`
	ReadingTime int         `json:"reading_time"`
	Tags        []string    `json:"tags"`
	Enclosures  []Enclosure `json:"enclosures"`
	Feed        Feed        `json:"feed"`
}

// Enclosure is a media attachment of an entry, such as a podcast's audio file.
type Enclosure struct {
	ID       int64  `json:"id"`
	URL      string `json:"url"`
	MimeType string `json:"mime_type"`
	Size     int64  `json:"size"`
}

// Feed is the subset of the feed object embedded in each API entry.
type Feed struct {
	ID      int64  `json:"id"`
	Title   string `json:"title"`
	SiteURL string `json:"site_url"`
	FeedURL string `json:"feed_url"`
}

type entriesPage struct {
	Total   int     `json:"total"`
	Entries []Entry `json:"entries"`
}

// Config identifies a Miniflux instance and its API credentials.
type Config struct {
	// BaseURL is the instance root; a trailing /v1 API suffix is accepted.
	BaseURL    string
	Token      string
	HTTPClient *http.Client
}

// Client calls the Miniflux REST API and parses its entries.
type Client struct {
	baseURL *url.URL
	token   string
	client  *http.Client
}

func New(config Config) (*Client, error) {
	rawBase := strings.TrimSpace(config.BaseURL)
	if rawBase == "" {
		rawBase = DefaultBaseURL
	}
	base, err := url.Parse(rawBase)
	if err != nil {
		return nil, fmt.Errorf("configure Miniflux client: parse base URL: %w", err)
	}
	if (base.Scheme != "http" && base.Scheme != "https") || base.Host == "" {
		return nil, errors.New("configure Miniflux client: base URL must be an HTTP(S) URL")
	}
	base.Path = strings.TrimSuffix(strings.TrimSuffix(base.Path, "/"), "/v1")
	base.RawPath, base.RawQuery, base.Fragment = "", "", ""
	base.Host = strings.ToLower(base.Host)

	token := strings.TrimSpace(config.Token)
	if token == "" {
		return nil, errors.New("configure Miniflux client: API token is empty")
	}
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{baseURL: base, token: token, client: httpClient}, nil
}

// NewFromEnv configures a client from TokenEnv and, when set, BaseURLEnv.
func NewFromEnv(httpClient *http.Client) (*Client, error) {
	client, err := New(Config{BaseURL: os.Getenv(BaseURLEnv), Token: os.Getenv(TokenEnv), HTTPClient: httpClient})
	if err != nil {
		return nil, fmt.Errorf("%w (set %s)", err, TokenEnv)
	}
	return client, nil
}

// EntryURL is the web UI URL of entry, which the extractor accepts as input.
func (c *Client) EntryURL(entry Entry) string {
	return c.baseURL.JoinPath("feed", strconv.FormatInt(entry.FeedID, 10), "entry", strconv.FormatInt(entry.ID, 10)).String()
}

// Entry fetches a single entry by ID.
func (c *Client) Entry(ctx context.Context, id int64) (Entry, error) {
	var entry Entry
	if err := c.get(ctx, "/v1/entries/"+strconv.FormatInt(id, 10), nil, &entry); err != nil {
		return Entry{}, fmt.Errorf("fetch Miniflux entry %d: %w", id, err)
	}
	return entry, nil
}

// StarredEntries fetches every starred entry, newest first.
func (c *Client) StarredEntries(ctx context.Context) ([]Entry, error) {
	var entries []Entry
	for {
		query := url.Values{
			"starred":   {"true"},
			"order":     {"published_at"},
			"direction": {"desc"},
			"limit":     {strconv.Itoa(pageSize)},
			"offset":    {strconv.Itoa(len(entries))},
		}
		var page entriesPage
		if err := c.get(ctx, "/v1/entries", query, &page); err != nil {
			return nil, fmt.Errorf("fetch starred Miniflux entries: %w", err)
		}
		entries = append(entries, page.Entries...)
		if len(page.Entries) < pageSize || len(entries) >= page.Total {
			return entries, nil
		}
	}
}

// Unstar removes the star from entry id and reports whether it was starred.
// Miniflux only offers a star toggle, so the current state is read first to
// avoid re-starring an entry that was already unstarred (for example when a
// Lambda retry repeats a successful transcription).
func (c *Client) Unstar(ctx context.Context, id int64) (bool, error) {
	entry, err := c.Entry(ctx, id)
	if err != nil {
		return false, err
	}
	if !entry.Starred {
		return false, nil
	}
	if err := c.do(ctx, http.MethodPut, "/v1/entries/"+strconv.FormatInt(id, 10)+"/bookmark", nil, nil); err != nil {
		return false, fmt.Errorf("unstar Miniflux entry %d: %w", id, err)
	}
	return true, nil
}

// UnstarEntryURL unstars the entry identified by a web UI or API entry URL
// on this instance, such as a Miniflux transcription's source input.
func (c *Client) UnstarEntryURL(ctx context.Context, entryURL string) (bool, error) {
	id, ok := c.EntryID(entryURL)
	if !ok {
		return false, fmt.Errorf("unstar Miniflux entry: not an entry URL on %s: %q", c.baseURL.Host, entryURL)
	}
	return c.Unstar(ctx, id)
}

func (c *Client) get(ctx context.Context, apiPath string, query url.Values, target any) error {
	return c.do(ctx, http.MethodGet, apiPath, query, target)
}

func (c *Client) do(ctx context.Context, method, apiPath string, query url.Values, target any) error {
	endpoint := c.baseURL.JoinPath(apiPath)
	endpoint.RawQuery = query.Encode()
	req, err := http.NewRequestWithContext(ctx, method, endpoint.String(), nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-Auth-Token", c.token)
	req.Header.Set("Accept", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("request %s: %w", apiPath, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		var apiErr struct {
			Message string `json:"error_message"`
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		if json.Unmarshal(body, &apiErr) == nil && apiErr.Message != "" {
			return fmt.Errorf("request %s: unexpected status %d: %s", apiPath, resp.StatusCode, apiErr.Message)
		}
		return fmt.Errorf("request %s: unexpected status %d", apiPath, resp.StatusCode)
	}
	if target == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		return fmt.Errorf("decode %s response: %w", apiPath, err)
	}
	return nil
}

// EntryID extracts the entry ID from a web UI or API entry URL on this
// instance. It returns false for any other input.
func (c *Client) EntryID(input string) (int64, bool) {
	u, err := url.Parse(strings.TrimSpace(input))
	if err != nil || !strings.EqualFold(u.Host, c.baseURL.Host) || (u.Scheme != "http" && u.Scheme != "https") {
		return 0, false
	}
	relative, ok := strings.CutPrefix(u.Path, c.baseURL.Path)
	if !ok {
		return 0, false
	}
	for _, pattern := range []*regexp.Regexp{apiEntryPathPattern, uiEntryPathPattern} {
		if match := pattern.FindStringSubmatch(relative); match != nil {
			id, err := strconv.ParseInt(match[1], 10, 64)
			return id, err == nil && id > 0
		}
	}
	return 0, false
}

// Extractor resolves Miniflux entry URLs into podcast transcription input.
type Extractor struct {
	client *Client
}

func NewExtractor(client *Client) *Extractor {
	return &Extractor{client: client}
}

func (e *Extractor) CanHandle(input string) bool {
	if e == nil || e.client == nil {
		return false
	}
	_, ok := e.client.EntryID(input)
	return ok
}

func (e *Extractor) Extract(ctx context.Context, input string) (podscriber.TranscriptionInput, error) {
	if e == nil || e.client == nil {
		return podscriber.TranscriptionInput{}, errors.New("extract Miniflux entry: client is nil")
	}
	input = strings.TrimSpace(input)
	id, ok := e.client.EntryID(input)
	if !ok {
		return podscriber.TranscriptionInput{}, errors.New("extract Miniflux entry: expected a Miniflux entry URL")
	}
	entry, err := e.client.Entry(ctx, id)
	if err != nil {
		return podscriber.TranscriptionInput{}, err
	}
	return e.client.ParseEntry(input, entry)
}

// ParseEntry maps an API entry to transcription input. input is the original
// user input recorded as the source; callers without one should pass EntryURL.
func (c *Client) ParseEntry(input string, entry Entry) (podscriber.TranscriptionInput, error) {
	fail := func(err error) (podscriber.TranscriptionInput, error) {
		return podscriber.TranscriptionInput{}, fmt.Errorf("parse Miniflux entry %d: %w", entry.ID, err)
	}

	enclosure, ok := audioEnclosure(entry.Enclosures)
	if !ok {
		return fail(errors.New("entry has no audio enclosure"))
	}
	mediaURL := c.unproxy(enclosure.URL)

	entryURL := c.EntryURL(entry)
	sourceURL := canonicalURL(entry.URL)
	if sourceURL == "" {
		sourceURL = entryURL
	}
	if strings.TrimSpace(input) == "" {
		input = entryURL
	}

	var publishedAt *time.Time
	publishedDate := ""
	if parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(entry.PublishedAt)); err == nil {
		publishedAt = &parsed
		publishedDate = parsed.Format(time.DateOnly)
	}

	var series *podscriber.Series
	seriesURL := strings.TrimSpace(entry.Feed.SiteURL)
	if seriesURL == "" {
		seriesURL = strings.TrimSpace(entry.Feed.FeedURL)
	}
	if title := strings.TrimSpace(entry.Feed.Title); title != "" || seriesURL != "" {
		series = &podscriber.Series{Title: title, URL: seriesURL}
	}

	// Miniflux replaces an RSS entry's estimated reading time with its
	// itunes:duration, truncated to whole minutes, so for podcast entries it
	// is the episode length. Feeds without that tag keep a word-count estimate.
	durationSeconds := float64(entry.ReadingTime * 60)

	extra := map[string]any{
		"miniflux_entry_id":  entry.ID,
		"miniflux_feed_id":   entry.FeedID,
		"miniflux_entry_url": entryURL,
	}
	setString(extra, "feed_url", entry.Feed.FeedURL)
	setString(extra, "author", entry.Author)
	setString(extra, "enclosure_mime_type", enclosure.MimeType)
	if enclosure.Size > 0 {
		extra["enclosure_size_bytes"] = enclosure.Size
	}
	if len(entry.Tags) > 0 {
		extra["tags"] = entry.Tags
	}

	result := podscriber.TranscriptionInput{
		SchemaVersion: podscriber.SchemaVersion,
		Source: podscriber.Source{
			Type:  podscriber.SourceTypeMiniflux,
			Input: strings.TrimSpace(input),
			URL:   sourceURL,
		},
		Media: podscriber.Media{Type: podscriber.MediaTypeRemoteURL, URL: mediaURL},
		Metadata: podscriber.Metadata{
			Title:           strings.TrimSpace(entry.Title),
			Description:     htmlToText(entry.Content),
			DescriptionHTML: strings.TrimSpace(entry.Content),
			PublishedAt:     publishedAt,
			PublishedDate:   publishedDate,
			DurationSeconds: durationSeconds,
			Series:          series,
			Extra:           extra,
		},
	}
	if err := result.Validate(); err != nil {
		return fail(err)
	}
	return result, nil
}

// HasAudio reports whether entry has an audio enclosure ParseEntry can use,
// distinguishing podcast episodes from ordinary starred articles.
func HasAudio(entry Entry) bool {
	_, ok := audioEnclosure(entry.Enclosures)
	return ok
}

func audioEnclosure(enclosures []Enclosure) (Enclosure, bool) {
	var fallback *Enclosure
	for i := range enclosures {
		enclosure := enclosures[i]
		u, err := url.Parse(strings.TrimSpace(enclosure.URL))
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			continue
		}
		mimeType := strings.ToLower(strings.TrimSpace(enclosure.MimeType))
		if strings.HasPrefix(mimeType, "audio/") {
			return enclosure, true
		}
		if fallback == nil && audioExtensions[strings.ToLower(path.Ext(u.Path))] {
			fallback = &enclosures[i]
		}
	}
	if fallback != nil {
		return *fallback, true
	}
	return Enclosure{}, false
}

// unproxy reverses Miniflux's media proxy rewriting, which serves enclosures
// as <base>/proxy/<hmac>/<base64url(original URL)> when proxying is enabled
// for that media type. Other URLs are returned unchanged.
func (c *Client) unproxy(raw string) string {
	raw = strings.TrimSpace(raw)
	u, err := url.Parse(raw)
	if err != nil || !strings.EqualFold(u.Host, c.baseURL.Host) {
		return raw
	}
	rest, ok := strings.CutPrefix(u.Path, c.baseURL.Path+"/proxy/")
	if !ok {
		return raw
	}
	parts := strings.Split(rest, "/")
	if len(parts) != 2 {
		return raw
	}
	decoded, err := base64.URLEncoding.DecodeString(parts[1])
	if err != nil {
		return raw
	}
	original, err := url.Parse(string(decoded))
	if err != nil || (original.Scheme != "http" && original.Scheme != "https") || original.Host == "" {
		return raw
	}
	return original.String()
}

func canonicalURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return ""
	}
	u.Host = strings.ToLower(u.Host)
	u.Fragment = ""
	return u.String()
}

func setString(values map[string]any, key, value string) {
	if value = strings.TrimSpace(value); value != "" {
		values[key] = value
	}
}
