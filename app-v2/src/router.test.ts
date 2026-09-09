// @vitest-environment jsdom

import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { getRouter } from "./router";

describe("feature routing", () => {
  it.each([
    ["/transcript-reader", ["__root__", "/transcript-reader"]],
    ["/admin/podscriber", ["__root__", "/admin", "/admin/podscriber"]],
    ["/admin/daily-log", ["__root__", "/admin", "/admin/daily-log"]],
  ])("matches %s with its expected layout", async (path, routeIds) => {
    const router = getRouter();
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
    const router = getRouter();
    router.update({
      isServer: false,
      context: router.options.context,
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    await router.load();
    expect(router.state.location.pathname).toBe(destination);
  });

  it.each([
    ["/transcript-reader", "/transcript-reader"],
    ["/admin/podscriber", "/admin"],
    ["/admin/daily-log", "/admin"],
  ])("loads only the stylesheet owned by %s", async (path, ownerRouteId) => {
    const router = getRouter();
    router.update({
      context: router.options.context,
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    await router.load();
    const stylesheetOwners = router.state.matches.flatMap((match) =>
      (match.links ?? []).filter((link) => link?.rel === "stylesheet").map(() => match.routeId),
    );
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
