---
name: advanced-3d-art
description: Use when building procedural Blender meshes, UVs, PBR materials, textures, animations or glTF assets.
---

# Advanced 3D Art

## Workflow

1. Review `docs/ASSET_LICENSES.md` and identify asset scale, pivot, target polygon count and license before generating or importing anything.
2. Use `blender --background --factory-startup --python path/to/reviewed_generator.py`; never load unknown add-ons or auto-run scripts from untrusted blend files.
3. Work in meters, apply transforms, generate UVs, check normals and assign named PBR material slots. Export GLB with only selected objects, geometry and required animation.
4. Import via `tools/validate_environment.sh`; inspect scale, texture paths, material slots and collision separately. Register source, generator, version and license in the asset ledger.
5. Keep procedural prototypes honest: primitive-based starter assets are not final production art. Use real render captures for visual review.

## Verification

Run `tools/run_tests.sh` and the workflow-specific check above. Preserve failing output and report unrun checks. Do not claim completion from a PID, zero-test run or a headless render placeholder.
