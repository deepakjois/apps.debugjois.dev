# apps.debugjois.dev

Frontend, Go backend, and AWS infrastructure for `apps.debugjois.dev`.

## What runs where

- `app/` is a TanStack Start app on Nitro. It runs as a Node.js Lambda behind
  API Gateway and CloudFront and serves the public transcript reader and the
  admin pages. See [app/README.md](app/README.md).
- `backend/` is a Go Lambda shipped as a container image, with no HTTP API.
  The app invokes it directly for daily-log and podcast transcription actions,
  and an EventBridge rule runs it daily. The same code builds CLIs for local
  use. See [backend/README.md](backend/README.md).
- `infra/` holds the AWS CDK stacks and `deploy.sh`, which deploys them
  without CDK bootstrap. See [infra/README.md](infra/README.md).

Agents start with [AGENTS.md](AGENTS.md). It lists the checks to run, the
repo conventions, and the commands that change AWS.

## Development environment

Go and Node come from `flake.nix`, with their nixpkgs versions pinned by
`flake.lock`. npm is pinned separately in the flake because it releases
independently of Node. The flake also supplies the AWS, GitHub, Google Cloud,
and media CLIs. Application dependencies stay in `package-lock.json` and
`go.mod` and `go.sum`. Builds are not Nix derivations.

Supported hosts are x86-64 and ARM64 Linux and Apple Silicon macOS. Current
nixpkgs has dropped Intel macOS.

Go helper tools (`gopls`, `golangci-lint`, `govulncheck`, `go-mod-upgrade`,
`gomajor`) are pinned in `scripts/install-go-tools.sh`, which builds them with
`go install` and the active compiler. The dev shell puts their install
directory, `~/.cache/apps-debugjois-dev/go-tools/bin`, on `PATH` and sets
`GOTOOLCHAIN=local` so Go never downloads a compiler on its own.

1. Install [Nix](https://nixos.org/download/) with flakes enabled
   (`experimental-features = nix-command flakes` in `nix.conf`).
2. Enter the environment. With [direnv](https://direnv.net/), which
   [nix-direnv](https://github.com/nix-community/nix-direnv) makes faster:

   ```sh
   direnv allow
   ```

   Or by hand:

   ```sh
   nix develop
   ```

3. Install project dependencies:

   ```sh
   npm --prefix app ci
   npm --prefix infra ci
   (cd backend && go mod download)
   ./scripts/install-go-tools.sh
   ```

Tests and builds need no credentials. Live integrations and deployments do.
Each component README lists what its commands need.

`docker` with buildx is not in the flake. Install it separately to build
backend images with `infra/deploy.sh --with-backend-image`.

### Updating tools

- Run `nix flake update` to refresh Go, Node, and the other nixpkgs packages.
- When npm releases ahead of the version bundled with Node, update npm's
  version and tarball hash in `flake.nix`.
- Update Go helper pins in `scripts/install-go-tools.sh`, then rerun it. Pass
  names to install only those helpers, for example
  `./scripts/install-go-tools.sh golangci-lint`.
- Re-enter `nix develop` after flake changes. Format the flake with
  `nix fmt flake.nix`.
- `backend/go.mod` declares the minimum Go language version, not a compiler
  patch pin. The backend Docker build reads its compiler version from
  `go env GOVERSION` in the active environment.

npm install scripts need explicit `allowScripts` approval in each project's
`package.json`. Review with `npm --prefix infra install-scripts ls` and approve
only reviewed packages and versions, not all scripts globally.

## Orb development

A fresh Amp orb runs `.agents/setup`. It installs Nix if missing, builds the
flake's tool profile (`packages.default`) into
`~/.cache/apps-debugjois-dev/nix-tools`, adds a `~/.bash_profile` hook through
`.agents/profile-hook` that puts the profile on `PATH` for login shells inside
the repo, and installs the npm and Go dependencies and the Go helpers.

`.agents/resume` rebuilds the tool profile when `flake.nix` or `flake.lock`
changed since the last build. It also moves the hook back to the end of
`~/.bash_profile`, because Amp appends a block there on activation that
sources `~/.env`, whose `PATH` would otherwise hide the Nix tools. Resume does
not rebuild Go helpers.

After editing the flake or the Go helper pins in an orb, refresh the tools and
start a new login shell:

```sh
.agents/nix-tools
./scripts/install-go-tools.sh
```

## GitHub Actions

Every workflow uses `.github/actions/setup-tools`. It installs Nix, caches the
Nix store and the npm and Go download and build caches, and activates the
smaller `packages.ci` profile from the flake. Jobs request only the Go helpers
they need, from the same version list local development uses. The CDK CLI
comes from the infra lockfile, not a global install. AWS OIDC and Docker buildx
stay GitHub Actions responsibilities.

| Workflow                   | Trigger                                                     | Effect                                                  |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| App Test and Deploy        | Push to `main` touching `app/`                              | `infra/deploy.sh --with-artifact`                       |
| Backend Test and Deploy    | Push to `main` touching `backend/`                          | `infra/deploy.sh --with-backend-image`                  |
| Infra Build                | Push to `main` touching `infra/`                            | Type-check and synth only                               |
| Infra Deploy               | Manual                                                      | `infra/deploy.sh` reusing the deployed artifacts        |
| Toolchain Validation       | Changes to the flake, `.agents/`, actions, or workflows     | `nix flake check` plus all three component check suites |
| Backend Go Vulnerability   | PRs touching `backend/` and daily                           | `govulncheck ./...`                                     |
| Dependency Upgrades        | Weekly                                                      | PR bumping npm dependencies in `app/` and `infra/`      |
| Go Dependency Upgrades     | Weekly                                                      | PR bumping Go minor and patch versions                  |
| Go Major Version Upgrades  | Weekly                                                      | Tracking issue listing available Go major versions      |

The deploy workflows share one concurrency group, so deploys run one at a time.
Pull requests never deploy or write to production.
