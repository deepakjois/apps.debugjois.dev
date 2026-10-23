import { createRemoteJWKSet, jwtVerify } from "jose";
import { GOOGLE_CLIENT_ID } from "#/core/auth/config";
import type { AdminSession } from "#/core/auth/contract";

export const ALLOWED_ADMIN_EMAILS = new Set(["deepak.jois@gmail.com"]);

export const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type VerifyGoogleIdToken = (idToken: string) => Promise<AdminSession>;

function parseAllowedEmail(email: unknown, emailVerified: unknown): string {
  if (typeof email !== "string" || email.length === 0) {
    throw new Error("Google token did not include an email address");
  }

  if (emailVerified !== true) {
    throw new Error("Google account email is not verified");
  }

  if (!ALLOWED_ADMIN_EMAILS.has(email)) {
    throw new Error("Google account is not allowed to access admin routes");
  }

  return email;
}

export async function verifyGoogleIdToken(idToken: string): Promise<AdminSession> {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    audience: GOOGLE_CLIENT_ID,
    issuer: [...GOOGLE_ISSUERS],
  });
  const email = parseAllowedEmail(payload.email, payload.email_verified);

  return {
    email,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}
