// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { handleLoggerUrlPaste, LoggerAdminPage } from "../../components/admin/LoggerAdminPage";
import { getDailyLogServerFn, saveDailyLogServerFn } from "../../server/logger";

vi.mock("@uiw/react-codemirror", async () => {
  const React = await import("react");

  return {
    default: ({ onChange, value }: { onChange?: (value: string) => void; value: string }) =>
      React.createElement("textarea", {
        "aria-label": "Daily Log",
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(event.target.value),
        value,
      }),
    basicSetup: () => [],
    EditorView: {
      domEventHandlers: (handlers: unknown) => handlers,
      lineWrapping: {},
    },
  };
});

vi.mock("../../server/logger", () => ({
  getDailyLogServerFn: vi.fn(),
  saveDailyLogServerFn: vi.fn(),
}));

const getDailyLogMock = vi.mocked(getDailyLogServerFn);
const saveDailyLogMock = vi.mocked(saveDailyLogServerFn);

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <LoggerAdminPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  getDailyLogMock.mockReset();
  saveDailyLogMock.mockReset();
});

describe("LoggerAdminPage", () => {
  test("loads daily log content with save disabled while unchanged", async () => {
    getDailyLogMock.mockResolvedValue({
      title: "2026-04-29.md",
      contents: "### 2026-04-29\n",
    });

    renderPage();

    expect(await screen.findByText("2026-04-29.md")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Daily Log" })).toHaveProperty(
      "value",
      "### 2026-04-29\n",
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  test("saves edited daily log content", async () => {
    getDailyLogMock.mockResolvedValue({
      title: "2026-04-29.md",
      contents: "hello",
    });
    saveDailyLogMock.mockResolvedValue({
      title: "2026-04-29.md",
      contents: "hello world",
    });

    renderPage();

    const editor = await screen.findByRole("textbox", { name: "Daily Log" });
    fireEvent.change(editor, { target: { value: "hello world" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Saved" })).toBeTruthy());
    expect(saveDailyLogMock).toHaveBeenCalledWith({
      data: { title: "2026-04-29.md", contents: "hello world" },
    });
  });

  test("shows load errors", async () => {
    getDailyLogMock.mockRejectedValue(new Error("Admin session required."));

    renderPage();

    expect(await screen.findByText("Could not open logger.")).toBeTruthy();
    expect(screen.getByText("Admin session required.")).toBeTruthy();
  });

  test("pastes a URL over selected text as a Markdown link", () => {
    const event = createPasteEvent("https://example.com");
    const view = createPasteView("Read this", 0, 4);

    expect(handleLoggerUrlPaste(event, view, vi.fn())).toBe(true);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(view.getValue()).toBe("[Read](https://example.com) this");
  });

  test("fetches a title when pasting a bare URL", async () => {
    const event = createPasteEvent("https://example.com");
    const view = createPasteView("", 0, 0);
    const fetchLinkPreview = vi.fn(async () => ({ title: "Example Title" }));

    expect(handleLoggerUrlPaste(event, view, fetchLinkPreview)).toBe(true);
    expect(view.getValue()).toBe("[Fetching title...](https://example.com)");

    await waitFor(() => {
      expect(view.getValue()).toBe("[Example Title](https://example.com)");
    });
  });

  test("falls back to the URL when title fetching fails", async () => {
    const event = createPasteEvent("https://example.com");
    const view = createPasteView("", 0, 0);
    const fetchLinkPreview = vi.fn(async () => {
      throw new Error("LinkPreview unavailable.");
    });

    expect(handleLoggerUrlPaste(event, view, fetchLinkPreview)).toBe(true);

    await waitFor(() => {
      expect(view.getValue()).toBe("[https://example.com](https://example.com)");
    });
  });
});

function createPasteEvent(text: string) {
  return {
    clipboardData: {
      getData: (format: string) => (format === "text/plain" ? text : ""),
    },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

function createPasteView(initialValue: string, from: number, to: number) {
  let value = initialValue;
  const state = {
    doc: {
      toString: () => value,
    },
    selection: {
      main: { from, to },
    },
    sliceDoc: (sliceFrom: number, sliceTo: number) => value.slice(sliceFrom, sliceTo),
  };

  // The fake view mutates an in-memory doc when CodeMirror dispatches changes.
  const view = {
    state,
    dispatch: vi.fn(
      (transaction: {
        changes: { from: number; to: number; insert: string };
        selection?: { anchor: number };
      }) => {
        const { changes, selection } = transaction;
        value = `${value.slice(0, changes.from)}${changes.insert}${value.slice(changes.to)}`;
        const anchor = selection?.anchor ?? changes.from + changes.insert.length;
        state.selection.main = { from: anchor, to: anchor };
      },
    ),
    getValue: () => value,
  };

  return view;
}
