import { defineEventHandler, type H3Event } from "nitro/h3";
import { requireAdminSession } from "../../../core/adminSession";
import { getLoggerNote, type LoggerNote } from "../../../apps/logger/dailyLog";

type GetLoggerDependencies = {
  requireAdmin: (event: H3Event) => Promise<unknown>;
  getLogger: () => Promise<LoggerNote>;
};

export async function handleGetLogger(
  event: H3Event,
  dependencies: GetLoggerDependencies = {
    requireAdmin: requireAdminSession,
    getLogger: getLoggerNote,
  },
): Promise<LoggerNote> {
  await dependencies.requireAdmin(event);
  return dependencies.getLogger();
}

export default defineEventHandler(handleGetLogger);
