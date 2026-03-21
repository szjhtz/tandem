#!/bin/sh
set -eu

: "${TANDEM_ENGINE_HOST:=0.0.0.0}"
: "${TANDEM_ENGINE_PORT:=39731}"
: "${TANDEM_STATE_DIR:=/var/lib/tandem/engine}"
: "${TANDEM_API_TOKEN_FILE:=/run/secrets/tandem_api_token}"

token_dir="$(dirname "$TANDEM_API_TOKEN_FILE")"
mkdir -p "$token_dir"

if [ ! -s "$TANDEM_API_TOKEN_FILE" ]; then
  token="$(tandem-engine token generate | tr -d '\r\n')"
  if [ -z "$token" ]; then
    echo "[tandem-engine] failed to generate an API token" >&2
    exit 1
  fi
  printf '%s\n' "$token" > "$TANDEM_API_TOKEN_FILE"
  chmod 600 "$TANDEM_API_TOKEN_FILE" || true
  echo "[tandem-engine] generated API token and wrote it to $TANDEM_API_TOKEN_FILE" >&2
fi

export TANDEM_API_TOKEN="$(cat "$TANDEM_API_TOKEN_FILE")"
export TANDEM_ENGINE_HOST
export TANDEM_ENGINE_PORT
export TANDEM_STATE_DIR

exec tandem-engine serve --hostname "$TANDEM_ENGINE_HOST" --port "$TANDEM_ENGINE_PORT"

