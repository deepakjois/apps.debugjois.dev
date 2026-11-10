import { defineEventHandler, type H3Event } from "nitro/h3";
import type { SessionResponse } from "#/core/auth/contract";
import { readAdminSession } from "../../../core/adminSession";

export async function handleGetSession(event: H3Event): Promise<SessionResponse> {
  return { session: await readAdminSession(event) };
}

export default defineEventHandler(handleGetSession);
