# backend

Go backend rewrite workspace for `apps.debugjois.dev`.

The previous backend has been preserved in `../backend_backup/`. This folder keeps the copied non-Go assets from that backend while the new Go implementation is rebuilt from scratch.

## Requirements

- Go 1.22+

## Local run

The binary runs in Lambda mode when `AWS_LAMBDA_RUNTIME_API` is present and otherwise runs a local Lambda-like invocation. Local runs load `backend/.env` before invoking the handler.

Run the stand-in local invocation from `backend/`:

```bash
go run .
```

Expected output:

```text
{"message":"hello world","runtime":"local"}
```

Pass a stand-in payload on stdin:

```bash
printf '{"message":"hello from stdin"}' | go run . --payload-file -
```

Expected output:

```text
{"message":"hello from stdin","runtime":"local"}
```

You can also pass the payload directly:

```bash
go run . --payload '{"message":"hello from flag"}'
```

## Format, test, and build

Run from `backend/`:

```bash
go fmt ./...
go test ./...
go build ./...
```
