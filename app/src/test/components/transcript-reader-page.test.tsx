// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import TranscriptReaderPage from "../../components/transcript-reader/TranscriptReaderPage";
import type { TranscriptPayload } from "../../queries/queries";

const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

const CURRENT_LOCATION =
  "https://example.com/current--1111111111111111222222222222222233333333333333334444444444444444.json";
const NEXT_LOCATION =
  "https://example.com/next--aaaaaaaaaaaaaaaa555555555555555566666666666666667777777777777777.json";

const currentTranscript: TranscriptPayload = {
  podcast: {
    episode: {
      title: "Current transcript",
    },
  },
  deepgram: {
    results: {
      channels: [
        {
          alternatives: [
            {
              paragraphs: {
                paragraphs: [
                  {
                    speaker: 1,
                    sentences: [{ text: "Current body copy." }],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <TranscriptReaderPage
          selectedLocation={CURRENT_LOCATION}
          transcript={currentTranscript}
          transcriptList={[
            { location: CURRENT_LOCATION, title: "Current transcript", date: "2025-01-01" },
            { location: NEXT_LOCATION, title: "Next transcript", date: "2025-01-02" },
          ]}
        />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  navigateMock.mockReset();
});

describe("TranscriptReaderPage", () => {
  test("keeps the current transcript visible until the delayed skeleton threshold", async () => {
    const { queryClient } = renderPage();

    vi.spyOn(queryClient, "ensureQueryData").mockImplementation(
      () =>
        new Promise((resolve) => {
          window.setTimeout(() => resolve({}), 300);
        }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Search transcripts" }));
    fireEvent.click(screen.getByRole("button", { name: /Next transcript/ }));

    expect(screen.getByRole("heading", { name: "Current transcript" })).toBeTruthy();
    expect(screen.queryByText("Transcript", { selector: ".transcript-heading" })).toBeTruthy();
    expect(screen.queryByText("No transcripts available yet.")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(199);
    });

    expect(screen.getByRole("heading", { name: "Current transcript" })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(document.querySelector(".article-skeleton")).toBeTruthy();
  });
});
