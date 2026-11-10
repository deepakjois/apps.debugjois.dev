import { H3Event, toResponse } from "nitro/h3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_COOKIE_NAME,
  clearAdminSession,
  createAdminSession,
  readAdminSession,
  requireAdminSession,
} from "./adminSession";
import { signedInCookie, TEST_ADMIN_SESSION as session } from "./adminSessionTesting";

const FOREIGN_COOKIE = `${AUTH_COOKIE_NAME}=signed-google-token`;

function apiEvent(cookie?: string, protocol: "http" | "https" = "https") {
  return new H3Event(
    new Request(`${protocol}://apps.debugjois.dev/api/admin/logger`, {
      headers: cookie ? { cookie } : {},
    }),
  );
}

function issuedCookies(event: H3Event): string[] {
  return event.res.headers.getSetCookie();
}

beforeEach(() => {
  delete process.env.DEV_ADMIN_BYPASS;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createAdminSession", () => {
  it("verifies the Google credential and issues its own 30-day HttpOnly session", async () => {
    const event = apiEvent();
    const verify = vi.fn().mockResolvedValue(session);

    await expect(createAdminSession(event, "signed-google-token", verify)).resolves.toEqual(
      session,
    );

    expect(verify).toHaveBeenCalledWith("signed-google-token");
    const [cookie] = issuedCookies(event);
    expect(cookie).toMatch(
      new RegExp(
        `^${AUTH_COOKIE_NAME}=[^;]+;.*Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax$`,
      ),
    );
    expect(cookie).not.toContain("signed-google-token");
    await expect(readAdminSession(apiEvent(cookie.split(";")[0]))).resolves.toEqual(session);
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
    const event = apiEvent(FOREIGN_COOKIE);

    clearAdminSession(event);

    const [cookie] = issuedCookies(event);
    expect(cookie).toMatch(new RegExp(`^${AUTH_COOKIE_NAME}=;`));
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Path=/");
  });
});

describe("readAdminSession", () => {
  it("returns null without a cookie", async () => {
    const event = apiEvent();

    await expect(readAdminSession(event)).resolves.toBeNull();
    expect(issuedCookies(event)).toEqual([]);
  });

  it("expires a cookie this server did not sign, such as a raw Google token", async () => {
    const event = apiEvent(FOREIGN_COOKIE);

    await expect(readAdminSession(event)).resolves.toBeNull();

    const [cookie] = issuedCookies(event);
    expect(cookie).toMatch(new RegExp(`^${AUTH_COOKIE_NAME}=;`));
    expect(cookie).toContain("Max-Age=0");
  });

  it("rejects a session whose email is not on the admin allowlist", async () => {
    const cookie = await signedInCookie({
      email: "someone@example.com",
      name: null,
      picture: null,
    });
    const event = apiEvent(cookie);

    await expect(readAdminSession(event)).resolves.toBeNull();
    expect(issuedCookies(event)[0]).toContain("Max-Age=0");
  });

  it("keeps a session that is used at least monthly alive by renewing it after a day", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-01T00:00:00Z"), toFake: ["Date"] });
    const original = await signedInCookie();

    vi.setSystemTime(new Date("2026-11-01T20:00:00Z"));
    const sameDay = apiEvent(original);
    await expect(readAdminSession(sameDay)).resolves.toEqual(session);
    expect(issuedCookies(sameDay)).toEqual([]);

    vi.setSystemTime(new Date("2026-11-20T00:00:00Z"));
    const later = apiEvent(original);
    await expect(readAdminSession(later)).resolves.toEqual(session);
    const renewed = issuedCookies(later)[0].split(";")[0];

    vi.setSystemTime(new Date("2026-12-15T00:00:00Z"));
    await expect(readAdminSession(apiEvent(original))).resolves.toBeNull();
    await expect(readAdminSession(apiEvent(renewed))).resolves.toEqual(session);
  });

  it("provides an opt-in local session in development", async () => {
    process.env.DEV_ADMIN_BYPASS = "true";

    await expect(readAdminSession(apiEvent())).resolves.toEqual({
      email: "local-admin@localhost",
      name: "Local Admin",
      picture: null,
    });
  });
});

describe("requireAdminSession", () => {
  it("returns the signed-in session", async () => {
    await expect(requireAdminSession(apiEvent(await signedInCookie()))).resolves.toEqual(session);
  });

  it("rejects a request without a cookie with 401", async () => {
    await expect(requireAdminSession(apiEvent())).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a stale cookie with 401 and expires it on that response", async () => {
    const event = apiEvent(FOREIGN_COOKIE);

    const response = await toResponse(requireAdminSession(event), event);

    expect(response.status).toBe(401);
    const [cookie] = response.headers.getSetCookie();
    expect(cookie).toMatch(new RegExp(`^${AUTH_COOKIE_NAME}=;`));
    expect(cookie).toContain("Max-Age=0");
  });
});
