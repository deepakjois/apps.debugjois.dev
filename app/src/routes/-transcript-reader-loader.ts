import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import {
  canonicalHashForTranscript,
  findTranscriptByHashPrefix,
  getTranscriptDescription,
  getTranscriptPageTitle,
  transcriptIndexQueryOptions,
  transcriptQueryOptions,
} from "../features/transcript-reader/data";
import type { TranscriptIndexItem, TranscriptPayload } from "../features/transcript-reader/data";

type PageMeta = {
  pageTitle: string;
  pageDescription: string;
  pagePath: string;
};

export type TranscriptReaderLoaderData = PageMeta &
  (
    | {
        transcriptList: TranscriptIndexItem[];
        archivedTranscriptList: TranscriptIndexItem[];
      }
    | { transcript: TranscriptPayload }
  );

type TranscriptReaderCacheHeaders = {
  "Cache-Control": string;
};

const TRANSCRIPT_LIST_LIMIT = 50;
const LIST_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const HASH_CACHE_CONTROL = "public, max-age=60, s-maxage=31536000, stale-while-revalidate=86400";

export function getTranscriptReaderCacheHeaders(
  loaderData: TranscriptReaderLoaderData | undefined,
): TranscriptReaderCacheHeaders | undefined {
  if (!loaderData) {
    return undefined;
  }

  return {
    "Cache-Control": "transcript" in loaderData ? HASH_CACHE_CONTROL : LIST_CACHE_CONTROL,
  };
}

export async function loadTranscriptReaderData(
  queryClient: QueryClient,
  requestedHash: string | undefined,
): Promise<TranscriptReaderLoaderData> {
  const transcriptList = await queryClient.ensureQueryData(transcriptIndexQueryOptions());

  if (!requestedHash) {
    const linkable = transcriptList.filter((item) => canonicalHashForTranscript(item));

    return {
      transcriptList: linkable.filter((item) => !item.archived).slice(0, TRANSCRIPT_LIST_LIMIT),
      archivedTranscriptList: linkable
        .filter((item) => item.archived)
        .slice(0, TRANSCRIPT_LIST_LIMIT),
      pageTitle: "Transcript Reader",
      pageDescription: "Readable, linkable podcast episode transcripts.",
      pagePath: "/transcript-reader",
    };
  }

  const item = findTranscriptByHashPrefix(transcriptList, requestedHash);

  if (!item) {
    throw redirect({
      to: "/transcript-reader",
      replace: true,
      headers: { "Cache-Control": LIST_CACHE_CONTROL },
    });
  }

  const transcript = await queryClient.ensureQueryData(transcriptQueryOptions(item.location));

  return {
    transcript,
    pageTitle: getTranscriptPageTitle(transcript),
    pageDescription: getTranscriptDescription(transcript),
    pagePath: `/transcript-reader?t=${canonicalHashForTranscript(item)}`,
  };
}
