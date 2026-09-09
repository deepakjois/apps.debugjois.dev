import { GoogleOAuthProvider } from "@react-oauth/google";
import { createFileRoute } from "@tanstack/react-router";
import { AdminAuthGate } from "../components/auth/AdminAuthGate";
import { GOOGLE_CLIENT_ID } from "../lib/auth/config";
import { getAdminSessionServerFn } from "../server/adminAuth";
import adminCssHref from "../styles/admin.css?url";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin" }],
    links: [
      // Route-owned stylesheet so WebTUI globals are present only on /admin/*.
      { rel: "stylesheet", href: adminCssHref },
    ],
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
