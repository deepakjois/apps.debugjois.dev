// The dash prefix keeps this test module out of TanStack's generated route tree.
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  getTranscriptReaderCacheHeaders,
  loadTranscriptReaderData,
} from "./-transcript-reader-loader";
import type { TranscriptIndexItem, TranscriptPayload } from "../features/transcript-reader/data";

const HASH_A = "1111111111111111222222222222222233333333333333334444444444444444";
const HASH_B = "aaaaaaaaaaaaaaaa555555555555555566666666666666667777777777777777";
const LOCATION_A = `https://example.com/episode-a--${HASH_A}.json`;
const LOCATION_B = `https://example.com/episode-b--${HASH_B}.json`;
const INDEX: TranscriptIndexItem[] = [
  { location: LOCATION_A, title: "Episode A", date: "2026-02-03" },
  { location: LOCATION_B, title: "Episode B", date: "2026-01-02" },
];
const TRANSCRIPT_B: TranscriptPayload = { podcast: { episode: { title: "Episode B" } } };

function queryClientWith(index: TranscriptIndexItem[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  // Seed app-owned inputs so loader tests never exercise the remote transcript service.
  queryClient.setQueryData(["transcripts", "index"], index);
  queryClient.setQueryData(["transcripts", "item", LOCATION_B], TRANSCRIPT_B);

  return queryClient;
}

describe("transcript reader loader", () => {
  it.each([undefined, "not-a-hash"])(
    "redirects %s to the latest canonical transcript with a short cache policy",
    async (requestedHash) => {
      await expect(
        loadTranscriptReaderData(queryClientWith(INDEX), requestedHash),
      ).rejects.toMatchObject({
        options: {
          replace: true,
          search: { t: "1111111111111111" },
          headers: {
            "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
          },
        },
      });
    },
  );

  it("loads a hash-selected transcript and gives its immutable URL a long CDN policy", async () => {
    const loaderData = await loadTranscriptReaderData(queryClientWith(INDEX), "AAAAAAAAAAAAAAAA");

    expect(loaderData).toEqual({
      transcriptList: INDEX,
      selectedLocation: LOCATION_B,
      transcript: TRANSCRIPT_B,
      pageTitle: "Episode B | Transcript Reader",
    });
    expect(getTranscriptReaderCacheHeaders(loaderData)).toEqual({
      "Cache-Control": "public, max-age=60, s-maxage=31536000, stale-while-revalidate=86400",
    });
  });

  it("renders and short-caches the empty index state without requesting a transcript", async () => {
    const loaderData = await loadTranscriptReaderData(queryClientWith([]), undefined);

    expect(loaderData).toEqual({
      transcriptList: [],
      selectedLocation: null,
      transcript: null,
      pageTitle: "Transcript Reader",
    });
    expect(getTranscriptReaderCacheHeaders(loaderData)).toEqual({
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    });
  });
});
