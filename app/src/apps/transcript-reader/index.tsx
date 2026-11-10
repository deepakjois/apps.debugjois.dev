import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import type { MouseEvent, ReactNode } from "react";
import { useOptionalAdminSession } from "#/core/auth/adminSession";
import TranscriptArticle from "./TranscriptArticle";
import {
  canonicalHashForTranscript,
  formatTranscriptDate,
  getTranscriptSourceLabel,
  setTranscriptState,
  transcriptIndexQueryOptions,
} from "./data";
import type { TranscriptIndexItem, TranscriptPayload, TranscriptState } from "./data";

type TranscriptListProps = {
  transcriptList: TranscriptIndexItem[];
  archivedTranscriptList: TranscriptIndexItem[];
  showArchived: boolean;
};

type TranscriptActions = {
  change: (item: TranscriptIndexItem, state: TranscriptState) => void;
  pendingLocation: string | undefined;
};

export function TranscriptList({
  transcriptList,
  archivedTranscriptList,
  showArchived,
}: TranscriptListProps) {
  const isAdmin = useOptionalAdminSession() !== null;
  const queryClient = useQueryClient();
  const router = useRouter();
  const stateMutation = useMutation({
    mutationFn: ({ location, state }: { location: string; state: TranscriptState }) =>
      setTranscriptState(location, state),
    onSuccess: async (transcripts) => {
      queryClient.setQueryData(transcriptIndexQueryOptions().queryKey, transcripts);
      await router.invalidate({ sync: true });
    },
  });
  const actions: TranscriptActions | undefined = isAdmin
    ? {
        change: (item, state) => {
          if (
            state === "deleted" &&
            !window.confirm(`Delete “${item.title || "Untitled"}” and its transcript?`)
          ) {
            return;
          }
          stateMutation.mutate({ location: item.location, state });
        },
        pendingLocation: stateMutation.isPending ? stateMutation.variables.location : undefined,
      }
    : undefined;

  return (
    <div className="transcript-reader-page">
      <main className="content">
        <h1 className="transcript-list-heading">Recent transcripts</h1>

        {stateMutation.error ? (
          <p className="status transcript-action-error" role="alert">
            {stateMutation.error.message}
          </p>
        ) : null}

        {transcriptList.length === 0 ? (
          <p className="status">No transcripts available yet.</p>
        ) : (
          <TranscriptLinks actions={actions} items={transcriptList} />
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
                actions={actions}
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
  actions,
}: {
  items: TranscriptIndexItem[];
  className?: string;
  actions?: TranscriptActions;
}) {
  return (
    <ol className={className ? `transcript-list ${className}` : "transcript-list"}>
      {items.map((item) => {
        const date = formatTranscriptDate(item.date);
        const title = item.title || "Untitled";

        return (
          <li
            aria-busy={actions?.pendingLocation === item.location || undefined}
            key={item.location}
          >
            <Link
              className="transcript-list-link"
              preload={false}
              search={{ t: canonicalHashForTranscript(item) }}
              to="/transcript-reader"
            >
              <div className="podcast-name">
                {getTranscriptSourceLabel(item.source_type, item.podcast_name)}
              </div>
              <span className="transcript-list-title">{title}</span>
              {date ? <span className="transcript-list-date">{date}</span> : null}
            </Link>
            {actions ? (
              <div className="transcript-actions">
                <ActionButton
                  disabled={actions.pendingLocation !== undefined}
                  action={item.archived ? "Unarchive" : "Archive"}
                  itemTitle={title}
                  onClick={() => actions.change(item, item.archived ? "active" : "archived")}
                >
                  <rect height="4" rx="1" width="18" x="3" y="4" />
                  <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
                  {item.archived ? (
                    <path d="M12 17v-5M9.5 14.5 12 12l2.5 2.5" />
                  ) : (
                    <path d="M10 12h4" />
                  )}
                </ActionButton>
                <ActionButton
                  className="transcript-action-delete"
                  disabled={actions.pendingLocation !== undefined}
                  action="Delete"
                  itemTitle={title}
                  onClick={() => actions.change(item, "deleted")}
                >
                  <path d="M4 7h16M10 11v6M14 11v6M9 7V4h6v3" />
                  <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
                </ActionButton>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ActionButton({
  action,
  itemTitle,
  className,
  disabled,
  onClick,
  children,
}: {
  action: string;
  itemTitle: string;
  className?: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={`${action} ${itemTitle}`}
      className={className ? `transcript-action ${className}` : "transcript-action"}
      disabled={disabled}
      onClick={onClick}
      title={action}
      type="button"
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
        {children}
      </svg>
    </button>
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
