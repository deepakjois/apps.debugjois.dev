# infra

AWS CDK app that provisions the infrastructure for `apps.debugjois.dev`.

This CDK app is designed for a bootstrap-free flow:

- synthesize templates with `cdk synth`
- deploy them with `aws cloudformation deploy`
- upload Lambda and static assets outside CDK

The infrastructure is split across three stacks:

- `AppsDebugJoisDevArtifactStack` in `us-west-2` for the Lambda artifact bucket
- `AppsDebugJoisDevCertificateStack` in `us-east-1` for the CloudFront ACM certificate
- `AppsDebugJoisDevSiteStack` in `us-west-2` for the static asset bucket, Lambda, HTTP API, CloudFront distribution, and Route53 records

# Getting Started

Install dependencies:

```bash
npm install
```

# Synth Commands

Synthesize all CloudFormation templates:

```bash
npm run synth
```

Synthesize only the artifact bucket stack:

```bash
npm run synth:artifact
```

Synthesize only the ACM certificate stack:

```bash
npm run synth:certificate
```

Synthesize only the site stack:

```bash
npm run synth:site
```

# Stack Responsibilities

`AppsDebugJoisDevArtifactStack` creates the S3 bucket that stores uploaded Lambda zip artifacts.

`AppsDebugJoisDevCertificateStack` creates the ACM certificate for `apps.debugjois.dev` in `us-east-1` and validates it with Route53.

`AppsDebugJoisDevSiteStack` expects three deploy-time inputs:

- `CertificateArn`
- `ArtifactBucketName`
- `ArtifactObjectKey`
- `ArtifactObjectVersion`

It uses those inputs to:

- import the certificate by ARN
- point the Lambda function at an uploaded S3 zip object
- create CloudFront behaviors that serve static files from S3 and all other routes from API Gateway

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

# Deployment Model

This repo does not use `cdk deploy`.

Expected high-level deployment flow:

1. Deploy `AppsDebugJoisDevArtifactStack`
2. Deploy `AppsDebugJoisDevCertificateStack`
3. Upload a uniquely named Lambda artifact zip to the artifact bucket
4. Deploy `AppsDebugJoisDevSiteStack` with:
   - `CertificateArn`
   - `ArtifactBucketName`
   - `ArtifactObjectKey`
   - `ArtifactObjectVersion`
5. Upload static frontend assets to the site stack's static asset bucket
6. Invalidate CloudFront after static uploads

# Notes

- The hosted zone is `debugjois.dev`.
- The app domain is `apps.debugjois.dev`.
- The artifact bucket is versioned, and the site stack should be deployed with the uploaded object's S3 version ID.
- Lambda artifacts are assumed to already exist in the artifact bucket before the site stack is deployed.
- Static frontend assets are assumed to be uploaded separately after the site stack creates the destination bucket.

```bash
cd ../app
npm install
npm run package:lambda
```

The CDK deploy uploads the contents of `../app/.output/public/` into the static asset bucket automatically.

# CDK Commands

Synthesize the CloudFormation templates:

```bash
npm run synth
```

Deploy both stacks:

```bash
npm run deploy
```

Deploy only the ACM certificate stack:

```bash
npm run deploy:certificate
```

Deploy only the app stack:

```bash
npm run deploy:site
```

# Routing

CloudFront is configured as follows:

- `/assets/*` goes to the S3 bucket
- `/favicon.ico` goes to the S3 bucket
- `/logo192.png` goes to the S3 bucket
- `/logo512.png` goes to the S3 bucket
- `/manifest.json` goes to the S3 bucket
- `/robots.txt` goes to the S3 bucket
- all other paths go to API Gateway and then Lambda

All behaviors use CloudFront's native `redirect-to-https` policy.

# Notes

- The hosted zone is `debugjois.dev`.
- The app domain is `apps.debugjois.dev`.
- The Lambda deployment artifact must exist at `../app/artifacts/lambda-package.zip` before `cdk synth` or `cdk deploy`.
