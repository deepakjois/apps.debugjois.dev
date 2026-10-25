import { createFileRoute } from "@tanstack/react-router";
import { TranscriptList, TranscriptReader } from "#/apps/transcript-reader";
import { brand } from "#/apps/transcript-reader/brand";
import TranscriptArticleSkeleton from "#/apps/transcript-reader/TranscriptArticleSkeleton";
import { getTranscriptTitle, normalizeTranscriptHash } from "#/apps/transcript-reader/data";
import {
  getTranscriptReaderCacheHeaders,
  loadTranscriptReaderData,
} from "#/apps/transcript-reader/loader";
import transcriptReaderStylesHref from "#/apps/transcript-reader/styles.css?url";
import { appCardMeta, appIconLinks, appThemeMeta, SITE_ORIGIN } from "#/core/appBrand";

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
      ...(loaderData ? [{ rel: "canonical", href: `${SITE_ORIGIN}${loaderData.pagePath}` }] : []),
      { rel: "stylesheet", href: transcriptReaderStylesHref },
      ...appIconLinks(brand),
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300;1,6..72,400&family=DM+Sans:wght@400;500;600&display=swap",
      },
    ],
    meta: [
      { title: loaderData?.pageTitle ?? brand.name },
      appThemeMeta(brand),
      ...(loaderData
        ? [
            { name: "description", content: loaderData.pageDescription },
            { property: "og:site_name", content: brand.name },
            {
              property: "og:type",
              content: "transcript" in loaderData ? "article" : "website",
            },
            {
              property: "og:title",
              content:
                "transcript" in loaderData
                  ? getTranscriptTitle(loaderData.transcript)
                  : loaderData.pageTitle,
            },
            { property: "og:description", content: loaderData.pageDescription },
            { property: "og:url", content: `${SITE_ORIGIN}${loaderData.pagePath}` },
            ...appCardMeta(brand),
          ]
        : []),
    ],
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
