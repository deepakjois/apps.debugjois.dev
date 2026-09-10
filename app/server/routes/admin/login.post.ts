import { H3Event, defineEventHandler, readBody, setCookie } from "h3";
import type { AdminSession } from "../../../src/lib/auth/server";
import { verifyGoogleIdToken } from "../../../src/lib/auth/server";
import { AUTH_COOKIE_NAME } from "../../../src/lib/auth/config";

// Browser payload containing the ID token returned by Google Identity Services.
type LoginBody = {
  credential: string;
};

type VerifyGoogleIdToken = (credential: string) => Promise<AdminSession>;

export async function handleAdminLogin(
  event: H3Event,
  verify: VerifyGoogleIdToken = verifyGoogleIdToken,
): Promise<AdminSession> {
  const body = await readBody<LoginBody>(event);

  if (typeof body?.credential !== "string" || body.credential.length === 0) {
    throw new Error("Google credential is required");
  }

  const session = await verify(body.credential);

  // Set this on Nitro's outer response so API Gateway receives the cookie.
  setCookie(event, AUTH_COOKIE_NAME, body.credential, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: event.url.protocol === "https:",
    maxAge: 60 * 60 * 24 * 7,
  });

  return session;
}

export default defineEventHandler(handleAdminLogin);
