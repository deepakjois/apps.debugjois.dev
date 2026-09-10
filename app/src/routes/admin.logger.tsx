import { createFileRoute } from "@tanstack/react-router";
import { Logger } from "../features/admin/logger";
import "../features/admin/logger/styles.css";

export const Route = createFileRoute("/admin/logger")({
  head: () => ({ meta: [{ title: "Logger" }] }),
  component: Logger,
});
