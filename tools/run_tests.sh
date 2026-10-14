#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
checked_godot tests --headless --script tests/test_game.gd
rg -q 'RESULT: [1-9][0-9]* checks, 0 failures' artifacts/tests.log
python tools/check_skills.py
