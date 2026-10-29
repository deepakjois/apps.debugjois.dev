#!/usr/bin/env bash
# Refreshes flake.lock, the npm pin in flake.nix, and the Go helper pins in
# scripts/install-go-tools.sh, then rebuilds the CI profile with the result.
# Expects GO_TOOLS (passed through to setup-ci.sh) and $GITHUB_OUTPUT.
#
# Outputs: has_updates ("true"/"false") and body (PR markdown).

set -euo pipefail

versions() {
  printf 'Go %s\n' "$(go env GOVERSION)"
  printf 'Node %s\n' "$(node --version)"
  printf 'npm %s\n' "$(npm --version)"
  sed -n 's/^  \([a-z-]*\)) package=.*@\([^ ]*\) ;;$/\1 \2/p' scripts/install-go-tools.sh
}

before=$(versions)

nix flake update

current_npm=$(sed -n 's/^ *version = "\(.*\)";$/\1/p' flake.nix)
latest_npm=$(npm view npm version)
if [ "$current_npm" != "$latest_npm" ]; then
  integrity=$(npm view "npm@$latest_npm" dist.integrity)
  sed -i \
    -e "s|^\( *version = \)\"$current_npm\";|\1\"$latest_npm\";|" \
    -e "s|^\( *hash = \)\"sha512-[^\"]*\";|\1\"$integrity\";|" \
    flake.nix
fi

# Pins name packages, but only modules have versions, so walk up the package
# path to the first prefix that resolves as a module.
latest_module_version() {
  local path="$1" version
  while [ "$path" != "${path%/*}" ]; do
    if version=$(go list -m -f '{{.Version}}' "$path@latest" 2>/dev/null); then
      echo "$version"
      return
    fi
    path="${path%/*}"
  done
  echo "No module found for $1" >&2
  return 1
}

while read -r package version; do
  latest=$(latest_module_version "$package")
  sed -i "s|package=$package@$version ;;|package=$package@$latest ;;|" scripts/install-go-tools.sh
done < <(sed -n 's/^  [a-z-]*) package=\([^@]*\)@\([^ ]*\) ;;$/\1 \2/p' scripts/install-go-tools.sh)

if git diff --quiet; then
  echo "has_updates=false" >>"$GITHUB_OUTPUT"
  echo "Toolchains are up to date."
  exit 0
fi

.github/scripts/setup-ci.sh

# The backend image builds from golang:<flake Go version>-alpine, which Docker
# publishes separately from the nixpkgs Go update.
go_image="golang:$(go env GOVERSION | sed 's/^go//')-alpine"
if ! docker manifest inspect "$go_image" >/dev/null; then
  echo "::error::$go_image is not published yet; the backend image would not build."
  exit 1
fi

after=$(versions)

echo "has_updates=true" >>"$GITHUB_OUTPUT"

EOF_MARKER=$(dd if=/dev/urandom bs=15 count=1 status=none | base64)
{
  echo "body<<$EOF_MARKER"
  echo "## Toolchain Upgrades"
  echo ""
  echo "Weekly \`nix flake update\`, npm pin, and Go helper pin refresh."
  echo "Merging redeploys the backend, whose image is built with the flake's Go."
  echo ""
  echo "| Tool | Before | After |"
  echo "| ---- | ------ | ----- |"
  paste -d ' ' <(echo "$before") <(echo "$after") |
    awk '{ printf "| %s | `%s` | %s |\n", $1, $2, ($2 == $4 ? "unchanged" : "`" $4 "`") }'
  echo ""
  echo "$EOF_MARKER"
} >>"$GITHUB_OUTPUT"
