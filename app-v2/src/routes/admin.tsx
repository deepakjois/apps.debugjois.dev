import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

function AdminLayout() {
  return (
    <div className="admin-layout">
      <aside>
        <p className="eyebrow">Admin</p>
        <nav aria-label="Admin applications">
          <Link to="/admin/podscriber">Podscriber</Link>
          <Link to="/admin/daily-log">Daily log</Link>
        </nav>
      </aside>
      <Outlet />
    </div>
  );
}
