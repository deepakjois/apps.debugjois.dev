"use client";

import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import TranscriptArticle from "./TranscriptArticle";
import { canonicalHashForTranscript, formatTranscriptDate, getTranscriptSourceLabel } from "./data";
import type { TranscriptIndexItem, TranscriptPayload } from "./data";

type TranscriptListProps = {
  transcriptList: TranscriptIndexItem[];
  archivedTranscriptList: TranscriptIndexItem[];
  showArchived: boolean;
};

export function TranscriptList({
  transcriptList,
  archivedTranscriptList,
  showArchived,
}: TranscriptListProps) {
  return (
    <div className="transcript-reader-page">
      <main className="content">
        <h1 className="transcript-list-heading">Recent transcripts</h1>

        {transcriptList.length === 0 ? (
          <p className="status">No transcripts available yet.</p>
        ) : (
          <TranscriptLinks items={transcriptList} />
        )}

        {archivedTranscriptList.length > 0 ? (
          <section className="archived-transcripts">
            <Link
              aria-expanded={showArchived}
              className="archived-toggle"
              replace
              resetScroll={false}
              search={showArchived ? {} : { archived: true }}
              to="/transcript-reader"
            >
              {showArchived ? "Hide archived" : "Show archived"}
              <span className="archived-count">{archivedTranscriptList.length}</span>
            </Link>

            {showArchived ? (
              <TranscriptLinks
                className="transcript-list-archived"
                items={archivedTranscriptList}
              />
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}

function TranscriptLinks({
  items,
  className,
}: {
  items: TranscriptIndexItem[];
  className?: string;
}) {
  return (
    <ol className={className ? `transcript-list ${className}` : "transcript-list"}>
      {items.map((item) => {
        const date = formatTranscriptDate(item.date);

        return (
          <li key={item.location}>
            <Link
              className="transcript-list-link"
              preload={false}
              search={{ t: canonicalHashForTranscript(item) }}
              to="/transcript-reader"
            >
              <div className="podcast-name">
                {getTranscriptSourceLabel(item.source_type, item.podcast_name)}
              </div>
              <span className="transcript-list-title">{item.title || "Untitled"}</span>
              {date ? <span className="transcript-list-date">{date}</span> : null}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function TranscriptReader({ transcript }: { transcript: TranscriptPayload }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  // Returning through history restores the list's scroll position and avoids
  // stacking list entries. Without in-app history, as on a shared permalink,
  // the link navigates to the list.
  function handleBackClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      !canGoBack ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    router.history.back();
  }

  return (
    <div className="transcript-reader-page">
      <div className="toolbar">
        <Link
          aria-label="Back to transcripts"
          className="back-link"
          onClick={handleBackClick}
          to="/transcript-reader"
        >
          <svg
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
          >
            <path d="M19 12H5" />
            <path d="M11 6L5 12L11 18" />
          </svg>
        </Link>
      </div>

      <main className="content">
        <TranscriptArticle transcript={transcript} />
      </main>
    </div>
  );
}
