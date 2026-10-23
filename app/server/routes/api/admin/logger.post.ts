import { createError, readBody } from "nitro/h3";
import type { LoggerNote } from "#/apps/logger/contract";
import { saveLoggerNote } from "../../../apps/logger/dailyLog";
import { defineAdminHandler } from "../../../core/adminHandler";

export default defineAdminHandler(async (event) => {
  const body = await readBody<Partial<LoggerNote>>(event);

  if (typeof body?.title !== "string" || typeof body.contents !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "Logger title and contents are required.",
    });
  }

  return saveLoggerNote({ title: body.title, contents: body.contents });
});
