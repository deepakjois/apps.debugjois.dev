import { H3Event, toResponse } from "h3";
import { describe, expect, it } from "vitest";
import { handleAdminLogout } from "../../../server/routes/admin/logout.post";
import { AUTH_COOKIE_NAME } from "./config";

describe("admin logout route", () => {
  it("expires the session cookie on the HTTP response", async () => {
    const event = new H3Event(
      new Request("https://apps.debugjois.dev/admin/logout", { method: "POST" }),
    );

    const result = handleAdminLogout(event);
    const response = await toResponse(result, event);
    const cookie = response.headers.getSetCookie()[0];

    expect(result).toEqual({ ok: true });
    expect(cookie).toMatch(new RegExp(`^${AUTH_COOKIE_NAME}=;`));
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Path=/");
  });
});
