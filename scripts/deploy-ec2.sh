#!/usr/bin/env bash
set -Eeuo pipefail

readonly REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ENV_FILE="${DEPLOY_ENV_FILE:-/home/ec2-user/SOLAR_BESS_WEB/.env}"
readonly COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-solar_bess_web}"
readonly RELEASE_SHA="${RELEASE_SHA:-$(git -C "$REPOSITORY_ROOT" rev-parse --short=12 HEAD)}"
readonly LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/solar-bess-deploy.lock}"
readonly STATE_DIR="${DEPLOY_STATE_DIR:-/home/ec2-user/SOLAR_BESS_WEB/.deploy}"
readonly ROLLBACK_TAG="rollback-${RELEASE_SHA}"
readonly COMPOSE=(sudo -n docker compose --project-directory "$REPOSITORY_ROOT" --env-file "$ENV_FILE" --project-name "$COMPOSE_PROJECT_NAME")

log() { printf '[deploy] %s\n' "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

[[ "$RELEASE_SHA" =~ ^[A-Za-z0-9._-]+$ ]] || fail 'RELEASE_SHA contains unsupported characters'
[[ -r "$ENV_FILE" ]] || fail "deployment env file is not readable: $ENV_FILE"
command -v curl >/dev/null || fail 'curl is required'
command -v flock >/dev/null || fail 'flock is required'
sudo -n docker info >/dev/null || fail 'runner requires passwordless sudo access to Docker'

runtime_secrets_dir="$({ set -a; source "$ENV_FILE"; set +a; printf '%s' "${RUNTIME_SECRETS_DIR:-/tmp/solar-bess-secrets}"; })"
for secret in postgres_user postgres_password database_url redis_password; do
  [[ -s "$runtime_secrets_dir/$secret" ]] || fail "runtime secret is missing or empty: $runtime_secrets_dir/$secret"
done

mkdir -p "$STATE_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || fail 'another deployment is already running'

previous_release=''
rollback_ready=true
for service in api worker web; do
  container_id="$("${COMPOSE[@]}" ps -q "$service" 2>/dev/null || true)"
  if [[ -z "$container_id" ]]; then
    rollback_ready=false
    continue
  fi
  image_id="$(sudo -n docker inspect --format '{{.Image}}' "$container_id")"
  sudo -n docker image tag "$image_id" "solar-bess-${service}:${ROLLBACK_TAG}"
done
if [[ -r "$STATE_DIR/current-release" ]]; then
  previous_release="$(<"$STATE_DIR/current-release")"
fi

rollback() {
  local exit_code=$?
  trap - ERR
  if [[ "$rollback_ready" != true ]]; then
    fail "release $RELEASE_SHA failed and no complete previous runtime exists for automatic rollback"
  fi
  log "release $RELEASE_SHA failed; restoring previous application images"
  if sudo -n env RELEASE_SHA="$ROLLBACK_TAG" docker compose --project-directory "$REPOSITORY_ROOT" --env-file "$ENV_FILE" --project-name "$COMPOSE_PROJECT_NAME" up -d --wait --wait-timeout 180 api worker web; then
    curl --fail --silent --show-error --retry 5 --retry-delay 2 http://127.0.0.1/web-health >/dev/null
    curl --fail --silent --show-error --retry 5 --retry-delay 2 http://127.0.0.1/health >/dev/null
    [[ -n "$previous_release" ]] && printf '%s\n' "$previous_release" > "$STATE_DIR/current-release"
    log 'rollback health checks passed'
  else
    log 'ERROR: automatic rollback also failed; inspect Docker Compose immediately' >&2
  fi
  exit "$exit_code"
}
trap rollback ERR

log "building release $RELEASE_SHA"
sudo -n env RELEASE_SHA="$RELEASE_SHA" docker compose --project-directory "$REPOSITORY_ROOT" --env-file "$ENV_FILE" --project-name "$COMPOSE_PROJECT_NAME" build --pull api worker web

log 'rolling out database, cache and application services'
sudo -n env RELEASE_SHA="$RELEASE_SHA" docker compose --project-directory "$REPOSITORY_ROOT" --env-file "$ENV_FILE" --project-name "$COMPOSE_PROJECT_NAME" up -d --wait --wait-timeout 240 --remove-orphans

log 'running HTTP smoke checks'
curl --fail --silent --show-error --retry 10 --retry-delay 2 http://127.0.0.1/web-health >/dev/null
curl --fail --silent --show-error --retry 10 --retry-delay 2 http://127.0.0.1/health >/dev/null
if [[ "$({ set -a; source "$ENV_FILE"; set +a; printf '%s' "${SWAGGER_ENABLED:-true}"; })" == true ]]; then
  curl --fail --silent --show-error --retry 10 --retry-delay 2 http://127.0.0.1/api/docs/ \
    | grep -F 'Solar & BESS API Documentation' >/dev/null
  curl --fail --silent --show-error --retry 10 --retry-delay 2 http://127.0.0.1/api/docs/openapi.yaml \
    | grep '^openapi: 3.1.0$' >/dev/null
fi

printf '%s\n' "$RELEASE_SHA" > "$STATE_DIR/current-release"
trap - ERR
log "release $RELEASE_SHA is healthy"
"${COMPOSE[@]}" ps
