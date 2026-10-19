#!/usr/bin/env bash
# Check for and apply npm dependency upgrades in a single project directory.
#
# Usage: dep-upgrades-check.sh <project-dir> <report-file>
#
# Semver ranges are bumped with npm-check-updates. Dependencies that track an
# npm dist-tag (for example "latest" or "npm:nitro-nightly@latest") are skipped
# by npm-check-updates and kept at their locked version by npm install, so they
# are refreshed separately with npm update.
#
# On success:
#   - If upgrades were applied: writes human-readable report to <report-file>, exits 0
#   - If no upgrades available: writes nothing to <report-file> (file is truncated), exits 0
# The caller determines whether any project had updates by checking file sizes.

set -euo pipefail

PROJECT_DIR="$1"
REPORT_FILE="$2"

# Ensure the report file starts empty so "no upgrades" can be detected by size.
: >"$REPORT_FILE"

cd "$PROJECT_DIR"

# Names of direct dependencies whose spec is a dist-tag ending in "latest".
mapfile -t TAGGED < <(node -e '
  const pkg = require("./package.json");
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, spec] of Object.entries(deps)) {
    if (/(^|@)latest$/.test(spec)) console.log(name);
  }
')

# Print "<name> <locked version>" for each dist-tag dependency.
locked_tagged_versions() {
  [ "${#TAGGED[@]}" -eq 0 ] && return 0
  node -e '
    const lock = require("./package-lock.json");
    for (const name of process.argv.slice(1)) {
      console.log(name, lock.packages["node_modules/" + name]?.version ?? "missing");
    }
  ' "${TAGGED[@]}"
}

TAGGED_BEFORE=$(locked_tagged_versions)

# Capture human-readable upgrade report (shows package old → new).
NCU_REPORT=$(npm-check-updates 2>/dev/null || true)

# Detect whether any semver upgrades are available (empty object means none).
UPGRADES=$(npm-check-updates --jsonUpgraded 2>/dev/null || echo '{}')
NCU_UPDATED=false
if [ "$UPGRADES" != '{}' ] && [ -n "$UPGRADES" ]; then
  # Apply upgrades to package.json and refresh the lockfile.
  npm-check-updates -u
  npm install
  NCU_UPDATED=true
fi

# Refresh dist-tag dependencies. Their peer ranges can depend on each other
# (e.g. a TanStack devtools release requiring a newer router), so one pass may
# leave some behind; repeat until the lockfile stops changing.
if [ "${#TAGGED[@]}" -gt 0 ]; then
  for _ in 1 2 3; do
    LOCK_BEFORE=$(sha256sum package-lock.json)
    npm update "${TAGGED[@]}"
    [ "$(sha256sum package-lock.json)" = "$LOCK_BEFORE" ] && break
  done
fi

# Report dist-tag dependencies whose locked version changed, as "name  old → new".
TAGGED_REPORT=$(join <(sort <<<"$TAGGED_BEFORE") <(locked_tagged_versions | sort) |
  awk '$2 != $3 { printf " %s  %s  →  %s\n", $1, $2, $3 }')

if [ "$NCU_UPDATED" = "false" ] && [ -z "$TAGGED_REPORT" ]; then
  echo "No dependency updates available for $PROJECT_DIR."
  exit 0
fi

# Persist the human-readable report for the caller to aggregate into a PR body.
{
  [ "$NCU_UPDATED" = "true" ] && printf '%s\n' "$NCU_REPORT"
  if [ -n "$TAGGED_REPORT" ]; then
    [ "$NCU_UPDATED" = "true" ] && echo ""
    echo "Dist-tag dependencies refreshed in the lockfile:"
    printf '%s\n' "$TAGGED_REPORT"
  fi
} >"$REPORT_FILE"
