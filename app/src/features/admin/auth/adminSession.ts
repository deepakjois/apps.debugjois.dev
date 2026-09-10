import { createContext, useContext } from "react";
import type { AdminSession } from "../../../lib/auth/server";

// Verified session plus the sign-out action, available to the authenticated admin layout.
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
