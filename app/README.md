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

### Logger

`/admin/logger` is a full-screen Markdown editor for today's Berlin-date note in
Google Drive. The browser loads and saves through authenticated Nitro routes at
`/api/admin/logger`; Nitro invokes the existing backend Lambda synchronously. The
browser never receives AWS credentials.

To exercise the complete logger flow locally, copy the example environment file:

```sh
cp .env.example .env.local
```

Set `BACKEND_LAMBDA_FUNCTION_NAME` and `AWS_REGION`, then provide credentials using
the AWS SDK's normal credential chain. For example, set `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` (plus `AWS_SESSION_TOKEN` for temporary credentials), or
use a configured local `AWS_PROFILE`. The identity needs `lambda:InvokeFunction`
for the configured backend Lambda. Set the 32-character `LINKPREVIEW_API_KEY` to
exercise automatic page-title lookup when pasting bare URLs.

Start the app with `DEV_ADMIN_BYPASS=true npm run dev` to test without Google
sign-in. This bypasses only the app's admin login; Nitro still performs the real
AWS Lambda invocation with the supplied AWS credentials.

### Admin authentication

Every route under `/admin` requires Google sign-in. The browser uses the existing
Google OAuth web client ID; no client secret or local environment variable is
needed. The server verifies Google's signed ID token against Google's JWKS,
requires a verified email in the admin allowlist, and stores the token in an
`HttpOnly` cookie. The browser manages that session through one Nitro resource,
`/api/admin/session`: `GET` reports the current session, `POST` signs in with the
Google credential, and `DELETE` signs out. Admin pages check the session from the
browser, so the server renders only a "Checking session" state for them.
`server/utils/adminSession.ts` is the only module that issues, expires, or checks the
cookie; every private Nitro route authorizes through its `requireAdminSession`, and
the cookie attributes are defined once in `src/lib/auth/config.ts`.

The sign-in card also shows Google One Tap with `auto_select` enabled, so a
returning user with one signed-in Google account is signed in without a click.
Otherwise One Tap lists the signed-in accounts to choose from. The email of the last
account that signed in is kept in `localStorage` and passed as Google's
`login_hint`, so the button popup preselects it. In Chrome the button uses the FedCM
flow (`use_fedcm_for_button`), so it stays personalized with the signed-in account
even when third-party cookies are blocked. One Tap is requested at most once per page
load: Chrome allows a single pending FedCM request, and React StrictMode in development
replays mount effects. The **Sign out** button in the
admin header clears the cookie, forgets the remembered email, and calls Google's
`disableAutoSelect` so One Tap cannot immediately sign the same account back in.

Real local sign-in requires the dev origin to be listed under **Authorized
JavaScript origins** for the OAuth client in Google Cloud. Google expects both
`http://localhost` and `http://localhost:3000` for local development; without the
port-less entry the button popup still works but the button status iframe and One
Tap are rejected with "The given origin is not allowed for the given client ID".
If a different port is used, add that exact origin too. Google sign-in and server
verification both need internet access. Automated tests use mocks and need neither
Google credentials nor network access.

To inspect pages behind the guard without using Google, enable the development-only
server session:

```sh
DEV_ADMIN_BYPASS=true npm run dev
```

The bypass is guarded by Vite's build-time development flag and cannot be enabled
in a production build. Leave it unset when testing the real Google sign-in flow.

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
    logger/                 → /admin/logger
```

Each feature owns its UI, queries, styles, and tests.
Features should not import another feature's internals. Thin files in `src/routes`
own URLs and route metadata; `admin.tsx` provides the shared admin layout.
TanStack Router automatically generates `src/routeTree.gen.ts`; do not edit it.
The root document owns only the HTML document and a minimal reset. The transcript
reader and admin layout each own their chrome and load a separate stylesheet from
route `head` metadata, so SSR includes the matched CSS before first paint.
Admin pages use WebTUI with its Catppuccin theme; their package imports and custom
layout rules live in `src/features/admin/styles.css`.
The admin and transcript-reader interfaces do not link to each other. `/` redirects
to the transcript reader and `/admin` redirects to Logger.

`src/router.tsx` creates a QueryClient per router instance and integrates it with
SSR hydration. Transcript loaders prefetch through `context.queryClient`; feature
components consume those queries with TanStack Query. Do not use a global
server-side QueryClient shared across requests. TanStack server functions are
reserved for data that must be server-rendered; nothing uses them today, and the
transcript reader prefetches through route loaders. Every `/admin` operation,
including reading the session, is an authenticated Nitro route under
`server/routes/api/admin`, never a server function. Nitro route code imports h3
through `nitro/h3`, so the app does not depend on the transitive `h3` package
directly.

The transcript reader loads the public transcript index and immutable transcript
payloads from `www.debugjois.dev`. Admin pages gate rendering in the browser, so
every private Nitro route must call `requireAdminSession` from
`server/utils/adminSession.ts` before reading or changing private data; the page
guard alone does not authorize server endpoints.

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
