# Temple Realm

Android-first Godot 4.7.2 open-world starter for a mobile-only developer. Target phone: Realme P1 Speed. All build work runs in Codex Cloud; no personal computer is required.

The playable slice is the Eastern Temple District: original curved-roof red/gold architecture, flowering gardens, lanterns, animated jade water and banners, waterfalls and a mountainous panorama. Walk between the sanctuary, lotus overlook and eastern gate to complete a discovery quest. Version 0.2 improves original PBR temple surfaces, layered limestone scenery, terrain and foliage, the animated traveler, touch controls, camera and mobile HUD. Terrain streams through a bounded 3×3 region grid. Visuals remain stylized; final concept-image fidelity and wider combat/dragon/crafting systems remain in development.

On phone: press/drag anywhere in the lower-left movement zone for the floating analog joystick; swipe the right side to look; hold RUN to sprint; JUMP jumps; VIEW changes camera; MAP shows discovered-waypoint travel. SETTINGS contains quality presets, camera sensitivity/distance, pad size and SAVE/LOAD for both location and earned landmarks. Landscape expands to wide phones, and opening map/settings releases gestures and pauses movement. Keyboard controls remain available for cloud tests (WASD/arrows, Shift, Space, V, F5/F9, M, Esc).

Cloud setup: `tools/setup_environment.sh`. Validate: `tools/validate_environment.sh`. Build APK: `tools/export_android.sh`. The local APK is `artifacts/TempleRealm-Android-debug.apk`. Delivery uses the GitHub Actions **Temple Realm Android APK** workflow: sign into GitHub, download its APK artifact ZIP, extract it on Android, and open the APK. The workflow summary contains the actual artifact download link. A debug build is for testing, not store distribution.

See [development](docs/DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md), [test evidence](docs/TEST_RESULTS.md), [security](docs/SECURITY.md) and [asset licenses](docs/ASSET_LICENSES.md). Six workflows are discoverable in `.agents/skills/`.
