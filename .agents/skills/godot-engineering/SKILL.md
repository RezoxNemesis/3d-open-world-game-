---
name: godot-engineering
description: Use when changing Godot scenes, GDScript, physics, signals, resources or the pinned engine.
---

# Godot Engineering

## Workflow

1. Read `AGENTS.md`, `project.godot`, `tools/engine-lock.json`, and the affected scene/script. Keep player control, procedural world and persistence separate.
2. Add a behavior assertion to `tests/test_game.gd` that fails before the change. Use real physics frames and release simulated inputs after each probe.
3. Make a focused GDScript patch. Prefer typed values, exported resources and signals over global state. Preserve existing scene paths and assets.
4. Run `tools/validate_environment.sh`. Investigate engine errors even when the process exits zero.
5. For engine upgrades verify an official stable release and published archive checksum; update binary and matching template pins together. Retain a versioned rollback path; never use prereleases silently.

## Verification

Run `tools/run_tests.sh` and the workflow-specific check above. Preserve failing output and report unrun checks. Do not claim completion from a PID, zero-test run or a headless render placeholder.
