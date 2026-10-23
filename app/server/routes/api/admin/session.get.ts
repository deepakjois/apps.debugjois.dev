import { defineEventHandler, type H3Event } from "nitro/h3";
import type { SessionResponse } from "#/core/auth/contract";
import { readAdminSession } from "../../../core/adminSession";
import type { VerifyGoogleIdToken } from "../../../core/googleIdToken";

export async function handleGetSession(
  event: H3Event,
  verify?: VerifyGoogleIdToken,
): Promise<SessionResponse> {
  return { session: await readAdminSession(event, verify) };
}

export default defineEventHandler(handleGetSession);
