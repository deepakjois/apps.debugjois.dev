import { createFileRoute } from "@tanstack/react-router";
import { Logger } from "#/apps/logger/Logger";
import "#/apps/logger/styles.css";

export const Route = createFileRoute("/admin/logger")({
  head: () => ({ meta: [{ title: "Logger" }] }),
  component: Logger,
});
