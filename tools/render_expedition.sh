#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
mkdir -p artifacts/expedition-qa
: > artifacts/expedition-display
"$TEMPLE_ENV_ROOT/x11/usr/bin/Xvfb" -displayfd 3 -screen 0 1600x720x24 -nolisten tcp 3>artifacts/expedition-display >artifacts/expedition-xvfb.log 2>&1 &
temple_expedition_xvfb=$!
trap 'kill "$temple_expedition_xvfb" 2>/dev/null || true; wait "$temple_expedition_xvfb" 2>/dev/null || true' EXIT
for attempt in {1..50}; do
 [[ -s artifacts/expedition-display ]] && break
 sleep 0.1
done
export DISPLAY=":$(cat artifacts/expedition-display)"
export LIBGL_ALWAYS_SOFTWARE=1
checked_godot expedition-render --rendering-method gl_compatibility --audio-driver Dummy --script tools/expedition_capture.gd
python tools/check_expedition_evidence.py
