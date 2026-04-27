# backend

Local Go podcast transcription tools for `apps.debugjois.dev`.

This module is intentionally local-only for now. The deployed Nitro app invokes the existing `debugjois.dev` backend Lambda from the other repo; this Go module is not packaged or deployed from this repository yet.

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

Locally, accepted `queue-podcast-transcription` requests start the transcription worker in a goroutine and return a local transcription ID. Use the standalone CLI below when you want synchronous local output.

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

## Tests and build

Run from `backend/`:

```bash
go test ./...
go build ./...
```
