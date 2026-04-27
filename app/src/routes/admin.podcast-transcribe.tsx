import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/podcast-transcribe")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/podscriber", replace: true });
  },
});
