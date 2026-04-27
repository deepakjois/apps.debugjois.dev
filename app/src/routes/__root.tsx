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
  const isAdminRoute = useRouterState({
    select: (state) => state.location.pathname.startsWith("/admin"),
  });

  return (
    <html
      data-admin-webtui={isAdminRoute ? "true" : undefined}
      data-webtui-theme={isAdminRoute ? "catppuccin" : undefined}
      lang="en"
    >
      <head>
        <HeadContent />
      </head>
      <body className="app-body">
        {children}
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
        <Scripts />
      </body>
    </html>
  );
}
