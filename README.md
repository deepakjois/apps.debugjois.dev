# apps.debugjois.dev

Frontend, Go backend, and AWS infrastructure for `apps.debugjois.dev`.

## Folders

- `app/` - TanStack Start/Nitro app for `apps.debugjois.dev`
- `backend/` - Go backend Lambda and daily-log/podcast transcription/index CLIs
- `backend-old/` - Previous Go backend retained for reference
- `infra/` - AWS CDK infrastructure for the Nitro app
- `mac-reader/` - Swift CLI that shows a text file full screen in a reading view (macOS)

## Development environment

Go and Node come from `flake.nix`, with their nixpkgs versions pinned by
`flake.lock`. npm is pinned separately in the flake because it releases
independently of Node. The flake also supplies cloud/media CLIs and scripting
utilities. Application dependencies remain managed by `package-lock.json` and
`go.mod`/`go.sum`; builds are not Nix derivations.

Supported hosts are x86-64/ARM64 Linux and Apple Silicon macOS. Current nixpkgs
has dropped Intel macOS support.

Go helper versions live in `scripts/install-go-tools.sh`: it uses `go install`
with the active compiler, not Nix packages. The development shell adds their
installation directory (`~/.cache/apps-debugjois-dev/go-tools/bin`) to `PATH`
and sets `GOTOOLCHAIN=local`, preventing automatic compiler downloads.

1. Install [Nix](https://nixos.org/download/) with flakes enabled
   (`experimental-features = nix-command flakes` in `nix.conf`).
2. Enter the environment, either automatically with
   [direnv](https://direnv.net/) (recommended:
   [nix-direnv](https://github.com/nix-community/nix-direnv) for caching):

   ```sh
   direnv allow
   ```

   or manually:

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

See [frontend](app/README.md), [backend](backend/README.md), and
[infrastructure](infra/README.md) for commands and environment-specific setup.
Tests and builds need no credentials; live integrations and deployments do.

### Updating tools

- Run `nix flake update` to refresh Go, Node, and the other nixpkgs packages.
- Update npm's version and tarball integrity hash in `flake.nix` when npm releases
  ahead of the version bundled with Node.
- Update Go helper pins in `scripts/install-go-tools.sh`, then rerun it. Pass
  individual names to install only those helpers, e.g. `./scripts/install-go-tools.sh golangci-lint`.
- Re-enter `nix develop` after flake changes; format the flake with `nix fmt flake.nix`.
- `backend/go.mod` declares the minimum Go language version, not a separate
  compiler patch pin. The backend Docker build takes its compiler version from
  `go env GOVERSION` in the active environment.

npm dependency install scripts require explicit `allowScripts` approval in each
project's `package.json`. Review with `npm --prefix infra install-scripts ls`;
approve only reviewed packages/versions, not all dependency scripts globally.

`docker` (with buildx) is not provided by the flake; install it separately
to build backend images with `infra/deploy.sh --with-backend-image`.

## Orb development

Fresh Amp orbs run `.agents/setup`, which installs Nix if it is missing, builds
the flake's tool profile (`packages.default`) into
`~/.cache/apps-debugjois-dev/nix-tools`, adds a `~/.bash_profile` hook
(`.agents/profile-hook`) that puts it on `PATH` for login shells inside the
repository, and installs npm/Go dependencies and the Go helpers. `.agents/resume`
rebuilds the tool profile when `flake.nix` or `flake.lock` changed since the
last build, and moves the hook back to the end of `~/.bash_profile`: Amp
appends a block there on activation that sources `~/.env`, whose `PATH` would
otherwise hide the Nix tools. After editing
the flake in an orb, refresh the tools with:

```sh
.agents/nix-tools
./scripts/install-go-tools.sh
```

Start a new login shell afterward to use the refreshed environment. Resume does
not compile Go helpers; rerun their installer after changing their pins.

## GitHub Actions

Every workflow uses `.github/actions/setup-tools` to install Nix, cache its
store and npm/Go downloads/build outputs, and activate the smaller `packages.ci`
profile. Jobs request only the Go helpers they need; local and CI installations
share the same version list. CDK comes from the infra npm lockfile, not a global
install. AWS OIDC and Docker/buildx remain GitHub Actions responsibilities.

The Toolchain Validation workflow checks the app, backend, and infrastructure
when shared toolchain/setup files change, without deployment credentials or
production writes. Existing deployment workflows keep their explicit triggers
and shared deployment concurrency group.

Lambda's managed Node runtime is configured in `infra/lib/site-stack.ts` and
uses the latest production-supported major, not AWS preview runtimes. It is
distinct from the latest Node used to build the frontend; Lambda manages runtime
patches. See the frontend README for build output and runtime requirements.
