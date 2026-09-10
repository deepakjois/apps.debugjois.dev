import { H3Event } from "nitro/h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleLogout } from "../../../server/routes/api/admin/session.delete";
import { handleGetSession } from "../../../server/routes/api/admin/session.get";
import { handleLogin } from "../../../server/routes/api/admin/session.post";
import { AUTH_COOKIE_NAME } from "./config";

const session = { email: "deepak.jois@gmail.com", name: "Deepak", picture: null };

function sessionEvent(init?: RequestInit) {
  return new H3Event(new Request("https://apps.debugjois.dev/api/admin/session", init));
}

function loginEvent(body: unknown) {
  return sessionEvent({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.DEV_ADMIN_BYPASS;
});

// Cookie strings are covered by adminSession.test.ts; these tests cover the HTTP contract only.
describe("session routes", () => {
  it("GET reports the verified session", async () => {
    const event = sessionEvent({ headers: { cookie: `${AUTH_COOKIE_NAME}=signed-google-token` } });
    const verify = vi.fn().mockResolvedValue(session);

    await expect(handleGetSession(event, verify)).resolves.toEqual({ session });
  });

  it("GET reports no session without a cookie", async () => {
    const verify = vi.fn();

    await expect(handleGetSession(sessionEvent(), verify)).resolves.toEqual({ session: null });
    expect(verify).not.toHaveBeenCalled();
  });

  it("POST signs in with the Google credential and issues the cookie", async () => {
    const event = loginEvent({ credential: "signed-google-token" });
    const verify = vi.fn().mockResolvedValue(session);

    await expect(handleLogin(event, verify)).resolves.toEqual({ session });
    expect(verify).toHaveBeenCalledWith("signed-google-token");
    expect(event.res.headers.getSetCookie()).toEqual([
      expect.stringMatching(new RegExp(`^${AUTH_COOKIE_NAME}=signed-google-token;`)),
    ]);
  });

  it("POST rejects a missing credential without issuing a cookie", async () => {
    const event = loginEvent({});
    const verify = vi.fn();

    await expect(handleLogin(event, verify)).rejects.toMatchObject({ status: 400 });
    expect(verify).not.toHaveBeenCalled();
    expect(event.res.headers.getSetCookie()).toEqual([]);
  });

  it("DELETE signs out by expiring the cookie", () => {
    const event = sessionEvent({ method: "DELETE" });

    expect(handleLogout(event)).toEqual({ session: null });
    expect(event.res.headers.getSetCookie()[0]).toContain("Max-Age=0");
  });
});
