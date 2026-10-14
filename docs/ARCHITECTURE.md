# Architecture and production backlog

## Implemented starter

`scenes/main.tscn` composes independent world and physics player components. `scripts/main.gd` registers input, presents the HUD and coordinates local saves. `scripts/mobile_controls.gd` maps multi-touch joystick/buttons and camera drag onto the same gameplay controls. Focus loss releases movement. `scripts/player.gd` handles camera-relative movement, jumping, collision, first/third person and fall recovery; the capsule/cloak and walking bob are placeholders.

`scripts/world.gd` creates shared rough PBR materials, deterministic courtyard architecture, shallow pool, foliage, rocks and directional shadows. Eight 0.22 m temple steps are reached with jumping; automatic step traversal is not yet implemented. `scripts/region_streamer.gd` owns nine 128 m regions, loads neighboring terrain with one deterministic factory, removes distant regions, and emits load/unload signals. Each region has a 16×16 coarse mesh with collision. The courtyard is a fenced hero region; unrestricted exploration will require removing/adding gates and designing safe routes. Current region generation is synchronous, not a production streaming scheduler.

`save_store.gd` writes a versioned JSON position through a temporary file and rename. Corrupt, oversized, incompatible and invalid coordinates fall back safely. This is positional persistence, not a full quest/world save system.

## Mobile target

Realme P1 Speed, Android, arm64. Compatibility/OpenGL is the validated baseline. Logical landscape resolution 1280×720, Android 3D scale 0.85 and 1024 directional shadow map. Keep a high-quality phone experience through authored art, lighting and measured budgets; these defaults do not promise any frame rate. Desktop Forward+ can be invoked with `godot --rendering-method forward_plus`, but is unverified here and must not silently become the mobile default.

Provisional content budgets: nine regions maximum; no more than 25,000 terrain triangles across active regions; keep decorative meshes without collision unless traversal needs it; one shadow-casting sun and four short-range non-shadow point lights. Tile and foliage instancing, a detail-quality selector and on-phone profiling are next steps. Budget values require device measurement.

## Next increments, in order

1. Install the debug APK on the target phone; check touch reachability, movement, jump, camera, save/load, memory, heat and frame time. Add adjustable render scale and foliage/shadow quality after measurement.
2. Replace hero-region primitive art with reviewed Blender/glTF assets, UVs and appropriately licensed PBR textures. Add automatic stair stepping, camera polish and authored player animations.
3. Add asynchronous region jobs, biome-specific terrain/vegetation, MultiMesh foliage, actual geometric LOD, cliffs and cave interiors. Include cancellation, seams and collision continuity tests.
4. Add bounded weather, compatible atmosphere/fog, spatial ambient audio, animated water and cinematic camera sequencing with mobile fallbacks.
5. Introduce NPC/quest interfaces and full versioned world saves only after traversal and streaming are stable.

Caves, weather, spatial audio, production animation, AI/NPCs and quests are not implemented in this starter. Skill workflows are guidance, not evidence that those systems exist.
