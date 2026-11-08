#!/usr/bin/env bash
set -euo pipefail

component=${1:?backend or frontend is required}
environment=${2:?staging or production is required}
image=${3:?an immutable image is required}
release=${4:?a release ID is required}
case "$component" in
  backend) repository=ghcr.io/vitaliilatysh/quizproject ;;
  frontend) repository=ghcr.io/vitaliilatysh/quizproject-web ;;
  *) echo 'Unknown deployment component.' >&2; exit 1 ;;
esac
[[ "$environment" == staging || "$environment" == production ]]
[[ "$image" == "$repository@sha256:"* ]]
[[ "${image#"$repository@sha256:"}" =~ ^[0-9a-f]{64}$ ]]
[[ "$release" =~ ^[0-9]+-[0-9]+$ ]]
[[ "${DO_HOST:-}" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ "${DO_SSH_USER:-}" =~ ^[a-z_][a-z0-9_-]*$ ]]
port=${DO_SSH_PORT:-22}
[[ "$port" =~ ^[0-9]{1,5}$ ]] && ((10#$port >= 1 && 10#$port <= 65535))
: "${DO_SSH_KEY:?Configure the DO_SSH_KEY environment secret}"
: "${DO_KNOWN_HOSTS:?Configure the verified DO_KNOWN_HOSTS environment secret}"

umask 077
credentials=$(mktemp -d "${RUNNER_TEMP:-/tmp}/quiz-ssh.XXXXXXXX")
trap 'rm -rf -- "$credentials"' EXIT
printf '%s\n' "$DO_SSH_KEY" > "$credentials/key"
printf '%s\n' "$DO_KNOWN_HOSTS" > "$credentials/known_hosts"
unset DO_SSH_KEY DO_KNOWN_HOSTS
options=(-i "$credentials/key" -o BatchMode=yes -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$credentials/known_hosts"
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)
target="$DO_SSH_USER@$DO_HOST"
directory="/opt/quizproject/$environment/$component/releases/$release"
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
files=("$source_dir/compose.yaml" "$source_dir/rollout.sh")
if [[ "$component" == frontend ]]; then
  files+=("$source_dir/Caddyfile" "$source_dir/runtime-config.js")
fi

# Secrets already live on the server. Only reviewed deployment files are sent.
ssh -p "$port" "${options[@]}" "$target" \
  "test -r '/opt/quizproject/$environment/$component/.env' && mkdir -m 700 -p '$directory'"
scp -P "$port" "${options[@]}" "${files[@]}" "$target:$directory/"
ssh -p "$port" "${options[@]}" "$target" \
  "bash '$directory/rollout.sh' '$component' '$environment' '$image'"
