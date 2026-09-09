import { H3Event, toResponse } from "h3";
import { describe, expect, it, vi } from "vitest";
import { handleAdminLogin } from "../../../server/routes/admin/login.post";
import { AUTH_COOKIE_NAME } from "./config";

function loginEvent(protocol: "http" | "https" = "https") {
  return new H3Event(
    new Request(`${protocol}://apps.debugjois.dev/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential: "signed-google-token" }),
    }),
  );
}

describe("admin login route", () => {
  it("puts the verified credential in the successful HTTP response cookie", async () => {
    const event = loginEvent();
    const verify = vi.fn().mockResolvedValue({
      email: "deepak.jois@gmail.com",
      name: "Deepak",
      picture: null,
    });

    const result = await handleAdminLogin(event, verify);
    const response = await toResponse(result, event);

    expect(result.email).toBe("deepak.jois@gmail.com");
    expect(verify).toHaveBeenCalledWith("signed-google-token");
    expect(response.headers.getSetCookie()).toEqual([
      expect.stringMatching(
        new RegExp(
          `^${AUTH_COOKIE_NAME}=signed-google-token;.*Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax$`,
        ),
      ),
    ]);
  });

  it("allows the session cookie on local HTTP", async () => {
    const event = loginEvent("http");
    const verify = vi.fn().mockResolvedValue({
      email: "deepak.jois@gmail.com",
      name: null,
      picture: null,
    });

    const result = await handleAdminLogin(event, verify);
    const response = await toResponse(result, event);
    const cookie = response.headers.getSetCookie()[0];

    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("Secure");
  });
});
