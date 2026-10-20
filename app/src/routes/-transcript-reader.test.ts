// @vitest-environment jsdom

// The dash prefix keeps this test module out of TanStack's generated route tree.
import { dehydrate, hydrate } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getTranscriptReaderCacheHeaders,
  loadTranscriptReaderData,
} from "./-transcript-reader-loader";
import type { TranscriptIndexItem, TranscriptPayload } from "../features/transcript-reader/data";
import { getRouter } from "../router";

const SHORT_CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const LONG_CACHE = "public, max-age=60, s-maxage=31536000, stale-while-revalidate=86400";

function locationFor(index: number) {
  return `https://example.com/episode-${index}--${index.toString(16).padStart(4, "0").padEnd(64, "f")}.json`;
}

const INDEX: TranscriptIndexItem[] = [
  { location: "https://example.com/not-addressed.json", title: "Unlinkable" },
  ...Array.from({ length: 60 }, (_, index) => ({
    location: locationFor(index + 1),
    title: `Episode ${index + 1}`,
  })),
];
const TRANSCRIPT_2: TranscriptPayload = { podcast: { episode: { title: "Episode 2" } } };

function queryClientWith(index: TranscriptIndexItem[]) {
  const { queryClient } = getRouter().options.context;

  queryClient.setQueryData(["transcripts", "index"], index);

  return queryClient;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("transcript reader loader", () => {
  it("lists the 50 latest linkable transcripts without fetching any transcript", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const loaderData = await loadTranscriptReaderData(queryClientWith(INDEX), undefined);

    expect(fetchMock).not.toHaveBeenCalled();
    expect("transcriptList" in loaderData && loaderData.transcriptList).toEqual(INDEX.slice(1, 51));
    expect(getTranscriptReaderCacheHeaders(loaderData)).toEqual({ "Cache-Control": SHORT_CACHE });
  });

  it.each([
    ["fetched on selection", 1, () => queryClientWith(INDEX)],
    [
      "hydrated from SSR",
      0,
      () => {
        const serverClient = queryClientWith(INDEX);
        serverClient.setQueryData(["transcripts", "item", locationFor(2)], TRANSCRIPT_2);
        const browserClient = getRouter().options.context.queryClient;
        hydrate(browserClient, dehydrate(serverClient));
        return browserClient;
      },
    ],
  ])(
    "keeps a transcript %s cached for reselection",
    async (_, expectedFetches, createQueryClient) => {
      vi.useFakeTimers();
      const fetchMock = vi.fn((url: string) =>
        Promise.resolve(
          Response.json(url === locationFor(2) ? TRANSCRIPT_2 : { transcripts: INDEX }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const queryClient = createQueryClient();
      const prefix = "0002ffffffffffff";

      const loaderData = await loadTranscriptReaderData(queryClient, prefix);
      await loadTranscriptReaderData(queryClient, undefined);
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      await loadTranscriptReaderData(queryClient, prefix);

      expect(loaderData).toEqual({
        transcript: TRANSCRIPT_2,
        pageTitle: "Episode 2 | Transcript Reader",
      });
      expect(fetchMock.mock.calls.filter(([url]) => url === locationFor(2))).toHaveLength(
        expectedFetches,
      );
      expect(getTranscriptReaderCacheHeaders(loaderData)).toEqual({ "Cache-Control": LONG_CACHE });
    },
  );

  it.each(["not-a-hash", "ffffffffffffffff"])(
    "redirects %s to the list with a short cache policy",
    async (requestedHash) => {
      await expect(
        loadTranscriptReaderData(queryClientWith(INDEX), requestedHash),
      ).rejects.toMatchObject({
        options: {
          to: "/transcript-reader",
          replace: true,
          headers: { "Cache-Control": SHORT_CACHE },
        },
      });
    },
  );

  it("renders the empty index state", async () => {
    const loaderData = await loadTranscriptReaderData(queryClientWith([]), undefined);

    expect(loaderData).toEqual({ transcriptList: [], pageTitle: "Transcript Reader" });
  });
});
