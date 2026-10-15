# Verdant Sanctuaries Implementation Plan

> For agentic workers: use subagent-driven development with distinct file ownership and final independent review. Tasks are independently testable and coordinated for shared imports/renders.

**Goal:** Ship a substantial reference-directed Android environment/exploration upgrade with useful mobile lifecycle and control improvements.
**Architecture:** Preserve Godot/world factories and existing quest. Add modular assets, western route, batched dressing, an activity/journal controller and a checkpoint controller. Root integrates UI/state; specialist owners work in parallel without overlapping files.
**Tech stack:** Godot4.7.2 Compatibility, GDScript, Blender4.3.2, pinned Python/Pillow, AndroidSDK36/Java21, GitHub Actions.
**Spec:** docs/superpowers/specs/2026-10-15-verdant-sanctuaries-design.md

## Global constraints

- Existing isolated checkout; no worktrees, paid services, signing changes or reference-image runtime assets.
- Android/Realme/mobile-only owner; autonomous routine decisions and actual workflow artifact delivery.
- All existing controls/quests/IDs/saves remain compatible; new ID fox_shrine and schema4 migrate safely.
- Shared importer/render owner coordinated; final app inputs frozen before capture.
- Balanced starting/wide target<=800draws/700ktriangles; no software-to-phone performance claims.

## Review focus

- Full3D reachability: no shrine/relic interaction from below the deck; actual capsule route and return pass.
- Restore/lifecycle: malformed saves never overwrite progress, startup load never races checkpoint writes.
- Mobile cancellation: auto-sprint and native buttons clear on overlays/focus/resize/cancel.
- Geometry/materials: imported floor offsets, solid interior props, vertex tint and quality restoration are actual behavior.
- Evidence: no stale screenshots, unsupported graphics effects or static concept imagery claimed as gameplay.

### Task1 — Original modular assets and dressed spaces

Files: new generator/models/manifest; new verdant_district.gd and original textures; tests/test_verdant_dressing.gd.
- [x] Pin dimensions/material slots from spec; observe failing asset/placement assertions.
- [x] Generate eight original UV-mapped modules; shared palette, bounded triangles/materials.
- [x] Implement build(world)/apply_quality(preset), furnished scholar interior, pergolas and shrine details with real prop collision.
- [x] Run focused imported-geometry/material/collider/corridor/quality tests; inspect actual isolated art.

### Task2 — Natural landscape, water and reachable western route

Files: world.gd, landscape_visuals.gd, new verdant_route.gd, landscape/shaders; tests/test_verdant_route.gd and world regressions.
- [x] Reproduce disabled cliff vertex tint and route absence in tests.
- [x] Implement thirty0.2m risers,16m covered bridge and6m shrine terrace as specified; connect actual floor surfaces and guards.
- [x] Refine terrain/cliff/shore transitions, supported masses, water and lighting without violating old floors/seams.
- [x] Actual capsule ascends, crosses bridge, reaches shrine and returns; verify new solid interior props and old routes.

### Task3 — Foliage and optional living dragon

Files: nature.gd/botanical assets and helper; separate dragon generator/model/controller if accepted; focused tests.
- [x] Add deterministic rich planted edges/wisteria/forest transitions with route exclusions and density hooks.
- [x] Candidate dragon uses real modeled/animated geometry and bounded deterministic flight, <=8ktri/6surfaces.
- [x] Verify exclusions/seed/quality restoration and actual dragon animation/path. Reject visual or budget regressions during real render review.

### Task4 — Exploration activities and compatible persistence

Files: world_activities.gd, quest_interface.gd, main.gd, exploration.gd, save_store.gd; tests/test_world_activities.gd plus save/exploration fixtures.
- [x] Observe missing lore/bell/schema4 behaviors fail.
- [x] Three unique proximity lore records, viewable journal, completion-gated bell and visible persistent seal.
- [x] Five discovered-only map waypoints; update both route diagrams and ID validation.
- [x] Version4 roundtrip and strict invalid/inconsistent data handling, old1/2/3 migrations.
- [x] Actual GUI taps, modal pause/release, compact bounds and full3D guard tests pass.

### Task5 — Mobile checkpoint/resume and sprint assistance

Files: journey_checkpoint.gd, main.gd, mobile_controls.gd, player.gd, game_settings.gd; focused lifecycle/control suites.
- [x] Reproduce absence of automatic restore/checkpoints and two-thumb sprint support.
- [x] Add isolated, debounced grounded checkpoint controller with guarded restore/focus handling; Android default enabled, desktop default disabled.
- [x] Add optional strict bool sprint setting/default false; independent assist state with native action compatibility.
- [x] Prove milestone save, resume, malformed-load preservation, no restore-write race and every cancellation path.

### Task6 — Review, real pixels and APK delivery

Files: test runner/capture helpers/workflow/version/docs.
- [ ] Register focused suites; setup, import/lint/startup, all behavior tests and security checks pass.
- [ ] Compare matched views and all new destinations; actual15s traversal clip and animated water/dragon evidence, bounded content metrics and mobile layouts.
- [ ] Independent review; fix significant findings with focused regression evidence.
- [ ] Freeze source, run autonomous cycle and label native host limit honestly; export the combined final Hero milestone as code5/name0.5.0 (the owner extended scope before delivery).
- [ ] Commit/push tested source once stable; verify successful exact-SHA GitHub workflow and actual APK artifact, then update delivery/handoff docs.
