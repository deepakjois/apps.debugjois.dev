import { H3Event } from "nitro/h3";
import type { AdminSession } from "#/core/auth/contract";
import { createAdminSession } from "./adminSession";

export const TEST_ADMIN_SESSION: AdminSession = {
  email: "deepak.jois@gmail.com",
  name: "Deepak",
  picture: null,
};

// Signs in without contacting Google and returns the issued session as a Cookie header value.
export async function signedInCookie(session = TEST_ADMIN_SESSION): Promise<string> {
  const event = new H3Event(new Request("https://apps.debugjois.dev/api/admin/session"));
  await createAdminSession(event, "google-id-token", async () => session);
  return event.res.headers.getSetCookie()[0].split(";")[0];
}
