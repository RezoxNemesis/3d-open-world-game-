#!/usr/bin/env bash
set -euo pipefail
cd /workspace/3d-open-world-game-
# Use the existing isolated checkout; do not create a worktree.
tools/setup_environment.sh
tools/setup_emulator.sh
tools/validate_environment.sh
tools/security_audit.sh
tools/export_android.sh
source tools/common.sh
python tools/test_runtime_cache.py
