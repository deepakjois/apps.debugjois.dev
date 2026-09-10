// Package podcastaddict extracts podcast and episode metadata from Podcast
// Addict episode pages and share payloads.
package podcastaddict

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"

	"github.com/deepakjois/apps.debugjois.dev/backend-v2/podscriber"
)

const UserAgent = "Mozilla/5.0 (Android 14; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0"

var (
	markdownURLPattern  = regexp.MustCompile(`\((https?://(?:www\.)?podcastaddict\.com/[^)\s]+)\)`)
	urlPattern          = regexp.MustCompile(`https?://(?:www\.)?podcastaddict\.com/[^\s)]+`)
	episodePathPattern  = regexp.MustCompile(`(^|/)episode/\d+/?$`)
	durationPartPattern = regexp.MustCompile(`(?i)(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)`)
)

// podcastEpisodeJSONLD contains the Podcast Addict fields mapped into common metadata.
type podcastEpisodeJSONLD struct {
	Type            string `json:"@type"`
	URL             string `json:"url"`
	Name            string `json:"name"`
	DatePublished   string `json:"datePublished"`
	Description     string `json:"description"`
	AssociatedMedia struct {
		ContentURL string `json:"contentUrl"`
	} `json:"associatedMedia"`
	PartOfSeries struct {
		Name string `json:"name"`
		URL  string `json:"url"`
	} `json:"partOfSeries"`
}

// parsedInput retains the original share payload and its extracted episode details.
type parsedInput struct {
	input      string
	shareTitle string
	episodeURL string
}

// Extractor fetches Podcast Addict pages using Client.
type Extractor struct {
	client *http.Client
}

func New(client *http.Client) *Extractor {
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	return &Extractor{client: client}
}

func (e *Extractor) CanHandle(input string) bool {
	return urlPattern.MatchString(strings.TrimSpace(input))
}

func (e *Extractor) Extract(ctx context.Context, input string) (podscriber.TranscriptionInput, error) {
	if e == nil || e.client == nil {
		return podscriber.TranscriptionInput{}, errors.New("extract Podcast Addict episode: HTTP client is nil")
	}
	source, err := parseInput(input)
	if err != nil {
		return podscriber.TranscriptionInput{}, err
	}
	doc, err := e.fetchDocument(ctx, source.episodeURL)
	if err != nil {
		return podscriber.TranscriptionInput{}, err
	}
	return parseEpisodeDocument(doc, source)
}

func parseInput(raw string) (parsedInput, error) {
	input := strings.TrimSpace(raw)
	if input == "" {
		return parsedInput{}, invalidInput(errors.New("input is empty"))
	}

	matchedURL := extractEpisodeURL(input)
	if matchedURL == "" {
		return parsedInput{}, invalidInput(errors.New("input does not contain a Podcast Addict URL"))
	}
	episodeURL, err := normalizeEpisodeURL(matchedURL)
	if err != nil {
		return parsedInput{}, err
	}

	result := parsedInput{input: input, episodeURL: episodeURL}
	lines := strings.Split(input, "\n")
	if len(lines) > 1 {
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" {
				continue
			}
			if strings.Contains(trimmed, episodeURL) || urlPattern.MatchString(trimmed) {
				break
			}
			result.shareTitle = trimmed
			break
		}
	}
	return result, nil
}

func extractEpisodeURL(input string) string {
	match := markdownURLPattern.FindStringSubmatch(input)
	if len(match) == 2 {
		return match[1]
	}
	return urlPattern.FindString(input)
}

func normalizeEpisodeURL(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", invalidInput(fmt.Errorf("parse episode URL: %w", err))
	}
	if u.Scheme != "https" {
		return "", invalidInput(errors.New("expected Podcast Addict HTTPS URL"))
	}
	if !isPodcastAddictHost(u.Host) {
		return "", invalidInput(errors.New("expected Podcast Addict URL"))
	}
	if !episodePathPattern.MatchString(u.EscapedPath()) {
		return "", invalidInput(errors.New("expected Podcast Addict episode URL"))
	}
	u.Host = strings.ToLower(u.Host)
	u.Fragment = ""
	return u.String(), nil
}

func isPodcastAddictHost(host string) bool {
	switch strings.ToLower(host) {
	case "podcastaddict.com", "www.podcastaddict.com":
		return true
	default:
		return false
	}
}

func (e *Extractor) fetchDocument(ctx context.Context, episodeURL string) (*goquery.Document, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, episodeURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build Podcast Addict request: %w", err)
	}
	req.Header.Set("User-Agent", UserAgent)

	resp, err := e.client.Do(req)
	if err != nil {
		return nil, upstream(fmt.Errorf("fetch episode page: %w", err))
	}
	if resp.Body == nil {
		return nil, upstream(errors.New("fetch episode page: response body is nil"))
	}
	if resp.StatusCode != http.StatusOK {
		statusErr := fmt.Errorf("fetch episode page: unexpected status %d", resp.StatusCode)
		if closeErr := resp.Body.Close(); closeErr != nil {
			statusErr = errors.Join(statusErr, fmt.Errorf("close episode response: %w", closeErr))
		}
		return nil, upstream(statusErr)
	}
	doc, parseErr := goquery.NewDocumentFromReader(resp.Body)
	closeErr := resp.Body.Close()
	if parseErr != nil {
		return nil, upstream(fmt.Errorf("parse episode HTML: %w", parseErr))
	}
	if closeErr != nil {
		return nil, upstream(fmt.Errorf("close episode response: %w", closeErr))
	}
	return doc, nil
}

func parseEpisodeDocument(doc *goquery.Document, source parsedInput) (podscriber.TranscriptionInput, error) {
	episode, err := extractPodcastEpisodeJSONLD(doc)
	if err != nil {
		return podscriber.TranscriptionInput{}, err
	}
	descriptionHTML, description, err := extractEpisodeDescription(doc)
	if err != nil {
		return podscriber.TranscriptionInput{}, err
	}
	_, durationDisplay := extractVisibleMetadata(doc)

	var publishedAt *time.Time
	publishedRaw := decodeHTMLString(episode.DatePublished)
	publishedDate := ""
	if publishedRaw != "" {
		parsed, parseErr := time.Parse(time.RFC3339, publishedRaw)
		if parseErr == nil {
			publishedAt = &parsed
			publishedDate = parsed.Format(time.DateOnly)
		}
	}

	extra := make(map[string]any)
	if source.shareTitle != "" {
		extra["share_title"] = source.shareTitle
	}
	if durationDisplay != "" {
		extra["duration_display"] = durationDisplay
	}
	if publishedRaw != "" && publishedAt == nil {
		extra["published_at_raw"] = publishedRaw
	}
	if len(extra) == 0 {
		extra = nil
	}

	series := &podscriber.Series{
		Title: decodeHTMLString(episode.PartOfSeries.Name),
		URL:   decodeHTMLString(episode.PartOfSeries.URL),
	}
	if series.Title == "" && series.URL == "" {
		series = nil
	}

	result := podscriber.TranscriptionInput{
		SchemaVersion: podscriber.SchemaVersion,
		Source: podscriber.Source{
			Type:  podscriber.SourceTypePodcastAddict,
			Input: source.input,
			URL:   source.episodeURL,
		},
		Media: podscriber.Media{
			Type: podscriber.MediaTypeRemoteURL,
			URL:  decodeHTMLString(episode.AssociatedMedia.ContentURL),
		},
		Metadata: podscriber.Metadata{
			Title:           decodeHTMLString(episode.Name),
			Description:     description,
			DescriptionHTML: descriptionHTML,
			PublishedAt:     publishedAt,
			PublishedDate:   publishedDate,
			DurationSeconds: durationSeconds(durationDisplay),
			Series:          series,
			Extra:           extra,
		},
	}
	if err := result.Validate(); err != nil {
		return podscriber.TranscriptionInput{}, upstream(fmt.Errorf("invalid episode metadata: %w", err))
	}
	return result, nil
}

func extractPodcastEpisodeJSONLD(doc *goquery.Document) (podcastEpisodeJSONLD, error) {
	var (
		found   bool
		episode podcastEpisodeJSONLD
	)
	doc.Find(`script[type="application/ld+json"]`).EachWithBreak(func(_ int, selection *goquery.Selection) bool {
		candidate, ok := decodePodcastEpisodeScript(strings.TrimSpace(selection.Text()))
		if !ok {
			return true
		}
		episode = candidate
		found = true
		return false
	})
	if !found {
		return podcastEpisodeJSONLD{}, upstream(errors.New("missing PodcastEpisode JSON-LD"))
	}
	return episode, nil
}

func decodePodcastEpisodeScript(script string) (podcastEpisodeJSONLD, bool) {
	if script == "" {
		return podcastEpisodeJSONLD{}, false
	}
	var array []json.RawMessage
	if err := json.Unmarshal([]byte(script), &array); err == nil {
		for _, item := range array {
			if episode, ok := decodePodcastEpisodeObject(item); ok {
				return episode, true
			}
		}
		return podcastEpisodeJSONLD{}, false
	}
	return decodePodcastEpisodeObject([]byte(script))
}

func decodePodcastEpisodeObject(data []byte) (podcastEpisodeJSONLD, bool) {
	var probe struct {
		Type string `json:"@type"`
	}
	if err := json.Unmarshal(data, &probe); err != nil || probe.Type != "PodcastEpisode" {
		return podcastEpisodeJSONLD{}, false
	}
	var episode podcastEpisodeJSONLD
	if err := json.Unmarshal(data, &episode); err != nil {
		return podcastEpisodeJSONLD{}, false
	}
	return episode, true
}

func extractEpisodeDescription(doc *goquery.Document) (string, string, error) {
	selection := doc.Find("div#episode_body").First()
	if selection.Length() == 0 {
		return "", "", upstream(errors.New("missing episode description"))
	}
	descriptionHTML, err := selection.Html()
	if err != nil {
		return "", "", upstream(fmt.Errorf("extract episode description HTML: %w", err))
	}
	descriptionText := selectionText(selection)
	if descriptionText == "" {
		return "", "", upstream(errors.New("episode description is empty"))
	}
	return strings.TrimSpace(descriptionHTML), descriptionText, nil
}

func extractVisibleMetadata(doc *goquery.Document) (string, string) {
	spans := doc.Find("div.titlestack h5 span")
	if spans.Length() == 0 {
		return "", ""
	}
	displayDate := cleanText(spans.First().Text())
	duration := ""
	if spans.Length() > 1 {
		duration = cleanText(spans.Eq(1).Text())
	}
	return displayDate, duration
}

func durationSeconds(value string) float64 {
	matches := durationPartPattern.FindAllStringSubmatch(value, -1)
	var total float64
	for _, match := range matches {
		amount, err := strconv.ParseFloat(match[1], 64)
		if err != nil {
			continue
		}
		switch strings.ToLower(match[2])[0] {
		case 'h':
			total += amount * 60 * 60
		case 'm':
			total += amount * 60
		case 's':
			total += amount
		}
	}
	return total
}

func selectionText(selection *goquery.Selection) string {
	paragraphs := selection.Find("p")
	if paragraphs.Length() == 0 {
		return cleanText(selection.Text())
	}
	parts := make([]string, 0, paragraphs.Length())
	paragraphs.Each(func(_ int, paragraph *goquery.Selection) {
		if text := cleanText(paragraph.Text()); text != "" {
			parts = append(parts, text)
		}
	})
	if len(parts) == 0 {
		return cleanText(selection.Text())
	}
	return strings.Join(parts, "\n\n")
}

func cleanText(value string) string {
	value = strings.ReplaceAll(value, "\u00a0", " ")
	return strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
}

func decodeHTMLString(value string) string {
	decoded := value
	for range 3 {
		next := html.UnescapeString(decoded)
		if next == decoded {
			break
		}
		decoded = next
	}
	return decoded
}

func invalidInput(err error) error {
	return fmt.Errorf("parse Podcast Addict input: %w", err)
}

func upstream(err error) error {
	return fmt.Errorf("extract Podcast Addict episode: %w", err)
}
