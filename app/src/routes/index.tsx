import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";

async function ServerMessage() {
  const deployedTo = process.env.AWS_EXECUTION_ENV ? "AWS Lambda" : "Nitro Node runtime";

  return (
    <section className="section">
      <p className="eyebrow">React Server Component</p>
      <h2 className="section-title">Rendered on the server</h2>
      <p className="muted">
        This block is streamed from the server with React Server Components enabled.
      </p>
      <dl className="details-list">
        <div className="details-row">
          <dt>Runtime target</dt>
          <dd>{deployedTo}</dd>
        </div>
        <div className="details-row">
          <dt>Rendered at</dt>
          <dd>{new Date().toISOString()}</dd>
        </div>
      </dl>
    </section>
  );
}

const getHomePage = createServerFn({ method: "GET" }).handler(async () => {
  const ServerRenderable = await renderServerComponent(<ServerMessage />);

  return {
    ServerRenderable,
  };
});

export const Route = createFileRoute("/")({
  loader: () => getHomePage(),
  component: App,
});

function App() {
  const { ServerRenderable } = Route.useLoaderData();

  return (
    <main className="home">
      <section className="section">
        <p className="eyebrow">Barebones TanStack Start</p>
        <h1 className="page-title">React, SSR, and RSC running through Nitro for AWS Lambda.</h1>
        <p className="lead muted">
          This is a minimal starting point on Vite 8 with TanStack Start, experimental React Server
          Components, and Nitro configured for the `aws_lambda` preset.
        </p>
      </section>

      {ServerRenderable}

      <section className="section">
        <h2 className="section-title">What is included</h2>
        <ul className="feature-list muted">
          <li>TanStack Start with file-based routing and SSR.</li>
          <li>React 19 with an RSC example rendered through a server function.</li>
          <li>Nitro configured for Lambda-compatible packaging.</li>
          <li>Plain CSS in a single lightweight stylesheet.</li>
        </ul>
      </section>
    </main>
  );
}
