import { createFileRoute } from "@tanstack/react-router";
import { TranscriptReader } from "../features/transcript-reader";
import transcriptReaderStylesHref from "../features/transcript-reader/styles.css?url";

export const Route = createFileRoute("/transcript-reader")({
  head: () => ({
    meta: [{ title: "Transcript reader · Apps v2" }],
    // SSR places feature CSS in the document head before the route is painted.
    links: [{ rel: "stylesheet", href: transcriptReaderStylesHref }],
  }),
  component: TranscriptReader,
});
