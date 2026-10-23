import { defineEventHandler, type H3Event } from "nitro/h3";
import type { SessionResponse } from "#/core/auth/contract";
import { clearAdminSession } from "../../../core/adminSession";

export function handleLogout(event: H3Event): SessionResponse {
  clearAdminSession(event);

  return { session: null };
}

export default defineEventHandler(handleLogout);
