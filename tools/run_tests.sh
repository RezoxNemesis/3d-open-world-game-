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
checked_godot sky-route-tests --headless --fixed-fps 60 --script tests/test_sky_route.gd
rg -q 'SKY_ROUTE_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/sky-route-tests.log
checked_godot foliage-tests --headless --script tests/test_foliage.gd
rg -q 'FOLIAGE_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/foliage-tests.log
checked_godot dressing-tests --headless --script tests/test_dressing.gd
rg -q 'DRESSING_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/dressing-tests.log
checked_godot traveler-tests --headless --fixed-fps 60 --script tests/test_traveler_visual.gd
rg -q 'TRAVELER_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/traveler-tests.log
checked_godot lantern-quest-tests --headless --fixed-fps 60 --script tests/test_lantern_quest.gd
rg -q 'LANTERN_QUEST_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/lantern-quest-tests.log
python tools/check_skills.py
