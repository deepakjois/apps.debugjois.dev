import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME, GOOGLE_CLIENT_ID, GOOGLE_ISSUERS } from "./config";

const mocks = vi.hoisted(() => ({
  deleteCookie: vi.fn(),
  getCookie: vi.fn(),
  getRequestProtocol: vi.fn(),
  jwtVerify: vi.fn(),
  setCookie: vi.fn(),
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-google-jwks"),
  jwtVerify: mocks.jwtVerify,
}));

vi.mock("@tanstack/react-start/server", () => ({
  deleteCookie: mocks.deleteCookie,
  getCookie: mocks.getCookie,
  getRequestProtocol: mocks.getRequestProtocol,
  setCookie: mocks.setCookie,
}));

import { createAdminSession, getAdminSession } from "./server";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRequestProtocol.mockReturnValue("https");
});

describe("admin session verification", () => {
  it("accepts only a Google-signed token for the configured audience and stores it securely", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        email: "deepak.jois@gmail.com",
        email_verified: true,
        name: "Deepak",
        picture: "https://example.com/avatar.png",
      },
    });

    await expect(createAdminSession("signed-google-token")).resolves.toEqual({
      email: "deepak.jois@gmail.com",
      name: "Deepak",
      picture: "https://example.com/avatar.png",
    });
    expect(mocks.jwtVerify).toHaveBeenCalledWith("signed-google-token", "mock-google-jwks", {
      audience: GOOGLE_CLIENT_ID,
      issuer: [...GOOGLE_ISSUERS],
    });
    expect(mocks.setCookie).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      "signed-google-token",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", secure: true }),
    );
  });

  it("rejects a verified Google identity outside the admin allowlist", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: { email: "someone@example.com", email_verified: true },
    });

    await expect(createAdminSession("other-user-token")).rejects.toThrow(
      "Google account is not allowed to access admin routes",
    );
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("allows the session cookie over local HTTP", async () => {
    mocks.getRequestProtocol.mockReturnValue("http");
    mocks.jwtVerify.mockResolvedValue({
      payload: { email: "deepak.jois@gmail.com", email_verified: true },
    });

    await createAdminSession("local-token");

    expect(mocks.setCookie).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      "local-token",
      expect.objectContaining({ secure: false }),
    );
  });

  it("clears a cookie whose token no longer verifies", async () => {
    mocks.getCookie.mockReturnValue("expired-token");
    mocks.jwtVerify.mockRejectedValue(new Error("JWT expired"));

    await expect(getAdminSession()).resolves.toBeNull();
    expect(mocks.deleteCookie).toHaveBeenCalledWith(AUTH_COOKIE_NAME, { path: "/" });
  });
});
