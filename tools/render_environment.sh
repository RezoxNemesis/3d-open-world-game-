#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
XVFB="${XVFB:-$TEMPLE_ENV_ROOT/x11/usr/bin/Xvfb}"
[[ -x "$XVFB" ]] || { echo "Xvfb unavailable; see docs/DEVELOPMENT.md"; exit 1; }
# An isolated display, no TCP listener. Stop only the process this script starts.
: > artifacts/display-number
rm -f artifacts/temple-courtyard.png
"$XVFB" -displayfd 3 -screen 0 1280x720x24 -nolisten tcp 3>artifacts/display-number >artifacts/xvfb.log 2>&1 &
temple_xvfb_pid=$!
trap 'kill "$temple_xvfb_pid" 2>/dev/null || true; wait "$temple_xvfb_pid" 2>/dev/null || true' EXIT
for attempt in {1..40}; do
 [[ -s artifacts/display-number ]] && break
 kill -0 "$temple_xvfb_pid" 2>/dev/null || { cat artifacts/xvfb.log; exit 1; }
 sleep 0.1
done
[[ -s artifacts/display-number ]] || { echo "Xvfb startup timed out"; exit 1; }
export DISPLAY=":$(cat artifacts/display-number)"
export LIBGL_ALWAYS_SOFTWARE=1
checked_godot render --rendering-method gl_compatibility --audio-driver Dummy --script tools/render_capture.gd
python - <<'CHECK'
from PIL import Image, ImageStat
image = Image.open('artifacts/temple-courtyard.png').convert('RGB')
assert image.size == (1280, 720)
assert max(ImageStat.Stat(image).stddev) > 15, 'Blank or uniform capture'
print('PASS: nonuniform 1280x720 rendered screenshot')
CHECK
python tools/check_render_evidence.py
