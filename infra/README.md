# infra

Bootstrap-free AWS infrastructure for `apps.debugjois.dev` with no dependency on the `CdkToolkit` stack.

This CDK app is used only to synthesize CloudFormation templates. It uses `LegacyStackSynthesizer` so the generated cloud assembly does not assume the existence of CDK bootstrap roles, bootstrap buckets, or the `CdkToolkit` stack. Deployments are handled by `infra/deploy.sh`, which uses `aws cloudformation deploy`, `aws s3 sync`, and `aws cloudfront create-invalidation` directly.

# Stacks

- `AppsDebugJoisDevAccessStack` in `us-west-2` manages the dedicated CloudFormation service role and the GitHub Actions OIDC role used by this repo.
- `AppsDebugJoisDevArtifactStack` in `us-west-2` creates the versioned S3 bucket for Lambda artifacts and the ECR repository for backend images.
- `AppsDebugJoisDevCertificateStack` in `us-east-1` creates the ACM certificate for `apps.debugjois.dev`.
- `AppDebugJoisDevBackendStack` in `us-west-2` creates the Go backend Lambda and Deepgram API key secret.
- `AppsDebugJoisDevSiteStack` in `us-west-2` creates the static asset bucket, Lambda, API Gateway, CloudFront distribution, and Route53 records.

# Getting Started

Install dependencies:

```bash
npm install
```

Synthesize all CloudFormation templates:

```bash
npm run synth
```

# Deploy

Default deploy reuses the currently deployed Lambda artifact and only updates infrastructure:

```bash
./deploy.sh
```

To build, package, upload, and deploy a new frontend Lambda artifact as part of the deploy:

```bash
./deploy.sh --with-artifact
```

To build, push, and deploy a new backend Lambda container image:

```bash
./deploy.sh --with-backend-image
```

The flags can be combined when both app and backend code changed:

```bash
./deploy.sh --with-artifact --with-backend-image
```

The script always:

1. synthesizes the CDK templates during each stack deploy
2. deploys the access, artifact bucket/ECR, and certificate stacks
3. deploys the backend stack when a new backend image is requested or an existing backend stack can reuse its current image
4. deploys the site stack

When `--with-artifact` is passed, the script also:

1. builds the app in `../app`
2. packages `../app/.output/` into `../app/artifacts/lambda-package.zip`
3. hashes the zip bytes
4. uploads the artifact to the versioned artifact bucket using a key like `lambda/app-debugjois-dev-<hash>.zip`
5. passes the uploaded object's S3 version ID into the site stack deploy
6. syncs `../app/.output/public` into the static asset bucket
7. invalidates the CloudFront distribution

Without `--with-artifact`, the script reuses the existing `ArtifactObjectKey` and `ArtifactObjectVersion` from `AppsDebugJoisDevSiteStack`. Without `--with-backend-image`, the script reuses the backend Lambda image currently deployed in `AppDebugJoisDevBackendStack`; if that stack does not exist yet, backend deployment is skipped until a fresh image is built.

# Routing

CloudFront is configured as follows:

- `/assets/*` goes to the static asset S3 bucket
- `/favicon.ico` goes to the static asset S3 bucket
- `/logo192.png` goes to the static asset S3 bucket
- `/logo512.png` goes to the static asset S3 bucket
- `/manifest.json` goes to the static asset S3 bucket
- `/robots.txt` goes to the static asset S3 bucket
- all other paths go to API Gateway and then Lambda

All behaviors use CloudFront's native `redirect-to-https` policy.

# Backend Lambda

`AppDebugJoisDevBackendStack` deploys the Go backend as a Lambda container image with no API Gateway. It supports direct Lambda invocation actions such as `queue-podcast-transcription` and `process-podcast-transcription`. The backend Lambda reads the Deepgram API key from the `apps-debugjois-dev/deepgram-api-key` Secrets Manager secret and writes transcripts to the existing `debugjois-dev-site` transcript bucket.

The site stack still grants the Nitro Lambda generic `lambda:InvokeFunction` permission on `*` so `/admin/podscriber` can invoke a backend Lambda.

# Notes

- The hosted zone is `debugjois.dev`.
- The app domain is `apps.debugjois.dev`.
- Frontend Lambda artifacts are stored in a versioned S3 bucket and the site stack is deployed with both the object key and object version.
- Backend Lambda images are stored in the `apps-debugjois-dev-backend` ECR repository and the backend stack is deployed with a digest-pinned image URI.
- Static frontend assets are uploaded outside CloudFormation by `infra/deploy.sh --with-artifact`.
- CDK-managed assets are intentionally not used in this app. Lambda artifacts and static assets are published explicitly by `infra/deploy.sh`.
- ArtifactStack updates explicitly use the CloudFormation service role exported by `AppsDebugJoisDevAccessStack` so they do not depend on bootstrap execution roles.
