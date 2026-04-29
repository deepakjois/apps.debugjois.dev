import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { tags as t } from "@lezer/highlight";
import { createFileRoute } from "@tanstack/react-router";
import { basicSetup, EditorView, useCodeMirror } from "@uiw/react-codemirror";
import { githubDark } from "@uiw/codemirror-theme-github";
import "../styles/admin-logger.css";

export const Route = createFileRoute("/admin/logger")({
  head: () => ({
    meta: [{ title: "Logger" }],
  }),
  component: LoggerAdminPage,
});

// Sample document exercises common Markdown tokens while persistence is pending.
const LOGGER_MARKDOWN_SAMPLE = `# Logger Draft

Lorem ipsum dolor sit amet, **consectetur adipiscing elit**. Integer _vulputate_ sem nec justo luctus, vitae gravida augue luctus.

## Session Notes

- Capture raw observations as they happen.
- Add structured follow-ups before publishing.
- Keep snippets close to the surrounding narrative.

> Curabitur blandit tempus porttitor. Etiam porta sem malesuada magna mollis euismod.

### Representative Code

\`\`\`ts
type LogEntry = {
  id: string;
  title: string;
  tags: string[];
  body: string;
};

const entry: LogEntry = {
  id: "lorem-001",
  title: "Dolor sit amet",
  tags: ["draft", "markdown", "logger"],
  body: "Praesent commodo cursus magna.",
};
\`\`\`

## Checklist

1. Draft the core idea.
2. Link related context with [example references](https://example.com).
3. Review the final note before sharing.

| Field | Example |
| --- | --- |
| Status | Draft |
| Priority | Medium |
| Owner | Admin |
`;

// Heading styles make Markdown structure visually scannable in the editor.
const markdownHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: "2em", fontWeight: "bold" },
  { tag: t.heading2, fontSize: "1.75em", fontWeight: "bold" },
  { tag: t.heading3, fontSize: "1.5em", fontWeight: "bold" },
]);

const loggerEditorExtensions = [
  basicSetup({
    foldGutter: false,
    highlightActiveLineGutter: false,
    lineNumbers: false,
  }),
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  syntaxHighlighting(markdownHighlightStyle),
  EditorView.lineWrapping,
];

function LoggerAdminPage() {
  const { setContainer } = useCodeMirror({
    value: LOGGER_MARKDOWN_SAMPLE,
    height: "100vh",
    theme: githubDark,
    basicSetup: false,
    extensions: loggerEditorExtensions,
  });

  return <div className="admin-logger-page" ref={setContainer} />;
}
