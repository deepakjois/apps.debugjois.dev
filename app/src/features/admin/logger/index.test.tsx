// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleLoggerUrlPaste, Logger } from ".";

vi.mock("@uiw/react-codemirror", async () => {
  const React = await import("react");
  return {
    default: ({ onChange, value }: { onChange?: (value: string) => void; value: string }) =>
      React.createElement("textarea", {
        "aria-label": "Logger",
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

function renderLogger() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Logger />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Logger", () => {
  it("loads from the Nitro route and saves edited Markdown", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ title: "2026-09-10.md", contents: "hello" }))
      .mockResolvedValueOnce(Response.json({ title: "2026-09-10.md", contents: "hello world" }));

    renderLogger();

    const editor = await screen.findByRole("textbox", { name: "Logger" });
    expect(editor).toHaveProperty("value", "hello");
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);

    fireEvent.change(editor, { target: { value: "hello world" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Saved" })).toBeTruthy());
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/admin/logger", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/logger", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "2026-09-10.md", contents: "hello world" }),
    });
  });

  it("turns a URL pasted over selected text into a Markdown link", () => {
    const event = createPasteEvent("https://example.com");
    const view = createPasteView("Read this", 0, 4);

    expect(handleLoggerUrlPaste(event, view, vi.fn())).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(view.getValue()).toBe("[Read](https://example.com) this");
  });
});

function createPasteEvent(text: string) {
  return {
    clipboardData: { getData: (format: string) => (format === "text/plain" ? text : "") },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

function createPasteView(initialValue: string, from: number, to: number) {
  let value = initialValue;
  const state = {
    doc: { toString: () => value },
    selection: { main: { from, to } },
    sliceDoc: (sliceFrom: number, sliceTo: number) => value.slice(sliceFrom, sliceTo),
  };

  return {
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
}
