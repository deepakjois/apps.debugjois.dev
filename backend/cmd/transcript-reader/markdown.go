package main

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	htmltomarkdown "github.com/JohannesKaufmann/html-to-markdown/v2"
)

type transcriptDocument struct {
	Podcast struct {
		Source struct {
			ShareTitle string `json:"share_title"`
			EpisodeURL string `json:"episode_url"`
		} `json:"source"`
		Podcast struct {
			Title string `json:"title"`
		} `json:"podcast"`
		Episode struct {
			Title           string `json:"title"`
			PublishedDate   string `json:"published_date"`
			Duration        string `json:"duration"`
			DescriptionHTML string `json:"description_html"`
		} `json:"episode"`
	} `json:"podcast"`
	Deepgram struct {
		Results struct {
			Channels []struct {
				Alternatives []struct {
					Paragraphs struct {
						Paragraphs []paragraph `json:"paragraphs"`
					} `json:"paragraphs"`
				} `json:"alternatives"`
			} `json:"channels"`
		} `json:"results"`
	} `json:"deepgram"`
}

type paragraph struct {
	Speaker   *int `json:"speaker"`
	Sentences []struct {
		Text string `json:"text"`
	} `json:"sentences"`
}

func renderMarkdown(doc transcriptDocument, fallbackTitle string) string {
	var b strings.Builder
	podcast := doc.Podcast

	title := firstNonEmpty(podcast.Episode.Title, podcast.Source.ShareTitle, fallbackTitle, "Transcript")
	fmt.Fprintf(&b, "# %s\n\n", escapeInline(title))

	var meta []string
	if name := strings.TrimSpace(podcast.Podcast.Title); name != "" {
		meta = append(meta, "**"+escapeInline(name)+"**")
	}
	if date := formatDate(podcast.Episode.PublishedDate); date != "" {
		meta = append(meta, date)
	}
	if duration := strings.TrimSpace(podcast.Episode.Duration); duration != "" {
		meta = append(meta, escapeInline(duration))
	}
	if len(meta) > 0 {
		fmt.Fprintf(&b, "%s\n\n", strings.Join(meta, " · "))
	}
	if url := strings.TrimSpace(podcast.Source.EpisodeURL); url != "" {
		fmt.Fprintf(&b, "[Listen to episode](<%s>)\n\n", url)
	}

	if notes := showNotes(podcast.Episode.DescriptionHTML); notes != "" {
		fmt.Fprintf(&b, "## Show notes\n\n%s\n\n", notes)
	}

	b.WriteString("## Transcript\n\n")
	lastSpeaker := -1
	for _, paragraph := range transcriptParagraphs(doc) {
		texts := make([]string, 0, len(paragraph.Sentences))
		for _, sentence := range paragraph.Sentences {
			if text := strings.TrimSpace(sentence.Text); text != "" {
				texts = append(texts, text)
			}
		}
		if len(texts) == 0 {
			continue
		}
		speaker := 0
		if paragraph.Speaker != nil {
			speaker = *paragraph.Speaker
		}
		text := escapeParagraph(strings.Join(texts, " "))
		if speaker != lastSpeaker {
			fmt.Fprintf(&b, "**Speaker %d:** %s\n\n", speaker, text)
		} else {
			fmt.Fprintf(&b, "%s\n\n", text)
		}
		lastSpeaker = speaker
	}

	return strings.TrimRight(b.String(), "\n") + "\n"
}

func transcriptParagraphs(doc transcriptDocument) []paragraph {
	channels := doc.Deepgram.Results.Channels
	if len(channels) == 0 || len(channels[0].Alternatives) == 0 {
		return nil
	}
	return channels[0].Alternatives[0].Paragraphs.Paragraphs
}

func showNotes(descriptionHTML string) string {
	if strings.TrimSpace(descriptionHTML) == "" {
		return ""
	}
	notes, err := htmltomarkdown.ConvertString(descriptionHTML)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(notes)
}

func formatDate(value string) string {
	value = strings.TrimSpace(value)
	date, err := time.Parse(time.DateOnly, value)
	if err != nil {
		return value
	}
	return date.Format("January 2, 2006")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

var inlineEscaper = strings.NewReplacer(
	`\`, `\\`, "`", "\\`", `*`, `\*`, `_`, `\_`,
	`[`, `\[`, `]`, `\]`, `<`, `\<`, `>`, `\>`, `#`, `\#`, `|`, `\|`,
)

// A paragraph that starts with "2024. " or "- " would otherwise render as a
// list item.
var orderedListMarker = regexp.MustCompile(`^(\d{1,9})([.)]\s)`)

func escapeInline(text string) string {
	return inlineEscaper.Replace(text)
}

func escapeParagraph(text string) string {
	text = orderedListMarker.ReplaceAllString(escapeInline(text), `$1\$2`)
	if strings.HasPrefix(text, "- ") || strings.HasPrefix(text, "+ ") {
		text = `\` + text
	}
	return text
}
