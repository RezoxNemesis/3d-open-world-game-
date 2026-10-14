# Architecture and production backlog

## Eastern Temple District milestone

`scenes/main.tscn` composes world, physics traveler and input/HUD coordinators. `scripts/world.gd` builds the authored sanctuary, side pavilions, eastern gate, lotus waterfront, stone routes, mountain silhouettes and waterfalls. Original curved-roof Blender/glTF modules replace the first courtyard's primitive architecture. Imported pavilion plinths are offset so visible upper floors match gameplay collision. Pillar collision is aligned separately; the eastern and western exits are open. The eight 0.22 m risers can be walked using a bounded 0.28 m capsule-clearance step probe; higher walls and overhead obstructions remain blocking.

`scripts/nature.gd` creates seeded flowering trees, pines and rocks in 32 m MultiMesh groups. Low-triangle petal meshes and smaller distant pavilions control repeat geometry. Eighteen lantern placements share six material MultiMeshes. `assets/models/manifest.json` records exact asset bounds, triangle counts and generator provenance. The art remains an original procedural foundation, with visibly simplified foliage, terrain and characters relative to the concept images.

`scripts/region_streamer.gd` preserves nine 128 m regions. Each 16×16 grid has walkable collision; globally sampled height gives matching shared edges and deterministic regeneration. Loading a saved distant position builds its neighboring terrain before moving the player. Generation remains synchronous. The district assets remain loaded as a bounded authored scene; distant cliff pavilions are scenic landmarks without authored climbing routes.

`scripts/player.gd` implements camera-relative physics movement, walking limbs, jumping, first/third person, spring-arm collision and fall recovery. The original cream/teal traveler has a humanoid silhouette, pack and sheathed sword. `scripts/mobile_controls.gd` maps multi-touch joystick, independent actions and camera swipe. Opening the map freezes movement and releases latched actions; focus loss clears all actions.

`scripts/exploration.gd` discovers Cloud Sanctuary, Lotus Overlook and Eastern Gate by reaching them. Main HUD displays real progress and distance. The map draws district positions and supports travel only to discovered waypoints. No unimplemented combat or progression buttons are exposed. `save_store.gd` persists versioned position JSON with corruption/schema/size/coordinate checks. Discovery is session-local; full quest/world persistence is a next increment.

`assets/shaders/` implements paving wear, cloud sky, animated jade water, fine-flow waterfalls and gently moving silk banners using Compatibility features. One sun casts bounded two-split shadows; two short-range non-shadow lights supplement emissive lantern art. `scripts/ambience.gd` plays a quiet original 20-second Vorbis loop of synthesized wind/water, bird motifs and a bell. Audio clipping/looping/import were checked; listening remains unverified.

## Mobile target and measured budgets

Realme P1 Speed, Android ARM64. Godot 4.7.2 Compatibility/OpenGL, logical landscape 1280×720, Android 3D scale 0.85 and 1024 directional shadow map remain the baseline. No sustained phone FPS/heat/memory claim is made from software desktop rendering or headless physics.

Terrain budget: nine active regions, 4,608 grid triangles in total. Hero pavilion: 19,068 triangles/six materials; distant variant: 2,516/six. Gate: 17,468/five; lantern: 564/six; bridge: 1,432/four; shrine: 7,436/five. Meshes share materials, decorative colliders are omitted, flowers omit shadows, and tiny lanterns/distant pavilion art omit shadows. Repeated content uses batching. Actual per-view counters are archived in `artifacts/district-render-metrics.json`; the figures include the chosen software renderer's passes and do not establish phone speed.

## Next increments

1. Add adjustable render scale and foliage/shadow quality; obtain physical-phone timing and thermal evidence when available while continuing cloud implementation independently.
2. Author richer hero terrain, dense natural foliage, detailed material normals and character animation. Match the concept's contrast and scale through real render comparisons and explicit resource budgets.
3. Add cancellable asynchronous region generation, region-owned vegetation/LOD, safe wider routes and reachable mountain temples.
4. Persist discovery and quest state in a versioned world save; introduce one NPC conversation and a quest with real rewards.
5. Implement one enemy and a complete combat loop before elemental progression, equipment, dragon traversal, crafting, farming/fishing and aquatic activities from the broader reference roadmap.

Weather, cave interiors, NPCs, combat, dragon riding, crafting and life activities are not implemented in this milestone. The ten images guide visual direction and future systems; they are not game screenshots or evidence that those systems already work.
