import { createFileRoute } from "@tanstack/react-router";
import { PodscriberAdminPage } from "../components/admin/PodscriberAdminPage";

export const Route = createFileRoute("/admin/podscriber")({
  head: () => ({
    meta: [{ title: "Podscriber" }],
  }),
  component: PodscriberAdminPage,
});
