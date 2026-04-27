import { createServerFn } from "@tanstack/react-start";
import { clearAdminSession, createAdminSession, getAdminSession } from "../lib/auth/server";

type LoginInput = {
  credential: string;
};

export const getAdminSessionServerFn = createServerFn({ method: "GET" }).handler(async () => {
  return getAdminSession();
});

export const loginAdminServerFn = createServerFn({ method: "POST" })
  .inputValidator((input: LoginInput) => input)
  .handler(async ({ data }) => {
    return createAdminSession(data.credential);
  });

export const logoutAdminServerFn = createServerFn({ method: "POST" }).handler(async () => {
  clearAdminSession();
  return { ok: true };
});
