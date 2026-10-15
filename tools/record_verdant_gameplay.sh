#!/usr/bin/env bash
# Real fixed-time gameplay, encoded for convenient review. Software timing is labeled.
set -euo pipefail
source "$(dirname "$0")/common.sh"
temple_record_mode="${1:-traversal}"
temple_record_quality="${2:-balanced}"
[[ "$temple_record_mode" == traversal || "$temple_record_mode" == abilities ]] || {
 echo "Usage: tools/record_verdant_gameplay.sh [traversal|abilities] [balanced|performance]"; exit 2;
}
[[ "$temple_record_quality" == balanced || "$temple_record_quality" == performance ]] || exit 2
temple_record_output="artifacts/verdant-qa/motion/$temple_record_mode"
if [[ -d "$temple_record_output" ]]; then
 mv "$temple_record_output" "$temple_record_output-previous-$(date -u +%Y%m%dT%H%M%S%N)"
fi
mkdir -p "$temple_record_output"
"$TEMPLE_ENV_ROOT/x11/usr/bin/Xvfb" -displayfd 3 -screen 0 960x540x24 -nolisten tcp \
 3>"$temple_record_output/display-number" >"$temple_record_output/xvfb.log" 2>&1 &
temple_record_xvfb_pid=$!
trap 'kill "$temple_record_xvfb_pid" 2>/dev/null || true; wait "$temple_record_xvfb_pid" 2>/dev/null || true' EXIT
for attempt in {1..40}; do
 [[ -s "$temple_record_output/display-number" ]] && break
 kill -0 "$temple_record_xvfb_pid" 2>/dev/null || { cat "$temple_record_output/xvfb.log"; exit 1; }
 sleep 0.1
done
[[ -s "$temple_record_output/display-number" ]] || { echo "Xvfb startup timed out"; exit 1; }
export DISPLAY=":$(cat "$temple_record_output/display-number")"
export LIBGL_ALWAYS_SOFTWARE=1
temple_record_args=()
[[ "$temple_record_mode" == traversal ]] || temple_record_args+=(--abilities)
[[ "$temple_record_quality" == balanced ]] || temple_record_args+=(--performance)
timeout 1200 godot --path "$TEMPLE_ROOT" --fixed-fps 20 --rendering-method gl_compatibility \
 --audio-driver Dummy --script tools/verdant_motion_capture.gd -- "${temple_record_args[@]}" \
 >"$temple_record_output/record.log" 2>&1 || { cat "$temple_record_output/record.log"; exit 1; }
cat "$temple_record_output/record.log"
if rg -n 'SCRIPT ERROR|ERROR:|Parse Error' "$temple_record_output/record.log"; then exit 1; fi
ffmpeg -hide_banner -loglevel error -framerate 20 -i "$temple_record_output/frame-%05d.png" \
 -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p -movflags +faststart -an \
 "$temple_record_output/gameplay.mp4"
python tools/check_verdant_motion_evidence.py "$temple_record_mode"
