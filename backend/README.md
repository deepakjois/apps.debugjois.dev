# backend

Go backend Lambda and standalone CLIs for daily logs, podcast transcription,
and transcript index generation. Application packages are independent of their
external-service adapters and transports.

## Requirements

- Go 1.26.8+
- `golangci-lint` on `PATH`
- AWS credentials for transcript publishing or index generation with `--write`
- Google Drive Application Default Credentials for daily logs
- `yt-dlp` on `PATH` for YouTube transcription
- `DEEPGRAM_API_KEY` for podcast transcription

Configure local Google Drive access. Quote the full service-account email so the ADC impersonation URL is written correctly:

```bash
gcloud auth application-default login \
  --impersonate-service-account='gdrive-obsidian@daily-notes-obsidian-gdrive.iam.gserviceaccount.com' \
  --scopes='https://www.googleapis.com/auth/drive'
```

## Daily-log CLI

Run from `backend/`. `read` prints today's raw Markdown log to stdout:

```bash
go run ./cmd/daily-log read
```

`write` replaces today's log with the raw Markdown read from stdin:

```bash
printf '### Today\n\nUpdated text\n' | go run ./cmd/daily-log write
```

Dates and filenames use the `Europe/Berlin` timezone. A missing daily log reads as `### YYYY-MM-DD` followed by a newline; it is not created until `write` is called.

## Podscriber CLI

The podscriber resolves Podcast Addict episode links or share text, YouTube
URLs, and direct HTTP(S) audio URLs before transcribing the audio with
Deepgram. YouTube sources are downloaded with `yt-dlp` into a temporary
directory that is removed after transcription.

The CLI accepts the payload as one argument or from stdin. With `-parse`, it
only resolves the source and prints the internal JSON transcription input;
this mode does not require a Deepgram key. The Lambda transport retains the
deployed public envelope described below instead:

```bash
go run ./cmd/podscriber -parse 'https://example.com/episode.mp3'
printf '%s\n' 'https://example.com/episode.mp3' | go run ./cmd/podscriber -parse
```

Without `-parse`, it resolves and immediately transcribes the payload. Provide
the Deepgram key through the environment (or inject it from your secret
manager). By default, the transcript text is printed to stdout:

```bash
export DEEPGRAM_API_KEY='your-deepgram-api-key'
go run ./cmd/podscriber 'https://www.youtube.com/watch?v=example'
printf '%s\n' 'https://example.com/episode.mp3' | go run ./cmd/podscriber
```

Use `-output` to write only the transcript text to a file instead of stdout:

```bash
go run ./cmd/podscriber \
  -output transcript.txt \
  'https://www.youtube.com/watch?v=example'
```

Use `-publish` to additionally publish the full transcript payload to S3 and
refresh the public transcript index. This requires AWS credentials and can be
combined with either stdout or `-output`:

```bash
go run ./cmd/podscriber \
  -publish \
  -output transcript.txt \
  'https://www.youtube.com/watch?v=example'
```

Publishing is exposed through the `podscriber.Publisher` interface. The CLI
opts into the S3 adapter only with `-publish`. The Lambda transport always
publishes successful transcriptions, retaining the previous backend's document
and object-key identity for compatibility.

Podcast Addict share text containing newlines must be quoted when passed as an
argument, or it can be piped through stdin. The reusable
`podscriber/resolvers` and `podscriber/deepgram` packages retain source metadata
and the complete raw Deepgram response for non-CLI transports.

YouTube resolution downloads media to a local temporary file. Parse-only JSON
therefore demonstrates the handoff shape, but that local path is removed when
the CLI exits. Before splitting YouTube processing across asynchronous Lambda
invocations, the queue stage must put the downloaded media in shared storage,
or the worker stage must perform the `yt-dlp` resolution itself.

## Transcript index CLI

Generate and print the transcript index from S3:

```bash
go run ./cmd/podcast-index
```

Write the generated index back to `transcripts/transcripts.json`:

```bash
go run ./cmd/podcast-index --write
```

## Lambda transport

`main.go` starts the Lambda runtime and classifies direct, EventBridge, and API
Gateway v2 envelopes before dispatching actions. Direct invocations first decode
only the `action` discriminator, then decode the fields for that action.
EventBridge events remain acknowledged with `{"ok":true}`; API Gateway v2 remains
explicitly unsupported. Unknown direct actions return an error rather than
invoking an unrelated handler. `logger.go` handles daily logs; `podscriber.go`
handles queue and worker actions.

The external JSON contract remains compatible with `backend-old/`:

- `{"action":"health-check"}` returns `{"ok":true}`.
- `{"action":"get-daily-log"}` returns `{"title":"YYYY-MM-DD.md","contents":"<base64>"}`.
- `{"action":"post-daily-log","title":"YYYY-MM-DD.md","contents":"<base64>"}`
  validates today's Berlin filename, saves the decoded bytes, and echoes the
  trimmed title and original base64 string.
- `{"action":"queue-podcast-transcription","text":"<Podcast Addict URL or share text>"}`
  returns `{"podcast":{...},"transcription_lambda_id":"<AWS request ID>"}` and
  invokes the same function asynchronously with
  `{"action":"process-podcast-transcription","podcast":{...}}`.
- The worker accepts the original nested `podcast.source`, `podcast.podcast`,
  and `podcast.episode` fields (including `episode.audio_url`). It returns and
  publishes `{"podcast":{...},"deepgram":{...}}`, then refreshes the transcript
  index. Publishing failures fail the invocation so AWS can retry.

Lambda queue input remains Podcast Addict-only. YouTube and direct audio input
return an unsupported-source error at the Lambda transport boundary; support
for those inputs remains available through the CLI. The worker consumes
previously prepared metadata without fetching the episode page again.

Build the Lambda executable from `backend/`:

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o /tmp/backend-bootstrap .
```

The executable requires the AWS Lambda Runtime API; use the existing `cmd/`
tools for local operations, or `go test .` for credential-free dispatch tests.
Lambda uses `AWS_LAMBDA_FUNCTION_NAME` for self-invocation, ambient AWS
credentials for Lambda/S3, `DEEPGRAM_API_KEY`, and Google ADC (the existing
`gcp-credentials.json` federation configuration in AWS). It needs the same IAM
permissions as the previous backend.

## Lambda container image

The backend is packaged as an AWS Lambda container image. Build and push a fresh
image from the repository root:

```bash
./backend/build-and-push-image.sh
```

The script prints an immutable ECR image URI consumed by the backend stack. The
image starts the Lambda bootstrap and bundles `/gcp-credentials.json`, the
non-secret Google Workload Identity Federation configuration used by daily-log
actions.

## Format, lint, test, and build

Run from `backend/`:

```bash
go fmt ./...
golangci-lint run ./...
go test ./...
go build ./...
```
