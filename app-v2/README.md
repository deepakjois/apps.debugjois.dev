# app-v2

A fresh foundation copied from `../app`'s tooling, with React 19, TanStack Start,
TanStack Router and Query, Vite 8, Nitro, and experimental React Server Components.
The original app and its deployment remain unchanged.

## Development

Use Node.js 24.15+ (24.x) or 26+ and npm. The upgraded Vitest/jsdom tooling
requires a recent Node version; this foundation was verified on Node 26.5.1.

```sh
npm ci
npm run dev
```

Vite defaults to port 3000. To run alongside the original app, use
`npm run dev -- --port 3001`. No credentials or backend services are needed.

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

Each feature owns its UI and, when implemented, its queries, styles, and tests.
Features should not import another feature's internals. Thin files in `src/routes`
own URLs and route metadata; `admin.tsx` provides the shared admin layout.
TanStack Router automatically generates `src/routeTree.gen.ts`; do not edit it.
The root shell owns shared navigation and minimal styling. `/` redirects to the
transcript reader and `/admin` redirects to Podscriber.

`src/router.tsx` creates a QueryClient per router instance and integrates it with
SSR hydration. Future loaders can prefetch through `context.queryClient`; feature
components can consume those queries with TanStack Query. Do not use a global
server-side QueryClient shared across requests.

All pages are static stubs. **Admin routes are currently public.** Add server-side
authentication and authorization before implementing private data or actions.
No old authentication, editors, transcript data, or backend calls are copied.

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

The copied Nitro configuration uses `aws_lambda` with streaming disabled for API
Gateway HTTP API compatibility. One build produces `.output/` with the server and
client assets for all features. Existing `infra` scripts still deploy `app`, not
`app-v2`; no deployment switch is included here.

For a local production preview, build with the Node preset instead:

```sh
NITRO_PRESET=node-server npm run build
npm run preview
```

Run `npm run build` again to restore the Lambda-targeted artifact before packaging.
The Vite, Nitro, TypeScript, Vitest, oxlint, and oxfmt configuration is inherited
from `app`; feature-only dependencies were removed from the copied package.
