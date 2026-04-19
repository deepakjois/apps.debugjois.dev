import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Transcript Reader" }],
  }),
  loader: () => {
    // Static redirect — safe to cache at the CDN for a day.
    throw redirect({
      to: "/transcript-reader",
      replace: true,
      headers: { "Cache-Control": "public, max-age=60, s-maxage=86400" },
    });
  },
});
