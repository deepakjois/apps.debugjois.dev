import { createError, deleteCookie, getCookie, type H3Event } from "h3";
import { AUTH_COOKIE_NAME } from "../../src/lib/auth/config";
import {
  getDevelopmentAdminSession,
  verifyGoogleIdToken,
  type AdminSession,
} from "../../src/lib/auth/server";

export async function requireAdminSession(event: H3Event): Promise<AdminSession> {
  const developmentSession = getDevelopmentAdminSession();
  if (developmentSession) {
    return developmentSession;
  }

  const idToken = getCookie(event, AUTH_COOKIE_NAME);
  if (!idToken) {
    throw createError({ statusCode: 401, statusMessage: "Admin session required." });
  }

  try {
    return await verifyGoogleIdToken(idToken);
  } catch {
    deleteCookie(event, AUTH_COOKIE_NAME, { path: "/" });
    throw createError({ statusCode: 401, statusMessage: "Admin session required." });
  }
}
