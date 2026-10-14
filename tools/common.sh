#!/usr/bin/env bash
# Source this file; leave injected proxy and CA settings untouched.
set -euo pipefail
TEMPLE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export TEMPLE_ENV_ROOT="${TEMPLE_ENV_ROOT:-/workspace/.temple-realm}"
export PATH="$TEMPLE_ENV_ROOT/bin:$TEMPLE_ENV_ROOT/venv/bin:$PATH"
export XDG_DATA_HOME="$TEMPLE_ENV_ROOT/xdg/data"
export XDG_CONFIG_HOME="$TEMPLE_ENV_ROOT/xdg/config"
export XDG_CACHE_HOME="$TEMPLE_ENV_ROOT/xdg/cache"
export ANDROID_USER_HOME="$TEMPLE_ENV_ROOT/android/user"
mkdir -p "$ANDROID_USER_HOME"
export PIP_CACHE_DIR="$TEMPLE_ENV_ROOT/cache/pip"
mkdir -p "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$TEMPLE_ROOT/artifacts"
cd "$TEMPLE_ROOT"

checked_godot() {
 local label="$1"; shift
 local log="$TEMPLE_ROOT/artifacts/$label.log"
 timeout 120 godot --path "$TEMPLE_ROOT" "$@" >"$log" 2>&1 || { cat "$log"; return 1; }
 cat "$log"
 if rg -n 'SCRIPT ERROR|ERROR:|Parse Error' "$log"; then return 1; fi
}
