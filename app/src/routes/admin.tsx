import { GoogleOAuthProvider } from "@react-oauth/google";
import { createFileRoute } from "@tanstack/react-router";
import { AdminAuthGate } from "../components/auth/AdminAuthGate";
import { GOOGLE_CLIENT_ID } from "../lib/auth/config";
import { getAdminSessionServerFn } from "../server/adminAuth";
import "../styles/admin.css";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin" }],
  }),
  loader: async () => {
    return {
      session: await getAdminSessionServerFn(),
    };
  },
  component: AdminRouteComponent,
});

function AdminRouteComponent() {
  const { session } = Route.useLoaderData();

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AdminAuthGate initialSession={session} />
    </GoogleOAuthProvider>
  );
}
