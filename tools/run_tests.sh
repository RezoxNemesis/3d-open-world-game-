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
checked_godot verdant-route-tests --headless --fixed-fps 60 --script tests/test_verdant_route.gd
rg -q 'VERDANT_ROUTE_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/verdant-route-tests.log
checked_godot verdant-dressing-tests --headless --script tests/test_verdant_dressing.gd
rg -q 'VERDANT_DRESSING_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/verdant-dressing-tests.log
checked_godot celestial-dragon-tests --headless --script tests/test_celestial_dragon.gd
rg -q 'DRAGON_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/celestial-dragon-tests.log
checked_godot world-activities-tests --headless --script tests/test_world_activities.gd
rg -q 'ACTIVITIES_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/world-activities-tests.log
checked_godot activity-interface-tests --headless --script tests/test_activity_interface.gd
rg -q 'ACTIVITY_INTERFACE_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/activity-interface-tests.log
checked_godot checkpoint-tests --headless --fixed-fps 60 --script tests/test_checkpoint_resume.gd
rg -q 'CHECKPOINT_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/checkpoint-tests.log
checked_godot sprint-assist-tests --headless --script tests/test_sprint_assist.gd
rg -q 'SPRINT_ASSIST_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/sprint-assist-tests.log
checked_godot hero-save-tests --headless --script tests/test_hero_save.gd
rg -q 'HERO_SAVE_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/hero-save-tests.log
checked_godot residence-tests --headless --fixed-fps 60 --script tests/test_residence_route.gd
rg -q 'RESIDENCE_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/residence-tests.log
checked_godot architectural-detail-tests --headless --script tests/test_architectural_detail.gd
rg -q 'ARCHITECTURAL_DETAIL_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/architectural-detail-tests.log
checked_godot architecture-collision-tests --headless --fixed-fps 60 --script tests/test_architecture_collision.gd
rg -q 'ARCHITECTURE_COLLISION_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/architecture-collision-tests.log
checked_godot hero-powers-tests --headless --fixed-fps 60 --script tests/test_hero_powers.gd
rg -q 'HERO_POWERS_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/hero-powers-tests.log
checked_godot hero-touch-tests --headless --fixed-fps 60 --script tests/test_hero_touch.gd
rg -q 'HERO_TOUCH_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/hero-touch-tests.log
checked_godot hero-streaming-tests --headless --script tests/test_hero_streaming.gd
rg -q 'HERO_STREAMING_RESULT: [1-9][0-9]* checks, 0 failures' artifacts/hero-streaming-tests.log
python tools/test_verdant_asset_contract.py
python tools/test_residence_asset_contract.py
python tools/check_skills.py
