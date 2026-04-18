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

To run the built server locally:

```bash
npm run preview
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
- `src/queries/queries.ts` contains transcript query options plus hash-resolution helpers used by the route.
- `src/styles/transcript-reader.css` contains the transcript reader route styles extracted from the original standalone page.
- `.oxlintrc.json` enables type-aware linting for the project.
- `../infra/deploy.sh --with-artifact` packages and uploads the Nitro output for deployment.
