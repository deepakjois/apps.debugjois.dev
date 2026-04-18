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

const transcriptReaderCriticalCss = `
:root {
  --tr-bg: #101113;
  --tr-border: #252730;
  --tr-text: #b8bac2;
  --tr-text-dim: #6b6e7a;
  --tr-text-bright: #e4e5eb;
  --tr-serif: "Newsreader", Georgia, serif;
  --tr-sans: "DM Sans", system-ui, sans-serif;
  --tr-max-w: 660px;
}

html,
body {
  min-height: 100%;
  margin: 0;
  background: var(--tr-bg);
}

body {
  color: var(--tr-text-bright);
  overscroll-behavior-x: auto;
}

.transcript-reader-page {
  min-height: 100vh;
  background: var(--tr-bg);
}

.toolbar {
  max-width: var(--tr-max-w);
  margin: 0 auto;
  padding: 18px 24px 0;
}

.search-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--tr-border);
  border-radius: 999px;
  background: transparent;
  color: var(--tr-text-dim);
  cursor: pointer;
}

.search-trigger svg {
  width: 14px;
  height: 14px;
}

.content {
  max-width: var(--tr-max-w);
  margin: 0 auto;
  padding: 26px 24px 120px;
  color: var(--tr-text);
  font-family: var(--tr-serif);
  font-size: 17px;
  line-height: 1.78;
}

.content-pending {
  display: flex;
  justify-content: center;
}

.status {
  font-family: var(--tr-sans);
  font-size: 14px;
  color: var(--tr-text-dim);
}

.status-pending {
  text-align: center;
}

@media (max-width: 600px) {
  .content {
    padding: 18px 18px 80px;
    font-size: 16px;
  }

  .toolbar {
    padding: 14px 18px 0;
  }
}
`;

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
    styles: [{ children: transcriptReaderCriticalCss }],
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

  return (
    <TranscriptReaderSelectedContent
      selectedLocation={selectedLocation}
      transcriptList={transcriptList}
    />
  );
}

function TranscriptReaderSelectedContent({
  selectedLocation,
  transcriptList,
}: {
  selectedLocation: string;
  transcriptList: TranscriptIndexItem[];
}) {
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
