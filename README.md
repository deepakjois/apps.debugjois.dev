code and infra for apps.debugjois.dev.

see README in the subfolders for more details.

## Folders

- `app/` - TanStack Start/Nitro app for `apps.debugjois.dev`
- `backend/` - Go podcast transcription tools, CLIs, and Lambda container image
- `backend-v2/` - Refactored Go backend packages and daily-log CLI
- `infra/` - AWS CDK infrastructure for the Nitro app

## Orb development

Fresh Amp orbs run `.agents/setup` to install the pinned Node.js, npm, and Go
toolchains, AWS CLI, `zip`, `golangci-lint`, and all locked dependencies. Run it
manually to prepare another Debian-based development machine:

```sh
.agents/setup
```

Builds and tests need no credentials. Deployment and integrations still require
the AWS, Google Drive, Deepgram, or LinkPreview credentials described in the
subproject READMEs.
