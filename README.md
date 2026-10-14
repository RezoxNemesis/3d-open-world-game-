# Temple Realm

Android-first Godot 4.7.2 open-world starter for a mobile-only developer. Target phone: Realme P1 Speed. All build work runs in Codex Cloud; no personal computer is required.

The playable slice is the Eastern Temple District: original curved-roof red/gold architecture, flowering gardens, lanterns, animated jade water and banners, waterfalls and a mountainous panorama. Walk between the sanctuary, lotus overlook and eastern gate to complete a discovery quest. A humanoid traveler, automatic stair ascent, camera switching, quiet ambience, a discovered-waypoint map and local position saves are implemented. Terrain streams through a bounded 3×3 region grid. This is the first reference-directed art/gameplay milestone; final concept-image fidelity and wider combat/dragon/crafting systems remain in development.

On phone: left joystick moves; swipe the right side to look; JUMP jumps; VIEW changes camera; SAVE and LOAD manage local position; MAP shows landmarks and discovered-only travel. Landscape orientation. Keyboard controls remain available for cloud tests (WASD/arrows, Space, V, F5/F9, M).

Cloud setup: `tools/setup_environment.sh`. Validate: `tools/validate_environment.sh`. Build APK: `tools/export_android.sh`. The generated APK is `artifacts/TempleRealm-Android-debug.apk`; download it from the cloud task and install on your Android phone. A debug build is for testing, not store distribution.

See [development](docs/DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md), [test evidence](docs/TEST_RESULTS.md), [security](docs/SECURITY.md) and [asset licenses](docs/ASSET_LICENSES.md). Six workflows are discoverable in `.agents/skills/`.
