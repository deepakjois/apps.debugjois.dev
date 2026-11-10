import { createError, readBody } from "nitro/h3";
import type { TranscriptIndexResponse, TranscriptState } from "#/apps/transcript-reader/data";
import { defineAdminHandler } from "../../../../core/adminHandler";
import { invokeBackendLambda } from "../../../../core/backendLambda";

const STATES: readonly unknown[] = ["active", "archived", "deleted"] satisfies TranscriptState[];

export default defineAdminHandler(async (event) => {
  const body = await readBody<{ location?: unknown; state?: unknown }>(event);

  if (typeof body?.location !== "string" || !body.location || !STATES.includes(body.state)) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "A transcript location and a state of active, archived, or deleted are required.",
    });
  }

  return invokeBackendLambda<TranscriptIndexResponse>({
    action: "set-transcript-state",
    location: body.location,
    state: body.state,
  });
});
