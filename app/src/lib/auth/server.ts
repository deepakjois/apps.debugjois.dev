import { createRemoteJWKSet, jwtVerify } from "jose";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import { ALLOWED_ADMIN_EMAILS, AUTH_COOKIE_NAME, GOOGLE_CLIENT_ID, GOOGLE_ISSUERS } from "./config";

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

// Identity fields exposed to authenticated admin UI and server operations.
export type AdminSession = {
  email: string;
  name: string | null;
  picture: string | null;
};

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

export async function getAdminSession(): Promise<AdminSession | null> {
  const idToken = getCookie(AUTH_COOKIE_NAME);

  if (!idToken) {
    return null;
  }

  try {
    return await verifyGoogleIdToken(idToken);
  } catch {
    deleteCookie(AUTH_COOKIE_NAME, { path: "/" });
    return null;
  }
}
