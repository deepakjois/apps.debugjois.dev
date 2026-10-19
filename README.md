code and infra for apps.debugjois.dev.

see README in the subfolders for more details.

## Folders

- `app/` - TanStack Start/Nitro app for `apps.debugjois.dev`
- `backend/` - Go backend Lambda and daily-log/podcast transcription/index CLIs
- `backend-old/` - Previous Go backend retained for reference
- `infra/` - AWS CDK infrastructure for the Nitro app

## Development environment

All toolchains and CLIs (Go, golangci-lint, gopls, govulncheck, Node.js/npm,
AWS CLI, gcloud, yt-dlp, ffmpeg, Deno, gh, jq, zip, jj) come from the Nix flake
in `flake.nix`, pinned by `flake.lock`. npm packages and Go modules are still
installed from their own lockfiles. Commands in the subproject READMEs assume
you are inside this environment.

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
   ```

Update the pinned tools with `nix flake update`, and format `flake.nix` with
`nix fmt flake.nix`.

`docker` (with buildx) is not provided by the flake; install it separately
to build backend images with `infra/deploy.sh --with-backend-image`.

## Orb development

Fresh Amp orbs run `.agents/setup`, which installs Nix if it is missing, builds
the flake's tool profile (`packages.default`) into
`~/.cache/apps-debugjois-dev/nix-tools`, adds a `~/.bash_profile` hook that
puts it on `PATH` for login shells inside the repository, and installs the
locked npm and Go dependencies. `.agents/resume` rebuilds the tool profile
when `flake.nix` or `flake.lock` changed since the last build. After editing
the flake in an orb, refresh the tools with:

```sh
.agents/nix-tools
```

Builds and tests need no credentials. Deployment and integrations still require
the AWS, Google Drive, Deepgram, or LinkPreview credentials described in the
subproject READMEs.
