import { H3Event } from "nitro/h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleLogout } from "../routes/api/admin/session.delete";
import { handleGetSession } from "../routes/api/admin/session.get";
import { handleLogin } from "../routes/api/admin/session.post";
import { AUTH_COOKIE_NAME } from "./adminSession";

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

describe("session routes", () => {
  it("GET reports no session without a cookie", async () => {
    await expect(handleGetSession(sessionEvent())).resolves.toEqual({ session: null });
  });

  it("POST signs in with the Google credential, and GET reports that session", async () => {
    const event = loginEvent({ credential: "signed-google-token" });
    const verify = vi.fn().mockResolvedValue(session);

    await expect(handleLogin(event, verify)).resolves.toEqual({ session });
    expect(verify).toHaveBeenCalledWith("signed-google-token");
    const [cookie] = event.res.headers.getSetCookie();
    expect(cookie).toMatch(new RegExp(`^${AUTH_COOKIE_NAME}=`));

    const getEvent = sessionEvent({ headers: { cookie: cookie.split(";")[0] } });
    await expect(handleGetSession(getEvent)).resolves.toEqual({ session });
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
