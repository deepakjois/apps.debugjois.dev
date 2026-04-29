# app

Barebones TanStack Start app using React 19, SSR, and experimental React Server Components on Vite 8.

Nitro is configured with the `aws_lambda` preset so production builds target AWS Lambda.

# Getting Started

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

The app runs on `http://localhost:3000`.

# Build

Create a production build:

```bash
npm run build
```

The Nitro output is written to `.output/` and is configured for the AWS Lambda preset.

# Admin Auth

Admin routes live under `/admin/*` and use Google sign-in on the frontend through `react-oauth/google`.

The server treats Google as the source of truth by verifying the Google ID token against Google's JWKS and then checking the authenticated email against an allowlist.

Current allowlist:

- `deepak.jois@gmail.com`

Current Google OAuth client ID:

- `1056519509576-4av02t7h19bafa5dtfspcfod1in63eup.apps.googleusercontent.com`

After a successful sign-in, the server stores the Google ID token in an `HttpOnly` session cookie and re-verifies it on each admin request.

To run the built server locally:

```bash
npm run preview
```

# Podscriber Admin

`/admin/podscriber` lets an authenticated admin paste Podcast Addict share text and submit it to the existing backend Lambda with a direct JSON payload:

```json
{ "action": "queue-podcast-transcription", "text": "..." }
```

The target Lambda function name is read server-side from `BACKEND_LAMBDA_FUNCTION_NAME`. Production deployments set it from the `AppDebugJoisDevBackendStack` backend Lambda output, and the deployed Nitro Lambda role must be able to call `lambda:InvokeFunction` on that backend Lambda.

For local `npm run preview` submissions, set `BACKEND_LAMBDA_FUNCTION_NAME` to the deployed backend Lambda function name.

During `npm run dev`, if `BACKEND_LAMBDA_FUNCTION_NAME` is not set, server functions fall back to invoking the local Go backend with `go run . invoke` from `../backend`. Configure local Google Drive ADC first for logger testing:

```bash
gcloud auth application-default login \
  --impersonate-service-account='gdrive-obsidian@daily-notes-obsidian-gdrive.iam.gserviceaccount.com' \
  --scopes='https://www.googleapis.com/auth/drive'
```

If the app is launched from a nonstandard working directory, set `LOCAL_BACKEND_INVOKE_DIR` to the backend folder path.

# Logger Admin

`/admin/logger` is an authenticated full-screen Markdown editor for today's daily log.

The editor uses CodeMirror through `@uiw/react-codemirror` with Markdown syntax support, GitHub dark theme styling, and route-local CSS. It loads and saves the current daily note through TanStack server functions, which verify the admin session and invoke the backend Lambda directly:

```json
{ "action": "get-daily-log" }
{ "action": "post-daily-log", "title": "YYYY-MM-DD.md", "contents": "..." }
```

`contents` is base64-encoded Markdown at the backend Lambda boundary; the React editor works with decoded Markdown text.

Pasting a URL into the logger turns it into a Markdown link. If text is selected, the selected text becomes the link label. If no text is selected, the app fetches a page title through the Nitro server using LinkPreview and inserts a Markdown link with that title.

For local logger title-fetching, copy the example env file and set a 32-character LinkPreview key before starting the app:

```bash
cp .env.example .env.local
# edit .env.local and set LINKPREVIEW_API_KEY
npm run dev
```

# Deployment Packaging

Deployment packaging is handled by `../infra/deploy.sh --with-artifact`.

That flow:

- builds the app with Nitro's `aws_lambda` preset
- packages the generated `.output/` directory into `artifacts/lambda-package.zip`
- uploads the zip to the artifact bucket before the site stack is deployed

Regular local development only needs `npm run build` or `npm run dev`.

# Styling

Styling for the transcript reader route lives in `src/styles/transcript-reader.css`.

Admin route styling lives in `src/styles/admin.css`, imports WebTUI styles directly, uses the Catppuccin theme, and is attached only while `/admin/*` is active so WebTUI globals cannot bleed into non-admin routes.

# Data Fetching

TanStack Query is integrated with TanStack Router through the router context and SSR hydration.

This lets route loaders use a shared `queryClient` for server-side prefetching and client hydration.

Transcript reader query definitions and route helpers live in `src/queries/queries.ts`.

# Tooling

Lint the project with type-aware `oxlint`:

```bash
npm run lint
```

Type-aware linting is enabled in `.oxlintrc.json` and uses `oxlint-tsgolint` under the hood.

Apply safe lint fixes:

```bash
npm run lint:fix
```

Format the project with `oxfmt`:

```bash
npm run format
```

Check formatting without writing files:

```bash
npm run format:check
```

Run the combined validation check:

```bash
npm run check
```

# Testing

Run the test suite with Vitest:

```bash
npm run test
```

# Project Notes

- `vite.config.ts` enables TanStack Start, Vite React, and `@vitejs/plugin-rsc`.
- `nitro.config.ts` sets the Nitro preset to `aws_lambda` with streaming disabled for API Gateway HTTP API compatibility.
- `src/router.tsx` integrates TanStack Query with router-managed SSR hydration.
- `src/routes/__root.tsx` defines the typed router context.
- `src/routes/index.tsx` redirects `/` to `/transcript-reader`.
- `src/routes/transcript-reader.tsx` server-renders the latest transcript or a selected `?t=` transcript and redirects invalid hashes to the canonical route.
- `src/routes/admin.tsx` is the protected admin layout route, provides Google OAuth only to the admin subtree, and attaches the WebTUI admin stylesheet only for the admin subtree.
- `src/routes/admin.logger.tsx` and `src/components/admin/LoggerAdminPage.tsx` contain the persisted daily-log editor.
- `src/routes/admin.podscriber.tsx` contains the authenticated Podscriber form that invokes the backend Lambda.
- `src/server/logger.ts`, `src/server/podscriber.ts`, and `src/lib/backend/lambda.ts` contain the server-only Lambda invocation paths.
- `src/server/adminAuth.ts` and `src/lib/auth/server.ts` contain Google token verification, allowlist checks, and cookie-backed admin session helpers.
- `src/queries/queries.ts` contains transcript query options plus hash-resolution helpers used by the route.
- `src/styles/transcript-reader.css` contains the transcript reader route styles extracted from the original standalone page.
- `.oxlintrc.json` enables type-aware linting for the project.
- `../infra/deploy.sh --with-artifact` packages and uploads the Nitro output for deployment.
