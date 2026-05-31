#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="${ROOT_DIR}/tmp/kest"
SERVER_LOG="${TMP_DIR}/server.log"
KEST_CONFIG_PATH="${ROOT_DIR}/.kest/config.yaml"
KEST_CONFIG_BACKUP="${TMP_DIR}/config.yaml.bak"
RUN_ID="$(date +%s)"
SERVER_PID=""
PORT=""
BASE_URL=""
DB_HOST="${KEST_DB_HOST:-localhost}"
DB_PORT="${KEST_DB_PORT:-5432}"
DB_NAME="${KEST_DB_NAME:-luas}"
DB_USERNAME="${KEST_DB_USERNAME:-luas_user}"
DB_PASSWORD="${KEST_DB_PASSWORD:-luas_pass}"
RESET_DB="${KEST_RESET_DB:-false}"

pick_port() {
  if [[ -n "${SERVER_PORT:-}" ]]; then
    echo "${SERVER_PORT}"
    return
  fi

  for _ in $(seq 1 20); do
    local candidate
    candidate="$((RANDOM % 10000 + 20000))"
    if ! lsof -iTCP:"${candidate}" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "${candidate}"
      return
    fi
  done

  echo "failed to find a free local port for kest run" >&2
  exit 1
}

write_kest_config() {
  cat >"${KEST_CONFIG_PATH}" <<EOF
version: 1
defaults:
  timeout: 30
  headers:
    Content-Type: application/json
    Accept: application/json

environments:
  local:
    base_url: ${BASE_URL}

  dev:
    base_url: ${BASE_URL}
    variables:
      api_key: dev_key_123

  staging:
    base_url: https://staging-api.example.com

  prod:
    base_url: https://api.example.com

active_env: local
log_enabled: true
EOF
}

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi

  if [[ -f "${KEST_CONFIG_BACKUP}" ]]; then
    mv "${KEST_CONFIG_BACKUP}" "${KEST_CONFIG_PATH}"
  fi
}

trap cleanup EXIT

mkdir -p "${TMP_DIR}"
rm -f "${SERVER_LOG}"

PORT="$(pick_port)"
BASE_URL="http://127.0.0.1:${PORT}"

if ! command -v kest >/dev/null 2>&1; then
  echo "kest is not installed or not in PATH" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required for PostgreSQL-backed Kest flow tests" >&2
  exit 1
fi

if ! PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USERNAME}" -d postgres -tAc "SELECT 1" >/dev/null; then
  echo "PostgreSQL is not available for Kest flow tests at ${DB_HOST}:${DB_PORT}" >&2
  exit 1
fi

if [[ ! "${DB_NAME}" =~ ^[A-Za-z0-9_][A-Za-z0-9_-]*$ ]]; then
  echo "KEST_DB_NAME may only contain letters, numbers, underscores, and hyphens" >&2
  exit 1
fi

if [[ "${RESET_DB}" == "true" ]]; then
  PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USERNAME}" -d postgres -tAc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" >/dev/null
  PGPASSWORD="${DB_PASSWORD}" dropdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USERNAME}" --if-exists "${DB_NAME}"
  PGPASSWORD="${DB_PASSWORD}" createdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USERNAME}" "${DB_NAME}"
elif ! PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USERNAME}" -d "${DB_NAME}" -tAc "SELECT 1" >/dev/null; then
  echo "PostgreSQL database ${DB_NAME} is not available; create it or run with KEST_RESET_DB=true using a role that can create databases" >&2
  exit 1
fi

COMMON_ENV=(
  APP_ENV=test
  APP_DEBUG=false
  APP_URL="${BASE_URL}"
  SERVER_MODE=release
  SERVER_PORT="${PORT}"
  DB_ENABLED=true
  DB_DRIVER=postgres
  DB_HOST="${DB_HOST}"
  DB_PORT="${DB_PORT}"
  DB_NAME="${DB_NAME}"
  DB_USERNAME="${DB_USERNAME}"
  DB_PASSWORD="${DB_PASSWORD}"
  DB_SSLMODE=disable
  DB_TIMEZONE=UTC
  JWT_SECRET=kest-test-secret
  AI_ENABLED=false
  TRACING_ENABLED=false
  LOG_CH_ENABLED=false
)

cd "${ROOT_DIR}"

cp "${KEST_CONFIG_PATH}" "${KEST_CONFIG_BACKUP}"
write_kest_config

env "${COMMON_ENV[@]}" go run ./cmd/luas/main.go migrate >/dev/null
env "${COMMON_ENV[@]}" go run ./cmd/server/main.go >"${SERVER_LOG}" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 30); do
  if curl -fsS "${BASE_URL}/v1/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "${BASE_URL}/v1/health" >/dev/null 2>&1; then
  echo "server failed to start for kest run" >&2
  cat "${SERVER_LOG}" >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  set -- "${ROOT_DIR}"/tests/kest/*.flow.md
fi

for flow in "$@"; do
  kest run "${flow}" -e local --fail-fast --var "run_id=${RUN_ID}"
done
