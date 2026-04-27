// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PodscriberAdminPage } from "../../routes/admin.podscriber";
import { submitPodscriberServerFn } from "../../server/podscriber";

vi.mock("../../server/podscriber", () => ({
  submitPodscriberServerFn: vi.fn(),
}));

const submitPodscriberMock = vi.mocked(submitPodscriberServerFn);

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PodscriberAdminPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  submitPodscriberMock.mockReset();
});

describe("PodscriberAdminPage", () => {
  test("shows a validation error for an empty payload", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Start Transcription" }));

    expect(screen.getByText("Paste the Podcast Addict payload before submitting.")).toBeTruthy();
    expect(submitPodscriberMock).not.toHaveBeenCalled();
  });

  test("submits payload text and renders the accepted response", async () => {
    submitPodscriberMock.mockResolvedValue({
      podcast: { episode: { title: "The Payload Episode" } },
      transcription_lambda_id: "request-123",
    });
    renderPage();

    fireEvent.change(screen.getByRole("textbox", { name: "PodcastAddict Payload" }), {
      target: { value: "Shared from Podcast Addict" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start Transcription" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Submitted" })).toBeTruthy());

    expect(submitPodscriberMock).toHaveBeenCalledWith({
      data: { text: "Shared from Podcast Addict" },
    });
    expect(screen.getByText("Transcription request queued")).toBeTruthy();
    expect(screen.getByText("request-123")).toBeTruthy();
    expect(screen.getByText(/"title": "The Payload Episode"/)).toBeTruthy();
  });

  test("renders Lambda errors and leaves the textarea enabled", async () => {
    submitPodscriberMock.mockRejectedValue(new Error("expected Podcast Addict episode URL"));
    renderPage();

    const textarea = screen.getByRole("textbox", { name: "PodcastAddict Payload" });
    fireEvent.change(textarea, { target: { value: "bad payload" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Transcription" }));

    await waitFor(() => expect(screen.getByText("Request Error")).toBeTruthy());

    expect(screen.getByText("expected Podcast Addict episode URL")).toBeTruthy();
    expect(textarea).not.toHaveProperty("disabled", true);
  });
});
