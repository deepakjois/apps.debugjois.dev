# shellcheck shell=bash
# Sourced (never executed) by .agents/setup, .agents/resume, and the orb's
# ~/.bash_profile hook. Puts the flake's tool profile, built by
# .agents/nix-tools, on PATH without evaluating Nix, so login shells stay fast.

# Out-link of the built tool profile; it doubles as a Nix GC root.
APPS_DEBUGJOIS_DEV_TOOLS="${APPS_DEBUGJOIS_DEV_TOOLS:-$HOME/.cache/apps-debugjois-dev/nix-tools}"

# Make `nix` itself reachable when it was installed by the single-user installer.
if ! command -v nix >/dev/null && [[ -r "$HOME/.nix-profile/etc/profile.d/nix.sh" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.nix-profile/etc/profile.d/nix.sh"
fi

# Prepend once, so nested login shells do not stack duplicate entries.
if [[ -d "$APPS_DEBUGJOIS_DEV_TOOLS/bin" && ":$PATH:" != *":$APPS_DEBUGJOIS_DEV_TOOLS/bin:"* ]]; then
  export PATH="$APPS_DEBUGJOIS_DEV_TOOLS/bin:$PATH"
fi

# Mirrors devShells.default in flake.nix.
export GOTOOLCHAIN=local
export GOBIN="$HOME/.cache/apps-debugjois-dev/go-tools/bin"
if [[ ":$PATH:" != *":$GOBIN:"* ]]; then
  export PATH="$GOBIN:$PATH"
fi
