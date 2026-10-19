#!/usr/bin/env bash
set -euo pipefail

# Use the small CI profile, not the orb's login hook or full local tool suite.
profile="$RUNNER_TEMP/nix-tools"
nix build .#ci --out-link "$profile"
export GOBIN="$HOME/.cache/apps-debugjois-dev/go-tools/bin"
export GOTOOLCHAIN=local
export PATH="$GOBIN:$profile/bin:$PATH"
printf '%s\n' "$profile/bin" "$GOBIN" >>"$GITHUB_PATH"
printf 'GOBIN=%s\nGOTOOLCHAIN=local\n' "$GOBIN" >>"$GITHUB_ENV"

go version
node --version
npm --version

# Only build helpers needed by this job; all versions live in the installer.
if [[ -n "${GO_TOOLS:-}" ]]; then
  read -r -a tools <<<"$GO_TOOLS"
  scripts/install-go-tools.sh "${tools[@]}"
fi
