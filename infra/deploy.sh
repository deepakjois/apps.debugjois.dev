#!/usr/bin/env bash

set -euxo pipefail

WITH_ARTIFACT=0
if [[ "${1-}" == "--with-artifact" ]]; then
  WITH_ARTIFACT=1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_DIR/app"
INFRA_DIR="$REPO_DIR/infra"
APP_OUTPUT_DIR="$APP_DIR/.output"
APP_PUBLIC_DIR="$APP_OUTPUT_DIR/public"
APP_ARTIFACTS_DIR="$APP_DIR/artifacts"
LAMBDA_ZIP_PATH="$APP_ARTIFACTS_DIR/lambda-package.zip"

ARTIFACT_STACK="AppsDebugJoisDevArtifactStack"
CERTIFICATE_STACK="AppsDebugJoisDevCertificateStack"
SITE_STACK="AppsDebugJoisDevSiteStack"

ARTIFACT_REGION="us-west-2"
CERTIFICATE_REGION="us-east-1"

# Deploys a synthesized CloudFormation template into the target region.
# Always passes CAPABILITY_NAMED_IAM: required for ArtifactStack's named
# GitHub Actions role, and a harmless no-op for stacks without IAM resources.
deploy_stack() {
  local region="$1"
  local stack_name="$2"
  local template_path="$3"

  aws cloudformation deploy \
    --region "$region" \
    --stack-name "$stack_name" \
    --template-file "$template_path" \
    --capabilities CAPABILITY_NAMED_IAM
}

# Reads a named CloudFormation output value from a stack.
stack_output() {
  local region="$1"
  local stack_name="$2"
  local output_key="$3"

  aws cloudformation describe-stacks \
    --region "$region" \
    --stack-name "$stack_name" \
    --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue" \
    --output text
}

# Reads a named CloudFormation parameter value from a stack.
stack_parameter() {
  local region="$1"
  local stack_name="$2"
  local parameter_key="$3"

  aws cloudformation describe-stacks \
    --region "$region" \
    --stack-name "$stack_name" \
    --query "Stacks[0].Parameters[?ParameterKey=='$parameter_key'].ParameterValue" \
    --output text
}

# Ensure the local artifact directory exists before packaging.
mkdir -p "$APP_ARTIFACTS_DIR"

# Synthesize the latest templates before deploying any stacks.
cd "$INFRA_DIR"
npm run synth

# Keep the shared artifact bucket and certificate stacks up to date.
printf '==> Deploying ArtifactStack (artifact bucket, us-west-2)\n'
deploy_stack "$ARTIFACT_REGION" "$ARTIFACT_STACK" "cdk.out/${ARTIFACT_STACK}.template.json"
printf '==> Deploying CertificateStack (ACM cert, us-east-1)\n'
deploy_stack "$CERTIFICATE_REGION" "$CERTIFICATE_STACK" "cdk.out/${CERTIFICATE_STACK}.template.json"

# Resolve the shared stack outputs needed by the site deploy.
ARTIFACT_BUCKET_NAME="$(stack_output "$ARTIFACT_REGION" "$ARTIFACT_STACK" "ArtifactBucketName")"
CERTIFICATE_ARN="$(stack_output "$CERTIFICATE_REGION" "$CERTIFICATE_STACK" "CertificateArn")"

if [[ "$WITH_ARTIFACT" == "1" ]]; then
  # Build a fresh app bundle before packaging a new Lambda artifact.
  printf '==> Building app bundle\n'
  cd "$APP_DIR"
  npm run build

  # Package the Nitro output directory into a Lambda deployment zip.
  printf '==> Packaging Lambda zip -> %s\n' "$LAMBDA_ZIP_PATH"
  rm -f "$LAMBDA_ZIP_PATH"
  (
    cd "$APP_OUTPUT_DIR"
    zip -rq "$LAMBDA_ZIP_PATH" .
  )

  # Use the zip hash to derive a stable, content-addressed artifact key.
  ARTIFACT_HASH="$(shasum -a 256 "$LAMBDA_ZIP_PATH" | cut -d' ' -f1 | cut -c1-16)"
  ARTIFACT_OBJECT_KEY="lambda/app-debugjois-dev-${ARTIFACT_HASH}.zip"
  printf '==> Lambda artifact key: %s\n' "$ARTIFACT_OBJECT_KEY"

  # Reuse an existing uploaded object when the content hash already exists.
  EXISTING_VERSION="$(aws s3api list-object-versions \
    --region "$ARTIFACT_REGION" \
    --bucket "$ARTIFACT_BUCKET_NAME" \
    --prefix "$ARTIFACT_OBJECT_KEY" \
    --query "Versions[?Key=='$ARTIFACT_OBJECT_KEY'] | [0].VersionId" \
    --output text)"

  if [[ "$EXISTING_VERSION" == "None" ]]; then
    # Upload the new artifact and capture the exact S3 version for Lambda.
    printf '==> Uploading Lambda artifact to s3://%s/%s\n' "$ARTIFACT_BUCKET_NAME" "$ARTIFACT_OBJECT_KEY"
    ARTIFACT_OBJECT_VERSION="$(aws s3api put-object \
      --region "$ARTIFACT_REGION" \
      --bucket "$ARTIFACT_BUCKET_NAME" \
      --key "$ARTIFACT_OBJECT_KEY" \
      --body "$LAMBDA_ZIP_PATH" \
      --query VersionId \
      --output text)"
  else
    printf '==> Lambda artifact already uploaded; reusing version %s\n' "$EXISTING_VERSION"
    ARTIFACT_OBJECT_VERSION="$EXISTING_VERSION"
  fi
  printf '==> Lambda artifact version: %s\n' "$ARTIFACT_OBJECT_VERSION"
else
  # Reuse the currently deployed artifact parameters for infra-only deploys.
  ARTIFACT_OBJECT_KEY="$(stack_parameter "$ARTIFACT_REGION" "$SITE_STACK" "ArtifactObjectKey")"
  ARTIFACT_OBJECT_VERSION="$(stack_parameter "$ARTIFACT_REGION" "$SITE_STACK" "ArtifactObjectVersion")"
fi

# Re-synthesize after the app build so the site template is current.
cd "$INFRA_DIR"
npm run synth

# Deploy the site stack with the resolved certificate and artifact inputs.
printf '==> Deploying SiteStack (updates Lambda code + CloudFront config)\n'
aws cloudformation deploy \
  --region "$ARTIFACT_REGION" \
  --stack-name "$SITE_STACK" \
  --template-file "cdk.out/${SITE_STACK}.template.json" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    CertificateArn="$CERTIFICATE_ARN" \
    ArtifactBucketName="$ARTIFACT_BUCKET_NAME" \
    ArtifactObjectKey="$ARTIFACT_OBJECT_KEY" \
    ArtifactObjectVersion="$ARTIFACT_OBJECT_VERSION"

SITE_URL="$(stack_output "$ARTIFACT_REGION" "$SITE_STACK" "SiteUrl")"

if [[ "$WITH_ARTIFACT" == "1" ]]; then
  # Read the site outputs needed for static sync and cache invalidation.
  STATIC_ASSETS_BUCKET_NAME="$(stack_output "$ARTIFACT_REGION" "$SITE_STACK" "StaticAssetsBucketName")"
  CLOUDFRONT_DISTRIBUTION_ID="$(stack_output "$ARTIFACT_REGION" "$SITE_STACK" "CloudFrontDistributionId")"

  # Publish the static frontend files and clear the CloudFront cache.
  printf '==> Syncing static assets -> s3://%s\n' "$STATIC_ASSETS_BUCKET_NAME"
  aws s3 sync "$APP_PUBLIC_DIR" "s3://$STATIC_ASSETS_BUCKET_NAME" --delete
  printf '==> Creating CloudFront invalidation (/*)\n'
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths '/*' >/dev/null
fi

# Print the deploy summary for the chosen artifact version.
printf 'Deployed %s\n' "$SITE_URL"
printf 'Artifact key: %s\n' "$ARTIFACT_OBJECT_KEY"
printf 'Artifact version: %s\n' "$ARTIFACT_OBJECT_VERSION"
