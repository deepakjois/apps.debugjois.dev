import { H3Event, defineEventHandler, deleteCookie } from "h3";
import { AUTH_COOKIE_NAME } from "../../../src/lib/auth/config";

// Response body confirming the cookie was cleared; the client resets its own state on success.
type LogoutResult = { ok: true };

export function handleAdminLogout(event: H3Event): LogoutResult {
  // Expire the cookie on Nitro's outer response so API Gateway forwards the Set-Cookie header.
  deleteCookie(event, AUTH_COOKIE_NAME, { path: "/" });

  return { ok: true };
}

export default defineEventHandler(handleAdminLogout);
