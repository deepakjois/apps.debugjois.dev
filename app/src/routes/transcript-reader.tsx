import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import TranscriptReaderPage from "../components/transcript-reader/TranscriptReaderPage";
import {
  canonicalHashForTranscript,
  getTranscriptPageTitle,
  normalizeTranscriptHash,
  resolveTranscript,
  transcriptIndexQueryOptions,
  transcriptQueryOptions,
} from "../queries/queries";
import type { TranscriptIndexItem } from "../queries/queries";
import "../styles/transcript-reader.css";

type TranscriptReaderSearch = {
  t?: string;
};

type TranscriptReaderLoaderData = {
  selectedLocation: string | null;
  pageTitle: string;
};

export const Route = createFileRoute("/transcript-reader")({
  validateSearch: (search: Record<string, unknown>): TranscriptReaderSearch => ({
    t: normalizeTranscriptHash(search.t),
  }),
  pendingComponent: TranscriptReaderPending,
  pendingMinMs: 200,
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
  loader: async ({ context, deps }): Promise<TranscriptReaderLoaderData> => {
    const transcriptList = await context.queryClient.ensureQueryData(transcriptIndexQueryOptions());
    const latestTranscript = transcriptList[0] ?? null;
    const latestCanonicalHash = canonicalHashForTranscript(latestTranscript) || undefined;

    if (!deps.requestedHash && latestCanonicalHash) {
      throw redirect({
        to: "/transcript-reader",
        search: { t: latestCanonicalHash },
        replace: true,
      });
    }

    const resolvedTranscript = resolveTranscript(transcriptList, deps.requestedHash);

    if (resolvedTranscript.shouldRedirect) {
      throw redirect({
        to: "/transcript-reader",
        search: latestCanonicalHash ? { t: latestCanonicalHash } : undefined,
        replace: true,
      });
    }

    if (!resolvedTranscript.item) {
      return {
        selectedLocation: null,
        pageTitle: "Transcript Reader",
      };
    }

    const transcript = await context.queryClient.ensureQueryData(
      transcriptQueryOptions(resolvedTranscript.item.location),
    );

    return {
      selectedLocation: resolvedTranscript.item.location,
      pageTitle: getTranscriptPageTitle(transcript),
    };
  },
  component: TranscriptReaderRouteComponent,
});

function TranscriptReaderRouteComponent() {
  const { selectedLocation } = Route.useLoaderData();
  const transcriptList = useSuspenseQuery(transcriptIndexQueryOptions()).data;

  return (
    <TranscriptReaderRouteContent
      selectedLocation={selectedLocation}
      transcriptList={transcriptList}
    />
  );
}

function TranscriptReaderRouteContent({
  selectedLocation,
  transcriptList,
}: {
  selectedLocation: string | null;
  transcriptList: TranscriptIndexItem[];
}) {
  if (!selectedLocation) {
    return (
      <TranscriptReaderPage
        selectedLocation={selectedLocation}
        transcript={null}
        transcriptList={transcriptList}
      />
    );
  }

  const transcript = useSuspenseQuery(transcriptQueryOptions(selectedLocation)).data;

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
      <main className="content content-pending">
        <p className="status status-pending">Loading transcript...</p>
      </main>
    </div>
  );
}
