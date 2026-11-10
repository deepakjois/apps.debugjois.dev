/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useLoaderData,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LAST_ADMIN_EMAIL_STORAGE_KEY } from "#/core/auth/config";
import type { TranscriptIndexItem } from "./data";
import { TranscriptList } from "./index";
import { loadTranscriptReaderData } from "./loader";
import TranscriptArticle from "./TranscriptArticle";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

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
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

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
  expect(screen.queryByRole("button")).toBeNull();
});

it("lets a signed-in admin archive a transcript and asks before deleting one", async () => {
  const keep = { title: "Keep me", location: `https://example.com/keep--${"a".repeat(64)}.json` };
  const archive = {
    title: "Archive me",
    location: `https://example.com/archive--${"b".repeat(64)}.json`,
  };
  const queryClient = new QueryClient();
  queryClient.setQueryData<TranscriptIndexItem[]>(["transcripts", "index"], [keep, archive]);
  queryClient.setQueryData(["admin", "session"], {
    session: { email: "deepak.jois@gmail.com", name: null, picture: null },
  });
  window.localStorage.setItem(LAST_ADMIN_EMAIL_STORAGE_KEY, "deepak.jois@gmail.com");
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json({ transcripts: [keep, { ...archive, archived: true }] }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: "/transcript-reader",
    loader: () => loadTranscriptReaderData(queryClient, undefined),
    component: function ListFromLoader() {
      const data = useLoaderData({ from: "/transcript-reader" });
      return "transcriptList" in data ? (
        <TranscriptList
          archivedTranscriptList={data.archivedTranscriptList}
          showArchived
          transcriptList={data.transcriptList}
        />
      ) : null;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/transcript-reader"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole("button", { name: "Delete Keep me" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(fetchMock).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Archive Archive me" }));

  expect(await screen.findByRole("button", { name: "Unarchive Archive me" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "Archive Archive me" })).toBeNull();
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/admin/transcript-reader/state");
  expect(init?.method).toBe("POST");
  expect(JSON.parse(init?.body as string)).toEqual({
    location: archive.location,
    state: "archived",
  });
});
