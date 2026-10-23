import { GoogleOAuthProvider } from "@react-oauth/google";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminAuthGate } from "../features/admin/auth/AdminAuthGate";
import adminAuthStylesHref from "../features/admin/auth/styles.css?url";
import { GOOGLE_CLIENT_ID } from "../lib/auth/config";

export const Route = createFileRoute("/admin")({
  head: () => ({
    links: [{ rel: "stylesheet", href: adminAuthStylesHref }],
  }),
  component: AdminRoute,
});

function AdminRoute() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AdminAuthGate>
        <Outlet />
      </AdminAuthGate>
    </GoogleOAuthProvider>
  );
}
