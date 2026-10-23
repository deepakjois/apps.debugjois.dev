import { GoogleOAuthProvider } from "@react-oauth/google";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminAuthGate } from "#/core/auth/AdminAuthGate";
import { GOOGLE_CLIENT_ID } from "#/core/auth/config";
import adminAuthStylesHref from "#/core/auth/styles.css?url";

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
