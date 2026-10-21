import { createFileRoute } from "@tanstack/react-router";
import { TranscriptList, TranscriptReader } from "../features/transcript-reader";
import TranscriptArticleSkeleton from "../features/transcript-reader/TranscriptArticleSkeleton";
import { normalizeTranscriptHash } from "../features/transcript-reader/data";
import transcriptReaderStylesHref from "../features/transcript-reader/styles.css?url";
import {
  getTranscriptReaderCacheHeaders,
  loadTranscriptReaderData,
} from "./-transcript-reader-loader";

type TranscriptReaderSearch = {
  t?: string;
  archived?: true;
};

export const Route = createFileRoute("/transcript-reader")({
  validateSearch: (search: Record<string, unknown>): TranscriptReaderSearch => ({
    t: normalizeTranscriptHash(search.t),
    archived: search.archived === true || search.archived === "true" ? true : undefined,
  }),
  pendingComponent: TranscriptReaderPending,
  pendingMinMs: 200,
  pendingMs: 0,
  loaderDeps: ({ search }) => ({
    requestedHash: search.t,
  }),
  loader: ({ context, deps }) => loadTranscriptReaderData(context.queryClient, deps.requestedHash),
  head: ({ loaderData }) => ({
    links: [
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
  const loaderData = Route.useLoaderData();
  const { archived } = Route.useSearch();

  return "transcript" in loaderData ? (
    <TranscriptReader transcript={loaderData.transcript} />
  ) : (
    <TranscriptList
      archivedTranscriptList={loaderData.archivedTranscriptList}
      showArchived={archived === true}
      transcriptList={loaderData.transcriptList}
    />
  );
}

function TranscriptReaderPending() {
  const { t } = Route.useSearch();

  if (!t) {
    return <div className="transcript-reader-page" />;
  }

  return (
    <div className="transcript-reader-page">
      <div className="toolbar">
        <div aria-hidden="true" className="back-link" />
      </div>
      <main className="content content-pending">
        <TranscriptArticleSkeleton />
      </main>
    </div>
  );
}
