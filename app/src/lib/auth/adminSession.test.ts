import { H3Event, toResponse } from "nitro/h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAdminSession,
  createAdminSession,
  readAdminSession,
  requireAdminSession,
} from "../../../server/utils/adminSession";
import { AUTH_COOKIE_NAME } from "./config";

const session = { email: "deepak.jois@gmail.com", name: "Deepak", picture: null };

// A request to a private route, optionally carrying a session cookie.
function apiEvent(cookie?: string, protocol: "http" | "https" = "https") {
  return new H3Event(
    new Request(`${protocol}://apps.debugjois.dev/api/admin/logger`, {
      headers: cookie ? { cookie: `${AUTH_COOKIE_NAME}=${cookie}` } : {},
    }),
  );
}

// Set-Cookie headers queued on the event's response.
function issuedCookies(event: H3Event): string[] {
  return event.res.headers.getSetCookie();
}

beforeEach(() => {
  delete process.env.DEV_ADMIN_BYPASS;
});

describe("createAdminSession", () => {
  it("verifies the credential and issues it as a secure HttpOnly cookie", async () => {
    const event = apiEvent();
    const verify = vi.fn().mockResolvedValue(session);

    await expect(createAdminSession(event, "signed-google-token", verify)).resolves.toEqual(
      session,
    );

    expect(verify).toHaveBeenCalledWith("signed-google-token");
    expect(issuedCookies(event)).toEqual([
      expect.stringMatching(
        new RegExp(
          `^${AUTH_COOKIE_NAME}=signed-google-token;.*Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax$`,
        ),
      ),
    ]);
  });

  it("omits Secure over local HTTP so the browser keeps the cookie", async () => {
    const event = apiEvent(undefined, "http");

    await createAdminSession(event, "local-token", vi.fn().mockResolvedValue(session));

    const [cookie] = issuedCookies(event);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("Secure");
  });

  it("issues nothing when the credential does not verify", async () => {
    const event = apiEvent();
    const verify = vi.fn().mockRejectedValue(new Error("bad audience"));

    await expect(createAdminSession(event, "forged-token", verify)).rejects.toThrow("bad audience");
    expect(issuedCookies(event)).toEqual([]);
  });
});

describe("clearAdminSession", () => {
  it("expires the cookie on the shared path", () => {
    const event = apiEvent("signed-google-token");

    clearAdminSession(event);

    const [cookie] = issuedCookies(event);
    expect(cookie).toMatch(new RegExp(`^${AUTH_COOKIE_NAME}=;`));
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Path=/");
  });
});

describe("readAdminSession", () => {
  it("returns the session for a cookie whose token verifies", async () => {
    const event = apiEvent("signed-google-token");
    const verify = vi.fn().mockResolvedValue(session);

    await expect(readAdminSession(event, verify)).resolves.toEqual(session);
    expect(verify).toHaveBeenCalledWith("signed-google-token");
    expect(issuedCookies(event)).toEqual([]);
  });

  it("returns null without a cookie and never contacts Google", async () => {
    const verify = vi.fn();

    await expect(readAdminSession(apiEvent(), verify)).resolves.toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it("expires a cookie whose token no longer verifies", async () => {
    const event = apiEvent("expired-token");
    const verify = vi.fn().mockRejectedValue(new Error("JWT expired"));

    await expect(readAdminSession(event, verify)).resolves.toBeNull();

    const [cookie] = issuedCookies(event);
    expect(cookie).toMatch(new RegExp(`^${AUTH_COOKIE_NAME}=;`));
    expect(cookie).toContain("Max-Age=0");
  });

  it("provides an opt-in local session in development", async () => {
    process.env.DEV_ADMIN_BYPASS = "true";
    const verify = vi.fn();

    await expect(readAdminSession(apiEvent(), verify)).resolves.toEqual({
      email: "local-admin@localhost",
      name: "Local Admin",
      picture: null,
    });
    expect(verify).not.toHaveBeenCalled();
  });
});

describe("requireAdminSession", () => {
  it("returns the verified session", async () => {
    const verify = vi.fn().mockResolvedValue(session);

    await expect(requireAdminSession(apiEvent("signed-google-token"), verify)).resolves.toEqual(
      session,
    );
  });

  it("rejects a request without a cookie with 401", async () => {
    await expect(requireAdminSession(apiEvent(), vi.fn())).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a stale cookie with 401 and expires it on that response", async () => {
    const event = apiEvent("expired-token");
    const verify = vi.fn().mockRejectedValue(new Error("JWT expired"));

    // h3 drops the event's regular headers from error responses, so check the HTTP response itself.
    const response = await toResponse(requireAdminSession(event, verify), event);

    expect(response.status).toBe(401);
    const [cookie] = response.headers.getSetCookie();
    expect(cookie).toMatch(new RegExp(`^${AUTH_COOKIE_NAME}=;`));
    expect(cookie).toContain("Max-Age=0");
  });
});
