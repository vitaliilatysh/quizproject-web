#!/usr/bin/env bash
set -euo pipefail

component=${1:?backend or frontend is required}
environment=${2:?staging or production is required}
image=${3:?an immutable image is required}
case "$component" in
  backend) repository=ghcr.io/vitaliilatysh/quizproject; service=api ;;
  frontend) repository=ghcr.io/vitaliilatysh/quizproject-web; service=web ;;
  *) echo 'Unknown deployment component.' >&2; exit 1 ;;
esac
[[ "$environment" == staging || "$environment" == production ]]
[[ "$image" == "$repository@sha256:"* ]]
[[ "${image#"$repository@sha256:"}" =~ ^[0-9a-f]{64}$ ]]
base=$(realpath -e "${QUIZ_DEPLOY_ROOT:-/opt/quizproject}")
root="$base/$environment/$component"
directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ "$directory" == "$root/releases/"* && "${directory#"$root/releases/"}" != */* ]]
[[ -r "$root/.env" && ! -L "$root/.env" ]]
# Do not allow local users to read database/JWT credentials.
mode=$(stat -c '%a' "$root/.env")
(( (8#$mode & 077) == 0 ))

# GitHub concurrency is per repository; this lock also serializes backend and
# frontend jobs on the host. Both copies use the same environment-level lock.
exec 9>"$base/$environment/.deploy.lock"
flock --exclusive --wait 600 9
previous=''
if [[ -e "$root/current" || -L "$root/current" ]]; then
  [[ -L "$root/current" ]]
  previous=$(realpath -e "$root/current")
  [[ "$previous" == "$root/releases/"* && "$previous" != "$directory" ]]
fi
umask 077
image_file=$(mktemp "$directory/.image.XXXXXXXX")
printf 'APP_IMAGE=%s\nDEPLOY_ENV=%s\n' "$image" "$environment" > "$image_file"
mv -Tf -- "$image_file" "$directory/image.env"
compose() {
  local release_dir=$1
  shift
  env -u APP_IMAGE -u DEPLOY_ENV -u DOCKER_HOST -u DOCKER_CONTEXT \
    -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock compose --project-name "quizproject-$environment-$component" \
    --env-file "$root/.env" --env-file "$release_dir/image.env" \
    --file "$release_dir/compose.yaml" "$@"
}
rollback() {
  if [[ -n "$previous" ]]; then
    echo 'Restoring the previous image and deployment configuration.' >&2
    compose "$previous" up --detach --wait --wait-timeout 180 || {
      echo 'Rollback failed; inspect the services on the Droplet.' >&2
      return 1
    }
  else
    echo 'First deployment failed; no previous release exists. Data volumes are preserved.' >&2
  fi
}

# Quiet validation must not print the resolved database/JWT environment.
compose "$directory" config --quiet
compose "$directory" pull "$service"
trap 'trap - HUP INT TERM; rollback; exit 1' HUP INT TERM
if ! compose "$directory" up --detach --wait --wait-timeout 180; then
  rollback
  exit 1
fi
trap - HUP INT TERM
ln -s "$directory" "$root/.current-$(basename -- "$directory")"
mv -Tf -- "$root/.current-$(basename -- "$directory")" "$root/current"
compose "$directory" ps
echo "Deployed $component to $environment: $image"
