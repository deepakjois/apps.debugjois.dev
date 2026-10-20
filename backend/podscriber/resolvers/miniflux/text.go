package miniflux

import (
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

var blockElements = map[atom.Atom]bool{
	atom.P: true, atom.Div: true, atom.Ul: true, atom.Ol: true,
	atom.H1: true, atom.H2: true, atom.H3: true, atom.H4: true, atom.H5: true,
	atom.H6: true, atom.Blockquote: true, atom.Pre: true, atom.Table: true,
	atom.Tr: true, atom.Hr: true, atom.Figure: true, atom.Section: true,
}

type textBuilder struct {
	paragraphs []string
	lines      []string
	current    strings.Builder
}

func (b *textBuilder) write(text string) { b.current.WriteString(text) }

func (b *textBuilder) lineBreak() {
	line := cleanText(b.current.String())
	b.current.Reset()
	if line == "" {
		b.endParagraph()
		return
	}
	b.lines = append(b.lines, line)
}

func (b *textBuilder) endLine() {
	if line := cleanText(b.current.String()); line != "" {
		b.lines = append(b.lines, line)
	}
	b.current.Reset()
}

func (b *textBuilder) endParagraph() {
	b.endLine()
	if len(b.lines) > 0 {
		b.paragraphs = append(b.paragraphs, strings.Join(b.lines, "\n"))
		b.lines = nil
	}
}

func htmlToText(content string) string {
	nodes, err := html.ParseFragment(strings.NewReader(content), &html.Node{Type: html.ElementNode, Data: "body", DataAtom: atom.Body})
	if err != nil {
		return cleanText(content)
	}
	var builder textBuilder
	var walk func(node *html.Node)
	walk = func(node *html.Node) {
		switch node.Type {
		case html.TextNode:
			builder.write(node.Data)
			return
		case html.ElementNode:
		default:
			return
		}
		switch {
		case node.DataAtom == atom.Br:
			builder.lineBreak()
			return
		case node.DataAtom == atom.Script || node.DataAtom == atom.Style:
			return
		case node.DataAtom == atom.Li:
			builder.endLine()
			builder.write("- ")
		case blockElements[node.DataAtom]:
			builder.endParagraph()
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
		if node.DataAtom == atom.Li {
			builder.endLine()
		} else if blockElements[node.DataAtom] {
			builder.endParagraph()
		}
	}
	for _, node := range nodes {
		walk(node)
	}
	builder.endParagraph()
	return strings.Join(builder.paragraphs, "\n\n")
}

func cleanText(value string) string {
	value = strings.ReplaceAll(value, "\u00a0", " ")
	return strings.Join(strings.Fields(value), " ")
}
