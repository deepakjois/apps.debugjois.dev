"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import TranscriptArticle from "./TranscriptArticle";
import TranscriptArticleSkeleton from "./TranscriptArticleSkeleton";
import TranscriptSearchModal from "./TranscriptSearchModal";
import { TRANSCRIPT_SWITCH_SKELETON_DELAY_MS } from "./constants";
import { canonicalHashForTranscript, transcriptQueryOptions } from "./data";
import type { TranscriptIndexItem, TranscriptPayload } from "./data";

type TranscriptReaderProps = {
  transcriptList: TranscriptIndexItem[];
  transcript: TranscriptPayload | null;
  selectedLocation: string | null;
};

export function TranscriptReader({
  transcriptList,
  transcript,
  selectedLocation,
}: TranscriptReaderProps) {
  const navigate = useNavigate({ from: "/transcript-reader" });
  const queryClient = useQueryClient();
  // This pending selection keeps the current article visible during a fast prefetch.
  const [pendingLocation, setPendingLocation] = useState<string | null>(null);
  const [showTransitionSkeleton, setShowTransitionSkeleton] = useState(false);
  const transitionSequenceRef = useRef(0);
  const skeletonTimerRef = useRef<number | null>(null);

  function clearSkeletonTimer() {
    if (skeletonTimerRef.current === null) {
      return;
    }

    window.clearTimeout(skeletonTimerRef.current);
    skeletonTimerRef.current = null;
  }

  useEffect(() => {
    return () => {
      clearSkeletonTimer();
    };
  }, []);

  function selectTranscript(item: TranscriptIndexItem) {
    const canonicalHash = canonicalHashForTranscript(item);

    if (!canonicalHash) {
      return;
    }

    const nextLocation = item.location;

    if (nextLocation === selectedLocation) {
      void navigate({
        to: "/transcript-reader",
        search: { t: canonicalHash },
        replace: true,
      });
      return;
    }

    const transitionSequence = transitionSequenceRef.current + 1;

    transitionSequenceRef.current = transitionSequence;
    clearSkeletonTimer();
    setPendingLocation(nextLocation);
    setShowTransitionSkeleton(false);

    // Slow prefetches replace the old article with a skeleton after a short grace period.
    skeletonTimerRef.current = window.setTimeout(() => {
      if (transitionSequenceRef.current === transitionSequence) {
        setShowTransitionSkeleton(true);
      }
    }, TRANSCRIPT_SWITCH_SKELETON_DELAY_MS);

    void queryClient
      .ensureQueryData(transcriptQueryOptions(nextLocation))
      .catch(() => undefined)
      .finally(() => {
        if (transitionSequenceRef.current !== transitionSequence) {
          return;
        }

        clearSkeletonTimer();

        startTransition(() => {
          setPendingLocation(null);
          setShowTransitionSkeleton(false);

          void navigate({
            to: "/transcript-reader",
            search: { t: canonicalHash },
          });
        });
      });
  }

  const shouldShowSkeleton = showTransitionSkeleton && pendingLocation !== null;

  return (
    <div className="transcript-reader-page">
      <TranscriptSearchModal
        onSelectTranscript={selectTranscript}
        transcriptList={transcriptList}
      />

      <main aria-busy={pendingLocation !== null} className="content">
        {shouldShowSkeleton ? (
          <TranscriptArticleSkeleton />
        ) : transcript ? (
          <div className="transcript-article-frame" key={selectedLocation ?? "transcript-empty"}>
            <TranscriptArticle transcript={transcript} />
          </div>
        ) : (
          <p className="status">No transcripts available yet.</p>
        )}
      </main>
    </div>
  );
}
