#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
godot --version
python --version
cmake --version | head -1
ninja --version
ffmpeg -version | head -1
blender --background --factory-startup --python-expr 'import bpy; print("BLENDER_READY", bpy.app.version_string)'
checked_godot import --headless --editor --import
python tools/gdtools.py lint scripts tests tools/render_capture.gd tools/mobile_render_capture.gd tools/celestial_capture.gd tools/verdant_capture.gd tools/verdant_motion_capture.gd tools/audit_architectural_geometry.gd tools/startup_smoke.gd
python tools/gdtools.py format --check scripts tests tools/render_capture.gd tools/mobile_render_capture.gd tools/celestial_capture.gd tools/verdant_capture.gd tools/verdant_motion_capture.gd tools/audit_architectural_geometry.gd tools/startup_smoke.gd
tools/start_environment.sh smoke
tools/run_tests.sh
echo 'PASS: environment and behavioral validation'
