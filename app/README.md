# app

The TanStack Start application for `apps.debugjois.dev`, using React 19, TanStack
Router and Query, Vite 8, Nitro, and experimental React Server Components.

## Development

Use Node.js 24.15+ (24.x) or 26+ and npm. The upgraded Vitest/jsdom tooling
requires a recent Node version; this foundation was verified on Node 26.5.1.

```sh
npm ci
npm run dev
```

Vite defaults to port 3000. The transcript reader needs no credentials or local
backend services.

### Admin authentication

Every route under `/admin` requires Google sign-in. The browser uses the existing
Google OAuth web client ID; no client secret or local environment variable is
needed. The server verifies Google's signed ID token against Google's JWKS,
requires a verified email in the admin allowlist, and stores the token in an
`HttpOnly` cookie.

Real local sign-in requires `http://localhost:3000` to be listed under **Authorized
JavaScript origins** for the OAuth client in Google Cloud. If a different port is
used, add that exact origin too. Google sign-in and server verification both need
internet access. Automated tests use mocks and need neither Google credentials nor
network access.

For a dev server behind a tunnel or Amp portal, set Vite's
`__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` environment variable to the exact public
hostname. Avoid `server.allowedHosts: true`, which disables host validation.
Amp portal services provide `PUBLIC_URL` and `PORT`, so their startup command can
derive the allowed host without hard-coding a temporary hostname:

```sh
export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="$(node -p 'new URL(process.env.PUBLIC_URL).hostname')"
npm run dev -- --host 0.0.0.0 --port "$PORT"
```

This command is for an Amp service started with `--portal`; regular local
development needs neither environment variable.

## Feature boundaries

These are route-based micro frontends compiled together, not independently
deployed applications or module-federation remotes.

```text
src/features/
  transcript-reader/       → /transcript-reader
  admin/
    podscriber/            → /admin/podscriber
    daily-log/             → /admin/daily-log
```

Each feature owns its UI, queries, styles, and tests.
Features should not import another feature's internals. Thin files in `src/routes`
own URLs and route metadata; `admin.tsx` provides the shared admin layout.
TanStack Router automatically generates `src/routeTree.gen.ts`; do not edit it.
The root document owns only the HTML document and a minimal reset. The transcript
reader and admin layout each own their chrome and load a separate stylesheet from
route `head` metadata, so SSR includes the matched CSS before first paint.
Cross-feature links reload the document because React retains stylesheet resources
after client navigation; links within a feature remain client-side. `/` redirects
to the transcript reader and `/admin` redirects to Podscriber.

`src/router.tsx` creates a QueryClient per router instance and integrates it with
SSR hydration. Loaders prefetch through `context.queryClient`; feature components
consume those queries with TanStack Query. Do not use a global server-side
QueryClient shared across requests.

The transcript reader loads the public transcript index and immutable transcript
payloads from `www.debugjois.dev`. Admin route rendering is authenticated, but
future private server functions must also call `getAdminSession` before reading or
changing private data; the route guard alone does not authorize server endpoints.

Future subdomains can point at this same build with host-to-path rewrites at the
hosting boundary. DNS, TLS, rewrites, canonical URLs, cookie scope, and client
navigation must be configured when that is introduced; host routing is not yet
implemented. Feature code remains independent of that hosting decision.

## Build and tooling

```sh
npm run format        # oxfmt
npm run check         # type-aware oxlint and formatting checks
npm run build         # generate routes and the production artifact
npx tsc --noEmit      # TypeScript check after route generation
npm test              # Vitest routing and request isolation checks
```

Nitro uses the `aws_lambda` preset with streaming disabled for API Gateway HTTP API
compatibility. One build produces `.output/server/index.mjs`, which exports the
Lambda `handler`, and `.output/public`, which contains the static browser assets.

To build, package, upload, and deploy a fresh production artifact, run from the
repository root:

```sh
./infra/deploy.sh --with-artifact
```

For a local production preview, build with the Node preset instead:

```sh
NITRO_PRESET=node-server npm run build
npm run preview
```

Run `npm run build` again to restore the Lambda-targeted artifact before packaging.
