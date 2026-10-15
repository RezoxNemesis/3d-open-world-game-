# Temple Realm

Android-first Godot 4.7.2 open-world starter for a mobile-only developer. Target phone: Realme P1 Speed. All build work runs in Codex Cloud; no personal computer is required.

The playable slice is the Eastern Temple District. Version 0.5 adds a furnished scholar hall, an elevated western covered bridge and Fox Shrine, wisteria gardens, a two-room home, a swimming sky dragon and modeled roof tiles and joinery. Both elevated temples have real walkable stair routes. Five landmarks unlock discovered-waypoint travel. Terrain streams through a bounded 3×3 region grid. Near buildings use richer shared geometry with distance-based detail. Visuals remain stylized; reference-level realism remains in development.

Speak to Keeper Sen in the starting courtyard, recover the jade lantern from the upper Sky Temple, and return to earn a visible lantern for your traveler. The contextual action appears when you are close enough. The live north-up minimap shows nearby routes, landmarks, your camera heading and the quest destination.

Read three original inscriptions in the scholar hall, western bridge and shrine. After completing the lantern errand, ring the nearby shrine bell to earn a visible jade seal. SETTINGS → JOURNAL revisits earned records. The house south of the courtyard has two furnished rooms reached by a side path and front steps.

On phone: drag in the lower-left movement zone for the floating analog joystick; swipe the right side to look; hold RUN to sprint; JUMP jumps; VIEW changes camera; MAP shows discovered-waypoint travel. FLY toggles collision-aware flight, with JUMP to rise, DOWN to descend and RUN to boost. Hold and release LEAP for a huge charged jump. SPEED toggles fast ground travel; RUN boosts it further. SMASH breaks nearby marked mountain formations, including their collision. Three specific crags can be broken; general terrain excavation is not implemented.

SETTINGS contains quality presets, look sensitivity, camera distance, pad size, optional edge-of-pad sprint assistance and SAVE/LOAD. Android automatically checkpoints earned milestones. Schema5 saves location, discoveries, quest/journal/reward progress, hero modes and destroyed formations; older saves migrate safely. Opening dialogue, map or settings releases gestures and pauses character movement. Keyboard cloud-test controls: WASD/arrows, Shift, Space, V, E, F5/F9, M, Esc; F toggles flight, Q charges a leap, G toggles speed, R smashes and C descends.

Cloud setup: `tools/setup_environment.sh`. Validate: `tools/validate_environment.sh`. Build APK: `tools/export_android.sh`. The local APK is `artifacts/TempleRealm-Android-debug.apk`. Delivery uses the GitHub Actions **Temple Realm Android APK** workflow: sign into GitHub, download its APK artifact ZIP, extract it on Android, and open the APK. The workflow summary contains the actual artifact download link. A debug build is for testing, not store distribution.

Use SETTINGS → RESTORE MOUNTAIN CRAGS to rebuild the three formations for another round of smashing while keeping earned journey progress.

See [development](docs/DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md), [test evidence](docs/TEST_RESULTS.md), [security](docs/SECURITY.md) and [asset licenses](docs/ASSET_LICENSES.md). Six workflows are discoverable in `.agents/skills/`.
