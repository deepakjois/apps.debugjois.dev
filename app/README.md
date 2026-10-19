# Frontend

The TanStack Start application for `apps.debugjois.dev`, using React, TanStack
Router and Query, Vite, Nitro, and experimental React Server Components.

- `/transcript-reader` reads public transcripts from `www.debugjois.dev`; no
  credentials or local backend are required. `/` redirects here.
- `/admin/logger` edits today's Berlin-date Markdown note in Google Drive.
- `/admin/podscriber` queues transcriptions from Podcast Addict share text.
  `/admin` redirects to Logger.

## Installation

Follow the [root README](../README.md#development-environment) for the Nix
environment and dependency installation (`npm --prefix app ci` from the repository
root). Use npm; the repository pins the toolchain and lockfile.

Unless noted otherwise, run the commands below from `app/`.

## Local development

```sh
npm run dev
```

Vite defaults to port 3000. For admin integrations, copy the example configuration:

```sh
cp .env.example .env.local
```

Both local and Amp orb development use the **deployed backend Lambda**, not a
local backend server. Configure:

| Setting                        | Purpose                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `BACKEND_LAMBDA_FUNCTION_NAME` | Deployed backend for Logger and Podscriber                                       |
| `AWS_REGION`                   | Region of that Lambda                                                            |
| `LINKPREVIEW_API_KEY`          | 32-character key for Logger's automatic page-title lookup when pasting bare URLs |

Provide AWS credentials through the SDK's normal credential chain: for example,
`AWS_PROFILE`, or `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (with
`AWS_SESSION_TOKEN` for temporary credentials). The identity must have
`lambda:InvokeFunction` on the configured backend. Nitro invokes Lambda
server-side; AWS credentials must never be exposed to the browser. Google Drive
and transcription integrations must already be configured on the deployed backend;
see the [backend README](../backend/README.md).

### Admin sign-in

All `/admin` pages require Google sign-in. The existing OAuth web client ID and
admin email allowlist live in `src/lib/auth/config.ts`; no client secret or local
Google environment variable is needed. The server verifies signed Google ID
tokens and the verified-email allowlist, and keeps the session in an `HttpOnly`
cookie. Every private Nitro endpoint must authorize with `requireAdminSession`;
the browser's page guard is not server authorization.

For real sign-in, add the development origin under **Authorized JavaScript
origins** for that OAuth client in Google Cloud:

- Add both `http://localhost` and `http://localhost:3000`. Without the port-less
  entry, the popup may work while One Tap and the button status iframe fail.
- Add the exact origin for any other port or public portal URL.

Google sign-in and server verification require internet access. Leave the bypass
unset when testing them. To inspect admin pages without Google sign-in:

```sh
DEV_ADMIN_BYPASS=true npm run dev
```

This bypasses only the app's admin session in development. It **does not bypass
AWS permissions or backend authorization**, and real requests can read/write
Drive notes or queue transcription jobs. Vite's build-time development flag
prevents enabling the bypass in a production build.

### Amp orbs and tunnels

Use the repository's [orb environment setup](../README.md#orb-development).
Supply the same backend settings and AWS credentials as for local development.
Start a supervised Amp service with a portal (from the repository root):

```sh
amp orb service start frontend --portal --command '
  cd app
  export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="$(node -p "new URL(process.env.PUBLIC_URL).hostname")"
  npm run dev -- --host 0.0.0.0 --port "$PORT"
'
```

Amp supplies `PUBLIC_URL` and `PORT`; the command allows the exact portal hostname
in Vite. For other tunnels, set `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` to their
exact public hostname. Do not use `server.allowedHosts: true`, which disables
host validation. Regular local development needs neither variable. For real
Google sign-in, authorize the portal's exact origin as described above.

## Checks and builds

```sh
npm run format        # format with oxfmt
npm run check         # type-aware oxlint and formatting checks
npm run build         # generate routes and the production artifact
npx tsc --noEmit      # TypeScript check after route generation
npm test              # Vitest tests
```

Builds and tests need no integration credentials. Tests mock Google verification
and integrations; they do not require Google sign-in or live backend calls.
TanStack Router generates `src/routeTree.gen.ts`; do not edit it manually.

### Lambda output

The default build uses Nitro's `aws_lambda` preset with streaming disabled for
API Gateway HTTP API compatibility. It produces:

- `.output/server/index.mjs`, exporting the Lambda `handler`.
- `.output/public`, containing static browser assets.

The production Lambda runtime is Node.js 24; the development toolchain is pinned
separately by the root flake. Node.js 26 is an AWS preview runtime, not the
production target.

### Local production preview

`npm run preview` needs the Node-server output, not the Lambda handler:

```sh
NITRO_PRESET=node-server npm run build
npm run preview
```

Run `npm run build` again to restore Lambda-targeted output before packaging.

## Deployment

With deployment credentials and infrastructure prerequisites from the
[infra README](../infra/README.md), run from the repository root:

```sh
./infra/deploy.sh --with-artifact
```

This builds, packages, uploads, and **deploys to AWS**, updating the production
frontend and infrastructure; it is not a local packaging-only command. It reuses
the existing backend image unless `--with-backend-image` is also supplied.
