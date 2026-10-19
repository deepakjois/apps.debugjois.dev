# Backend

Go Lambda backend and standalone CLIs for daily logs, podcast transcription,
and transcript indexing. Commands below run from `backend/` unless marked
otherwise.

## Install and check

Enter the repository development environment as described in the
[root README](../README.md#development-environment) (Nix installation, flakes,
`nix develop`, or direnv). The flake supplies Go and runtime tools; helper
versions are pinned separately in `scripts/install-go-tools.sh`, which uses
`go install` to build `gopls`, `golangci-lint`, `govulncheck`, `go-mod-upgrade`,
and `gomajor` with the active Go toolchain.

For local development, run from the repository root:

```bash
./scripts/install-go-tools.sh
(cd backend && go mod download)
```

The dev shell and orb environment configure
`GOBIN=$HOME/.cache/apps-debugjois-dev/go-tools/bin` and add it to `PATH`.
Fresh Amp orbs run `.agents/setup` automatically to install dependencies and
helpers; no separate manual install is needed there.

Format, lint, test, and build from `backend/`:

```bash
go fmt ./...
golangci-lint run ./...
go test ./...
go build ./...
```

Tests and builds need no credentials. Live integrations need the credentials
below. Publishing, index writes, image pushes, and deployment commands modify
AWS resources; they are not verification steps.

## Authentication and runtime setup

| Operation                                  | Requirements                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Daily-log CLI                              | Google Drive Application Default Credentials (ADC)                                                      |
| `podscriber -parse`                        | No Deepgram key; source resolution may access the network                                               |
| Transcription                              | `DEEPGRAM_API_KEY`                                                                                      |
| `podscriber -publish`                      | AWS credentials with transcript S3 read/write permissions                                               |
| `podcast-index` (including read-only mode) | AWS credentials with transcript S3 read/list permissions; `--write` also needs write permission         |
| `youtube-transcript` publishing            | AWS credentials/region, `BACKEND_LAMBDA_FUNCTION_NAME`, and `lambda:InvokeFunction` on that function    |
| Image push / deployment                    | AWS credentials authorized for ECR / infrastructure deployment; Docker with buildx installed separately |

AWS clients use the normal credential and region chain. YouTube downloads need
current `yt-dlp`, `ffmpeg`/`ffprobe`, and Deno on `PATH`, supplied by the flake.
These tools run locally, not in the Lambda image.

### Local Google Drive ADC

The Drive adapter expects the `obsidian` shared drive and its
`PersonalKnowledgeWiki/daily` folder. The service account must have access to
that drive, and your Google identity must be allowed to impersonate it.
Quote the full email so the ADC impersonation URL is written correctly:

```bash
gcloud auth application-default login \
  --impersonate-service-account='gdrive-obsidian@daily-notes-obsidian-gdrive.iam.gserviceaccount.com' \
  --scopes='https://www.googleapis.com/auth/drive'
```

If `GOOGLE_APPLICATION_CREDENTIALS` points to another configuration, unset it
before using local ADC.

### Amp orb Google federation

No `gcloud` login or Google secret is needed in an authorized orb. Set these
Amp project environment variables:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/home/user/workspace/repo/backend/gcp-credentials-orb.json
GOOGLE_EXTERNAL_ACCOUNT_ALLOW_EXECUTABLES=1
```

`gcp-credentials-orb.json` is non-secret. Its executable source,
`scripts/amp-gcp-token.sh`, calls `amp orb id-token` for a project-scoped OIDC
token. Google exchanges it through `amp-orbs-pool` / `amp-orb-provider` and
impersonates the same Drive service account. The checked-in config uses an
absolute orb path; adjust it if the checkout moves. Federation is restricted to
the Amp user and project in the provisioning section below, not every orb user.

## CLI usage

### Daily logs

```bash
go run ./cmd/daily-log read
printf '### Today\n\nUpdated text\n' | go run ./cmd/daily-log write
```

`read` prints today's raw Markdown; `write` replaces it with stdin. Dates and
filenames use `Europe/Berlin`. A missing log reads as `### YYYY-MM-DD` plus a
newline and is created only on write.

### Podscriber

Accepts Podcast Addict episode URLs or share text, YouTube URLs, and direct
HTTP(S) audio URLs. Pass one quoted argument (including any share-text newlines)
or pipe input through stdin. Put flags before the argument.

```bash
go run ./cmd/podscriber -parse 'https://example.com/episode.mp3'
printf '%s\n' 'https://example.com/episode.mp3' | go run ./cmd/podscriber
go run ./cmd/podscriber -output transcript.txt 'https://youtu.be/example'
go run ./cmd/podscriber -publish -output transcript.txt 'https://example.com/episode.mp3'
```

Set `DEEPGRAM_API_KEY` for transcription. By default, only transcript text goes
to stdout; `-output` writes that text to a file. `-publish` additionally writes
the full result to S3 and refreshes the public transcript index.

`-parse` prints the internal JSON transcription input without transcribing and
cannot be combined with `-publish` or `-output`. It is not the Lambda queue
envelope. YouTube resolution still downloads and converts audio to mono VBR
MP3 (quality 6); its temporary files are removed when the command exits, so a
parse-only local media path cannot be replayed later or sent to a worker.

### Local YouTube transcription → Lambda publishing

Use `youtube-transcript` to download and transcribe locally, then synchronously
ask Lambda to publish the completed result and refresh the index:

```bash
export DEEPGRAM_API_KEY='your-deepgram-api-key'
export BACKEND_LAMBDA_FUNCTION_NAME='your-backend-function-name'
go run ./cmd/youtube-transcript 'https://www.youtube.com/watch?v=example'
```

**By default, yt-dlp reads cookies from local Chrome.** Decryption requires the
same desktop user, Chrome profile, and unlocked system keychain/keyring. An orb
does not automatically have your desktop cookies. Use `--no-cookies` to avoid
browser-cookie access (YouTube may still require authentication):

```bash
go run ./cmd/youtube-transcript --no-cookies --no-publish 'https://youtu.be/example'
go run ./cmd/youtube-transcript --no-cookies -o /tmp/payload.json 'https://youtu.be/example'
jq '.transcription.transcript.text' /tmp/payload.json
```

`--no-publish` prints the publish payload instead of calling AWS. `-o <file>`
implies `--no-publish` and saves the same payload. Both still transcribe with
Deepgram, but need neither AWS credentials nor `BACKEND_LAMBDA_FUNCTION_NAME`.
Temporary media is removed; the completed payload contains no media URL or
local path. Deepgram uses Nova 3 with a ten-minute request timeout.

Replay a saved payload to publish it (this writes to AWS):

```bash
aws lambda invoke --function-name "$BACKEND_LAMBDA_FUNCTION_NAME" \
  --cli-binary-format raw-in-base64-out \
  --payload file:///tmp/payload.json /tmp/publish-response.json
```

The direct synchronous request must fit Lambda's request payload limit.
Successful publishing returns `{"ok":true}` after upload and index refresh.

### Transcript index

Both commands read S3 and print the generated index; only `--write` updates
`transcripts/transcripts.json` in the bucket:

```bash
go run ./cmd/podcast-index
go run ./cmd/podcast-index --write
```

## Lambda runtime and deployment

`main.go` starts the Lambda runtime, not a local HTTP server. Use the CLIs for
local operations. There is **no API Gateway**: API Gateway v2 events are
explicitly rejected; EventBridge events are acknowledged with `{"ok":true}`.
Unknown direct actions fail.

### Direct invocation contracts

| Action                            | Input and result                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `health-check`                    | Returns `{"ok":true}`                                                                                                                                                                                                                             |
| `get-daily-log`                   | Returns `{"title":"YYYY-MM-DD.md","contents":"<base64>"}`                                                                                                                                                                                         |
| `post-daily-log`                  | Takes `title` and base64 `contents`; validates today's Berlin filename, saves decoded bytes, and echoes the trimmed title and original base64 string                                                                                              |
| `queue-podcast-transcription`     | Takes `text` (Podcast Addict URL/share text); returns `{"podcast":{...},"transcription_lambda_id":"<AWS request ID>"}` and asynchronously self-invokes the worker                                                                                 |
| `process-podcast-transcription`   | Takes nested `podcast.source`, `podcast.podcast`, and `podcast.episode` (including `audio_url`); transcribes without re-fetching the episode page, publishes `{"podcast":{...},"deepgram":{...}}`, refreshes the index, and returns that document |
| `publish-completed-transcription` | Takes `transcription`, the media-free completed result generated by `youtube-transcript`; validates schema/source/provider/raw transcript JSON, publishes, refreshes the index, and returns `{"ok":true}`                                         |

Each direct request includes `"action":"<action-name>"`. The queue accepts
**only Podcast Addict**, not YouTube or direct audio URLs. The queue sends
`{"action":"process-podcast-transcription","podcast":{...}}` to the same
function. Successful worker and completed-result actions always publish;
publishing failures fail the invocation so AWS can retry. The Lambda preserves
the deployed reader-compatible document format and object identity.

### Runtime configuration

The final container is a `scratch` image containing a static Linux/amd64
bootstrap, CA certificates, timezone data, and the non-secret Google AWS
federation config at `/gcp-credentials.json`. It does not contain the local
YouTube download tools or Google service-account keys.

The backend stack sets `GOOGLE_APPLICATION_CREDENTIALS=/gcp-credentials.json`
and injects `DEEPGRAM_API_KEY` from Secrets Manager. Lambda provides ambient AWS
credentials/region and `AWS_LAMBDA_FUNCTION_NAME` for self-invocation. Its role
needs self-invoke and transcript S3 access; the Google federation provider must
authorize that AWS role to impersonate the Drive service account. See the
[infrastructure README](../infra/README.md) for deployment and secret setup.

### Build and push

Docker builds remain conventional Docker builds, separate from Nix. The required
`GO_VERSION` build argument comes from the active development Go toolchain,
not a second numeric pin. For a local image, from `backend/`:

```bash
docker build --build-arg GO_VERSION="$(go env GOVERSION | sed 's/^go//')" \
  -t apps-debugjois-dev-backend .
```

From the repository root, build and push to the existing ECR repository:

```bash
./backend/build-and-push-image.sh
```

The script derives `GO_VERSION` from `go env GOVERSION`, builds with buildx,
pushes the image, and prints its immutable ECR digest URI. To provision ECR and
build, push, and deploy the backend through the infrastructure workflow:

```bash
(cd infra && ./deploy.sh --with-backend-image)
```

These commands require Docker/buildx and AWS authorization and change AWS state.
For a credential-free executable build only:

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o /tmp/backend-bootstrap .
```

The executable itself requires the AWS Lambda Runtime API to run.

## One-time cloud-admin provisioning: orb Google federation

This is administrator setup, not part of installing dependencies. The current
provider permits one Amp project/user pair. A GCP project owner provisions it
with the following commands; changing the identity also requires updating the
condition and service-account binding together:

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
