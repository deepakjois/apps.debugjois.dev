import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { tags as t } from "@lezer/highlight";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CodeMirror, { basicSetup, EditorView } from "@uiw/react-codemirror";
import { githubDark } from "@uiw/codemirror-theme-github";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

type SaveState = "idle" | "saving" | "saved" | "error";

// LoggerNote is the decoded editor document returned by the Nitro logger API.
export type LoggerNote = {
  title: string;
  contents: string;
};

type LoggerLinkPreview = { title: string };
type FetchLoggerLinkPreview = (url: string) => Promise<LoggerLinkPreview>;

// PasteEditorView is the CodeMirror surface needed by the URL paste handler.
type PasteEditorView = {
  state: {
    doc: { toString: () => string };
    selection: { main: { from: number; to: number } };
    sliceDoc: (from: number, to: number) => string;
  };
  dispatch: (transaction: {
    changes: { from: number; to: number; insert: string };
    selection?: { anchor: number };
  }) => void;
};

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

export function Logger() {
  const loggerQuery = useQuery({
    queryKey: ["admin", "logger"],
    queryFn: getLogger,
    retry: false,
    staleTime: Infinity,
  });

  if (loggerQuery.isPending) {
    return <LoggerStatusScreen title="Loading logger..." />;
  }

  if (loggerQuery.isError) {
    return (
      <LoggerStatusScreen
        message={
          loggerQuery.error instanceof Error ? loggerQuery.error.message : "Could not load logger."
        }
        title="Could not open logger."
      />
    );
  }

  return <LoggerEditor initialNote={loggerQuery.data} />;
}

function LoggerEditor({ initialNote }: { initialNote: LoggerNote }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initialNote.title);
  const [value, setValue] = useState(initialNote.contents);
  const [savedValue, setSavedValue] = useState(initialNote.contents);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const saveResetTimeoutRef = useRef<number | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => saveLogger({ title, contents: value }),
    onMutate: () => {
      clearSaveResetTimeout(saveResetTimeoutRef);
      setSaveState("saving");
      setSaveMessage(null);
    },
    onSuccess: (note) => {
      setTitle(note.title);
      setValue(note.contents);
      setSavedValue(note.contents);
      setSaveState("saved");
      saveResetTimeoutRef.current = window.setTimeout(() => {
        setSaveState("idle");
        saveResetTimeoutRef.current = null;
      }, 1800);
    },
    onError: (error) => {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "Could not save logger.");
    },
  });

  useEffect(() => () => clearSaveResetTimeout(saveResetTimeoutRef), []);

  const editorExtensions = useMemo(
    () => [
      ...loggerEditorExtensions,
      buildLoggerPasteExtension((url) =>
        queryClient.fetchQuery({
          queryKey: ["admin", "logger", "link-preview", url],
          queryFn: () => getLoggerLinkPreview(url),
        }),
      ),
    ],
    [queryClient],
  );
  const isDirty = value !== savedValue;
  const isSaving = saveState === "saving";
  const saveButtonLabel =
    saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Save";

  return (
    <div className="admin-logger-page">
      <header className="admin-logger-toolbar">
        <h1 className="admin-logger-title">{title}</h1>
        <div className="admin-logger-actions">
          {saveMessage ? <p className="admin-logger-save-message">{saveMessage}</p> : null}
          <button
            className={`admin-logger-save-button is-${saveState}`}
            disabled={!isDirty || isSaving}
            onClick={() => saveMutation.mutate()}
            type="button"
          >
            {saveButtonLabel}
          </button>
        </div>
      </header>
      <main className="admin-logger-editor-pane">
        <CodeMirror
          basicSetup={false}
          className="admin-logger-codemirror"
          extensions={editorExtensions}
          height="100%"
          onChange={setValue}
          theme={githubDark}
          value={value}
        />
      </main>
    </div>
  );
}

async function getLogger(): Promise<LoggerNote> {
  return requestJSON<LoggerNote>("/api/admin/logger");
}

async function saveLogger(note: LoggerNote): Promise<LoggerNote> {
  return requestJSON<LoggerNote>("/api/admin/logger", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(note),
  });
}

async function getLoggerLinkPreview(url: string): Promise<LoggerLinkPreview> {
  return requestJSON<LoggerLinkPreview>("/api/admin/logger/link-preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

async function requestJSON<ResponseBody>(url: string, init?: RequestInit): Promise<ResponseBody> {
  const response = await fetch(url, init);
  if (response.ok) {
    return (await response.json()) as ResponseBody;
  }

  const body = (await response.json().catch(() => null)) as {
    message?: unknown;
    statusMessage?: unknown;
  } | null;
  const message = [body?.statusMessage, body?.message].find(
    (value): value is string => typeof value === "string" && Boolean(value.trim()),
  );
  throw new Error(message ?? `Logger request failed with HTTP ${response.status}.`);
}

export function buildLoggerPasteExtension(fetchLinkPreview: FetchLoggerLinkPreview) {
  return EditorView.domEventHandlers({
    paste: (event, view) => handleLoggerUrlPaste(event, view, fetchLinkPreview),
  });
}

export function handleLoggerUrlPaste(
  event: ClipboardEvent,
  view: PasteEditorView,
  fetchLinkPreview: FetchLoggerLinkPreview,
): boolean {
  const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
  if (!isHttpUrl(text)) {
    return false;
  }

  event.preventDefault();
  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to);

  if (selectedText) {
    const link = `[${selectedText}](${text})`;
    view.dispatch({
      changes: { from, to, insert: link },
      selection: { anchor: from + link.length },
    });
    return true;
  }

  const placeholder = `[Fetching title...](${text})`;
  view.dispatch({
    changes: { from, to, insert: placeholder },
    selection: { anchor: from + placeholder.length },
  });

  void fetchLinkPreview(text)
    .then((preview) => {
      const linkTitle = preview.title.trim() || text;
      replacePlaceholder(view, placeholder, `[${linkTitle}](${text})`);
    })
    .catch(() => replacePlaceholder(view, placeholder, `[${text}](${text})`));

  return true;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function replacePlaceholder(view: PasteEditorView, placeholder: string, replacement: string) {
  const content = view.state.doc.toString();
  const index = content.indexOf(placeholder);
  if (index === -1) {
    return;
  }

  view.dispatch({ changes: { from: index, to: index + placeholder.length, insert: replacement } });
}

type LoggerStatusScreenProps = { title: string; message?: string };

function LoggerStatusScreen({ title, message }: LoggerStatusScreenProps) {
  return (
    <main className="admin-logger-status">
      <section className="admin-logger-status-card">
        <p className="admin-logger-status-label">Logger</p>
        <h1>{title}</h1>
        {message ? <p>{message}</p> : null}
      </section>
    </main>
  );
}

function clearSaveResetTimeout(saveResetTimeoutRef: RefObject<number | null>) {
  if (saveResetTimeoutRef.current !== null) {
    window.clearTimeout(saveResetTimeoutRef.current);
    saveResetTimeoutRef.current = null;
  }
}
