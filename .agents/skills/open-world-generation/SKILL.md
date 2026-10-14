---
name: open-world-generation
description: Use when adding deterministic terrain, biome regions, chunk streaming, vegetation or world navigation.
---

# Open World Generation

## Workflow

1. Inspect `scripts/world.gd`; `SEED=73109` defines the current bounded courtyard. Do not generate a giant world at startup.
2. Design region keys and deterministic seed derivation before introducing streaming. Keep generated content under a region Node3D so unload can free meshes and colliders together.
3. Prototype one terrain region with a walkable collision mesh. Keep the courtyard flat, preserve temple access, and avoid vegetation in the player route.
4. Test the same seed twice for repeatable counts/bounds; traverse and unload neighboring regions with real physics tests. Reject leaked nodes and holes in collision.
5. Use MultiMesh for repeated foliage when adding density. Record active-region, triangle and collision budgets in `docs/ARCHITECTURE.md`.

## Verification

Run `tools/run_tests.sh` and the workflow-specific check above. Preserve failing output and report unrun checks. Do not claim completion from a PID, zero-test run or a headless render placeholder.
