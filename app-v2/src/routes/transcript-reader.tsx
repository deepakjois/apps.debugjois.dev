import { createFileRoute } from "@tanstack/react-router";
import { TranscriptReader } from "../features/transcript-reader";

export const Route = createFileRoute("/transcript-reader")({
  head: () => ({ meta: [{ title: "Transcript reader · Apps v2" }] }),
  component: TranscriptReader,
});
