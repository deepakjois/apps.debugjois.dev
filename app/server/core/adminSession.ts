import { jwtVerify, SignJWT } from "jose";
import { createError, deleteCookie, getCookie, setCookie, type H3Event } from "nitro/h3";
import type { AdminSession } from "#/core/auth/contract";
import {
  ALLOWED_ADMIN_EMAILS,
  verifyGoogleIdToken,
  type VerifyGoogleIdToken,
} from "./googleIdToken";

export const AUTH_COOKIE_NAME = "apps_debugjois_dev_admin_session";

const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;
// Renewing at most daily keeps an active session alive without a Set-Cookie on every request.
const SESSION_RENEW_AFTER_SECONDS = 60 * 60 * 24;

const ADMIN_SESSION_COOKIE = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  maxAge: SESSION_LIFETIME_SECONDS,
} as const;

const developmentAdminSession: AdminSession = {
  email: "local-admin@localhost",
  name: "Local Admin",
  picture: null,
};

let developmentSessionKey: Uint8Array | undefined;

function getDevelopmentAdminSession(): AdminSession | null {
  return import.meta.env.DEV && process.env.DEV_ADMIN_BYPASS === "true"
    ? developmentAdminSession
    : null;
}

function sessionKey(): Uint8Array {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() ?? "";

  if (secret.length >= 32) {
    return new TextEncoder().encode(secret);
  }

  if (import.meta.env.DEV && !secret) {
    // Sessions then last until the dev server restarts.
    developmentSessionKey ??= crypto.getRandomValues(new Uint8Array(32));
    return developmentSessionKey;
  }

  throw new Error("ADMIN_SESSION_SECRET must be set to at least 32 characters.");
}

export async function readAdminSession(event: H3Event): Promise<AdminSession | null> {
  const developmentSession = getDevelopmentAdminSession();
  if (developmentSession) {
    return developmentSession;
  }

  const token = getCookie(event, AUTH_COOKIE_NAME);
  if (!token) {
    return null;
  }

  const key = sessionKey();
  const payload = await jwtVerify(token, key, { algorithms: ["HS256"] }).then(
    (result) => result.payload,
    () => null,
  );

  if (!payload || typeof payload.sub !== "string" || !ALLOWED_ADMIN_EMAILS.has(payload.sub)) {
    clearAdminSession(event);
    return null;
  }

  const session: AdminSession = {
    email: payload.sub,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };

  if (Date.now() / 1000 - (payload.iat ?? 0) > SESSION_RENEW_AFTER_SECONDS) {
    await issueSessionCookie(event, session);
  }

  return session;
}

export async function createAdminSession(
  event: H3Event,
  credential: string,
  verify: VerifyGoogleIdToken = verifyGoogleIdToken,
): Promise<AdminSession> {
  const session = await verify(credential);

  await issueSessionCookie(event, session);

  return session;
}

// Google ID tokens expire after an hour, so the cookie carries a session signed here instead.
async function issueSessionCookie(event: H3Event, session: AdminSession): Promise<void> {
  const token = await new SignJWT({ name: session.name, picture: session.picture })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.email)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_LIFETIME_SECONDS}s`)
    .sign(sessionKey());

  setCookie(event, AUTH_COOKIE_NAME, token, {
    ...ADMIN_SESSION_COOKIE,
    secure: event.url.protocol === "https:",
  });
}

export function clearAdminSession(event: H3Event): void {
  deleteCookie(event, AUTH_COOKIE_NAME, ADMIN_SESSION_COOKIE);
}

export async function requireAdminSession(event: H3Event): Promise<AdminSession> {
  const session = await readAdminSession(event);
  if (!session) {
    // h3 builds error responses without the event's regular headers, so a cookie expiry queued by
    // readAdminSession has to travel on the error itself to reach the browser.
    const headers = new Headers();
    for (const cookie of event.res.headers.getSetCookie()) {
      headers.append("set-cookie", cookie);
    }

    throw createError({ statusCode: 401, statusMessage: "Admin session required.", headers });
  }

  return session;
}
