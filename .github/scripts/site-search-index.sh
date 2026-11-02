#!/usr/bin/env bash
# Builds the daily log search index from a debugjois.dev checkout and publishes
# it to the static asset bucket under site-search/index/.
#
# Usage: site-search-index.sh <daily-notes-dir>
# Set FORCE=1 to publish even when the deployed index already covers the
# checked-out commit, for example after the indexer itself changed.
set -euo pipefail

notes_dir="$(realpath "$1")"
repo_root="$(git rev-parse --show-toplevel)"
out_dir="$RUNNER_TEMP/site-search-index"
region=us-west-2
site_stack=AppsDebugJoisDevSiteStack
deployed_status_url=https://apps.debugjois.dev/site-search/index/status.json

commit="$(git -C "$notes_dir" rev-parse HEAD)"
deployed_commit="$(curl -fsS "$deployed_status_url" | jq -r '.commit // empty' || true)"
if [[ "${FORCE:-0}" != "1" && "$commit" == "$deployed_commit" ]]; then
  printf 'Index already covers debugjois.dev@%s; nothing to publish\n' "$commit"
  exit 0
fi

cd "$repo_root/app"
npm run site-search-index -- "$notes_dir" "$out_dir"

bucket="$(aws cloudformation describe-stacks \
  --region "$region" \
  --stack-name "$site_stack" \
  --query "Stacks[0].Outputs[?OutputKey=='StaticAssetsBucketName'].OutputValue" \
  --output text)"

# Five minutes keeps CloudFront and browsers within one hourly refresh without
# an invalidation. Fragments are content-hashed, so a stale entry file still
# finds the fragments it names until --delete removes them.
aws s3 sync "$out_dir" "s3://$bucket/site-search/index" \
  --delete \
  --cache-control "public, max-age=300"

printf 'Published index for debugjois.dev@%s to s3://%s/site-search/index\n' "$commit" "$bucket"
