import { GoogleOAuthProvider } from "@react-oauth/google";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { AdminAuthGate } from "../features/admin/auth/AdminAuthGate";
import { useAdminSession } from "../features/admin/auth/adminSession";
import adminStylesHref from "../features/admin/styles.css?url";
import { GOOGLE_CLIENT_ID } from "../lib/auth/config";
import { getAdminSessionServerFn } from "../server/adminAuth";

export const Route = createFileRoute("/admin")({
  head: () => ({
    // The parent layout loads one stylesheet for every admin child route.
    links: [{ rel: "stylesheet", href: adminStylesHref }],
  }),
  loader: async () => ({
    session: await getAdminSessionServerFn(),
  }),
  component: AdminRoute,
});

function AdminRoute() {
  const { session } = Route.useLoaderData();

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AdminAuthGate initialSession={session}>
        <AdminLayout />
      </AdminAuthGate>
    </GoogleOAuthProvider>
  );
}

function AdminLayout() {
  const { session, signOut, isSigningOut } = useAdminSession();

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <Link to="/admin" className="admin-brand">
          Apps <span>v2</span>
        </Link>
        <nav aria-label="Applications">
          {/* A document reload releases this feature's retained stylesheet. */}
          <Link to="/transcript-reader" reloadDocument>
            Transcript reader
          </Link>
          <Link to="/admin">Admin</Link>
          <button
            type="button"
            className="admin-signout"
            disabled={isSigningOut}
            onClick={signOut}
            title={session.email}
          >
            Sign out
          </button>
        </nav>
      </header>
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <p className="admin-eyebrow">Admin</p>
          <nav aria-label="Admin applications">
            <Link to="/admin/podscriber">Podscriber</Link>
            <Link to="/admin/daily-log">Daily log</Link>
          </nav>
        </aside>
        <Outlet />
      </div>
    </div>
  );
}
