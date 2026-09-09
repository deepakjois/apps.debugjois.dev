import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import adminStylesHref from "../features/admin/styles.css?url";

export const Route = createFileRoute("/admin")({
  head: () => ({
    // The parent layout loads one stylesheet for every admin child route.
    links: [{ rel: "stylesheet", href: adminStylesHref }],
  }),
  component: AdminLayout,
});

function AdminLayout() {
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
