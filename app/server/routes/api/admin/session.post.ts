import { createError, defineEventHandler, readBody, type H3Event } from "nitro/h3";
import type { VerifyGoogleIdToken } from "../../../../src/lib/auth/server";
import { createAdminSession, type SessionResponse } from "../../../utils/adminSession";

// Browser payload containing the ID token returned by Google Identity Services.
type LoginBody = {
  credential?: unknown;
};

// Signs in: verifies the Google credential and issues the session cookie.
export async function handleLogin(
  event: H3Event,
  verify?: VerifyGoogleIdToken,
): Promise<SessionResponse> {
  const body = await readBody<LoginBody>(event);

  if (typeof body?.credential !== "string" || body.credential.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "Google credential is required." });
  }

  return { session: await createAdminSession(event, body.credential, verify) };
}

export default defineEventHandler(handleLogin);
