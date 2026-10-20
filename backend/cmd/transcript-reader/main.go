package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"slices"
	"strings"
	"time"

	"charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/list"
	tea "charm.land/bubbletea/v2"

	"github.com/deepakjois/apps.debugjois.dev/backend/transcripts"
)

const (
	indexURL    = transcripts.LocationPrefix + "transcripts.json"
	httpTimeout = time.Minute
)

func main() {
	flag.Usage = func() {
		_, _ = fmt.Fprintf(flag.CommandLine.Output(), "Usage: transcript-reader [--edit]\n\n"+
			"Pick a published transcript and print it as Markdown on stdout.\n"+
			"The picker draws on stderr, so stdout can be piped.\n\n"+
			"With --edit, mark transcripts to archive or delete instead, and save\n"+
			"the marks to the index in S3. This needs AWS credentials.\n")
	}
	edit := flag.Bool("edit", false, "archive or delete transcripts instead of reading one")
	flag.Parse()

	var err error
	if *edit {
		err = runEditor(context.Background())
	} else {
		err = run(context.Background(), os.Stdout)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context, stdout io.Writer) error {
	client := &http.Client{Timeout: httpTimeout}

	var index transcripts.Index
	if err := getJSON(ctx, client, indexURL, &index); err != nil {
		return fmt.Errorf("fetch transcript index: %w", err)
	}
	if len(index.Transcripts) == 0 {
		return errors.New("transcript index is empty")
	}

	chosen, err := pick(ctx, index.Transcripts)
	if err != nil {
		return err
	}
	if chosen == nil {
		return errors.New("no transcript selected")
	}

	var doc transcriptDocument
	if err := getJSON(ctx, client, chosen.Location, &doc); err != nil {
		return fmt.Errorf("fetch transcript %q: %w", chosen.Title, err)
	}

	_, err = io.WriteString(stdout, renderMarkdown(doc, chosen.Title))
	return err
}

func getJSON(ctx context.Context, client *http.Client, url string, target any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: %s", url, resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(target)
}

type entry struct{ transcripts.ListItem }

func (e entry) Title() string { return e.ListItem.Title }

func (e entry) Description() string {
	return strings.Join(nonEmpty(formatDate(e.Date), e.podcastSlug()), " · ")
}

func (e entry) FilterValue() string { return e.ListItem.Title + " " + e.podcastSlug() }

// Object names are "<podcast-slug>--<episode-slug>--<sha256>.json", and the
// index carries no podcast name.
func (e entry) podcastSlug() string {
	slug, _, _ := strings.Cut(path.Base(e.Location), "--")
	return slug
}

func nonEmpty(values ...string) []string {
	var out []string
	for _, value := range values {
		if value != "" {
			out = append(out, value)
		}
	}
	return out
}

func newList(items []transcripts.ListItem, marks map[string]transcripts.ItemState) list.Model {
	// Dates are YYYY-MM-DD, so string order is chronological order.
	items = slices.Clone(items)
	slices.SortStableFunc(items, func(a, b transcripts.ListItem) int {
		return strings.Compare(b.Date, a.Date)
	})

	listItems := make([]list.Item, len(items))
	for i, item := range items {
		listItems[i] = entry{item}
	}

	l := list.New(listItems, newMarkDelegate(false, marks), 0, 0)
	l.Title = "Transcripts"
	l.SetStatusBarItemName("transcript", "transcripts")
	// bubbles v2.2.1 binds quit to "v" and labels it "select".
	l.KeyMap.Quit = key.NewBinding(key.WithKeys("q", "esc"), key.WithHelp("q", "quit"))
	return l
}

type picker struct {
	list   list.Model
	chosen *transcripts.ListItem
}

func pick(ctx context.Context, items []transcripts.ListItem) (*transcripts.ListItem, error) {
	// The picker draws on stderr so that stdout carries only the Markdown.
	final, err := tea.NewProgram(picker{list: newList(items, nil)}, tea.WithContext(ctx), tea.WithOutput(os.Stderr)).Run()
	if err != nil {
		return nil, fmt.Errorf("run picker: %w", err)
	}
	return final.(picker).chosen, nil
}

func (p picker) Init() tea.Cmd { return tea.RequestBackgroundColor }

func (p picker) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.BackgroundColorMsg:
		p.list.SetDelegate(newMarkDelegate(msg.IsDark(), nil))
		p.list.Styles = list.DefaultStyles(msg.IsDark())
	case tea.WindowSizeMsg:
		p.list.SetSize(msg.Width, msg.Height)
	case tea.KeyPressMsg:
		if msg.String() == "enter" && p.list.FilterState() != list.Filtering {
			if item, ok := p.list.SelectedItem().(entry); ok {
				p.chosen = &item.ListItem
				return p, tea.Quit
			}
		}
	}

	var cmd tea.Cmd
	p.list, cmd = p.list.Update(msg)
	return p, cmd
}

func (p picker) View() tea.View {
	view := tea.NewView(p.list.View())
	view.AltScreen = true
	return view
}
