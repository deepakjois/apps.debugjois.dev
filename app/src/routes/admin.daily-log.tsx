import { createFileRoute } from "@tanstack/react-router";
import { DailyLog } from "../features/admin/daily-log";

export const Route = createFileRoute("/admin/daily-log")({
  head: () => ({ meta: [{ title: "Daily log · Apps v2" }] }),
  component: DailyLog,
});
