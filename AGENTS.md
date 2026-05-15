## Version Control
When developing locally, this repo uses Jujutsu (jj) as the version control system, on top of a colocated Git repo. If you are in a worktree, the colocated Git repo will be found in the default location indicated in .jj/repo 

Always attempt to use jj first, falling back to Git only if there are no traces of jj.

## READMEs
READMEs should contain instructions to
- get started with development
- instructions to run any tools that are part of the codebase

Always update the README if something changes in either of those categories.

Always read the READMEs before reading the code when trying to figure out something.

## Code comments
Whenever writing code, add terse comments around data structures to indicate what they are for. Whenever a piece of code has complicated or intricate logic, comment clearly to explain the behavior.

## Code changes
After every code change, make sure you format, lint and build the code.

## AWS
Use the aws CLI tool to check the resources in AWS and monitor logs. Ensure you are logged and if not prompt the user to login separately and return.

For logs, prefer `aws logs start-query` instead of `aws logs filter` because the former sometimes handles things like UUIDs better.

## Github Actions Convention
Keep workflow YAML files declarative. Do not inline multiline or complex bash in `run:` blocks — extract any non-trivial shell logic into a script under .github/scripts/ and call it from the workflow step.

## Cursor Cloud specific instructions

### Project overview

This is a monorepo with three independent sub-projects. See each sub-project's README for detailed commands.

| Sub-project | Language | Purpose |
|---|---|---|
| `app/` | TypeScript (React 19, TanStack Start, Vite 8) | SSR web app on port 3000 |
| `backend/` | Go 1.26.3 | Lambda backend (podcast transcription, daily log) |
| `infra/` | TypeScript (AWS CDK) | Infrastructure-as-code |

### Quick reference

| Task | Command |
|---|---|
| App dev server | `cd app && npm run dev` |
| App lint+format | `cd app && npm run check` |
| App tests | `cd app && npm run test` |
| Backend health-check | `cd backend && printf '{"action":"health-check"}' \| go run . invoke` |
| Backend lint | `cd backend && golangci-lint run ./...` |
| Backend tests | `cd backend && go test ./...` |
| Infra synth | `cd infra && npm run synth` |

### Non-obvious caveats

- No Jujutsu (jj) is present in the Cloud Agent VM; use git directly.
- Go 1.26.3 is required (the update script installs it to `/usr/local/go`). Ensure `/usr/local/go/bin` is on PATH.
- `golangci-lint` is installed to `/usr/local/bin` by the update script.
- The app dev server (`npm run dev`) automatically invokes the local Go backend via `go run . invoke` when `BACKEND_LAMBDA_FUNCTION_NAME` is not set. No separate backend server process is needed.
- External APIs (S3 for transcripts, Google Drive for logger, Deepgram for transcription) require credentials not available in the Cloud Agent VM; the transcript reader fetches data from S3 at runtime so it works when AWS creds are present in the environment. Admin features (logger, podscriber) require Google OAuth which cannot be tested headlessly.
- The `infra/` CDK synth can run without AWS credentials; deployment (`deploy.sh`) requires them.
