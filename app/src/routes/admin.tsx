import { GoogleOAuthProvider } from "@react-oauth/google";
import { createFileRoute } from "@tanstack/react-router";
import { AdminAuthGate } from "#/core/auth/AdminAuthGate";
import { AdminHome } from "#/core/auth/AdminHome";
import { GOOGLE_CLIENT_ID } from "#/core/auth/config";
import adminAuthStylesHref from "#/core/auth/styles.css?url";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin" }],
    links: [{ rel: "stylesheet", href: adminAuthStylesHref }],
  }),
  component: AdminRoute,
});

function AdminRoute() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AdminAuthGate>
        <AdminHome />
      </AdminAuthGate>
    </GoogleOAuthProvider>
  );
}
