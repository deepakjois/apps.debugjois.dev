#!/usr/bin/env bash
# Check for and apply npm dependency upgrades in a single project directory.
#
# Usage: dep-upgrades-check.sh <project-dir> <report-file>
#
# On success:
#   - If upgrades were applied: writes human-readable report to <report-file>, exits 0
#   - If no upgrades available: writes nothing to <report-file> (file is truncated), exits 0
# The caller determines whether any project had updates by checking file sizes.

set -euo pipefail

PROJECT_DIR="$1"
REPORT_FILE="$2"

# Ensure the report file starts empty so "no upgrades" can be detected by size.
: > "$REPORT_FILE"

cd "$PROJECT_DIR"

# Capture human-readable upgrade report (shows package old → new).
REPORT=$(npx npm-check-updates 2>/dev/null || true)

# Detect whether any upgrades are available (empty object means none).
UPGRADES=$(npx npm-check-updates --jsonUpgraded 2>/dev/null || echo '{}')
if [ "$UPGRADES" = '{}' ] || [ -z "$UPGRADES" ]; then
  echo "No dependency updates available for $PROJECT_DIR."
  exit 0
fi

# Apply upgrades to package.json and refresh the lockfile.
npx npm-check-updates -u
npm install

# Persist the human-readable report for the caller to aggregate into a PR body.
printf '%s\n' "$REPORT" > "$REPORT_FILE"
