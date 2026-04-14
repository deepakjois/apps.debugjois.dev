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

# Lambda Packaging

Create a Lambda deployment artifact only:

```bash
npm run package:lambda
```

This command:

- builds the app with Nitro's `aws_lambda` preset
- packages the generated `.output/` directory into `artifacts/lambda-package.zip`

It does not create or deploy any AWS resources.

# Styling

Styling for the index route lives in `src/styles/index.css`.

# Data Fetching

TanStack Query is integrated with TanStack Router through the router context and SSR hydration.

This lets route loaders use a shared `queryClient` for server-side prefetching and client hydration.

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
- `nitro.config.ts` sets the Nitro preset to `aws_lambda` with streaming enabled.
- `src/router.tsx` integrates TanStack Query with router-managed SSR hydration.
- `src/routes/__root.tsx` defines the typed router context.
- `src/routes/index.tsx` includes a minimal RSC example rendered through a TanStack Start server function.
- `src/styles/index.css` contains the index route's lightweight plain CSS styles.
- `.oxlintrc.json` enables type-aware linting for the project.
- `scripts/package-lambda.mjs` packages the Nitro output into a zip file for later deployment.
