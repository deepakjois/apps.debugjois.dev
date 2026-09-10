import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import "../styles/global.css";

// Shared request-local services available to every feature's loaders.
export type RouterContext = { queryClient: QueryClient };

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Apps v2" },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => (
    <main>
      <h1>Page not found</h1>
      <Link to="/">Return home</Link>
    </main>
  ),
});

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
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
