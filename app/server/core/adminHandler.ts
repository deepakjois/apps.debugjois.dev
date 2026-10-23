import { defineEventHandler, type H3Event } from "nitro/h3";
import type { AdminSession } from "#/core/auth/contract";
import { requireAdminSession } from "./adminSession";

export function defineAdminHandler<ResponseBody>(
  handler: (event: H3Event, session: AdminSession) => ResponseBody | Promise<ResponseBody>,
) {
  return defineEventHandler(async (event) => handler(event, await requireAdminSession(event)));
}
