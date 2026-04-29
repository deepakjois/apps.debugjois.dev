import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import "../styles/global.css";

export type RouterContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "app",
      },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function NotFound() {
  return (
    <main className="page-wrap page-section">
      <section className="section">
        <p className="eyebrow">Not Found</p>
        <h1 className="page-title">This page does not exist.</h1>
        <p className="lead muted">Check the URL or return to a valid route.</p>
      </section>
    </main>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const routeChrome = useRouterState({
    select: (state) => ({
      isAdminRoute: state.location.pathname.startsWith("/admin"),
    }),
  });
  // Keep debug UI local-only and out of admin screens.
  const showDevtools = import.meta.env.DEV && !routeChrome.isAdminRoute;

  return (
    <html
      data-admin-webtui={routeChrome.isAdminRoute ? "true" : undefined}
      data-webtui-theme={routeChrome.isAdminRoute ? "catppuccin" : undefined}
      lang="en"
    >
      <head>
        <HeadContent />
      </head>
      <body className="app-body">
        {children}
        {showDevtools ? (
          <TanStackDevtools
            config={{
              position: "bottom-right",
            }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}
