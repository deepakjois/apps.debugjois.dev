import { createServerFn } from "@tanstack/react-start";
import { clearAdminSession, createAdminSession, getAdminSession } from "../lib/auth/server";

// Browser-to-server payload produced by Google Identity Services.
type LoginInput = {
  credential: string;
};

export const getAdminSessionServerFn = createServerFn({ method: "GET" }).handler(async () => {
  return getAdminSession();
});

export const loginAdminServerFn = createServerFn({ method: "POST" })
  .validator((input: unknown): LoginInput => {
    if (
      typeof input !== "object" ||
      input === null ||
      !("credential" in input) ||
      typeof input.credential !== "string" ||
      input.credential.length === 0
    ) {
      throw new Error("Google credential is required");
    }

    return { credential: input.credential };
  })
  .handler(async ({ data }) => {
    return createAdminSession(data.credential);
  });

export const logoutAdminServerFn = createServerFn({ method: "POST" }).handler(async () => {
  clearAdminSession();
  return { ok: true };
});
