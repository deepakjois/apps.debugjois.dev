import { Marked, type Tokens } from "marked";

// The archive pages render each note with goldmark's auto heading IDs. Its ID generator keeps
// ASCII letters and digits, maps ASCII whitespace, '-' and '_' to '-', and drops everything else, including
// all multi-byte characters.
function goldmarkId(text: string): string {
  let id = "";
  for (const ch of text.trim()) {
    if (/^[A-Za-z0-9]$/.test(ch)) id += ch.toLowerCase();
    else if (/^[ \t\n\r\f\v_-]$/.test(ch)) id += "-";
  }
  return id || "heading";
}

function plainText(tokens: Tokens.Generic[] = []): string {
  return tokens
    .map((t) => (t.tokens ? plainText(t.tokens) : t.type === "html" ? "" : (t.text ?? "")))
    .join("");
}

function uniqueWithin(seen: Set<string>, id: string): string {
  if (!seen.has(id)) return id;
  for (let i = 1; ; i++) {
    const candidate = `${id}-${i}`;
    if (!seen.has(candidate)) return candidate;
  }
}

export type Note = { date: string; markdown: string };

// Renders one note. `monthIds` holds the heading IDs of newer notes on the same archive page;
// a repeated ID would scroll to the newer note, so that heading gets no ID and its text belongs
// to the previous heading's section.
export function renderNote(note: Note, monthIds: Set<string>): { html: string; anchor?: string } {
  const noteIds = new Set<string>();
  let anchor: string | undefined;
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, token) {
        const id = uniqueWithin(noteIds, goldmarkId(plainText(token.tokens)));
        noteIds.add(id);
        const inner = this.parser.parseInline(token.tokens);
        if (monthIds.has(id)) return `<h${token.depth}>${inner}</h${token.depth}>\n`;
        monthIds.add(id);
        anchor ??= id;
        return `<h${token.depth} id="${id}">${inner}</h${token.depth}>\n`;
      },
    },
  });

  const markdown = note.markdown
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_, target, label) => label ?? target);
  const body = marked.parse(markdown, { async: false });

  const html = `<html lang="en"><body data-pagefind-body data-pagefind-meta="date:${note.date}" data-pagefind-sort="date:${note.date}">${body}</body></html>`;
  return { html, anchor };
}
