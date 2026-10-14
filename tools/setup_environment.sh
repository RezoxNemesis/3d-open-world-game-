#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || { echo "Linux x86_64 required"; exit 1; }
python3 -c 'import sys; assert sys.version_info[:2] == (3,12), "Python 3.12 required by wheel lock"'
mkdir -p "$TEMPLE_ENV_ROOT/bin" "$TEMPLE_ENV_ROOT/cache"
export WITH_EXPORT_TEMPLATES="${WITH_EXPORT_TEMPLATES:-1}"
python3 tools/install_engine.py
python3 tools/install_xvfb.py
if [[ ! -x "$TEMPLE_ENV_ROOT/venv/bin/python" ]]; then python3 -m venv "$TEMPLE_ENV_ROOT/venv"; fi
"$TEMPLE_ENV_ROOT/venv/bin/python" -m pip install --require-hashes --only-binary=:all: -r tools/requirements.lock
for bin in git bash gcc make jq ffmpeg blender; do
 command -v "$bin" >/dev/null || { echo "Missing base-image tool: $bin"; exit 1; }
done
cmake --version | head -1
ninja --version
godot --version
checked_godot import --headless --editor --import
python3 tools/install_android.py
printf 'Setup complete. Android debug export: tools/export_android.sh\n'
