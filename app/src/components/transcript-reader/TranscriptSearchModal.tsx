"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { canonicalHashForTranscript, formatTranscriptDate } from "../../queries/queries";
import type { TranscriptIndexItem } from "../../queries/queries";

const MAX_VISIBLE_RESULTS = 5;

type TranscriptSearchModalProps = {
  transcriptList: TranscriptIndexItem[];
  currentTranscriptLocation: string | null;
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

export default function TranscriptSearchModal({
  transcriptList,
  currentTranscriptLocation,
}: TranscriptSearchModalProps) {
  const navigate = useNavigate({ from: "/transcript-reader" });
  const [isOpen, setIsOpen] = useState(false);
  const [isKeyboardNavigating, setIsKeyboardNavigating] = useState(false);
  const [query, setQuery] = useState("");
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchTriggerRef = useRef<HTMLButtonElement | null>(null);

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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((currentValue) => !currentValue);
        return;
      }

      if (event.key === "/" && !isOpen) {
        const target = event.target;

        if (
          target instanceof HTMLElement &&
          (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        ) {
          return;
        }

        event.preventDefault();
        setIsOpen(true);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function openModal() {
    if (transcriptList.length === 0) {
      return;
    }

    setIsKeyboardNavigating(false);
    setQuery("");
    setActiveResultIndex(0);
    setIsOpen(true);
  }

  function closeModal() {
    setIsOpen(false);
    searchTriggerRef.current?.focus();
  }

  function navigateToTranscript(item: TranscriptIndexItem) {
    const canonicalHash = canonicalHashForTranscript(item);

    if (!canonicalHash) {
      return;
    }

    closeModal();
    void navigate({
      to: "/transcript-reader",
      search: { t: canonicalHash },
      replace: item.location === currentTranscriptLocation,
    });
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
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
        navigateToTranscript(selectedItem);
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    }
  }

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
          <div aria-labelledby="modal-search" aria-modal="true" className="modal-panel" role="dialog">
            <input
              autoComplete="off"
              className="modal-search"
              id="modal-search"
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveResultIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search transcripts"
              ref={searchInputRef}
              spellCheck={false}
              type="search"
              value={query}
            />

            <ul className={`modal-results${isKeyboardNavigating ? " is-keyboard-nav" : ""}`}>
              {visibleResults.length === 0 ? (
                <li className="modal-empty">No transcripts match your search.</li>
              ) : (
                visibleResults.map((item, index) => {
                  const isActive = index === activeResultIndex;

                  return (
                    <li key={item.location}>
                      <button
                        className={`modal-result${isActive ? " is-active" : ""}`}
                        onClick={() => {
                          navigateToTranscript(item);
                        }}
                        onMouseMove={() => {
                          setIsKeyboardNavigating(false);

                          if (index !== activeResultIndex) {
                            setActiveResultIndex(index);
                          }
                        }}
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
