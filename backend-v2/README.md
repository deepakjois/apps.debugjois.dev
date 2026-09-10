# backend-v2

Minimal Go port of the backend, starting with the daily log. The daily-log application package is independent of its Google Drive adapter and CLI transport so it can also be used by a future Lambda.

## Requirements

- Go 1.26.8+
- `golangci-lint` on `PATH`
- Google Drive Application Default Credentials

Configure local Google Drive access. Quote the full service-account email so the ADC impersonation URL is written correctly:

```bash
gcloud auth application-default login \
  --impersonate-service-account='gdrive-obsidian@daily-notes-obsidian-gdrive.iam.gserviceaccount.com' \
  --scopes='https://www.googleapis.com/auth/drive'
```

## Daily-log CLI

Run from `backend-v2/`. `read` prints today's raw Markdown log to stdout:

```bash
go run ./cmd/daily-log read
```

`write` replaces today's log with the raw Markdown read from stdin:

```bash
printf '### Today\n\nUpdated text\n' | go run ./cmd/daily-log write
```

Dates and filenames use the `Europe/Berlin` timezone. A missing daily log reads as `### YYYY-MM-DD` followed by a newline; it is not created until `write` is called.

## Container image

Build the CLI image from `backend-v2/`:

```bash
docker build -t apps-debugjois-dev-backend-v2 .
```

The image includes the same non-secret Google Workload Identity Federation credential configuration as the original backend. Set `GOOGLE_APPLICATION_CREDENTIALS=/gcp-credentials.json` when running it in AWS.

## Format, lint, test, and build

Run from `backend-v2/`:

```bash
go fmt ./...
golangci-lint run ./...
go test ./...
go build ./...
```
