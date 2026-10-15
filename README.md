# Temple Realm

Android-first Godot 4.7.2 open-world starter for a mobile-only developer. Target phone: Realme P1 Speed. All build work runs in Codex Cloud; no personal computer is required.

The playable slice is the Eastern Temple District. Version 0.3 adds a taller layered sanctuary, an elevated pagoda, market stalls, stone guardians, planted terraces, finer original foliage, textured mountain cliffs and a redesigned robed traveler. Follow the eastern gate to a real stairway and climb to the Sky Temple. Four landmarks unlock discovered-waypoint travel. Terrain streams through a bounded 3×3 region grid. Visuals remain stylized; concept-image realism and wider combat, dragon and crafting systems remain in development.

Speak to Keeper Sen in the starting courtyard, recover the jade lantern from the upper Sky Temple, and return to earn a visible lantern for your traveler. The contextual action appears when you are close enough. The live north-up minimap shows nearby routes, landmarks, your camera heading and the quest destination.

On phone: drag in the lower-left movement zone for the floating analog joystick; swipe the right side to look; hold RUN to sprint; JUMP jumps; VIEW changes camera; MAP shows discovered-waypoint travel. SETTINGS contains quality presets, camera sensitivity/distance, pad size and SAVE/LOAD for location, landmarks and quest progress. Older saves migrate safely. Opening dialogue, map or settings releases gestures and pauses movement. Keyboard controls remain available for cloud tests (WASD/arrows, Shift, Space, V, E to interact, F5/F9, M, Esc).

Cloud setup: `tools/setup_environment.sh`. Validate: `tools/validate_environment.sh`. Build APK: `tools/export_android.sh`. The local APK is `artifacts/TempleRealm-Android-debug.apk`. Delivery uses the GitHub Actions **Temple Realm Android APK** workflow: sign into GitHub, download its APK artifact ZIP, extract it on Android, and open the APK. The workflow summary contains the actual artifact download link. A debug build is for testing, not store distribution.

See [development](docs/DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md), [test evidence](docs/TEST_RESULTS.md), [security](docs/SECURITY.md) and [asset licenses](docs/ASSET_LICENSES.md). Six workflows are discoverable in `.agents/skills/`.
