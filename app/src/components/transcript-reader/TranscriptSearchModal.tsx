"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { formatTranscriptDate } from "../../queries/queries";
import type { TranscriptIndexItem } from "../../queries/queries";

const MAX_VISIBLE_RESULTS = 5;
const SEARCH_DIALOG_TITLE_ID = "transcript-search-title";
const SEARCH_INPUT_ID = "transcript-search-input";
const SEARCH_RESULTS_ID = "transcript-search-results";

type TranscriptSearchModalProps = {
  transcriptList: TranscriptIndexItem[];
  onSelectTranscript: (item: TranscriptIndexItem) => void;
};

function fuzzyScore(title: string, query: string): number {
  const haystack = title.toLowerCase();
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return 1;
  }

  if (haystack.includes(needle)) {
    return needle.length * 100 - haystack.indexOf(needle);
  }

  let score = 0;
  let searchIndex = 0;
  let streak = 0;

  for (const char of needle) {
    const foundAt = haystack.indexOf(char, searchIndex);

    if (foundAt === -1) {
      return 0;
    }

    if (foundAt === searchIndex) {
      streak += 1;
      score += 10 + streak * 3;
    } else {
      streak = 0;
      score += 3;
    }

    searchIndex = foundAt + 1;
  }

  return score;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
  );
}

function getFocusableElements(container: HTMLDivElement | null): HTMLElement[] {
  const focusableElements = container?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  );

  if (!focusableElements) {
    return [];
  }

  return Array.from(focusableElements).filter(
    (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1,
  );
}

function trapModalFocus(event: KeyboardEvent, container: HTMLDivElement | null) {
  if (event.key !== "Tab") {
    return;
  }

  const focusable = getFocusableElements(container);

  if (focusable.length === 0) {
    return;
  }

  const firstElement = focusable[0];
  const lastElement = focusable[focusable.length - 1];
  const activeElement = document.activeElement;

  if (event.shiftKey) {
    if (activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    }

    return;
  }

  if (activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

export default function TranscriptSearchModal({
  transcriptList,
  onSelectTranscript,
}: TranscriptSearchModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isKeyboardNavigating, setIsKeyboardNavigating] = useState(false);
  const [query, setQuery] = useState("");
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const modalPanelRef = useRef<HTMLDivElement | null>(null);

  const visibleResults = useMemo(() => {
    if (!query.trim()) {
      return transcriptList.slice(0, MAX_VISIBLE_RESULTS);
    }

    return transcriptList
      .map((item, index) => ({
        item,
        index,
        score: fuzzyScore(item.title ?? "", query),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (a.score !== b.score) {
          return b.score - a.score;
        }

        return a.index - b.index;
      })
      .slice(0, MAX_VISIBLE_RESULTS)
      .map((entry) => entry.item);
  }, [query, transcriptList]);

  useEffect(() => {
    setActiveResultIndex((currentIndex) => {
      if (visibleResults.length === 0) {
        return 0;
      }

      return Math.min(currentIndex, visibleResults.length - 1);
    });
  }, [visibleResults]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isOpen]);

  const openModal = useCallback(() => {
    if (transcriptList.length === 0) {
      return;
    }

    setIsKeyboardNavigating(false);
    setQuery("");
    setActiveResultIndex(0);
    setIsOpen(true);
  }, [transcriptList.length]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    searchTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    // Keep the global shortcuts aligned with the trigger button behavior.
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();

        if (isOpen) {
          closeModal();
        } else {
          openModal();
        }

        return;
      }

      if (event.key === "/" && !isOpen) {
        if (isEditableTarget(event.target)) {
          return;
        }

        event.preventDefault();
        openModal();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeModal, isOpen, openModal]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleFocusTrap(event: KeyboardEvent) {
      trapModalFocus(event, modalPanelRef.current);
    }

    document.addEventListener("keydown", handleFocusTrap);

    return () => {
      document.removeEventListener("keydown", handleFocusTrap);
    };
  }, [isOpen]);

  function selectTranscript(item: TranscriptIndexItem) {
    closeModal();
    onSelectTranscript(item);
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    // Keep focus on the input while arrow keys move the active result.
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsKeyboardNavigating(true);

      if (visibleResults.length) {
        setActiveResultIndex((currentIndex) => (currentIndex + 1) % visibleResults.length);
      }

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsKeyboardNavigating(true);

      if (visibleResults.length) {
        setActiveResultIndex(
          (currentIndex) => (currentIndex - 1 + visibleResults.length) % visibleResults.length,
        );
      }

      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selectedItem = visibleResults[activeResultIndex];

      if (selectedItem) {
        selectTranscript(selectedItem);
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    }
  }

  const activeResultId = visibleResults[activeResultIndex]
    ? `transcript-search-result-${activeResultIndex}`
    : undefined;

  return (
    <>
      <div className="toolbar">
        <button
          aria-label="Search transcripts"
          className="search-trigger"
          onClick={openModal}
          ref={searchTriggerRef}
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
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16L21 21" />
          </svg>
        </button>
      </div>

      {isOpen ? (
        <div aria-hidden="false" className="modal-root is-open">
          <button
            aria-label="Close transcript search"
            className="modal-backdrop"
            onClick={closeModal}
            type="button"
          />
          <div
            aria-labelledby={SEARCH_DIALOG_TITLE_ID}
            aria-modal="true"
            className="modal-panel"
            ref={modalPanelRef}
            role="dialog"
          >
            <h2 className="modal-title sr-only" id={SEARCH_DIALOG_TITLE_ID}>
              Search transcripts
            </h2>
            <input
              aria-activedescendant={activeResultId}
              aria-autocomplete="list"
              aria-controls={SEARCH_RESULTS_ID}
              aria-expanded="true"
              aria-label="Search transcripts"
              autoComplete="off"
              className="modal-search"
              id={SEARCH_INPUT_ID}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveResultIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search transcripts"
              ref={searchInputRef}
              role="combobox"
              spellCheck={false}
              type="search"
              value={query}
            />

            <ul
              className={`modal-results${isKeyboardNavigating ? " is-keyboard-nav" : ""}`}
              id={SEARCH_RESULTS_ID}
              role="listbox"
            >
              {visibleResults.length === 0 ? (
                <li className="modal-empty">No transcripts match your search.</li>
              ) : (
                visibleResults.map((item, index) => {
                  const isActive = index === activeResultIndex;

                  return (
                    <li key={item.location}>
                      <button
                        aria-selected={isActive}
                        className={`modal-result${isActive ? " is-active" : ""}`}
                        id={`transcript-search-result-${index}`}
                        onClick={() => {
                          selectTranscript(item);
                        }}
                        onMouseMove={() => {
                          setIsKeyboardNavigating(false);

                          if (index !== activeResultIndex) {
                            setActiveResultIndex(index);
                          }
                        }}
                        role="option"
                        type="button"
                      >
                        <span className="modal-result-title">{item.title ?? "Untitled"}</span>
                        <span className="modal-result-date">
                          {formatTranscriptDate(item.date) ?? "Undated"}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
