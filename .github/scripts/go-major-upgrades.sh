#!/usr/bin/env bash
set -euo pipefail

MODULES=("backend")
body=""
err_file=$(mktemp)

for module in "${MODULES[@]}"; do
  echo "Checking major version upgrades in ${module}..."
  # gomajor exits 0 even when proxy lookups fail and only reports them on
  # stderr, so fail here rather than treat a failed lookup as "no upgrades".
  output=$(cd "$module" && GOWORK=off gomajor list -major 2>"$err_file")
  if grep -q 'failed:' "$err_file"; then
    cat "$err_file" >&2
    exit 1
  fi

  if [ -n "$output" ]; then
    (cd "$module" && GOWORK=off gomajor get -major all && go mod tidy)
    body+="### \`${module}\`"$'\n\n'
    body+='```'$'\n'
    body+="${output}"$'\n'
    body+='```'$'\n\n'
  fi
done

if [ -z "$body" ]; then
  echo "has_upgrades=false" >> "$GITHUB_OUTPUT"
  echo "No Go major version upgrades available."
  exit 0
fi

echo "has_upgrades=true" >> "$GITHUB_OUTPUT"

EOF_MARKER=$(dd if=/dev/urandom bs=15 count=1 status=none | base64)
{
  echo "body<<$EOF_MARKER"
  echo "## Go Major Version Upgrades"
  echo ""
  echo "gomajor upgraded these Go dependencies to new major versions and"
  echo "rewrote their imports. Major versions can break APIs, so this PR is not"
  echo "merged automatically. Fix any CI failures on this branch before merging."
  echo ""
  echo "$body"
  echo "$EOF_MARKER"
} >> "$GITHUB_OUTPUT"
