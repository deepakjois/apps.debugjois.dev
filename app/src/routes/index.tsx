import { createFileRoute } from "@tanstack/react-router";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { getHomePageServerComponent } from "../server/homePageServerComponent";
import "../styles/index.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Index" }],
  }),
  loader: () => getHomePageServerComponent(),
  component: App,
});

function App() {
  const { ServerRenderable } = Route.useLoaderData();

  return (
    <>
      <Header />
      <div className="page-wrap page-section">
        <main className="home">
          <section className="section">
            <p className="eyebrow">Barebones TanStack Start</p>
            <h1 className="page-title">
              React, SSR, and RSC running through Nitro for AWS Lambda.
            </h1>
            <p className="lead muted">
              This is a minimal starting point on Vite 8 with TanStack Start, experimental React
              Server Components, and Nitro configured for the `aws_lambda` preset.
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
      </div>
      <Footer />
    </>
  );
}
