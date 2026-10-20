# shellcheck shell=bash

APPS_DEBUGJOIS_DEV_TOOLS="${APPS_DEBUGJOIS_DEV_TOOLS:-$HOME/.cache/apps-debugjois-dev/nix-tools}"

if ! command -v nix >/dev/null && [[ -r "$HOME/.nix-profile/etc/profile.d/nix.sh" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.nix-profile/etc/profile.d/nix.sh"
fi

if [[ -d "$APPS_DEBUGJOIS_DEV_TOOLS/bin" && ":$PATH:" != *":$APPS_DEBUGJOIS_DEV_TOOLS/bin:"* ]]; then
  export PATH="$APPS_DEBUGJOIS_DEV_TOOLS/bin:$PATH"
fi

export GOTOOLCHAIN=local
export GOBIN="$HOME/.cache/apps-debugjois-dev/go-tools/bin"
if [[ ":$PATH:" != *":$GOBIN:"* ]]; then
  export PATH="$GOBIN:$PATH"
fi
