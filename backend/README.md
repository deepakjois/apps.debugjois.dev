# backend

Go podcast transcription tools for `apps.debugjois.dev`. The module can run locally as CLIs and can be deployed as a backend Lambda container image.

## Requirements

- Go 1.26+
- AWS credentials for S3 transcript writes or index generation with `--write`
- `DEEPGRAM_API_KEY` in `backend/.env` for local transcription

Create a local env file when running transcription locally:

```bash
cat > .env <<'EOF_ENV'
DEEPGRAM_API_KEY=your-deepgram-api-key
EOF_ENV
```

## Local direct invoke

Run from `backend/`:

```bash
printf '{"action":"health-check"}' | go run . invoke
printf '{"action":"queue-podcast-transcription","text":"Podcast Addict share text"}' | go run . invoke
go run . invoke --payload event.json
```

The direct podcast action accepts JSON shaped as:

```json
{ "action": "queue-podcast-transcription", "text": "Podcast Addict share text" }
```

Locally, accepted `queue-podcast-transcription` requests parse the Podcast Addict text and return a local transcription ID, but they do not run transcription. Use the standalone CLI below when you want local transcription output.

Direct invocation actions currently supported by the local Lambda port:

- `health-check`
- `queue-podcast-transcription` — parse Podcast Addict text and queue worker payload
- `process-podcast-transcription` — worker action that transcribes one parsed podcast payload

## Standalone transcription CLI

Run from `backend/`:

```bash
go run ./cmd/transcribe-podcast "<podcast-addict-share-text-or-url>"
```

For multiline Podcast Addict share text, pipe stdin:

```bash
printf '%s\n' '[Podcast Name] Episode Title
https://podcastaddict.com/example/episode/123 via @PodcastAddict' \
  | go run ./cmd/transcribe-podcast
```

To store the transcript JSON in S3 and refresh `transcripts/transcripts.json`, pass `--write`:

```bash
printf '%s\n' '[Podcast Name] Episode Title
https://podcastaddict.com/example/episode/123 via @PodcastAddict' \
  | go run ./cmd/transcribe-podcast --write
```

## Transcript index CLI

Run from `backend/`:

```bash
go run ./cmd/podcast-index
```

To write the generated index back to S3:

```bash
go run ./cmd/podcast-index --write
```

## Lambda container image

The backend can be packaged as an AWS Lambda container image. The ECR repository is created by the infra artifact stack before image builds.

Build and push a fresh backend image from the repository root:

```bash
./backend/build-and-push-image.sh
```

The script prints an immutable ECR image URI like `.../apps-debugjois-dev-backend@sha256:...`, which the backend stack uses for deployment. Lambda loads `DEEPGRAM_API_KEY` from the Secrets Manager secret configured by the backend stack.

## Tests and build

Run from `backend/`:

```bash
go test ./...
go vet ./...
go build ./...
```
