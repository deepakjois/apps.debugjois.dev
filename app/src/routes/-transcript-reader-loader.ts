import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import {
  canonicalHashForTranscript,
  getTranscriptPageTitle,
  resolveTranscript,
  transcriptIndexQueryOptions,
  transcriptQueryOptions,
} from "../features/transcript-reader/data";
import type { TranscriptIndexItem, TranscriptPayload } from "../features/transcript-reader/data";

// Loader data is the complete SSR snapshot needed to render one reader page.
export type TranscriptReaderLoaderData = {
  transcriptList: TranscriptIndexItem[];
  selectedLocation: string | null;
  transcript: TranscriptPayload | null;
  pageTitle: string;
};

type TranscriptReaderCacheHeaders = {
  "Cache-Control": string;
};

const LATEST_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const HASH_CACHE_CONTROL = "public, max-age=60, s-maxage=31536000, stale-while-revalidate=86400";

export function getTranscriptReaderCacheHeaders(
  loaderData: TranscriptReaderLoaderData | undefined,
): TranscriptReaderCacheHeaders | undefined {
  if (!loaderData) {
    return undefined;
  }

  return {
    "Cache-Control": loaderData.selectedLocation ? HASH_CACHE_CONTROL : LATEST_CACHE_CONTROL,
  };
}

export async function loadTranscriptReaderData(
  queryClient: QueryClient,
  requestedHash: string | undefined,
): Promise<TranscriptReaderLoaderData> {
  const transcriptList = await queryClient.ensureQueryData(transcriptIndexQueryOptions());
  const latestTranscript = transcriptList[0] ?? null;
  const latestCanonicalHash = canonicalHashForTranscript(latestTranscript) || undefined;

  if (!requestedHash && latestCanonicalHash) {
    throw redirect({
      to: "/transcript-reader",
      search: { t: latestCanonicalHash },
      replace: true,
      headers: { "Cache-Control": LATEST_CACHE_CONTROL },
    });
  }

  const resolvedTranscript = resolveTranscript(transcriptList, requestedHash);

  if (resolvedTranscript.shouldRedirect) {
    throw redirect({
      to: "/transcript-reader",
      search: latestCanonicalHash ? { t: latestCanonicalHash } : undefined,
      replace: true,
      headers: { "Cache-Control": LATEST_CACHE_CONTROL },
    });
  }

  if (!resolvedTranscript.item) {
    return {
      transcriptList,
      selectedLocation: null,
      transcript: null,
      pageTitle: "Transcript Reader",
    };
  }

  const transcript = await queryClient.ensureQueryData(
    transcriptQueryOptions(resolvedTranscript.item.location),
  );

  return {
    transcriptList,
    selectedLocation: resolvedTranscript.item.location,
    transcript,
    pageTitle: getTranscriptPageTitle(transcript),
  };
}
