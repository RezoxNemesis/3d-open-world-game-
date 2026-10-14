#!/usr/bin/env bash
set -euo pipefail
cd /workspace/3d-open-world-game-
# Use this existing isolated checkout; do not create a worktree.
tools/setup_environment.sh
tools/validate_environment.sh
tools/security_audit.sh
tools/export_android.sh
