#!/usr/bin/env bash
# Usage: NCU_TARGET=minor|latest dep-upgrades-check.sh <project-dir> <report-file>
#
# ncurc.cjs holds the version policy. With NCU_TARGET=latest this reports
# nothing unless some dependency has a new major, so the majors PR only exists
# when there are majors to review.
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

: >"$REPORT_FILE"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NCU=(npm-check-updates --configFilePath "$SCRIPT_DIR" --configFileName ncurc.cjs)

cd "$PROJECT_DIR"

mapfile -t TAGGED < <(node -e '
  const pkg = require("./package.json");
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, spec] of Object.entries(deps)) {
    if (/(^|@)latest$/.test(spec)) console.log(name);
  }
')

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

NCU_REPORT=$("${NCU[@]}" 2>/dev/null | grep -vE '^(Using config file|Run ncu )' || true)

UPGRADES=$("${NCU[@]}" --jsonUpgraded 2>/dev/null || echo '{}')
if [ "$NCU_TARGET" = "latest" ]; then
  TAGGED=()
  WITHIN_MAJOR=$(NCU_TARGET=minor "${NCU[@]}" --jsonUpgraded 2>/dev/null || echo '{}')
  if [ "$UPGRADES" = "$WITHIN_MAJOR" ]; then
    echo "No major upgrades available for $PROJECT_DIR."
    exit 0
  fi
fi

NCU_UPDATED=false
if [ "$UPGRADES" != '{}' ] && [ -n "$UPGRADES" ]; then
  "${NCU[@]}" -u
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

TAGGED_REPORT=$(join <(sort <<<"$TAGGED_BEFORE") <(locked_tagged_versions | sort) |
  awk '$2 != $3 { printf " %s  %s  →  %s\n", $1, $2, $3 }')

if [ "$NCU_UPDATED" = "false" ] && [ -z "$TAGGED_REPORT" ]; then
  echo "No dependency updates available for $PROJECT_DIR."
  exit 0
fi

{
  [ "$NCU_UPDATED" = "true" ] && printf '%s\n' "$NCU_REPORT"
  if [ -n "$TAGGED_REPORT" ]; then
    [ "$NCU_UPDATED" = "true" ] && echo ""
    echo "Dist-tag dependencies refreshed in the lockfile:"
    printf '%s\n' "$TAGGED_REPORT"
  fi
} >"$REPORT_FILE"
