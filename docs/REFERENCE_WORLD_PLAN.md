# Eastern Temple District Implementation Plan

**Goal:** Deliver a playable, reference-directed Android temple district with original art, real discovery and verified screenshots.

**Architecture:** Keep the existing native Godot physics, persistence and bounded streaming. Independently generate modular architectural art, compose landscape/materials, and implement the exploration HUD before integration and fresh review.

**Tech Stack:** Godot 4.7.2 Compatibility, GDScript, Blender 4.3.2, existing Android SDK.

**Spec:** `docs/REFERENCE_WORLD_DESIGN.md`

## Global constraints

- Work in the existing isolated checkout; no additional worktree.
- Preserve working save/touch actions and nine deterministic regions.
- Original authored assets only; supplied images are references.
- No routine approval gates per the owner's explicit standing preference.
- No physical-device or final concept-parity claims from software rendering.

## Review focus

1. Terrain seams and open exits must have continuous collision.
2. Map cannot travel to undiscovered locations or through a missing landing floor.
3. Touch controls and HUD must remain readable on landscape phones and release on focus loss.
4. Camera must clear architecture and hide the traveler in first person.
5. Decorative batching and shader effects must stay within Compatibility features.

## Tasks

- [x] Architectural art: generate/export reusable curved-roof pavilion, gate, lantern and bridge; record source and measured triangle counts. Verify Godot import.
- [x] Exploration and HUD: add discovery and locked travel behavior assertions; observe failures, implement `exploration.gd` and dark/gold HUD with actual map, rerun tests.
- [x] World: add gate-exit and landing/collision assertions; observe failures, replace primitive Greek courtyard with authored temple garden, jade pool, waterfalls and mountain panorama; preserve `Regions` terrain-first contract and deterministic seams.
- [x] Traveler: retain input/physics behavior and build a readable humanoid model; verify camera and movement regression tests.
- [x] Integration: run format/lint, headless behavior, actual render viewpoints, source/advisory scan, signed phone export and bounded Android validation. Independent reviewer inspects current source and evidence; fix material findings and repeat affected checks.
- [x] Delivery: update architecture/results/asset ledger, recoverable Git commit and authorized feature branch backup, provide APK and actual rendered preview.

## Execution ledger

Baseline: 28 gameplay checks passed in `artifacts/reference-baseline-tests.log` before product changes. Interfaces are fixed in the design; parallel writers own distinct files. The existing checkout's branch is `work`, with clean initial status at commit `3774dcb`.

Reference implementation checkpoints: original architectural kit imported; 48 exploration checks, 28 regression checks, eight world/floor/seam checks and nine stair checks pass. Visual-floor alignment and distant-load regression were observed failing before correction. Native audio cleanup uses a bounded mixing drain in test/capture harnesses. Final autonomous cycle and delivery status are recorded in TEST_RESULTS.md after verification.
