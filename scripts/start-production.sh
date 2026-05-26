#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env}"
CONDA_ENV="${CONDA_ENV:-trade}"
APP_HOST="${APP_HOST:-0.0.0.0}"
PORT="${PORT:-3000}"

log() {
  printf '[trade-production] %s\n' "$*"
}

fail() {
  printf '[trade-production] ERROR: %s\n' "$*" >&2
  exit 1
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "Missing required environment variable: ${name}"
  fi
}

run_in_trade_env() {
  conda run --no-capture-output -n "$CONDA_ENV" "$@"
}

if [[ ! -f "$ENV_FILE" ]]; then
  fail "Environment file not found: ${ENV_FILE}. Copy .env.example to .env and fill production values first."
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export NODE_ENV="production"
export QUOTE_PROVIDER="${QUOTE_PROVIDER:-auto}"
export NEWS_PROVIDER="${NEWS_PROVIDER:-public}"
export MODEL_PROVIDER="${MODEL_PROVIDER:-openai-compatible}"
export EMAIL_PROVIDER="${EMAIL_PROVIDER:-smtp}"
export APP_TIMEZONE="${APP_TIMEZONE:-Asia/Shanghai}"

require_env "DATABASE_URL"
require_env "APP_PASSWORD"
require_env "SETTINGS_ENCRYPTION_KEY"

for provider_var in QUOTE_PROVIDER NEWS_PROVIDER MODEL_PROVIDER EMAIL_PROVIDER; do
  if [[ "${!provider_var}" == "mock" ]]; then
    fail "${provider_var}=mock is not allowed for production startup."
  fi
done

if ! command -v conda >/dev/null 2>&1; then
  fail "conda is required. Install conda and create the '${CONDA_ENV}' environment before production startup."
fi

log "Installing locked dependencies with npm ci."
run_in_trade_env npm ci

log "Generating Prisma client."
run_in_trade_env npm run prisma:generate

log "Applying production database migrations."
run_in_trade_env npx prisma migrate deploy

log "Building the Next.js production bundle."
run_in_trade_env npm run build

log "Starting production server on ${APP_HOST}:${PORT}."
exec conda run --no-capture-output -n "$CONDA_ENV" npm run start -- -H "$APP_HOST" -p "$PORT"
