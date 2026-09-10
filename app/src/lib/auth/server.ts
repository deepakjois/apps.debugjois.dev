import { createRemoteJWKSet, jwtVerify } from "jose";
import { ALLOWED_ADMIN_EMAILS, GOOGLE_CLIENT_ID, GOOGLE_ISSUERS } from "./config";

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

// Identity fields exposed to authenticated admin UI and server operations.
export type AdminSession = {
  email: string;
  name: string | null;
  picture: string | null;
};

// Shape of the token check, injectable so session and route tests never contact Google.
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
