import { createServerFn } from "@tanstack/react-start";
import { getAdminSession } from "../lib/auth/server";

export const getAdminSessionServerFn = createServerFn({ method: "GET" }).handler(async () => {
  return getAdminSession();
});
