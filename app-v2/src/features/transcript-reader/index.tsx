import { Link } from "@tanstack/react-router";

export function TranscriptReader() {
  return (
    <div className="transcript-reader-shell">
      <header className="transcript-reader-header">
        <Link to="/transcript-reader" className="transcript-reader-brand">
          Apps <span>v2</span>
        </Link>
        <nav aria-label="Applications">
          <Link to="/transcript-reader">Transcript reader</Link>
          {/* A document reload releases this feature's retained stylesheet. */}
          <Link to="/admin" reloadDocument>
            Admin
          </Link>
        </nav>
      </header>
      <main className="transcript-reader-main">
        <p className="transcript-reader-eyebrow">Application / 01</p>
        <h1>Transcript reader</h1>
        <p>Read and explore podcast transcripts.</p>
        <p className="transcript-reader-stub">Foundation ready · Feature coming later</p>
      </main>
    </div>
  );
}
