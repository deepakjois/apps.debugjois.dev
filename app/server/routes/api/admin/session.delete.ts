import { defineEventHandler, type H3Event } from "nitro/h3";
import { clearAdminSession, type SessionResponse } from "../../../utils/adminSession";

// Signs out: expires the session cookie on this response.
export function handleLogout(event: H3Event): SessionResponse {
  clearAdminSession(event);

  return { session: null };
}

export default defineEventHandler(handleLogout);
