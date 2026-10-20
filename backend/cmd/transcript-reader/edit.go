package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/list"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/deepakjois/apps.debugjois.dev/backend/transcripts"
)

var (
	archiveKey = key.NewBinding(key.WithKeys("a"), key.WithHelp("a", "archive"))
	deleteKey  = key.NewBinding(key.WithKeys("d"), key.WithHelp("d", "delete"))
	saveKey    = key.NewBinding(key.WithKeys("enter"), key.WithHelp("enter", "save"))
)

func runEditor(ctx context.Context) error {
	client, err := transcripts.NewS3Client(ctx, transcripts.BucketName)
	if err != nil {
		return err
	}
	snapshot, err := transcripts.ReadIndex(ctx, client, transcripts.BucketName)
	if err != nil {
		return err
	}
	if len(snapshot.Index.Transcripts) == 0 {
		return errors.New("transcript index is empty")
	}

	final, err := tea.NewProgram(newEditor(client, snapshot), tea.WithContext(ctx), tea.WithOutput(os.Stderr)).Run()
	if err != nil {
		return fmt.Errorf("run editor: %w", err)
	}
	e := final.(editor)
	if e.saveErr != nil {
		return e.saveErr
	}
	if e.saved {
		fmt.Fprintf(os.Stderr, "Saved: %s.\n", e.summary(true))
	}
	return nil
}

// editor holds pending marks, keyed by location, for transcripts whose
// marked state differs from their state in the snapshot.
type editor struct {
	list     list.Model
	client   transcripts.DeleteClient
	snapshot transcripts.IndexSnapshot
	marks    map[string]transcripts.ItemState
	isDark   bool
	message  string
	saving   bool
	saved    bool
	saveErr  error
}

type savedMsg struct{ err error }

func newEditor(client transcripts.DeleteClient, snapshot transcripts.IndexSnapshot) editor {
	marks := make(map[string]transcripts.ItemState)
	l := newList(snapshot.Index.Transcripts, marks)
	l.KeyMap.NextPage.SetKeys("right", "l", "pgdown", "f")
	l.AdditionalShortHelpKeys = func() []key.Binding { return []key.Binding{archiveKey, deleteKey, saveKey} }
	return editor{list: l, client: client, snapshot: snapshot, marks: marks}
}

func (e editor) Init() tea.Cmd { return tea.RequestBackgroundColor }

func (e editor) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.BackgroundColorMsg:
		e.isDark = msg.IsDark()
		e.list.SetDelegate(newMarkDelegate(e.isDark, e.marks))
		e.list.Styles = list.DefaultStyles(e.isDark)
	case tea.WindowSizeMsg:
		e.list.SetSize(msg.Width, msg.Height-1)
	case savedMsg:
		e.saving = false
		e.saved = msg.err == nil
		e.saveErr = msg.err
		return e, tea.Quit
	case tea.KeyPressMsg:
		if e.saving {
			return e, nil
		}
		if e.list.FilterState() != list.Filtering {
			switch {
			case key.Matches(msg, archiveKey):
				e.toggle(transcripts.Archived)
				return e, nil
			case key.Matches(msg, deleteKey):
				e.toggle(transcripts.Deleted)
				return e, nil
			case key.Matches(msg, saveKey):
				if len(e.marks) == 0 {
					e.message = "No changes to save."
					return e, nil
				}
				e.saving = true
				e.message = "Saving…"
				return e, e.save()
			}
		}
		e.message = ""
	}

	var cmd tea.Cmd
	e.list, cmd = e.list.Update(msg)
	return e, cmd
}

// toggle marks the selected transcript with target, or clears the mark if
// it already has it. Archived and deleted replace each other. Toggling
// archive on an archived transcript marks it for unarchiving.
func (e *editor) toggle(target transcripts.ItemState) {
	item, ok := e.list.SelectedItem().(entry)
	if !ok {
		return
	}
	e.message = ""

	original := item.State()
	current, pending := e.marks[item.Location]
	if !pending {
		current = original
	}

	next := target
	switch {
	case current == target && target == transcripts.Archived:
		next = transcripts.Active
	case current == target:
		next = original
	}

	if next == original {
		delete(e.marks, item.Location)
	} else {
		e.marks[item.Location] = next
	}
}

func (e editor) save() tea.Cmd {
	client, snapshot, marks := e.client, e.snapshot, e.marks
	return func() tea.Msg {
		_, err := transcripts.EditIndex(context.Background(), client, transcripts.BucketName, snapshot, marks)
		if errors.Is(err, transcripts.ErrIndexChanged) {
			err = fmt.Errorf("nothing was saved: the index in S3 changed after it was loaded; rerun to start over: %w", err)
		}
		return savedMsg{err: err}
	}
}

func (e editor) summary(done bool) string {
	var archive, unarchive, del int
	for _, state := range e.marks {
		switch state {
		case transcripts.Archived:
			archive++
		case transcripts.Active:
			unarchive++
		case transcripts.Deleted:
			del++
		}
	}

	var parts []string
	for _, part := range []struct {
		n             int
		pending, past string
	}{
		{archive, "to archive", "archived"},
		{unarchive, "to unarchive", "unarchived"},
		{del, "to delete", "deleted"},
	} {
		if part.n == 0 {
			continue
		}
		label := part.pending
		if done {
			label = part.past
		}
		parts = append(parts, fmt.Sprintf("%d %s", part.n, label))
	}
	return strings.Join(parts, " · ")
}

func (e editor) statusLine() string {
	text := e.message
	if text == "" && len(e.marks) == 0 {
		text = "No changes. a marks to archive, d marks to delete."
	} else if text == "" {
		text = e.summary(false) + " · enter saves · q quits without saving"
	}
	dim := lipgloss.LightDark(e.isDark)(lipgloss.Color("#A49FA5"), lipgloss.Color("#777777"))
	return lipgloss.NewStyle().Foreground(dim).Padding(0, 2).Render(text)
}

func (e editor) View() tea.View {
	view := tea.NewView(lipgloss.JoinVertical(lipgloss.Left, e.list.View(), e.statusLine()))
	view.AltScreen = true
	return view
}
