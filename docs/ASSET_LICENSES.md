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

No reference artwork or external game asset pack exists in this repository. The current result is a procedural prototype, not visual parity with a reference or final production artwork. Before adding assets record the source URL, creator, license, permitted usage, modifications and generator inputs here. Store releases need a complete bundled-notice review.
