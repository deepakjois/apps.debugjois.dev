// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Podscriber } from ".";

const samplePayload = `[Overthink] Closer Look: Levinas, On Escape
https://podcastaddict.com/overthink/episode/221058424 via @PodcastAddict`;

function renderPodscriber() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Podscriber />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Podscriber", () => {
  it("requires a Podcast Addict payload", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderPodscriber();

    fireEvent.click(screen.getByRole("button", { name: "Start Transcription" }));

    expect(screen.getByText("Paste the Podcast Addict payload before submitting.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits a sample payload and renders the accepted job", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          podcast: { episode: { title: "Closer Look: Levinas, On Escape" } },
          transcription_lambda_id: "request-123",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPodscriber();

    fireEvent.change(screen.getByRole("textbox", { name: "PodcastAddict Payload" }), {
      target: { value: samplePayload },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start Transcription" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Submitted" })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/podscriber", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: samplePayload }),
    });
    expect(screen.getByText("Transcription request queued")).toBeTruthy();
    expect(screen.getByText("request-123")).toBeTruthy();
    expect(screen.getByText(/"title": "Closer Look: Levinas, On Escape"/)).toBeTruthy();
  });

  it("shows API errors and allows another submission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ statusMessage: "expected Podcast Addict episode URL" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    renderPodscriber();

    const textarea = screen.getByRole("textbox", { name: "PodcastAddict Payload" });
    fireEvent.change(textarea, { target: { value: "bad payload" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Transcription" }));

    await waitFor(() => expect(screen.getByText("Request Error")).toBeTruthy());
    expect(screen.getByText("expected Podcast Addict episode URL")).toBeTruthy();
    expect(textarea).not.toHaveProperty("disabled", true);
  });
});
