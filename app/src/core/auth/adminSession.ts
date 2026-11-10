import { queryOptions, useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { requestJSON } from "../http";
import { LAST_ADMIN_EMAIL_STORAGE_KEY } from "./config";
import type { AdminSession, SessionResponse } from "./contract";

export const SESSION_URL = "/api/admin/session";

export type AdminSessionContextValue = {
  session: AdminSession;
  signOut: () => void;
  isSigningOut: boolean;
};

// Lives apart from AdminAuthGate so that component module exports only components, which is
// what Vite's React Fast Refresh needs to hot-swap it in place.
export const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

export function useAdminSession(): AdminSessionContextValue {
  const value = useContext(AdminSessionContext);

  if (!value) {
    throw new Error("useAdminSession must be used inside an authenticated AdminAuthGate");
  }

  return value;
}

export function adminSessionQueryOptions() {
  return queryOptions({
    queryKey: ["admin", "session"],
    queryFn: () =>
      requestJSON<SessionResponse>(SESSION_URL, undefined, "Admin session could not be checked"),
    staleTime: Infinity,
    retry: false,
  });
}

// For public pages. Only a browser that signed in as admin before asks the server, so the
// CDN-cached pages cost ordinary visitors no extra request.
export function useOptionalAdminSession(): AdminSession | null {
  const { data } = useQuery({
    ...adminSessionQueryOptions(),
    enabled: typeof window !== "undefined" && readLastAdminEmail() !== null,
  });

  return data?.session ?? null;
}

export function readLastAdminEmail(): string | null {
  try {
    return window.localStorage.getItem(LAST_ADMIN_EMAIL_STORAGE_KEY);
  } catch {
    return null;
  }
}
