#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./backend/build-and-push-image.sh

Build and push the backend Lambda container image to the apps-debugjois-dev-backend ECR repository.
The repository is created by ./infra/deploy.sh before this script is called with --with-backend-image.
USAGE
}

if [[ "${1-}" == "-h" || "${1-}" == "--help" ]]; then
  usage
  exit 0
fi
if (($# > 0)); then
  echo "Unknown argument: $1" >&2
  usage >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_NAME="apps-debugjois-dev-backend"
IMAGE_TAG="apps-debugjois-dev-backend-$(date +%Y%m%d-%H%M%S)"

AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || true)}}"
if [[ -z "${AWS_REGION}" ]]; then
  AWS_REGION="us-west-2"
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REPOSITORY_URI="$(aws ecr describe-repositories \
  --repository-names "${REPOSITORY_NAME}" \
  --region "${AWS_REGION}" \
  --query 'repositories[0].repositoryUri' \
  --output text)"
IMAGE_REF="${REPOSITORY_URI}:${IMAGE_TAG}"

aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com" >/dev/null

# Build an immutable Lambda container image for the Go backend.
docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  --push \
  -t "${IMAGE_REF}" \
  "${SCRIPT_DIR}" >/dev/null

IMAGE_DIGEST="$(aws ecr describe-images \
  --repository-name "${REPOSITORY_NAME}" \
  --region "${AWS_REGION}" \
  --image-ids imageTag="${IMAGE_TAG}" \
  --query 'imageDetails[0].imageDigest' \
  --output text)"

if [[ -z "${IMAGE_DIGEST}" || "${IMAGE_DIGEST}" == "None" ]]; then
  echo "Failed to resolve digest for pushed image ${IMAGE_REF}." >&2
  exit 1
fi

printf '%s@%s\n' "${REPOSITORY_URI}" "${IMAGE_DIGEST}"
