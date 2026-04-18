import type { QueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import TranscriptArticleSkeleton from "../components/transcript-reader/TranscriptArticleSkeleton";
import { TRANSCRIPT_SWITCH_SKELETON_DELAY_MS } from "../components/transcript-reader/transcript-reader.constants";
import TranscriptReaderPage from "../components/transcript-reader/TranscriptReaderPage";
import {
  canonicalHashForTranscript,
  getTranscriptPageTitle,
  normalizeTranscriptHash,
  resolveTranscript,
  transcriptIndexQueryOptions,
  transcriptQueryOptions,
} from "../queries/queries";
import type { TranscriptIndexItem, TranscriptPayload } from "../queries/queries";
import "../styles/transcript-reader.css";

type TranscriptReaderSearch = {
  t?: string;
};

type TranscriptReaderLoaderData = {
  transcriptList: TranscriptIndexItem[];
  selectedLocation: string | null;
  transcript: TranscriptPayload | null;
  pageTitle: string;
};

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
    });
  }

  const resolvedTranscript = resolveTranscript(transcriptList, requestedHash);

  if (resolvedTranscript.shouldRedirect) {
    throw redirect({
      to: "/transcript-reader",
      search: latestCanonicalHash ? { t: latestCanonicalHash } : undefined,
      replace: true,
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

export const Route = createFileRoute("/transcript-reader")({
  validateSearch: (search: Record<string, unknown>): TranscriptReaderSearch => ({
    t: normalizeTranscriptHash(search.t),
  }),
  pendingComponent: TranscriptReaderPending,
  pendingMinMs: TRANSCRIPT_SWITCH_SKELETON_DELAY_MS,
  pendingMs: 0,
  loaderDeps: ({ search }) => ({
    requestedHash: search.t,
  }),
  head: ({ loaderData }) => ({
    links: [
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300;1,6..72,400&family=DM+Sans:wght@400;500;600&display=swap",
      },
    ],
    meta: [
      {
        title: loaderData?.pageTitle ?? "Transcript Reader",
      },
    ],
  }),
  loader: ({ context, deps }) => loadTranscriptReaderData(context.queryClient, deps.requestedHash),
  component: TranscriptReaderRouteComponent,
});

function TranscriptReaderRouteComponent() {
  const { selectedLocation, transcript, transcriptList } = Route.useLoaderData();

  return (
    <TranscriptReaderPage
      selectedLocation={selectedLocation}
      transcript={transcript}
      transcriptList={transcriptList}
    />
  );
}

function TranscriptReaderPending() {
  return (
    <div className="transcript-reader-page">
      <div className="toolbar">
        <div aria-hidden="true" className="search-trigger" />
      </div>
      <main className="content content-pending">
        <TranscriptArticleSkeleton dense />
      </main>
    </div>
  );
}
