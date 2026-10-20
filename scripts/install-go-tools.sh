#!/usr/bin/env bash
set -euo pipefail

export GOTOOLCHAIN=local
export GOBIN="${GOBIN:-$HOME/.cache/apps-debugjois-dev/go-tools/bin}"
mkdir -p "$GOBIN"

if (($# == 0)); then
  set -- gopls golangci-lint govulncheck go-mod-upgrade gomajor
fi

for tool in "$@"; do
  case "$tool" in
  gopls) package=golang.org/x/tools/gopls@v0.24.0 ;;
  golangci-lint) package=github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0 ;;
  govulncheck) package=golang.org/x/vuln/cmd/govulncheck@v1.9.0 ;;
  go-mod-upgrade) package=github.com/oligot/go-mod-upgrade@v0.13.0 ;;
  gomajor) package=github.com/icholy/gomajor@v0.15.0 ;;
  *)
    printf 'Unknown Go tool: %s\n' "$tool" >&2
    exit 1
    ;;
  esac
  printf 'Installing %s with %s\n' "$package" "$(go version)"
  go install "$package"
done
