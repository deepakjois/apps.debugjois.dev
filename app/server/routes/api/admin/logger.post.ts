import { createError, defineEventHandler, readBody, type H3Event } from "h3";
import { requireAdminSession } from "../../../utils/adminSession";
import { saveLoggerNote, type LoggerNote } from "../../../utils/logger";

// Route dependencies keep request validation independent from AWS in tests.
type SaveLoggerDependencies = {
  requireAdmin: (event: H3Event) => Promise<unknown>;
  saveLogger: (note: LoggerNote) => Promise<LoggerNote>;
};

export async function handleSaveLogger(
  event: H3Event,
  dependencies: SaveLoggerDependencies = {
    requireAdmin: requireAdminSession,
    saveLogger: saveLoggerNote,
  },
): Promise<LoggerNote> {
  await dependencies.requireAdmin(event);
  const body = await readBody<Partial<LoggerNote>>(event);

  if (typeof body?.title !== "string" || typeof body.contents !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "Logger title and contents are required.",
    });
  }

  return dependencies.saveLogger({ title: body.title, contents: body.contents });
}

export default defineEventHandler(handleSaveLogger);
