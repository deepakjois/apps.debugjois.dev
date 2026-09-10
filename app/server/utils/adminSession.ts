import { createError, deleteCookie, getCookie, setCookie, type H3Event } from "nitro/h3";
import { ADMIN_SESSION_COOKIE, AUTH_COOKIE_NAME } from "../../src/lib/auth/config";
import {
  verifyGoogleIdToken,
  type AdminSession,
  type VerifyGoogleIdToken,
} from "../../src/lib/auth/server";

// Body of every /api/admin/session response; null means the browser holds no valid session.
export type SessionResponse = {
  session: AdminSession | null;
};

// Local identity used to inspect protected pages without contacting Google.
const developmentAdminSession: AdminSession = {
  email: "local-admin@localhost",
  name: "Local Admin",
  picture: null,
};

function getDevelopmentAdminSession(): AdminSession | null {
  // Vite replaces DEV at build time, so a production artifact cannot enable this bypass.
  return import.meta.env.DEV && process.env.DEV_ADMIN_BYPASS === "true"
    ? developmentAdminSession
    : null;
}

// The one implementation of the session rule. The cookie carries Google's signed ID token, which
// is re-verified on every request; a cookie whose token no longer verifies (expired, allowlist
// change, tampering) is expired on this response so the browser stops sending it.
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

// Verifies a Google credential and issues it as the session cookie on this response.
export async function createAdminSession(
  event: H3Event,
  credential: string,
  verify: VerifyGoogleIdToken = verifyGoogleIdToken,
): Promise<AdminSession> {
  const session = await verify(credential);

  // srvx already resolves the scheme (https behind API Gateway, the socket locally), and browsers
  // drop a Secure cookie issued over local http.
  setCookie(event, AUTH_COOKIE_NAME, credential, {
    ...ADMIN_SESSION_COOKIE,
    secure: event.url.protocol === "https:",
  });

  return session;
}

// Expires the session cookie; h3 forces Max-Age=0 and keeps the shared path.
export function clearAdminSession(event: H3Event): void {
  deleteCookie(event, AUTH_COOKIE_NAME, ADMIN_SESSION_COOKIE);
}

// Every private Nitro route calls this first; a missing or stale cookie fails the request with 401.
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
