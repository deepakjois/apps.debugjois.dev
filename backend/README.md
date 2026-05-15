# backend

Go backend rewrite workspace for `apps.debugjois.dev`.

The previous backend has been preserved in `../backend_backup/`. This folder keeps the copied non-Go assets from that backend while the new Go implementation is rebuilt from scratch.

## Requirements

- Go 1.22+

## Local run

Run from `backend/`:

```bash
go run .
```

Expected output:

```text
hello world
```

## Format, test, and build

Run from `backend/`:

```bash
go fmt ./...
go test ./...
go build ./...
```
