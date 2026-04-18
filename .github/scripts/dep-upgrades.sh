#!/usr/bin/env bash
# Orchestrate dependency upgrade checks across all npm projects in the repo
# and emit a combined PR body via GITHUB_OUTPUT.
#
# Expects $GITHUB_OUTPUT to be set (standard in GitHub Actions).
# Runs from repo root.
#
# Outputs written to $GITHUB_OUTPUT:
#   has_updates: "true" if at least one project has upgrades, else "false"
#   app_updated: "true" if app/ had upgrades
#   infra_updated: "true" if infra/ had upgrades
#   body: multi-line combined PR body (only set when has_updates=true)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHECK_SCRIPT="$SCRIPT_DIR/dep-upgrades-check.sh"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Scratch directory for per-project reports; cleaned up on exit.
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

APP_REPORT="$WORK_DIR/app.txt"
INFRA_REPORT="$WORK_DIR/infra.txt"

# Run both checks; each script applies upgrades in-place and writes its report.
"$CHECK_SCRIPT" "$REPO_DIR/app" "$APP_REPORT"
"$CHECK_SCRIPT" "$REPO_DIR/infra" "$INFRA_REPORT"

# A non-empty report file means upgrades were applied in that project.
APP_UPDATED=false
INFRA_UPDATED=false
[ -s "$APP_REPORT" ] && APP_UPDATED=true
[ -s "$INFRA_REPORT" ] && INFRA_UPDATED=true

{
  echo "app_updated=$APP_UPDATED"
  echo "infra_updated=$INFRA_UPDATED"
} >> "$GITHUB_OUTPUT"

if [ "$APP_UPDATED" = "false" ] && [ "$INFRA_UPDATED" = "false" ]; then
  echo "has_updates=false" >> "$GITHUB_OUTPUT"
  echo "No dependency updates available in any project."
  exit 0
fi

echo "has_updates=true" >> "$GITHUB_OUTPUT"

# Build the combined PR body with a section per project that was updated.
EOF_MARKER=$(dd if=/dev/urandom bs=15 count=1 status=none | base64)
{
  echo "body<<$EOF_MARKER"
  echo "## Dependency Upgrades"
  echo ""
  echo "Weekly npm dependency upgrades across the repo."
  echo ""

  if [ "$APP_UPDATED" = "true" ]; then
    echo "### app/"
    echo ""
    echo "The following packages were upgraded in \`app/\`:"
    echo ""
    echo '```'
    cat "$APP_REPORT"
    echo '```'
    echo ""
  fi

  if [ "$INFRA_UPDATED" = "true" ]; then
    echo "### infra/"
    echo ""
    echo "The following packages were upgraded in \`infra/\`:"
    echo ""
    echo '```'
    cat "$INFRA_REPORT"
    echo '```'
    echo ""
  fi

  echo "$EOF_MARKER"
} >> "$GITHUB_OUTPUT"
