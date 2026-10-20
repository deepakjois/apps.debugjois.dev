import { defineEventHandler, type H3Event } from "nitro/h3";
import type { VerifyGoogleIdToken } from "../../../../src/lib/auth/server";
import { readAdminSession, type SessionResponse } from "../../../utils/adminSession";

export async function handleGetSession(
  event: H3Event,
  verify?: VerifyGoogleIdToken,
): Promise<SessionResponse> {
  return { session: await readAdminSession(event, verify) };
}

export default defineEventHandler(handleGetSession);
