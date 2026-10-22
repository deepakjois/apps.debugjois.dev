# Infrastructure

AWS CDK stacks for `apps.debugjois.dev`, deployed without CDK bootstrap and
with no dependency on the `CdkToolkit` stack.

The CDK app synthesizes CloudFormation templates with `NoAssumeRoleSynthesizer`
in `lib/no-assume-role-synthesizer.ts`, a `BootstraplessSynthesizer` subclass.
The cloud assembly names no bootstrap roles or buckets, so `cdk deploy` runs
with the caller's credentials. For every stack except the access stack, the
synthesizer also tells CloudFormation to execute with the dedicated service
role that the access stack creates. `deploy.sh` runs the `cdk deploy` calls in
order, passes stack outputs to later stacks as parameters, uploads the Lambda
artifact with `aws s3api put-object`, syncs static assets with `aws s3 sync`,
and clears the cache with `aws cloudfront create-invalidation`. CDK-managed
assets are not used.

## Stacks

| Stack                              | Region      | Creates                                                                                                            |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `AppsDebugJoisDevAccessStack`      | `us-west-2` | The CloudFormation service role and the GitHub Actions OIDC role for this repo's `main` branch                     |
| `AppsDebugJoisDevArtifactStack`    | `us-west-2` | The versioned S3 bucket for Lambda zip artifacts and the ECR repository for backend images                         |
| `AppsDebugJoisDevCertificateStack` | `us-east-1` | The ACM certificate for `apps.debugjois.dev`                                                                       |
| `AppDebugJoisDevBackendStack`      | `us-west-2` | The Go backend Lambda, its role, the Deepgram API key secret, and the daily EventBridge rule for Miniflux          |
| `AppsDebugJoisDevSiteStack`        | `us-west-2` | The static asset bucket, the Nitro Lambda, API Gateway, CloudFront, Route53 records, and the LinkPreview secret    |

The GitHub OIDC identity provider is managed outside the access stack, because
an AWS account allows one provider per issuer. The stack references it by ARN.

## Getting started

Enter the [repository Nix environment](../README.md#development-environment),
then install locked dependencies from `infra/`:

```bash
npm ci
```

The CDK CLI is a local dev dependency used by the npm scripts and `deploy.sh`.
Do not install a global copy. The AWS CLI comes from the flake. Docker with
buildx is needed separately, and only for backend container builds.

Synthesize all CloudFormation templates:

```bash
npm run synth
```

The CDK app command in `cdk.json` runs `tsc` to type-check, then runs
`bin/infra.ts` with [tsx](https://tsx.is/), matching the TypeScript template
from `cdk init`. `ts-node` is not used because it is incompatible with
TypeScript 7. `npm run build` only type-checks and emits no files.

## Deploy

Every form of `deploy.sh` writes to AWS. Run from `infra/`.

The default deploy reuses the deployed Lambda artifact and backend image and
updates only infrastructure:

```bash
./deploy.sh
```

To build, package, upload, and deploy a new frontend Lambda artifact:

```bash
./deploy.sh --with-artifact
```

To build, push, and deploy a new backend Lambda container image:

```bash
./deploy.sh --with-backend-image
```

Combine the flags when both app and backend code changed:

```bash
./deploy.sh --with-artifact --with-backend-image
```

The script always:

1. synthesizes the CDK templates during each stack deploy
2. deploys the access, artifact, and certificate stacks
3. deploys the backend stack, with a new image when requested or with the image
   the existing backend stack already runs
4. deploys the site stack, passing it the backend Lambda function name

With `--with-artifact`, the script also:

1. builds the app in `../app`
2. packages `../app/.output/` into `../app/artifacts/lambda-package.zip`
3. hashes the zip bytes
4. uploads the artifact to the versioned artifact bucket under a key like
   `lambda/app-debugjois-dev-<hash>.zip`, or reuses the object if that key
   already exists
5. passes the object's S3 version ID into the site stack deploy
6. syncs `../app/.output/public` into the static asset bucket
7. invalidates the CloudFront distribution

Without `--with-artifact`, the script reuses the `ArtifactObjectKey` and
`ArtifactObjectVersion` parameters of `AppsDebugJoisDevSiteStack`. Without
`--with-backend-image`, it reuses the image the backend Lambda currently runs.
If the backend stack does not exist yet, the deploy stops. Rerun with
`--with-backend-image`.

## Routing

CloudFront routes requests as follows:

- `/assets/*`, `/icons/*`, `/favicon.ico`, `/favicon.svg`,
  `/apple-touch-icon.png`, `/manifest.webmanifest`, and `/robots.txt` go to
  the static asset S3 bucket. Any new top-level file in `app/public/` needs a
  behavior here; put other static files under `app/public/icons/`.
- All other paths go to API Gateway and then the Nitro Lambda.

All behaviors redirect HTTP to HTTPS. The API Gateway behavior uses a custom
cache policy that honors the origin's `Cache-Control` header, keys the cache by
path and query string, and forwards no headers. The managed policy forwards
`host`, which makes API Gateway reject the request.

## Backend Lambda

`AppDebugJoisDevBackendStack` deploys the Go backend as a Lambda container
image with no API Gateway. The app and the CLIs invoke it directly. The
[backend README](../backend/README.md#direct-invocation-actions) lists the
actions.

The Lambda receives `DEEPGRAM_API_KEY` and `MINIFLUX_API_TOKEN` through
CloudFormation Secrets Manager dynamic references, writes transcripts to the
existing `debugjois-dev-site` bucket, and uses Google Drive for the daily-log
actions.

### Secrets

The stack creates the retained `apps-debugjois-dev/deepgram-api-key` secret
with no value. Set it, then redeploy the backend stack so the Lambda
environment picks it up:

```bash
aws secretsmanager put-secret-value \
  --region us-west-2 \
  --secret-id apps-debugjois-dev/deepgram-api-key \
  --secret-string 'your-deepgram-api-key'
```

The stack does not create the Miniflux secret. A stack-created secret would
still be empty when the Lambda's dynamic reference resolves on first deploy.
Create it once before the first backend deploy. Deploys fail while it is
missing:

```bash
aws secretsmanager create-secret \
  --region us-west-2 \
  --name apps-debugjois-dev/miniflux-api-token \
  --description 'Miniflux API token for the apps.debugjois.dev backend' \
  --secret-string 'your-miniflux-api-token'
```

Rotate it with
`aws secretsmanager put-secret-value --secret-id apps-debugjois-dev/miniflux-api-token --secret-string '...'`,
then redeploy the backend stack.

### Daily Miniflux run

The EventBridge rule `QueueMinifluxStarredRule` invokes the backend Lambda
asynchronously every day at 04:00 UTC with `{"action":"queue-miniflux-starred"}`.
That is 05:00 in Berlin in winter and 06:00 in summer, because rule cron
expressions are UTC-only. A Lambda resource-based permission scoped to the
rule's ARN authorizes the call, so EventBridge needs no IAM role. Episodes that
already have a transcript are skipped, so repeated runs are harmless.

Pause the rule with `aws events disable-rule --name <rule-name>`, or change
`scheduleExpression` in `lib/backend-stack.ts`.

### Google Drive federation

The backend Lambda execution role has the stable name
`apps-debugjois-dev-backend-lambda-role` so that GCP Workload Identity
Federation can trust it by subject. The backend image bundles the non-secret
external-account config at `/gcp-credentials.json`, and the stack sets
`GOOGLE_APPLICATION_CREDENTIALS=/gcp-credentials.json`. No Google
service-account key is stored in AWS.

Grant the GCP-side trust for that role with:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  gdrive-obsidian@daily-notes-obsidian-gdrive.iam.gserviceaccount.com \
  --project=daily-notes-obsidian-gdrive \
  --role=roles/iam.workloadIdentityUser \
  --member='principal://iam.googleapis.com/projects/1016117555218/locations/global/workloadIdentityPools/github-actions-pool/subject/apps-debugjois-dev-backend-lambda-role'
```

### Site to backend

The deploy script passes the backend Lambda function name into the site stack.
The site stack sets `BACKEND_LAMBDA_FUNCTION_NAME` on the Nitro Lambda and
grants its role `lambda:InvokeFunction` on the backend Lambda ARN derived from
that name.

## Notes

- The hosted zone is `debugjois.dev`. The app domain is `apps.debugjois.dev`.
- The site stack creates the retained `apps-debugjois-dev/linkpreview-api-key`
  secret for the logger's URL title lookup. Set or rotate it with:

  ```bash
  aws secretsmanager put-secret-value \
    --region us-west-2 \
    --secret-id apps-debugjois-dev/linkpreview-api-key \
    --secret-string 'your-linkpreview-api-key'
  ```

  Redeploy the site stack afterward. The Lambda environment variable comes
  from a versionless dynamic reference, so it refreshes only on deploy.

- Frontend Lambda artifacts live in a versioned S3 bucket. The site stack is
  deployed with both the object key and the object version.
- Backend Lambda images live in the `apps-debugjois-dev-backend` ECR
  repository, which keeps the five most recent images. The backend stack is
  deployed with a digest-pinned image URI.
- `infra/deploy.sh --with-artifact` uploads static frontend assets outside
  CloudFormation.
