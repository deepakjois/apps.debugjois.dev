# backend-v2

Refactored Go backend packages and CLIs for daily logs and podcast transcription. Application packages are independent of their external-service adapters and CLI transports so they can also be used by a future Lambda.

## Requirements

- Go 1.26.8+
- `golangci-lint` on `PATH`
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

Run from `backend-v2/`. `read` prints today's raw Markdown log to stdout:

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
only resolves the source and prints the JSON handoff that a queue Lambda would
send to a transcription worker; this mode does not require a Deepgram key:

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
opts into the S3 adapter only with `-publish`; a future Lambda transport can
publish every successful transcription without putting that policy in the
transcription service.

Podcast Addict share text containing newlines must be quoted when passed as an
argument, or it can be piped through stdin. The reusable
`podscriber/resolvers` and `podscriber/deepgram` packages retain source metadata
and the complete raw Deepgram response for non-CLI transports.

YouTube resolution downloads media to a local temporary file. Parse-only JSON
therefore demonstrates the handoff shape, but that local path is removed when
the CLI exits. Before splitting YouTube processing across asynchronous Lambda
invocations, the queue stage must put the downloaded media in shared storage,
or the worker stage must perform the `yt-dlp` resolution itself.

## Container image

Build the CLI image from `backend-v2/`:

```bash
docker build -t apps-debugjois-dev-backend-v2 .
```

The image includes both `/daily-log` (the default entrypoint) and `/podscriber`,
along with `yt-dlp` and FFmpeg. It also includes the same non-secret Google
Workload Identity Federation credential configuration as the original backend.
Set `GOOGLE_APPLICATION_CREDENTIALS=/gcp-credentials.json` when running daily
logs in AWS.

Run podscriber from the image by overriding the entrypoint and injecting the
Deepgram secret as `DEEPGRAM_API_KEY`:

```bash
docker run --rm \
  --env DEEPGRAM_API_KEY \
  --entrypoint /podscriber \
  apps-debugjois-dev-backend-v2 \
  'https://www.youtube.com/watch?v=example'
```

## Format, lint, test, and build

Run from `backend-v2/`:

```bash
go fmt ./...
golangci-lint run ./...
go test ./...
go build ./...
```
