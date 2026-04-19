import { createIsomorphicFn } from "@tanstack/react-start";

// Set `Cache-Control` on the current SSR response so CloudFront (and browsers)
// can cache it. No-op on the client — loaders run on both sides, but only the
// server response needs the header. The dynamic import keeps the server-only
// `@tanstack/react-start/server` module out of the client bundle.
export const setCacheControl = createIsomorphicFn()
  .client(() => {})
  .server(async (value: string) => {
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", value);
  });
