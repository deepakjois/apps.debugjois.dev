import { createFileRoute } from "@tanstack/react-router";
import { Podscriber } from "../features/admin/podscriber";

export const Route = createFileRoute("/admin/podscriber")({
  head: () => ({ meta: [{ title: "Podscriber · Apps v2" }] }),
  component: Podscriber,
});
