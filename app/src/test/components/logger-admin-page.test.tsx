// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LoggerAdminPage } from "../../components/admin/LoggerAdminPage";
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
    EditorView: { lineWrapping: {} },
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
});
