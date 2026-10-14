# Temple Realm

Android-first Godot 4.7.2 open-world starter for a mobile-only developer. Target phone: Realme P1 Speed. All build work runs in Codex Cloud; no personal computer is required.

The playable slice is an ancient courtyard with stairs, columns, a sanctuary, a shallow ornamental pool, terrain, trees, rocks, warm lighting, a procedural placeholder player, camera switching and local saves. Terrain streams through a bounded 3×3 region grid. These are starter assets, not final high-quality production art.

On phone: left joystick moves; swipe the right side to look; JUMP jumps; VIEW changes camera; SAVE and LOAD manage local progress. Landscape orientation. Keyboard controls remain available for cloud tests (WASD/arrows, Space, V, F5/F9).

Cloud setup: `tools/setup_environment.sh`. Validate: `tools/validate_environment.sh`. Build APK: `tools/export_android.sh`. The generated APK is `artifacts/TempleRealm-Android-debug.apk`; download it from the cloud task and install on your Android phone. A debug build is for testing, not store distribution.

See [development](docs/DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md), [test evidence](docs/TEST_RESULTS.md), [security](docs/SECURITY.md) and [asset licenses](docs/ASSET_LICENSES.md). Six workflows are discoverable in `.agents/skills/`.
