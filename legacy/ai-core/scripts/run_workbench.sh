#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${PROJECT_ROOT}/.env"
  set +a
fi

API_HOST="${AIRO_API_HOST:-127.0.0.1}"
API_PORT="${AIRO_API_PORT:-8000}"
FRONTEND_PORT="${AIRO_FRONTEND_PORT:-8081}"
export AIRO_SANDBOX_BASE_URL="${AIRO_SANDBOX_BASE_URL:-http://${API_HOST}:${FRONTEND_PORT}}"
export AIRO_LOG_LEVEL="${AIRO_LOG_LEVEL:-INFO}"

cd "${PROJECT_ROOT}"
exec ./.venv/bin/uvicorn ai_requirement_os.api.app:app --host "${API_HOST}" --port "${API_PORT}" --log-level info
