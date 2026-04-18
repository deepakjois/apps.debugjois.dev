import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Transcript Reader" }],
  }),
  loader: () => {
    throw redirect({
      to: "/transcript-reader",
      replace: true,
    });
  },
});
