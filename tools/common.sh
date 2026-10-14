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

report_godot_failure() {
 [[ "${GITHUB_ACTIONS:-false}" == true ]] || return 0
 python - "$1" "$2" <<'PY'
import sys
from pathlib import Path
label, log = sys.argv[1:]
errors = [line.strip() for line in Path(log).read_text(errors='replace').splitlines()
          if 'ERROR:' in line or 'SCRIPT ERROR:' in line or 'Parse Error' in line]
message = label + ': ' + ('; '.join(errors[:3]) or 'Godot command failed; inspect this check log')
message = message[:1500].replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
print('::error title=Godot validation failed::' + message)
PY
}

checked_godot() {
 local label="$1"; shift
 local log="$TEMPLE_ROOT/artifacts/$label.log"
 timeout 120 godot --path "$TEMPLE_ROOT" "$@" >"$log" 2>&1 || { cat "$log"; report_godot_failure "$label" "$log"; return 1; }
 cat "$log"
 if rg -n 'SCRIPT ERROR|ERROR:|Parse Error' "$log"; then report_godot_failure "$label" "$log"; return 1; fi
}
