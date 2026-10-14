#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
mkdir -p "$TEMPLE_ENV_ROOT/autonomy"
exec flock -n -E 75 "$TEMPLE_ENV_ROOT/autonomy/cycle.lock" python -u tools/autonomous_cycle.py "$@"
