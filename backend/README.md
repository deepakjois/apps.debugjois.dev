# Backend

Go Lambda backend and standalone CLIs for daily logs, podcast transcription,
Miniflux, and the transcript index. Run the commands below from `backend/`
unless marked otherwise.

## Install and check

Enter the repository development environment as described in the
[root README](../README.md#development-environment). The flake supplies Go and
the runtime tools. Helper versions are pinned in `scripts/install-go-tools.sh`,
which builds `gopls`, `golangci-lint`, `govulncheck`, `go-mod-upgrade`, and
`gomajor` with the active Go toolchain.

From the repo root:

```bash
./scripts/install-go-tools.sh
(cd backend && go mod download)
```

The dev shell and the orb environment set
`GOBIN=$HOME/.cache/apps-debugjois-dev/go-tools/bin` and add it to `PATH`. A
fresh Amp orb runs `.agents/setup`, which installs the dependencies and the
helpers, so no manual install is needed there.

Format, lint, test, and build from `backend/`:

```bash
go fmt ./...
golangci-lint run ./...
go vet ./...
go test ./...
go build ./...
```

Tests and builds need no credentials. Live integrations need the credentials
below. Publishing, index writes, image pushes, and deploys change AWS
resources. They are not verification steps.

## Credentials by operation

| Operation                                   | Requirements                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Daily-log CLI                               | Google Drive Application Default Credentials (ADC)                                                                    |
| `podscriber -parse`                         | No Deepgram key. Source resolution may use the network                                                                |
| Transcription                               | `DEEPGRAM_API_KEY`                                                                                                    |
| `podscriber -publish`                       | AWS credentials with transcript S3 read and write permissions                                                         |
| Miniflux entries (`miniflux`, `podscriber`) | `MINIFLUX_API_TOKEN` from Miniflux Settings, API Keys. Optional `MINIFLUX_URL` (default `https://reader.miniflux.app`) |
| `miniflux queue-starred`                    | Miniflux token plus AWS credentials and region, `BACKEND_LAMBDA_FUNCTION_NAME`, and `lambda:InvokeFunction`           |
| `podcast-index` (including read-only mode)  | AWS credentials with transcript S3 read and list permissions. `--write` also needs write permission                   |
| `youtube-transcript` publishing             | AWS credentials and region, `BACKEND_LAMBDA_FUNCTION_NAME`, and `lambda:InvokeFunction` on that function             |
| Image push and deployment                   | AWS credentials authorized for ECR and infrastructure deployment. Docker with buildx installed separately             |

AWS clients use the normal credential and region chain. YouTube downloads need
current `yt-dlp`, `ffmpeg` and `ffprobe`, and Deno on `PATH`, which the flake
supplies. These tools run locally, not in the Lambda image.

### Local Google Drive ADC

The Drive adapter expects the `obsidian` shared drive and its
`PersonalKnowledgeWiki/daily` folder. The service account must have access to
that drive, and your Google identity must be allowed to impersonate it. Quote
the full email so the ADC impersonation URL is written correctly:

```bash
gcloud auth application-default login \
  --impersonate-service-account='gdrive-obsidian@daily-notes-obsidian-gdrive.iam.gserviceaccount.com' \
  --scopes='https://www.googleapis.com/auth/drive'
```

If `GOOGLE_APPLICATION_CREDENTIALS` points at another configuration, unset it
before using local ADC.

### Amp orb Google federation

An authorized orb needs no `gcloud` login and no Google secret. Set these Amp
project environment variables:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/home/user/workspace/repo/backend/gcp-credentials-orb.json
GOOGLE_EXTERNAL_ACCOUNT_ALLOW_EXECUTABLES=1
```

`gcp-credentials-orb.json` is non-secret. Its executable source,
`scripts/amp-gcp-token.sh`, calls `amp orb id-token` for a project-scoped OIDC
token. Google exchanges it through the `amp-orbs-pool` pool and the
`amp-orb-provider` provider and impersonates the same Drive service account.
The checked-in config uses an absolute orb path. Adjust it if the checkout
moves. Federation is restricted to the Amp user and project named in the
[provisioning section](#provision-the-orb-google-federation-once), not to
every orb user.

## CLI usage

### Daily logs

```bash
go run ./cmd/daily-log read
printf '### Today\n\nUpdated text\n' | go run ./cmd/daily-log write
```

`read` prints today's raw Markdown. `write` replaces it with stdin. Dates and
filenames use `Europe/Berlin`. A missing log reads as `### YYYY-MM-DD` plus a
newline and is created only on write.

### Podscriber

Accepts Podcast Addict episode URLs or share text, Miniflux entry URLs when
`MINIFLUX_API_TOKEN` is set, YouTube URLs, and direct HTTP(S) audio URLs. Pass
one quoted argument, including any share-text newlines, or pipe the input
through stdin. Put flags before the argument.

```bash
go run ./cmd/podscriber -parse 'https://example.com/episode.mp3'
printf '%s\n' 'https://example.com/episode.mp3' | go run ./cmd/podscriber
go run ./cmd/podscriber -output transcript.txt 'https://youtu.be/example'
go run ./cmd/podscriber -publish -output transcript.txt 'https://example.com/episode.mp3'
```

Set `DEEPGRAM_API_KEY` for transcription. By default only the transcript text
goes to stdout. `-output` writes that text to a file. `-publish` also writes
the full result to S3, refreshes the public transcript index, and unstars a
Miniflux source entry.

`-parse` prints the internal JSON transcription input without transcribing. It
cannot be combined with `-publish` or `-output`, and it is not the Lambda queue
envelope. YouTube resolution still downloads and converts the audio to mono
VBR MP3 at quality 6. The temporary files are removed when the command exits,
so a parse-only local media path cannot be replayed later or sent to a worker.

### Miniflux

Miniflux entries are read through the REST API with `MINIFLUX_API_TOKEN` as
`X-Auth-Token`. The instance defaults to `https://reader.miniflux.app`. Set
`MINIFLUX_URL` or pass `-url` for a self-hosted one. A trailing `/v1` is fine.
Entry URLs are any web UI route ending in `/entry/<id>`, for example
`/starred/entry/<id>` or `/feed/<feed>/entry/<id>`, or `/v1/entries/<id>` on
that host.

```bash
export MINIFLUX_API_TOKEN='your-miniflux-api-token'
go run ./cmd/miniflux entry 'https://reader.miniflux.app/starred/entry/123'
go run ./cmd/miniflux entry 123            # bare entry ID
go run ./cmd/miniflux starred              # every starred entry
go run ./cmd/miniflux queue-starred -dry-run
go run ./cmd/miniflux queue-starred        # writes to AWS
go run ./cmd/miniflux unstar 123           # entry URL or ID
go run ./cmd/podscriber -parse 'https://reader.miniflux.app/starred/entry/123'
```

- `entry` prints the same transcription input as `podscriber -parse`: the
  entry title, feed (series), show notes as HTML and plain text, publish date,
  duration, and the first audio enclosure. Cover-image enclosures are skipped
  and Miniflux media-proxy URLs are decoded to the original audio URL. The
  duration is Miniflux's `reading_time`, which for podcast feeds is
  `itunes:duration` truncated to minutes.
- `starred` prints every starred entry and parses those with audio. It exits
  non-zero only if a podcast entry fails to parse. Articles are listed with
  `has_audio: false`.
- `queue-starred` runs the same iteration as the Lambda's
  `queue-miniflux-starred` action. Each starred entry with audio is sent, one
  URL per call, to the Lambda's `queue-podcast-transcription` action with
  `skip_existing`, so episodes that already have a transcript are not
  transcribed again. It prints a per-entry report (`queued`,
  `already_transcribed`, `no_audio`, `dry_run`, `failed`) and exits non-zero
  if any entry failed. `-dry-run` lists entries without AWS access.
- `unstar` removes an entry's star. Miniflux exposes only a star toggle, so
  the current state is read first and an unstarred entry is left unchanged.
- Both the Lambda worker and `podscriber -publish` unstar a Miniflux episode
  after its transcript is published. An unstar failure is only logged or
  printed as a warning, because the transcript already exists. A still-starred
  entry is reported as `already_transcribed` by `queue-starred`.

### YouTube transcription with Lambda publishing

`youtube-transcript` downloads and transcribes locally, then asks the Lambda
synchronously to publish the completed result and refresh the index:

```bash
export DEEPGRAM_API_KEY='your-deepgram-api-key'
export BACKEND_LAMBDA_FUNCTION_NAME='your-backend-function-name'
go run ./cmd/youtube-transcript 'https://www.youtube.com/watch?v=example'
```

By default, yt-dlp reads cookies from local Chrome. Decryption needs the same
desktop user, Chrome profile, and an unlocked system keychain or keyring. An
orb does not have your desktop cookies. Use `--no-cookies` to skip browser
cookies. YouTube may still require authentication:

```bash
go run ./cmd/youtube-transcript --no-cookies --no-publish 'https://youtu.be/example'
go run ./cmd/youtube-transcript --no-cookies -o /tmp/payload.json 'https://youtu.be/example'
jq '.transcription.transcript.text' /tmp/payload.json
```

`--no-publish` prints the publish payload instead of calling AWS. `-o <file>`
implies `--no-publish` and saves the same payload. Both still transcribe with
Deepgram but need neither AWS credentials nor `BACKEND_LAMBDA_FUNCTION_NAME`.
Temporary media is removed, and the completed payload contains no media URL or
local path. Deepgram uses Nova 3 with a ten-minute request timeout.

Replay a saved payload to publish it. This writes to AWS:

```bash
aws lambda invoke --function-name "$BACKEND_LAMBDA_FUNCTION_NAME" \
  --cli-binary-format raw-in-base64-out \
  --payload file:///tmp/payload.json /tmp/publish-response.json
```

The synchronous request must fit Lambda's request payload limit. Successful
publishing returns `{"ok":true}` after the upload and the index refresh.

### Transcript index

Both commands read S3 and print the generated index. Only `--write` updates
`transcripts/transcripts.json` in the bucket. It writes conditionally on the
index's ETag and retries once on a conflict. A rebuild keeps each item's
optional `archived` flag from the current index, since transcript objects do
not record it:

```bash
go run ./cmd/podcast-index
go run ./cmd/podcast-index --write
```

### Transcript reader

`transcript-reader` reads the public index at
`https://www.debugjois.dev/transcripts/transcripts.json`, which needs no
credentials. It lists the transcripts newest first in a terminal picker. Press
`/` to filter, `enter` to apply the filter, and `enter` again to choose. It
then prints the chosen transcript as Markdown on stdout. The picker draws on
stderr, so pipe stdout to a viewer:

```bash
go run ./cmd/transcript-reader > /tmp/transcript.md
go install ./cmd/transcript-reader
transcript-reader | open -f -a 'Your Markdown App'
```

Quitting without a choice (`q` or `esc`) exits non-zero and prints nothing.

`--edit` reads the index from S3 instead, so it needs AWS credentials, and
writes to production when you save:

```bash
go run ./cmd/transcript-reader --edit
```

Press `a` to mark the selected transcript for archiving and `d` to mark it for
deletion. The two marks replace each other, and pressing a key again clears its
mark. `a` on an archived transcript marks it for unarchiving. Marked
transcripts show a colored label: `▣ archive`, `✗ delete`, or `□ unarchive`.
Archived ones show `▣ archived` in both modes. A dimmed status line counts the
pending changes. `enter` saves them and `q` quits without saving.

Saving sets `"archived": true` on archived items in the index and removes
deleted items. The index write is conditional on the ETag read at startup. If
anything else wrote the index since then, nothing is saved, and you must rerun.
After the index is written, the deleted transcripts' JSON objects are removed
from the bucket, so a later rebuild does not list them again. Consumers treat
`archived` as optional. Unarchived items omit it.

## Lambda runtime

`main.go` starts the Lambda runtime, not a local HTTP server. Use the CLIs for
local operations. There is no API Gateway. API Gateway v2 events are rejected,
EventBridge events are acknowledged with `{"ok":true}`, and unknown direct
actions fail.

### Direct invocation actions

Each direct request includes `"action":"<action-name>"`.

| Action                            | Input and result                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `health-check`                    | Returns `{"ok":true}`                                                                                                                                                                                                                                                                                                                            |
| `get-daily-log`                   | Returns `{"title":"YYYY-MM-DD.md","contents":"<base64>"}`                                                                                                                                                                                                                                                                                        |
| `post-daily-log`                  | Takes `title` and base64 `contents`. Validates today's Berlin filename, saves the decoded bytes, and echoes the trimmed title and the original base64 string                                                                                                                                                                                     |
| `queue-podcast-transcription`     | Takes `text` (Podcast Addict URL or share text, or a Miniflux entry URL) and optional `skip_existing`. Returns `{"podcast":{...},"transcription_lambda_id":"<AWS request ID>"}` and asynchronously self-invokes the worker. With `skip_existing: true`, an episode already published returns `{"podcast":{...},"existing_transcript":"<URL>"}` instead |
| `queue-miniflux-starred`          | Takes optional `dry_run`. Sends each starred Miniflux entry with audio to `queue-podcast-transcription` by synchronous self-invocation with `skip_existing: true`, and returns `{"entries":[...],"counts":{...}}`. Per-entry failures are reported and logged, not raised                                                                          |
| `process-podcast-transcription`   | Takes nested `podcast.source`, `podcast.podcast`, and `podcast.episode` including `audio_url`. Transcribes without re-fetching the episode page, publishes `{"podcast":{...},"deepgram":{...}}`, refreshes the index, unstars a Miniflux source entry, and returns that document                                                                 |
| `publish-completed-transcription` | Takes `transcription`, the media-free completed result from `youtube-transcript`. Validates the schema, source, provider, and raw transcript JSON, publishes, refreshes the index, and returns `{"ok":true}`                                                                                                                                      |

The queue accepts only Podcast Addict and Miniflux entry URLs, not YouTube or
direct audio URLs. Miniflux requires `MINIFLUX_API_TOKEN` in the Lambda
environment. The queue sends
`{"action":"process-podcast-transcription","podcast":{...}}` to the same
function. The worker and the completed-result action always publish, and a
publishing failure fails the invocation so that AWS can retry. The Lambda
preserves the deployed reader-compatible document format and object identity.

The backend stack runs `queue-miniflux-starred` daily at 04:00 UTC through an
EventBridge rule. See the
[infra README](../infra/README.md#daily-miniflux-run). To run it by hand
against the deployed function, which writes to AWS unless `dry_run` is set:

```bash
aws lambda invoke --function-name "$BACKEND_LAMBDA_FUNCTION_NAME" \
  --cli-binary-format raw-in-base64-out \
  --cli-read-timeout 900 \
  --payload '{"action":"queue-miniflux-starred"}' /tmp/starred-response.json
jq '.counts' /tmp/starred-response.json
```

Preview with `{"action":"queue-miniflux-starred","dry_run":true}`.

### Runtime configuration

The final container is a `scratch` image with a static Linux amd64 bootstrap,
CA certificates, timezone data, and the non-secret Google AWS federation
config at `/gcp-credentials.json`. It contains neither the local YouTube
download tools nor Google service-account keys.

The backend stack sets `GOOGLE_APPLICATION_CREDENTIALS=/gcp-credentials.json`
and injects `DEEPGRAM_API_KEY` and `MINIFLUX_API_TOKEN` from Secrets Manager.
Lambda provides ambient AWS credentials and region and
`AWS_LAMBDA_FUNCTION_NAME` for self-invocation. The role needs self-invoke and
transcript S3 access, and the Google federation provider must authorize that
AWS role to impersonate the Drive service account. See the
[infra README](../infra/README.md#backend-lambda) for deployment and secret
setup.

### Build and push

Docker builds are conventional Docker builds, separate from Nix. The required
`GO_VERSION` build argument comes from the active Go toolchain, not a second
numeric pin. For a local image, from `backend/`:

```bash
docker build --build-arg GO_VERSION="$(go env GOVERSION | sed 's/^go//')" \
  -t apps-debugjois-dev-backend .
```

From the repo root, build and push to the existing ECR repository:

```bash
./backend/build-and-push-image.sh
```

The script derives `GO_VERSION` from `go env GOVERSION`, builds with buildx,
pushes the image, and prints its immutable ECR digest URI. To build, push, and
deploy the backend through the infrastructure script:

```bash
(cd infra && ./deploy.sh --with-backend-image)
```

These commands need Docker buildx and AWS authorization and change AWS state.
For a credential-free executable build only:

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o /tmp/backend-bootstrap .
```

The executable needs the AWS Lambda Runtime API to run.

## Provision the orb Google federation once

This is administrator setup, not part of installing dependencies. The current
provider permits one Amp project and user pair. A GCP project owner provisions
it with the following commands. Changing the identity requires updating the
condition and the service-account binding together:

```bash
gcloud iam workload-identity-pools create amp-orbs-pool \
  --project=daily-notes-obsidian-gdrive --location=global --display-name='Amp orbs'

gcloud iam workload-identity-pools providers create-oidc amp-orb-provider \
  --project=daily-notes-obsidian-gdrive --location=global \
  --workload-identity-pool=amp-orbs-pool \
  --issuer-uri='https://ampcode.com/api/workload-identity' \
  --attribute-mapping='google.subject=assertion.sub,attribute.project_id=assertion.project_id,attribute.user_id=assertion.user_id' \
  --attribute-condition="assertion.project_id == '81f705c8-1f00-4378-b3da-3405d42d8959' && assertion.user_id == 'user_01JS1D88K42WE9W0P5QJY1P21S'"

gcloud iam service-accounts add-iam-policy-binding \
  gdrive-obsidian@daily-notes-obsidian-gdrive.iam.gserviceaccount.com \
  --project=daily-notes-obsidian-gdrive \
  --role=roles/iam.workloadIdentityUser \
  --member='principal://iam.googleapis.com/projects/1016117555218/locations/global/workloadIdentityPools/amp-orbs-pool/subject/user:user_01JS1D88K42WE9W0P5QJY1P21S:project:81f705c8-1f00-4378-b3da-3405d42d8959'
```
