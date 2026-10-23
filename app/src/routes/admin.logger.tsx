import { createFileRoute } from "@tanstack/react-router";
import { Logger } from "#/apps/logger/Logger";
import loggerStylesHref from "#/apps/logger/styles.css?url";

export const Route = createFileRoute("/admin/logger")({
  head: () => ({
    meta: [{ title: "Logger" }, { name: "theme-color", content: "#0d1117" }],
    links: [{ rel: "stylesheet", href: loggerStylesHref }],
  }),
  component: Logger,
});
