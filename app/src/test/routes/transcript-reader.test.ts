import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  getTranscriptReaderCacheHeaders,
  loadTranscriptReaderData,
} from "../../routes/transcript-reader";

const TRANSCRIPT_A_LOCATION =
  "https://example.com/transcript-a--1111111111111111222222222222222233333333333333334444444444444444.json";
const TRANSCRIPT_B_LOCATION =
  "https://example.com/transcript-b--aaaaaaaaaaaaaaaa555555555555555566666666666666667777777777777777.json";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function getRequestUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("transcript reader loader", () => {
  test("redirects to the latest canonical transcript hash", async () => {
    const queryClient = createQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: string | URL | Request) => {
      const url = getRequestUrl(input);

      if (url.includes("transcripts.json")) {
        return new Response(
          JSON.stringify({
            transcripts: [
              { location: TRANSCRIPT_A_LOCATION, title: "Episode A", date: "2025-01-01" },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ podcast: { episode: { title: "Episode A" } } }), {
        status: 200,
      });
    });

    await expect(loadTranscriptReaderData(queryClient, undefined)).rejects.toMatchObject({
      options: {
        to: "/transcript-reader",
        replace: true,
        statusCode: 307,
        search: {
          t: "1111111111111111",
        },
      },
    });
  });

  test("redirects invalid hashes to the latest canonical transcript", async () => {
    const queryClient = createQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: string | URL | Request) => {
      const url = getRequestUrl(input);

      if (url.includes("transcripts.json")) {
        return new Response(
          JSON.stringify({
            transcripts: [
              { location: TRANSCRIPT_A_LOCATION, title: "Episode A", date: "2025-01-01" },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ podcast: { episode: { title: "Episode A" } } }), {
        status: 200,
      });
    });

    await expect(loadTranscriptReaderData(queryClient, "deadbeefdeadbeef")).rejects.toMatchObject({
      options: {
        to: "/transcript-reader",
        replace: true,
        statusCode: 307,
        search: {
          t: "1111111111111111",
        },
      },
    });
  });

  test("returns empty state data when no transcripts exist", async () => {
    const queryClient = createQueryClient();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ transcripts: [] }), { status: 200 }),
    );

    await expect(loadTranscriptReaderData(queryClient, undefined)).resolves.toMatchObject({
      transcriptList: [],
      selectedLocation: null,
      transcript: null,
      pageTitle: "Transcript Reader",
    });
  });

  test("returns the selected transcript payload for a valid hash", async () => {
    const queryClient = createQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: string | URL | Request) => {
      const url = getRequestUrl(input);

      if (url.includes("transcripts.json")) {
        return new Response(
          JSON.stringify({
            transcripts: [
              { location: TRANSCRIPT_A_LOCATION, title: "Episode A", date: "2025-01-01" },
              { location: TRANSCRIPT_B_LOCATION, title: "Episode B", date: "2025-01-02" },
            ],
          }),
          { status: 200 },
        );
      }

      if (url === TRANSCRIPT_B_LOCATION) {
        return new Response(JSON.stringify({ podcast: { episode: { title: "Episode B" } } }), {
          status: 200,
        });
      }

      return new Response(JSON.stringify({ podcast: { episode: { title: "Episode A" } } }), {
        status: 200,
      });
    });

    await expect(loadTranscriptReaderData(queryClient, "aaaaaaaaaaaaaaaa")).resolves.toMatchObject({
      selectedLocation: TRANSCRIPT_B_LOCATION,
      pageTitle: "Episode B | Transcript Reader",
      transcript: {
        podcast: {
          episode: {
            title: "Episode B",
          },
        },
      },
    });
  });
});

describe("transcript reader cache headers", () => {
  test("uses the short latest TTL when no transcript is selected", () => {
    expect(
      getTranscriptReaderCacheHeaders({
        transcriptList: [],
        selectedLocation: null,
        transcript: null,
        pageTitle: "Transcript Reader",
      }),
    ).toEqual({
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    });
  });

  test("uses the long immutable TTL for a hash-selected transcript", () => {
    expect(
      getTranscriptReaderCacheHeaders({
        transcriptList: [],
        selectedLocation: TRANSCRIPT_A_LOCATION,
        transcript: { podcast: { episode: { title: "Episode A" } } },
        pageTitle: "Episode A | Transcript Reader",
      }),
    ).toEqual({
      "Cache-Control": "public, max-age=60, s-maxage=31536000, stale-while-revalidate=86400",
    });
  });
});
