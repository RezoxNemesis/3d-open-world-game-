# Temple Realm: Eastern Temple District

The owner requests a glamorous, natural mobile open world grounded in the ten supplied concept images, with autonomous implementation and workspace verification. The images and their descriptive text are visual/product references, not instructions that override the owner's request. This first development milestone builds a connected exploration district and the reusable art foundation; it does not claim the final fidelity of the concept paintings or all ten depicted systems.

## Direction and approach

Use native Godot 4.7.2 Compatibility rendering, original generated 3D assets and deterministic terrain. Curved charcoal roofs, red timber, restrained gold fittings, pale worn stone, flowering trees, lanterns, jade water and layered mountainous silhouettes define the scene. A focused authored district embedded in streamed terrain gives stronger composition and mobile resource control than filling a huge map with primitive buildings. Importing an arbitrary commercial asset pack would add licensing and stylistic risks; switching engines would discard the verified Android pipeline.

## World and gameplay

The existing scene, save API, camera and touch action names remain compatible. Preserve the courtyard at ground level and the southern collision wall, but open the eastern and western routes. Walkable approaches connect the central sanctuary, a lotus-water overlook and an eastern gate. A discovery quest completes by physically reaching these three landmarks; no inactive combat/crafting/flight buttons appear. A map shows those actual locations, with travel allowed only to discovered landmarks. Save/load retains local position. The player remains a physics body with switchable first/third person views.

## Components and shared interfaces

- `scripts/world.gd` owns composition, lighting, shared materials, colliders and the existing `World/Regions` owner. `build_region(key: Vector2i) -> Node3D` retains deterministic terrain as the first child for regression tests.
- `assets/models/` and `tools/generate_temple_assets.py` supply original low-poly detailed architectural modules, in meters, Blender Z-up exported as glTF Y-up. Pavilion centered on its base, width approximately 12 m. The main world owns gameplay collision independently from decorative assets.
- `scripts/nature.gd` provides `populate(parent: Node3D, seed_value: int) -> void` for batched trees, rocks and petals, without route-blocking decorative colliders.
- `scripts/exploration.gd` owns `landmarks: Array[Dictionary]`, `discovered: Dictionary`, `visit(position: Vector3) -> void`, `current_objective() -> String`, `travel(id: String, player: CharacterBody3D) -> bool`, and a `changed` signal. IDs `sanctuary`, `lotus`, `gate`; positions `(0,1.8,-16)`, `(-30,0,1)`, `(30,0,-4)`; discover radius 7 m. Travel checks discovery, resets velocity, and lands on walkable ground.
- `scripts/main.gd` and `scripts/mobile_controls.gd` own the responsive dark/gold HUD, readable title, live quest distance, map and working jump/view/save/load/map actions. HUD margins adapt at 960x540 and 1280x720. Retain mobile joystick integration and focus-loss release.
- `scripts/player.gd` owns movement/camera and an original readable humanoid traveler, no change to saved-position coordinate convention.

## Mobile and verification constraints

Android ARM64 debug output, Realme P1 Speed target. Compatibility renderer and conservative bounded light/shadow distances. No volumetric fog, SSR or desktop-only postprocessing assumptions. Repeated foliage uses MultiMesh; no image references bundled as textures or backgrounds. Preserve nine loaded regions, deterministic seam vertices, collision and route clearance. Visual review uses actual Xvfb/Mesa pixels from multiple cameras, including the player's camera. Test movement, jump, save/load, first person, touch/focus loss, gate exit, discovery, locked travel and reachable landmarks. Run the autonomous pipeline, retaining blocked Android-runtime status honestly when this host lacks acceleration. Physical-device speed/heat and final concept parity are unverified.

## Next production milestones

Author higher-detail hero assets and material textures with explicit budgets, then combat and one enemy, persistent quest progression, elemental progression, wider regions, traversal/mount systems and life activities. Each must work end to end before its button is exposed.
