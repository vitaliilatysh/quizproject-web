#!/usr/bin/env bash
set -euo pipefail
[[ "${CI:-}" == true && "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ]]
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
temporary=$(mktemp -d)
export DEPLOY_ENV="ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT:-1}"
project="quizproject-$DEPLOY_ENV-frontend"
compose() {
  docker compose --project-name "$project" --env-file "$temporary/.env" \
    --file "$root/deploy/digitalocean/compose.yaml" "$@"
}
cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker rm --force "$project-api" >/dev/null 2>&1 || true
  docker network rm "quizproject-$DEPLOY_ENV" >/dev/null 2>&1 || true
  rm -rf -- "$temporary"
}
trap cleanup EXIT

printf 'SITE_ADDRESS=http://:80\nHTTP_PORT=18080\nHTTPS_PORT=18443\n' > "$temporary/.env"
docker network create "quizproject-$DEPLOY_ENV" >/dev/null
mkdir -p "$temporary/http/api/v1" "$temporary/http/actuator"
printf '[{"id":7,"title":"compose-routing"}]' > "$temporary/http/api/v1/quizzes"
printf 'management-must-not-be-public' > "$temporary/http/actuator/health"
docker run --detach --name "$project-api" --network "quizproject-$DEPLOY_ENV" \
  --network-alias quiz-api --volume "$temporary/http:/www:ro" \
  busybox:1.37.0 httpd -f -p 8081 -h /www >/dev/null
export APP_IMAGE=quizproject-web:test
compose up --detach --wait --wait-timeout 120
curl --fail --silent --show-error http://127.0.0.1:18080/healthz | grep -qx ok
curl --fail --silent --show-error http://127.0.0.1:18080/api/v1/quizzes | grep -q compose-routing
curl --fail --silent --show-error http://127.0.0.1:18080/runtime-config.js | grep -q 'globalThis.location.origin'
curl --fail --silent --show-error http://127.0.0.1:18080/some-client-route | grep -q '<!doctype html>'
response=$(curl --fail --silent --show-error http://127.0.0.1:18080/actuator/health)
if [[ "$response" == *management-must-not-be-public* ]]; then
  echo 'Management was exposed by the public proxy.' >&2
  exit 1
fi
echo 'DigitalOcean frontend Compose routing, runtime configuration and management isolation passed.'
