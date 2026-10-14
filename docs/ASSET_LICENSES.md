# Asset and dependency ledger

| Item | Origin | License / handling |
| --- | --- | --- |
| Courtyard, temple, terrain, trees, rocks, pool, avatar and touch controls | Generated from repository GDScript; seed 73109 | Project MIT license; no downloaded asset attribution required |
| Godot runtime and matching export templates | Official godotengine/godot-builds 4.7.2 stable release | Godot MIT; preserve engine and bundled third-party notices for redistribution |
| Blender 4.3.2 | Prepared Debian base image | GPL; used as a development tool, not bundled into the game |
| FFmpeg and Mesa/Xvfb | Prepared Debian image / authenticated Debian package | Their upstream distribution licenses; development tools, not bundled |
| Python tools | Hash-locked PyPI wheels | Individual package licenses remain in venv wheel metadata; do not assume a uniform license |
| Android SDK and Java runtime | Official Google SDK / Debian OpenJDK | SDK license accepted by setup for local development; OpenJDK notices remain installed |
| Godot fallback font | Engine builtin font | Retain engine third-party license notices in release distribution |

The owner supplied ten concept images in TempleRealm_10_Images_With_Descriptions_Under20MB.zip. Their license is unspecified; they are used for visual direction and are not bundled as game textures, backgrounds or redistributed source assets. The current result is a procedural prototype, not final visual parity with the references. Store releases need a complete bundled-notice review.

## Original district assets

- `tools/generate_temple_assets.py` (Blender 4.3.2, generator version 1) creates `assets/models/{pavilion,pavilion_far,gate,lantern,bridge,shrine}.glb` and the stone/timber albedo textures. Geometry, UVs, surfaces and texture generation are original MIT project work. Exact counts/bounds are in `assets/models/manifest.json`; six-module Godot import and geometry checks passed. Embedded textures are included in GLBs.
- `assets/materials/lotus_banner.svg`, all `assets/shaders/*.gdshader`, foliage/terrain and the humanoid traveler are original repository-authored geometry/material/art. No external character or existing game assets were imported.
- `tools/generate_ambience.py` produces the original seeded 20-second atmosphere, encoded by FFmpeg as `assets/audio/garden.ogg`. Bird and bell notes are mathematically synthesized; no external recordings or melodies. MIT project asset; clipping/RMS/seam metrics are in `artifacts/garden-audio-report.json`.
