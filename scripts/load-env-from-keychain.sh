#!/usr/bin/env bash
set -euo pipefail

get_secret() {
  local service="$1"
  local val
  val=$(security find-generic-password -s "$service" -a "$USER" -w 2>/dev/null) || {
    echo "ERROR: Keychain entry '$service' not found. Run:" >&2
    echo "  security add-generic-password -s \"$service\" -a \"\$USER\" -w <value> -U" >&2
    exit 1
  }
  echo "$val"
}

export MINIMAX_API_KEY="$(get_secret minimax-api-key)"
export SITE_PASSWORD="$(get_secret mathmagics-site-password)"

exec "$@"
