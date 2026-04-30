#!/usr/bin/env bash

set -euo pipefail

WITH_ARTIFACT=0
WITH_BACKEND_IMAGE=0

usage() {
  cat <<'USAGE'
Usage: ./deploy.sh [--with-artifact] [--with-backend-image]

  --with-artifact       Build and deploy a fresh Nitro app Lambda zip artifact.
  --with-backend-image  Build, push, and deploy a fresh backend Lambda image.
  -h, --help            Show this help text.

Without --with-backend-image, an existing backend stack reuses its currently
deployed Lambda image. The backend stack must exist before the site stack can
be deployed because admin server functions are wired to invoke it directly.
USAGE
}

while (($# > 0)); do
  case "$1" in
    --with-artifact)
      WITH_ARTIFACT=1
      shift
      ;;
    --with-backend-image)
      WITH_BACKEND_IMAGE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_DIR/app"
BACKEND_DIR="$REPO_DIR/backend"
INFRA_DIR="$REPO_DIR/infra"
APP_OUTPUT_DIR="$APP_DIR/.output"
APP_PUBLIC_DIR="$APP_OUTPUT_DIR/public"
APP_ARTIFACTS_DIR="$APP_DIR/artifacts"
LAMBDA_ZIP_PATH="$APP_ARTIFACTS_DIR/lambda-package.zip"
BACKEND_BUILD_SCRIPT="$BACKEND_DIR/build-and-push-image.sh"

ACCESS_STACK="AppsDebugJoisDevAccessStack"
ARTIFACT_STACK="AppsDebugJoisDevArtifactStack"
CERTIFICATE_STACK="AppsDebugJoisDevCertificateStack"
BACKEND_STACK="AppDebugJoisDevBackendStack"
SITE_STACK="AppsDebugJoisDevSiteStack"

ARTIFACT_REGION="us-west-2"
CERTIFICATE_REGION="us-east-1"

# Deploys a single CDK stack using the current caller credentials.
# Stack-specific execution roles are encoded by the custom synthesizer.
cdk_deploy_stack() {
  local stack_name="$1"
  shift

  npx cdk deploy "$stack_name" \
    --require-approval never \
    "$@"
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

stack_exists() {
  local region="$1"
  local stack_name="$2"

  aws cloudformation describe-stacks \
    --region "$region" \
    --stack-name "$stack_name" >/dev/null 2>&1
}

lambda_image_uri_for_stack() {
  local region="$1"
  local stack_name="$2"

  local function_name
  function_name="$(stack_output "$region" "$stack_name" "LambdaFunctionName")"
  aws lambda get-function \
    --region "$region" \
    --function-name "$function_name" \
    --query 'Code.ImageUri' \
    --output text
}

# Ensure the local artifact directory exists before packaging.
mkdir -p "$APP_ARTIFACTS_DIR"

# Deploy the shared prerequisite stacks first.
cd "$INFRA_DIR"
printf '==> Deploying AccessStack (deployment IAM, us-west-2)\n'
cdk_deploy_stack "$ACCESS_STACK"
printf '==> Deploying ArtifactStack (artifact bucket + backend ECR, us-west-2)\n'
cdk_deploy_stack "$ARTIFACT_STACK"
printf '==> Deploying CertificateStack (ACM cert, us-east-1)\n'
cdk_deploy_stack "$CERTIFICATE_STACK"

# Resolve the shared stack outputs needed by later deploys.
ARTIFACT_BUCKET_NAME="$(stack_output "$ARTIFACT_REGION" "$ARTIFACT_STACK" "ArtifactBucketName")"
CERTIFICATE_ARN="$(stack_output "$CERTIFICATE_REGION" "$CERTIFICATE_STACK" "CertificateArn")"

if [[ "$WITH_BACKEND_IMAGE" == "1" ]]; then
  printf '==> Building and pushing backend Lambda image\n'
  BACKEND_IMAGE_URI="$(AWS_REGION="$ARTIFACT_REGION" "$BACKEND_BUILD_SCRIPT")"
  printf '==> Backend image URI: %s\n' "$BACKEND_IMAGE_URI"
else
  BACKEND_IMAGE_URI=""
  if stack_exists "$ARTIFACT_REGION" "$BACKEND_STACK"; then
    printf '==> Reusing currently deployed backend Lambda image\n'
    BACKEND_IMAGE_URI="$(lambda_image_uri_for_stack "$ARTIFACT_REGION" "$BACKEND_STACK")"
  else
    printf '==> Backend stack does not exist yet; run with --with-backend-image before deploying the site stack\n' >&2
    exit 1
  fi
fi

if [[ -n "$BACKEND_IMAGE_URI" ]]; then
  printf '==> Deploying BackendStack (Go Lambda image)\n'
  cdk_deploy_stack "$BACKEND_STACK" \
    --parameters "$BACKEND_STACK:BackendImageUri=$BACKEND_IMAGE_URI"
fi

# The site Lambda invokes the backend Lambda for admin server-function actions.
BACKEND_LAMBDA_FUNCTION_NAME="$(stack_output "$ARTIFACT_REGION" "$BACKEND_STACK" "LambdaFunctionName")"

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
  # Reuse the currently deployed Lambda artifact for infra-only deploys.
  ARTIFACT_OBJECT_KEY="$(stack_parameter "$ARTIFACT_REGION" "$SITE_STACK" "ArtifactObjectKey")"
  ARTIFACT_OBJECT_VERSION="$(stack_parameter "$ARTIFACT_REGION" "$SITE_STACK" "ArtifactObjectVersion")"
fi

# Deploy the site stack with the resolved certificate and Lambda artifact inputs.
cd "$INFRA_DIR"
printf '==> Deploying SiteStack (updates Lambda code + CloudFront config)\n'
cdk_deploy_stack "$SITE_STACK" \
  --parameters "$SITE_STACK:CertificateArn=$CERTIFICATE_ARN" \
  --parameters "$SITE_STACK:ArtifactBucketName=$ARTIFACT_BUCKET_NAME" \
  --parameters "$SITE_STACK:ArtifactObjectKey=$ARTIFACT_OBJECT_KEY" \
  --parameters "$SITE_STACK:ArtifactObjectVersion=$ARTIFACT_OBJECT_VERSION" \
  --parameters "$SITE_STACK:BackendLambdaFunctionName=$BACKEND_LAMBDA_FUNCTION_NAME"

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

# Print a concise deploy summary.
printf 'Deployed %s\n' "$SITE_URL"
printf 'Artifact key: %s\n' "$ARTIFACT_OBJECT_KEY"
printf 'Artifact version: %s\n' "$ARTIFACT_OBJECT_VERSION"
if [[ -n "$BACKEND_IMAGE_URI" ]]; then
  printf 'Backend image: %s\n' "$BACKEND_IMAGE_URI"
fi
printf 'Backend Lambda: %s\n' "$BACKEND_LAMBDA_FUNCTION_NAME"
