# Expedition Upgrade Implementation Plan

Goal: a verified mobile exploration increment with lower rendering cost, natural character motion, distant streamed travel, vehicle and guardian encounter.
Architecture: isolated expedition scene with integer sector coordinates; existing district and saves remain usable. Independent modules have disjoint file ownership.
Tech: pinned Godot 4.7.2 Compatibility, GDScript, original procedural art.
Spec: docs/superpowers/specs/2026-10-15-expedition-upgrade.md

- [x] Baseline: fetch remote, inspect references and capture named gameplay camera, record performance counters.
- [x] Streaming module: scripts/expedition_world.gd owns 128m integer-sector terrain and nearby region scene nodes, deterministic generation, safe floating origin. Tests at both extremes and boundaries.
- [x] Traveler: scripts/traveler_visual.gd and player.gd add natural animation with state tests; preserve physics/control interfaces.
- [x] Encounter module: scripts/expedition_encounter.gd owns guardian, telegraph/damage/dodge and vehicle movement contracts; independent tests.
- [x] Responsiveness: profile and optimize existing district draw/culling overhead in files owned by performance worker, compare identical capture.
- [x] Integrate expedition scene/UI/atlas and validated separate save, return to district; test actual touch and persistence.
- [ ] Verify full import/lint/gameplay/security, real captures and bounded autonomous cycle. Review, re-fetch other account changes, commit/push tested branch, inspect successful Actions artifact and publish screenshots.

Review focus: distant float precision; stale collision during rebase; touch ownership across overlays; mount/defeat/save state cleanup; old quest save preservation. Tests cover each in the owning module and integration.

### Added visual acceptance after owner feedback
- [x] Build original origin-only sanctuary architecture/water/physical route in expedition_sanctuary.gd, integrated via expedition_world.gd.
- [x] Build spatially batched lotus, blossom, bamboo and planted banks in expedition_garden.gd; preserve shrine and vehicle route clearance.
- [x] Add original residents with grounded patrol, breathing, and proximity greetings in expedition_residents.gd.
- [x] Recompose distant ridge atmosphere; capture both actual gameplay and garden/interior vistas after final changes.
- [x] Verify sanctuary navigation and budgets, then rerun final build checks. Keep first rejected screenshots as development evidence, not final presentation.
