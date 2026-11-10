import { Link } from "@tanstack/react-router";
import { useAdminSession } from "./adminSession";

export function AdminHome() {
  const { session, signOut, isSigningOut } = useAdminSession();

  return (
    <main className="admin-auth-screen">
      <section className="admin-auth-card">
        <p className="admin-auth-label">Admin</p>
        <div className="admin-account">
          {session.picture ? (
            <img
              alt=""
              className="admin-account-picture"
              referrerPolicy="no-referrer"
              src={session.picture}
            />
          ) : null}
          <div>
            <h1>Signed in as {session.name ?? session.email}</h1>
            {session.name ? <p className="admin-auth-status">{session.email}</p> : null}
          </div>
        </div>
        <p>Admin actions now show up on the site's own pages in this browser:</p>
        <ul className="admin-home-list">
          <li>
            <Link to="/logger">Logger</Link> opens today's daily note for editing.
          </li>
          <li>
            <Link to="/transcript-reader">Transcript reader</Link> adds archive and delete buttons
            to each transcript.
          </li>
        </ul>
        <p className="admin-auth-status">
          The session lasts 30 days and renews as you use the site. Sign out here to end it in this
          browser.
        </p>
        <div>
          <button
            className="admin-sign-out-button"
            disabled={isSigningOut}
            onClick={signOut}
            type="button"
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
