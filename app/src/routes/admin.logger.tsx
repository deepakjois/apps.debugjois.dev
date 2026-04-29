import { createFileRoute } from "@tanstack/react-router";
import { LoggerAdminPage } from "../components/admin/LoggerAdminPage";
import "../styles/admin-logger.css";

export const Route = createFileRoute("/admin/logger")({
  head: () => ({
    meta: [{ title: "Logger" }],
  }),
  component: LoggerAdminPage,
});
