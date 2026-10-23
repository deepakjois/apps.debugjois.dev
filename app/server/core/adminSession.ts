import { createError, deleteCookie, getCookie, setCookie, type H3Event } from "nitro/h3";
import type { AdminSession } from "#/core/auth/contract";
import { verifyGoogleIdToken, type VerifyGoogleIdToken } from "./googleIdToken";

export const AUTH_COOKIE_NAME = "apps_debugjois_dev_admin_session";

const ADMIN_SESSION_COOKIE = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 7,
} as const;

const developmentAdminSession: AdminSession = {
  email: "local-admin@localhost",
  name: "Local Admin",
  picture: null,
};

function getDevelopmentAdminSession(): AdminSession | null {
  return import.meta.env.DEV && process.env.DEV_ADMIN_BYPASS === "true"
    ? developmentAdminSession
    : null;
}

export async function readAdminSession(
  event: H3Event,
  verify: VerifyGoogleIdToken = verifyGoogleIdToken,
): Promise<AdminSession | null> {
  const developmentSession = getDevelopmentAdminSession();
  if (developmentSession) {
    return developmentSession;
  }

  const idToken = getCookie(event, AUTH_COOKIE_NAME);
  if (!idToken) {
    return null;
  }

  try {
    return await verify(idToken);
  } catch {
    clearAdminSession(event);
    return null;
  }
}

export async function createAdminSession(
  event: H3Event,
  credential: string,
  verify: VerifyGoogleIdToken = verifyGoogleIdToken,
): Promise<AdminSession> {
  const session = await verify(credential);

  setCookie(event, AUTH_COOKIE_NAME, credential, {
    ...ADMIN_SESSION_COOKIE,
    secure: event.url.protocol === "https:",
  });

  return session;
}

export function clearAdminSession(event: H3Event): void {
  deleteCookie(event, AUTH_COOKIE_NAME, ADMIN_SESSION_COOKIE);
}

export async function requireAdminSession(
  event: H3Event,
  verify?: VerifyGoogleIdToken,
): Promise<AdminSession> {
  const session = await readAdminSession(event, verify);
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
