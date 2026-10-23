/* @vitest-environment jsdom */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TranscriptList } from "./index";
import TranscriptArticle from "./TranscriptArticle";

afterEach(cleanup);

it.each([
  ["youtube", "Channel name", "YouTube"],
  ["audio_url", "Not a podcast", "Audio"],
  ["podcast", "Backfilled show", "Backfilled show"],
  ["podcast_addict", "Podcast Addict show", "Podcast Addict show"],
  [undefined, "Legacy show", "Legacy show"],
  [undefined, undefined, "Podcast"],
])(
  "labels an individual %s transcript consistently with the index",
  (sourceType, name, expected) => {
    render(
      <TranscriptArticle
        transcript={{
          podcast: {
            source: { type: sourceType },
            podcast: { title: name },
            episode: { title: "An episode" },
          },
        }}
      />,
    );
    expect(screen.getByText(expected as string)).toBeDefined();
    if (name && name !== expected) {
      expect(screen.queryByText(name)).toBeNull();
    }
  },
);

it("shows source labels in recent and archived lists, including undated items", async () => {
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: "/transcript-reader",
    component: () => (
      <TranscriptList
        showArchived
        transcriptList={[
          {
            title: "Podcast episode",
            source_type: "miniflux",
            podcast_name: "The Town",
            date: "2026-10-20",
            location: `https://example.com/podcast--${"a".repeat(64)}.json`,
          },
          {
            title: "Video episode",
            source_type: "youtube",
            podcast_name: "A channel, not the label",
            location: `https://example.com/video--${"b".repeat(64)}.json`,
          },
          {
            title: "Older index entry",
            podcast_name: "Legacy Show",
            date: "2026-10-18",
            location: `https://example.com/older--${"c".repeat(64)}.json`,
          },
          {
            title: "Entry without metadata",
            location: `https://example.com/bare--${"e".repeat(64)}.json`,
          },
        ]}
        archivedTranscriptList={[
          {
            title: "Recording",
            source_type: "audio_url",
            date: "2026-10-17",
            archived: true,
            location: `https://example.com/audio--${"d".repeat(64)}.json`,
          },
        ]}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/transcript-reader"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);

  expect((await screen.findByText("The Town")).closest("a")).toBe(
    screen.getByText("Podcast episode").closest("a"),
  );
  expect(screen.getByText("October 20, 2026").closest("a")).toBe(
    screen.getByText("Podcast episode").closest("a"),
  );
  expect(screen.getByText("YouTube").closest("a")).toBe(
    screen.getByText("Video episode").closest("a"),
  );
  expect(screen.getByText("October 18, 2026").closest("a")).toBe(
    screen.getByText("Older index entry").closest("a"),
  );
  expect(screen.getByText("Legacy Show").closest("a")).toBe(
    screen.getByText("Older index entry").closest("a"),
  );
  expect(screen.getByText("Podcast").closest("a")).toBe(
    screen.getByText("Entry without metadata").closest("a"),
  );
  expect(screen.queryByText("A channel, not the label")).toBeNull();
  expect(screen.getByText("Audio").closest("a")).toBe(screen.getByText("Recording").closest("a"));
  expect(screen.getByText("October 17, 2026").closest("a")).toBe(
    screen.getByText("Recording").closest("a"),
  );
});
