#!/usr/bin/env bash
# Google external-account executable credential source for Amp orbs.
# Google's auth libraries run this with GOOGLE_EXTERNAL_ACCOUNT_AUDIENCE set,
# and it prints an Amp-issued OIDC token in Google's executable-response format.
set -euo pipefail

readonly TTL_SECONDS=3600

token="$(amp orb id-token \
  --audience "${GOOGLE_EXTERNAL_ACCOUNT_AUDIENCE:?must be set by the Google auth library}" \
  --subject-scope project \
  --ttl-seconds "$TTL_SECONDS")"

expires_at=$(($(date +%s) + TTL_SECONDS - 60))

jq -n --arg token "$token" --argjson exp "$expires_at" '{
  version: 1,
  success: true,
  token_type: "urn:ietf:params:oauth:token-type:jwt",
  id_token: $token,
  expiration_time: $exp
}'
