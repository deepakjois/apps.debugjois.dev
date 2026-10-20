package main

import (
	"encoding/json"
	"testing"
)

func TestRenderMarkdown(t *testing.T) {
	const payload = `{
		"podcast": {
			"source": {"share_title": "Share title", "episode_url": "https://example.com/ep/1"},
			"podcast": {"title": "Fall_Through"},
			"episode": {
				"title": "Git *Out*",
				"published_date": "2026-10-07",
				"duration": "1 hr 39 mins",
				"description_html": "<p>Notes with <a href=\"https://jj-vcs.dev\">jj</a>.</p>"
			}
		},
		"deepgram": {"results": {"channels": [{"alternatives": [{"paragraphs": {"paragraphs": [
			{"speaker": 0, "sentences": [{"text": "Hello there."}, {"text": "Welcome."}]},
			{"speaker": 0, "sentences": [{"text": "2024. A big year."}]},
			{"speaker": 1, "sentences": [{"text": "  "}]},
			{"speaker": 1, "sentences": [{"text": "- not a list"}]},
			{"sentences": [{"text": "Back to # zero."}]}
		]}}]}]}}
	}`

	var doc transcriptDocument
	if err := json.Unmarshal([]byte(payload), &doc); err != nil {
		t.Fatal(err)
	}

	want := `# Git \*Out\*

**Fall\_Through** · October 7, 2026 · 1 hr 39 mins

[Listen to episode](<https://example.com/ep/1>)

## Show notes

Notes with [jj](https://jj-vcs.dev).

## Transcript

**Speaker 0:** Hello there. Welcome.

2024\. A big year.

**Speaker 1:** \- not a list

**Speaker 0:** Back to \# zero.
`
	if got := renderMarkdown(doc, "Index title"); got != want {
		t.Errorf("renderMarkdown() =\n%s\nwant:\n%s", got, want)
	}
}

func TestRenderMarkdownFallsBackToIndexTitle(t *testing.T) {
	got := renderMarkdown(transcriptDocument{}, "Index title")
	want := "# Index title\n\n## Transcript\n"
	if got != want {
		t.Errorf("renderMarkdown() = %q, want %q", got, want)
	}
}
