# Agent guide

Frontend, Go backend, and AWS infrastructure for `apps.debugjois.dev`. This
file is the working contract for agents. The READMEs hold the operational
detail. Read the README that owns a topic before you read its code.

## Layout

| Path        | What it holds                                                                                          | Read more                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `app/`      | TanStack Start app on Nitro. Runs as a Node.js Lambda behind API Gateway and CloudFront.               | [app/README.md](app/README.md)                               |
| `backend/`  | Go Lambda shipped as a container image, plus CLIs for daily logs, podcast transcription, and Miniflux. | [backend/README.md](backend/README.md)                       |
| `infra/`    | AWS CDK stacks synthesized without CDK bootstrap, deployed by `infra/deploy.sh`.                       | [infra/README.md](infra/README.md)                           |
| `.github/`  | Workflows, composite actions, and the shell scripts they call.                                         | [GitHub Actions](README.md#github-actions)                   |
| `.agents/`  | Setup and resume scripts for Amp orbs.                                                                 | [Orb development](README.md#orb-development)                 |
| `scripts/`  | `install-go-tools.sh`, the single version list for Go helper tools.                                    | [Development environment](README.md#development-environment) |
| `flake.nix` | Pinned Go, Node, npm, and CLI tools for the dev shell and CI.                                          | [Development environment](README.md#development-environment) |

## Version control

The repo uses Jujutsu (jj) colocated with Git. Use `jj` first. Fall back to
`git` only when the checkout has no `.jj` directory. In a worktree, `.jj/repo`
points at the colocated Git repo.

Write plain commit messages. Do not add co-author or agent trailers.

Merging to `main` deploys. A push to `main` that touches `app/` deploys the
frontend, and one that touches `backend/` deploys the backend. Treat landing a
change on `main` as a production deploy.

## Environment

Toolchains come from `flake.nix`. Enter the shell with `direnv allow` or
`nix develop`. In an Amp orb, `.agents/setup` has already run and login shells
have the tools on `PATH`. Docker with buildx is not in the flake and is needed
only for backend images.

If a Go helper such as `golangci-lint` is missing, run
`./scripts/install-go-tools.sh` from the repo root.

## Checks after every change

Format, lint, test, and build every component you touched. Tests and builds
need no credentials.

From `app/`:

```sh
npm run format
npm run check
npx tsc --noEmit
npm test
npm run build
```

From `backend/`:

```sh
go fmt ./...
golangci-lint run ./...
go vet ./...
go test ./...
go build ./...
```

From `infra/`:

```sh
npm run build
npm run synth
```

After editing `flake.nix`, run `nix fmt flake.nix` and `nix flake check`.
After editing a shell script, run `bash -n <script>`.

## Commands that change AWS

These write to production resources. Run them only when the user asks for a
deploy or a publish, never as a verification step.

- `infra/deploy.sh` with any flags.
- `backend/build-and-push-image.sh`.
- `podscriber -publish`, `podcast-index --write`, `miniflux queue-starred`
  without `-dry-run`, `miniflux unstar`, and `youtube-transcript` without
  `--no-publish`.
- `aws lambda invoke` against the backend function, except with
  `"dry_run": true` or `health-check`.

Before any AWS command, run `aws sts get-caller-identity`. If it fails, ask the
user to log in and return. For logs, use `aws logs start-query` rather than
`aws logs filter-log-events`. Everything lives in `us-west-2` except the ACM
certificate stack in `us-east-1`. Read function names and bucket names from
stack outputs with `aws cloudformation describe-stacks`, not from memory.

## Conventions

- **Comments.** Keep a comment only for a non-obvious why that the code cannot
  show, such as a vendor or platform constraint, a protocol requirement, or a
  link to the issue that forced a choice. Do not narrate what the next line
  does, and do not restate a type or function name in prose. If a comment
  explains a surprise in our own code, rename or restructure the code instead.
- **GitHub Actions.** Keep workflow YAML declarative. Do not inline multiline
  or non-trivial shell in `run:` blocks. Put it in a script under
  `.github/scripts/` and call the script from the step.
- **Admin endpoints.** Admin API endpoints are Nitro routes under
  `app/server/routes/api/admin/`. Every private route is defined with
  `defineAdminHandler`, which checks the session before the handler runs. A
  test sends each route there a request without a session and expects 401.
  TanStack server functions are for SSR data only. Do not propose moving admin
  endpoints to server functions.
- **Frontend apps.** Each app lives in `app/src/apps/<app>/` and imports only
  from `app/src/core/`, never from another app. The root route stays neutral.
  An app sets its own theme in its route `head`, and its icons, manifest, and
  `theme-color` through the `#/core/appBrand` helpers. After changing an app's
  `icon.svg` or `brand.ts`, run `npm run icons` and commit the output.
- **App styles.** Load an app's stylesheet with a `?url` import and a route
  `head` link, so it loads only on that app's pages. A side-effect CSS import
  in a route lands in the global bundle that every page loads. Scope every
  selector under the app's root class or a unique prefix, and prefix
  `@keyframes` names too.
- **AWS from the app.** Nitro server code invokes the backend Lambda. AWS
  credentials never reach the browser.
- **Generated files.** TanStack Router writes `app/src/routeTree.gen.ts`. Never
  edit it by hand.
- **Secrets.** Never commit `.env` files. Runtime secrets live in Secrets
  Manager and reach Lambdas through CloudFormation dynamic references. The
  `backend/gcp-credentials*.json` files are non-secret federation configs.
- **Dependencies.** `app/` and `infra/` each own a lockfile. Install with
  `npm ci`. npm install scripts need an `allowScripts` entry in that project's
  `package.json`. Go helper versions live only in `scripts/install-go-tools.sh`.
- **Docs.** When you change setup, a command, a tool version, a deploy step, or
  an environment variable, update the README that owns it. When you change a
  check or a convention, update this file.
