import { GoogleOAuthProvider } from "@react-oauth/google";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
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
  const isLogger = useRouterState({
    select: (state) => state.location.pathname === "/admin/logger",
  });

  // Logger retains its standalone full-screen editing surface from the previous app.
  if (isLogger) {
    return <Outlet />;
  }

  return <AdminShell />;
}

function AdminShell() {
  const { session, signOut, isSigningOut } = useAdminSession();

  return (
    <main className="admin-webtui admin-screen">
      <div className="admin-shell">
        <header box-="square" className="admin-shell-header">
          <div className="admin-copy" is-="typography-block">
            <span cap-="square round" is-="badge" variant-="foreground0">
              Admin
            </span>
            <h1>Apps.debugjois.dev</h1>
            <nav aria-label="Admin applications">
              <Link to="/admin/podscriber">Podscriber</Link>
              <Link to="/admin/logger">Logger</Link>
            </nav>
          </div>
          <button
            box-="round"
            type="button"
            className="admin-logout-button"
            disabled={isSigningOut}
            onClick={signOut}
            title={session.email}
            variant-="foreground0"
          >
            Sign out
          </button>
        </header>
        <Outlet />
      </div>
    </main>
  );
}
