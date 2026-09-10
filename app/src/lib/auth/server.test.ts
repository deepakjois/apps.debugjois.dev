import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_CLIENT_ID, GOOGLE_ISSUERS } from "./config";

const jwtVerify = vi.hoisted(() => vi.fn());

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-google-jwks"),
  jwtVerify,
}));

import { verifyGoogleIdToken } from "./server";

beforeEach(() => {
  jwtVerify.mockReset();
});

describe("Google ID token verification", () => {
  it("accepts only a Google-signed token for the configured audience", async () => {
    jwtVerify.mockResolvedValue({
      payload: {
        email: "deepak.jois@gmail.com",
        email_verified: true,
        name: "Deepak",
        picture: "https://example.com/avatar.png",
      },
    });

    await expect(verifyGoogleIdToken("signed-google-token")).resolves.toEqual({
      email: "deepak.jois@gmail.com",
      name: "Deepak",
      picture: "https://example.com/avatar.png",
    });
    expect(jwtVerify).toHaveBeenCalledWith("signed-google-token", "mock-google-jwks", {
      audience: GOOGLE_CLIENT_ID,
      issuer: [...GOOGLE_ISSUERS],
    });
  });

  it("rejects a verified Google identity outside the admin allowlist", async () => {
    jwtVerify.mockResolvedValue({
      payload: { email: "someone@example.com", email_verified: true },
    });

    await expect(verifyGoogleIdToken("other-user-token")).rejects.toThrow(
      "Google account is not allowed to access admin routes",
    );
  });
});
