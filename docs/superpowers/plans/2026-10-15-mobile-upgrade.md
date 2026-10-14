# Temple Realm Mobile Upgrade Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent implementation and a fresh whole-change review. Track verification below.

**Goal:** Improve the running Android district's natural scenery, temple surfaces, touch controls and camera while preserving exploration.

**Architecture:** Keep world, traveler, touch input, HUD and storage separate. Settings call explicit world/control/camera interfaces. SaveStore accepts original position saves and version 2 exploration saves.

**Tech Stack:** Godot 4.7.2 Compatibility, typed GDScript, Blender 4.3.2 original glTF assets, Android 36 ARM64 and pinned GitHub Actions.

**Spec:** `docs/MOBILE_UPGRADE_DESIGN.md`

## Global Constraints

- Realme P1 Speed Android is primary; owner has no desktop computer.
- Preserve the existing isolated checkout, scene paths, landmark coordinates and physics routes.
- Original/licensed art only; no network permission or credentials in APK.
- Deliver an actual successful GitHub Actions APK artifact URL.
- User authorized autonomous decisions, tests and routine Git work; review current evidence before claims.

## Review Focus

- Multiple fingers, canceled touches and focus loss must release all actions.
- Small/ultrawide viewports must keep controls and overlays visible and separate.
- Invalid settings/saves and older version1 saves must recover safely.
- Every quality preset must affect actual rendering without changing route collision.
- Temple stairs, distant save loads and map/settings transitions must preserve floor/velocity behavior.

## Independent tasks and gates

- [x] Landscape (`scripts/world.gd`, `scripts/nature.gd`, terrain/water/sky shaders): preserve world route tests, verify quality changes and inspect all five actual renderer views.
- [x] Temple surfaces (`tools/generate_temple_assets.py`, original generated materials/models): compare pre/post triangle/material/bounds ledger, factory-startup generation and official engine import.
- [x] Touch/camera (`scripts/player.gd`, `scripts/mobile_controls.gd`, `tests/test_mobile_upgrade.gd`): add failing real touch/physics assertions, implement floating pad/sprint/camera, pass existing step/game tests.
- [x] HUD/settings (`scripts/main.gd`, `scripts/game_settings.gd`, `tests/test_settings.gd`): add failing persistence/overlay tests, implement validated settings and compact interface, pass settings/map checks.
- [x] Exploration storage (`scripts/save_store.gd`, `scripts/exploration.gd`, `tests/test_save_progress.gd`): test v1 compatibility, v2 roundtrip/IDs/corruption before implementation; wire main save/load through coordinated interfaces.
- [x] Integration: wire suites and native test's actual settings-save path; import/lint/startup/tests/security and bounded autonomous cycle, inspect fresh renderer metrics, independent review and fixes.
- [x] Delivery: commit verified source, fast-forward/push main, verify successful hosted run head SHA and uploaded artifact; record evidence and provide direct artifact URL.

Interfaces: `World.apply_quality(preset: String)`; `MobileControls.configure_controls(sensitivity: float, joystick_scale: float)`; `Player.set_camera_distance(distance: float)`; `Player.rotate_camera(relative: Vector2, look_sensitivity: float = 1.0)`; `SaveStore.save_state(position: Vector3, discovered: Array, path: String) -> bool`; `SaveStore.load_state(path: String, fallback: Vector3) -> Dictionary`; `Exploration.restore_discovered(ids: Variant) -> void`.
