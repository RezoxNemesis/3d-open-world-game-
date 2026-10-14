#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
checked_godot tests --headless --script tests/test_game.gd
rg -q 'RESULT: [1-9][0-9]* checks, 0 failures' artifacts/tests.log
checked_godot exploration-tests --headless --script tests/test_exploration.gd
rg -q 'EXPLORATION RESULT: [1-9][0-9]* checks, 0 failures' artifacts/exploration-tests.log
checked_godot world-tests --headless --script tests/test_world.gd
rg -q 'WORLD_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/world-tests.log
checked_godot step-tests --headless --script tests/test_steps.gd
rg -q 'RESULT: [1-9][0-9]* step checks, 0 failures' artifacts/step-tests.log
checked_godot save-progress-tests --headless --script tests/test_save_progress.gd
rg -q 'SAVE_PROGRESS_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/save-progress-tests.log
checked_godot settings-tests --headless --script tests/test_settings.gd
rg -q 'SETTINGS RESULT: [1-9][0-9]* checks, 0 failures' artifacts/settings-tests.log
checked_godot mobile-upgrade-tests --headless --script tests/test_mobile_upgrade.gd
rg -q 'MOBILE_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/mobile-upgrade-tests.log
python tools/check_skills.py
