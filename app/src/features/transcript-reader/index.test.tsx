// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriptReader } from ".";
import type { TranscriptPayload } from "./data";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

const CURRENT_HASH = "1111111111111111222222222222222233333333333333334444444444444444";
const NEXT_HASH = "aaaaaaaaaaaaaaaa555555555555555566666666666666667777777777777777";
const CURRENT_LOCATION = `https://example.com/current--${CURRENT_HASH}.json`;
const NEXT_LOCATION = `https://example.com/next--${NEXT_HASH}.json`;
const CURRENT_TRANSCRIPT: TranscriptPayload = {
  podcast: { episode: { title: "Current transcript" } },
  deepgram: {
    results: {
      channels: [
        {
          alternatives: [
            {
              paragraphs: {
                paragraphs: [{ speaker: 1, sentences: [{ text: "Current body copy." }] }],
              },
            },
          ],
        },
      ],
    },
  },
};

function renderReader() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <TranscriptReader
        selectedLocation={CURRENT_LOCATION}
        transcript={CURRENT_TRANSCRIPT}
        transcriptList={[
          { location: CURRENT_LOCATION, title: "Current transcript" },
          { location: NEXT_LOCATION, title: "Next transcript" },
        ]}
      />
    </QueryClientProvider>,
  );

  return queryClient;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  navigate.mockReset();
});

describe("transcript switching", () => {
  it("keeps the current article until a slow prefetch crosses the skeleton threshold", async () => {
    const queryClient = renderReader();

    vi.spyOn(queryClient, "ensureQueryData").mockImplementation(
      () =>
        new Promise((resolve) => {
          window.setTimeout(() => resolve({}), 300);
        }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Search transcripts" }));
    fireEvent.change(screen.getByRole("listbox", { name: "Matching transcripts" }), {
      target: { value: NEXT_LOCATION },
    });

    expect(screen.getByRole("heading", { name: "Current transcript" })).toBeTruthy();

    await act(() => vi.advanceTimersByTime(199));
    expect(screen.getByRole("heading", { name: "Current transcript" })).toBeTruthy();

    await act(() => vi.advanceTimersByTime(1));
    expect(document.querySelector(".article-skeleton")).toBeTruthy();
  });
});
