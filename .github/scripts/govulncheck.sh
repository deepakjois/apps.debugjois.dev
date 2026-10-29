#!/usr/bin/env bash
# Runs govulncheck on backend/. Outside pull requests, when it finds called
# vulnerabilities, it also dispatches the workflow that can fix them: Go
# Dependency Upgrades for module findings, Toolchain Upgrades for standard
# library findings (Go itself comes from flake.lock). Their PRs merge
# automatically, and the check stays red until one lands.

set -euo pipefail

cd backend

status=0
govulncheck ./... || status=$?
# Exit status 3 means vulnerabilities were found; anything else is success or
# a tool error that a dependency bump would not fix.
if [ "$status" -ne 3 ] || [ "$GITHUB_EVENT_NAME" = "pull_request" ]; then
  exit "$status"
fi

called_modules=$(govulncheck -format json ./... |
  jq -rs '[.[].finding | select(. != null and .trace[0].function != null) | .trace[0].module] | unique | .[]')
echo "Modules with called vulnerabilities: ${called_modules//$'\n'/, }"

if grep -qvx stdlib <<<"$called_modules"; then
  gh workflow run go-dep-upgrades.yml --ref main
fi
if grep -qx stdlib <<<"$called_modules"; then
  gh workflow run toolchain-upgrades.yml --ref main
fi

exit "$status"
