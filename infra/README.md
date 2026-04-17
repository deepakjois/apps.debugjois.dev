# infra

Bootstrap-free AWS infrastructure for `apps.debugjois.dev`.

This CDK app is used only to synthesize CloudFormation templates. Deployments are handled by `infra/deploy.sh`, which uses `aws cloudformation deploy`, `aws s3 sync`, and `aws cloudfront create-invalidation` directly.

# Stacks

- `AppsDebugJoisDevArtifactStack` in `us-west-2` creates the versioned S3 bucket for Lambda artifacts.
- `AppsDebugJoisDevCertificateStack` in `us-east-1` creates the ACM certificate for `apps.debugjois.dev`.
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

To build, package, upload, and deploy a new Lambda artifact as part of the deploy:

```bash
./deploy.sh --with-artifact
```

The script always:

1. synthesizes the CDK templates
2. deploys the artifact bucket and certificate stacks
3. deploys the site stack

When `--with-artifact` is passed, the script also:

1. builds the app in `../app`
2. packages `../app/.output/` into `../app/artifacts/lambda-package.zip`
3. hashes the zip bytes
4. uploads the artifact to the versioned artifact bucket using a key like `lambda/app-debugjois-dev-<hash>.zip`
5. passes the uploaded object's S3 version ID into the site stack deploy
6. syncs `../app/.output/public` into the static asset bucket
7. invalidates the CloudFront distribution

Without `--with-artifact`, the script reuses the existing `ArtifactObjectKey` and `ArtifactObjectVersion` from `AppsDebugJoisDevSiteStack`.

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

# Notes

- The hosted zone is `debugjois.dev`.
- The app domain is `apps.debugjois.dev`.
- Lambda artifacts are stored in a versioned S3 bucket and the site stack is deployed with both the object key and object version.
- Static frontend assets are uploaded outside CloudFormation by `infra/deploy.sh --with-artifact`.
