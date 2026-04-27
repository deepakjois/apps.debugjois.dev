import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/podcast-transcribe")({
  head: () => ({
    meta: [{ title: "Podcast Transcribe" }],
  }),
  component: PodcastTranscribeAdminPage,
});

function PodcastTranscribeAdminPage() {
  return (
    <section box-="square" className="admin-page">
      <div className="admin-copy" is-="typography-block">
        <span cap-="square round" is-="badge" variant-="foreground1">
          Podcast Transcribe
        </span>
        <h2>Placeholder admin page</h2>
        <p>
          This route is protected by Google auth on the frontend and server-verified admin sessions.
        </p>
      </div>
      <ul marker-="tree open">
        <li>Google sign-in gates entry to the admin surface.</li>
        <li>The server re-verifies the session cookie on each request.</li>
        <li>The transcription form still needs to be built.</li>
      </ul>
      <p box-="round" className="admin-todo">
        TODO: add the podcast transcription form here.
      </p>
    </section>
  );
}
