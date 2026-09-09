// @vitest-environment jsdom

import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { getRouter } from "./router";

const TEST_HASH = "1111111111111111222222222222222233333333333333334444444444444444";
const TEST_LOCATION = `https://example.com/transcript--${TEST_HASH}.json`;

function getSeededRouter() {
  const router = getRouter();

  // Route-shape tests use local query data rather than the public transcript service.
  router.options.context.queryClient.setQueryData(
    ["transcripts", "index"],
    [{ location: TEST_LOCATION, title: "Test transcript" }],
  );
  router.options.context.queryClient.setQueryData(["transcripts", "item", TEST_LOCATION], {
    podcast: { episode: { title: "Test transcript" } },
  });

  return router;
}

describe("feature routing", () => {
  it.each([
    ["/transcript-reader?t=1111111111111111", ["__root__", "/transcript-reader"]],
    ["/admin/podscriber", ["__root__", "/admin", "/admin/podscriber"]],
    ["/admin/daily-log", ["__root__", "/admin", "/admin/daily-log"]],
  ])("matches %s with its expected layout", async (path, routeIds) => {
    const router = getSeededRouter();
    router.update({
      context: router.options.context,
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    await router.load();
    expect(router.state.matches.map((match) => match.routeId)).toEqual(routeIds);
    expect(router.state.matches.every((match) => match.status === "success")).toBe(true);
  });

  it.each([
    ["/", "/transcript-reader"],
    ["/admin", "/admin/podscriber"],
  ])("redirects %s to %s", async (path, destination) => {
    const router = getSeededRouter();
    router.update({
      isServer: false,
      context: router.options.context,
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    await router.load();
    expect(router.state.location.pathname).toBe(destination);
  });

  it.each([
    ["/transcript-reader?t=1111111111111111", "/transcript-reader"],
    ["/admin/podscriber", "/admin"],
    ["/admin/daily-log", "/admin"],
  ])("loads only the stylesheet owned by %s", async (path, ownerRouteId) => {
    const router = getSeededRouter();
    router.update({
      context: router.options.context,
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    await router.load();
    const stylesheetOwners = [
      ...new Set(
        router.state.matches.flatMap((match) =>
          (match.links ?? []).filter((link) => link?.rel === "stylesheet").map(() => match.routeId),
        ),
      ),
    ];
    expect(stylesheetOwners).toEqual([ownerRouteId]);
  });

  it("does not share cached data across router instances", () => {
    const first = getRouter().options.context.queryClient;
    const second = getRouter().options.context.queryClient;
    first.setQueryData(["private-note"], "first request only");
    expect(first.getQueryData(["private-note"])).toBe("first request only");
    expect(second.getQueryData(["private-note"])).toBeUndefined();
    first.clear();
    second.clear();
  });
});
