import { createFileRoute, redirect } from "@tanstack/react-router";

// The logger lived here before it became its own app; bookmarks and home-screen icons still open it.
export const Route = createFileRoute("/admin/logger")({
  beforeLoad: () => {
    throw redirect({ to: "/logger", replace: true });
  },
});
