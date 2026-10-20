package main

import (
	"image/color"
	"io"

	"charm.land/bubbles/v2/list"
	"charm.land/lipgloss/v2"

	"github.com/deepakjois/apps.debugjois.dev/backend/transcripts"
)

type mark struct {
	label  string
	color  color.Color
	strike bool
}

// markDelegate draws transcripts that are archived, or marked in marks, in
// the mark's color with the mark's label at the start of the description.
type markDelegate struct {
	list.DefaultDelegate
	marks                        map[string]transcripts.ItemState
	deleted, archived, unarchive color.Color
}

func newMarkDelegate(isDark bool, marks map[string]transcripts.ItemState) markDelegate {
	lightDark := lipgloss.LightDark(isDark)
	d := markDelegate{
		DefaultDelegate: list.NewDefaultDelegate(),
		marks:           marks,
		deleted:         lightDark(lipgloss.Color("#C62828"), lipgloss.Color("#FF6B6B")),
		archived:        lightDark(lipgloss.Color("#B26A00"), lipgloss.Color("#F2B84B")),
		unarchive:       lightDark(lipgloss.Color("#00796B"), lipgloss.Color("#4DD0C4")),
	}
	d.Styles = list.NewDefaultItemStyles(isDark)
	return d
}

func (d markDelegate) markFor(item transcripts.ListItem) (mark, bool) {
	state, pending := d.marks[item.Location]
	switch {
	case pending && state == transcripts.Deleted:
		return mark{label: "✗ delete", color: d.deleted, strike: true}, true
	case pending && state == transcripts.Archived:
		return mark{label: "▣ archive", color: d.archived}, true
	case pending && state == transcripts.Active:
		return mark{label: "□ unarchive", color: d.unarchive}, true
	case item.Archived:
		return mark{label: "▣ archived", color: d.archived}, true
	default:
		return mark{}, false
	}
}

type markedEntry struct {
	entry
	label string
}

func (e markedEntry) Description() string { return e.label + " · " + e.entry.Description() }

func (d markDelegate) Render(w io.Writer, m list.Model, index int, item list.Item) {
	e, ok := item.(entry)
	if !ok {
		return
	}
	mk, ok := d.markFor(e.ListItem)
	if !ok {
		d.DefaultDelegate.Render(w, m, index, item)
		return
	}

	dd := d.DefaultDelegate
	s := &dd.Styles
	s.NormalTitle = s.NormalTitle.Foreground(mk.color).Strikethrough(mk.strike)
	s.SelectedTitle = s.SelectedTitle.Foreground(mk.color).Strikethrough(mk.strike)
	s.NormalDesc = s.NormalDesc.Foreground(mk.color)
	s.SelectedDesc = s.SelectedDesc.Foreground(mk.color)
	dd.Render(w, m, index, markedEntry{e, mk.label})
}
