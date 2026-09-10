import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, test } from "vitest";
import { routeTree } from "../../routeTree.gen";

describe("index route", () => {
  test("redirects to transcript reader", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ["/"],
      }),
      context: { queryClient },
      isServer: true,
      scrollRestoration: true,
      defaultPreload: "intent",
      defaultPreloadStaleTime: 0,
    });

    await router.load();

    const redirect = router.state.redirect;

    expect(redirect).toBeDefined();
    expect(redirect).toBeInstanceOf(Response);
    expect(redirect?.status).toBe(307);
    expect(redirect?.headers.get("Location")).toBe("/transcript-reader");
    expect(redirect?.options).toMatchObject({
      href: "/transcript-reader",
      replace: true,
      statusCode: 307,
      to: "/transcript-reader",
    });
  });
});
