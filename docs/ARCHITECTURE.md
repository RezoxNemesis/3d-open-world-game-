# Architecture and production backlog

## Eastern Temple District mobile upgrade — version 0.2

`scenes/main.tscn` composes world, physics traveler and input/HUD coordinators. `scripts/world.gd` builds the authored sanctuary, side pavilions, eastern gate, lotus waterfront, stone routes, mountain silhouettes and waterfalls. Original curved-roof Blender/glTF modules replace the first courtyard's primitive architecture. Imported pavilion plinths are offset so visible upper floors match gameplay collision. Pillar collision is aligned separately; the eastern and western exits are open. The eight 0.22 m risers can be walked using a bounded 0.28 m capsule-clearance step probe; higher walls and overhead obstructions remain blocking.

`scripts/nature.gd` creates seeded flowering trees, varied pines, rocks, grass and ferns in 32 m MultiMesh groups. Blossom crowns use asymmetric clusters and scissored gaps; local-axis branch scaling preserves the intended fork endpoints. Camera-only canopy colliders use layer 2 while the traveler remains on layer 1. Authored gardens/routes/pool footprints exclude ground cover. Eighteen lantern placements share six material MultiMeshes. `assets/models/manifest.json` records exact asset bounds, triangle counts and generator provenance. Original 512px albedo / 256px normal / 128px roughness maps enrich limestone, lacquer timber and glazed roofs without changing architectural geometry budgets. Separate original seamless crag maps serve irregular karst scenery. The result remains visibly stylized relative to the concept images.

`scripts/region_streamer.gd` preserves nine 128 m regions. Each 32×32 grid has walkable collision and analytical smooth vertex normals; globally sampled height gives matching shared edges and deterministic regeneration. Loading a saved distant position builds its neighboring terrain before moving the player. Generation remains synchronous. The district assets remain loaded as a bounded authored scene; distant cliff pavilions are scenic landmarks without authored climbing routes.

`scripts/player.gd` implements analog camera-relative movement, acceleration/braking, 5 m/s walking, 8 m/s held sprint, articulated walking limbs, jumping, first/third person, damped camera targets, spring-arm collision and fall recovery. The cream/teal traveler has a rounded humanoid silhouette, pack and sheathed sword. `scripts/mobile_controls.gd` maps a floating lower-left joystick with radial dead zone, independent actions and right-side camera swipe. Opening map/settings pauses physics and releases action/finger/native-button latches; focus loss also clears movement velocity. Responsive safe-area controls and expanded stretch aspect use the wide phone view.

`scripts/exploration.gd` discovers Cloud Sanctuary, Lotus Overlook and Eastern Gate by reaching them. The compact HUD displays real progress and distance; map travel requires discovered waypoints. Settings contain real save/load utilities. `save_store.gd` reads original version 1 position saves and version 2 position/discovered-ID saves with strict type/schema/size/coordinate checks and atomic write-error handling. Invalid loads preserve the current journey. `game_settings.gd` persists validated quality, sensitivity, pad size and camera distance. Full mutable world-state persistence remains future work.

`assets/shaders/` implements paving wear, cloud sky, animated jade water, fine-flow waterfalls and gently moving silk banners using Compatibility features. One sun casts bounded two-split shadows; two short-range non-shadow lights supplement emissive lantern art. `scripts/ambience.gd` plays a quiet original 20-second Vorbis loop of synthesized wind/water, bird motifs and a bell. Audio clipping/looping/import were checked; listening remains unverified.

## Mobile target and measured budgets

Realme P1 Speed, Android ARM64. Godot 4.7.2 Compatibility/OpenGL, 1280×720 base canvas expanded for wide landscape. Presets: Performance 0.70 rendering scale/no MSAA/no sun shadows/42% scalable foliage; Balanced 0.85 / 2×MSAA / 45 m shadows/72%; High 1.0 / 4×MSAA / 65 m shadows/full density. Android directional shadow map is 1024. FXAA was rejected because this engine's Compatibility renderer reports it unsupported; real captures verify MSAA instead. No sustained phone FPS/heat/memory claim is made from software desktop rendering or headless physics.

Terrain budget: nine active regions, 18,432 grid triangles in total. Hero pavilion: 19,068 triangles/six materials; distant variant: 2,516/six. Gate: 17,468/five; lantern: 564/six; bridge: 1,432/four; shrine: 7,436/five. Meshes share materials, decorative colliders are omitted, flowers omit shadows, and tiny lanterns/distant pavilion art omit shadows. Repeated content uses batching. Actual per-view counters are archived in `artifacts/district-render-metrics.json`; supplemental wide/compact/preset evidence is in `artifacts/upgrade-qa/mobile-render-metrics.json`. The figures include software-renderer passes and do not establish phone speed.

## Next increments

1. Obtain physical-phone timing, thermal and memory evidence when available; tune implemented quality presets while continuing cloud work independently.
2. Refine stylized blossom/pine silhouettes, hero terrain, water depth/shorelines and character animation toward the concept's natural feel through actual render comparisons and explicit budgets.
3. Add cancellable asynchronous region generation, region-owned vegetation/LOD, safe wider routes and reachable mountain temples.
4. Extend the implemented discovery save to mutable quest/world state; introduce one NPC conversation and a quest with real rewards.
5. Implement one enemy and a complete combat loop before elemental progression, equipment, dragon traversal, crafting, farming/fishing and aquatic activities from the broader reference roadmap.

Weather, cave interiors, NPCs, combat, dragon riding, crafting and life activities are not implemented in this milestone. The ten images guide visual direction and future systems; they are not game screenshots or evidence that those systems already work.
