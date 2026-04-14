import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";

async function HomePageServerComponent() {
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

export const getHomePageServerComponent = createServerFn({ method: "GET" }).handler(async () => {
  const ServerRenderable = await renderServerComponent(<HomePageServerComponent />);

  return {
    ServerRenderable,
  };
});
