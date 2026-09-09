import { createFileRoute } from "@tanstack/react-router";
import { TranscriptReader } from "../features/transcript-reader";
import TranscriptArticleSkeleton from "../features/transcript-reader/TranscriptArticleSkeleton";
import { TRANSCRIPT_SWITCH_SKELETON_DELAY_MS } from "../features/transcript-reader/constants";
import { normalizeTranscriptHash } from "../features/transcript-reader/data";
import transcriptReaderStylesHref from "../features/transcript-reader/styles.css?url";
import {
  getTranscriptReaderCacheHeaders,
  loadTranscriptReaderData,
} from "./-transcript-reader-loader";

type TranscriptReaderSearch = {
  t?: string;
};

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
  loader: ({ context, deps }) => loadTranscriptReaderData(context.queryClient, deps.requestedHash),
  head: ({ loaderData }) => ({
    links: [
      // SSR emits feature CSS before the route paints, avoiding an unstyled reader shell.
      { rel: "stylesheet", href: transcriptReaderStylesHref },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300;1,6..72,400&family=DM+Sans:wght@400;500;600&display=swap",
      },
    ],
    meta: [{ title: loaderData?.pageTitle ?? "Transcript Reader" }],
  }),
  headers: ({ loaderData }) => getTranscriptReaderCacheHeaders(loaderData),
  component: TranscriptReaderRoute,
});

function TranscriptReaderRoute() {
  const { selectedLocation, transcript, transcriptList } = Route.useLoaderData();

  return (
    <TranscriptReader
      key={selectedLocation ?? "transcript-empty"}
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
