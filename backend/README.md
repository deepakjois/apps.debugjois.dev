# backend

Go backend Lambda and standalone CLIs for daily logs, podcast transcription,
and transcript index generation. Application packages are independent of their
external-service adapters and transports.

## Requirements

- Go 1.26.8+
- `golangci-lint` on `PATH`
- AWS credentials for transcript publishing or index generation with `--write`
- Google Drive Application Default Credentials for daily logs
- A current `yt-dlp` on `PATH` for YouTube transcription
- `ffmpeg` and `ffprobe` on `PATH` for YouTube audio conversion
- Deno 2+ on `PATH` for yt-dlp's YouTube JavaScript challenges
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
Deepgram. YouTube sources are downloaded with `yt-dlp`, converted to a mono
VBR MP3 at audio quality 6, and placed in a temporary directory that is removed
after transcription.

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

## Local YouTube transcription and Lambda publishing

`youtube-transcript` avoids downloading from YouTube inside Lambda. It accepts a
YouTube URL as its argument, downloads and transcribes the video locally,
removes the temporary media path from the completed result, and synchronously
asks the backend Lambda to publish the transcript and refresh the index:

```bash
export DEEPGRAM_API_KEY='your-deepgram-api-key'
export BACKEND_LAMBDA_FUNCTION_NAME='your-backend-function-name'
go run ./cmd/youtube-transcript 'https://www.youtube.com/watch?v=example'
```

By default, the command asks `yt-dlp` to read cookies from the local Chrome
profile. Cookie decryption requires running as the same desktop user with
access to Chrome's profile and unlocked system keychain or keyring. To download
without browser cookies instead:

```bash
go run ./cmd/youtube-transcript --no-cookies \
  'https://www.youtube.com/watch?v=example'
```

The command uses the normal AWS credential and region chain and prints the
Lambda response (`{"ok":true}`) after both the transcript upload and index
refresh succeed. Local Deepgram requests use the same Nova 3 options as the
backend and have a ten-minute timeout. The CLI generates the JSON action payload
shown below; callers do not need to construct it themselves.

The CLI invokes this direct Lambda action:

```json
{
  "action": "publish-completed-transcription",
  "transcription": {
    "schema_version": 1,
    "source": {
      "type": "youtube",
      "input": "https://youtu.be/example",
      "url": "https://www.youtube.com/watch?v=example"
    },
    "metadata": {
      "title": "Video title",
      "published_date": "2026-09-10",
      "series": { "title": "Channel", "url": "https://www.youtube.com/@channel" }
    },
    "transcript": {
      "text": "Plain transcript text",
      "provider": "deepgram",
      "request_id": "request-id",
      "raw": { "metadata": {}, "results": {} }
    }
  }
}
```

The portable action contract deliberately contains no media URL or local file
path. Lambda validates the schema, source identity, provider, and raw transcript
JSON before writing the existing reader-compatible document to S3. The caller
needs `lambda:InvokeFunction` permission for the backend function. As a direct
synchronous Lambda invocation, the complete JSON request must fit AWS Lambda's
request payload limit.

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
- `{"action":"publish-completed-transcription","transcription":{...}}` accepts
  a completed, media-free local transcription, publishes the same compatible
  document shape, refreshes the index, and returns `{"ok":true}`.

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
