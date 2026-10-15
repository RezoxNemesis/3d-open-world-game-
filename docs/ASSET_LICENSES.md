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

The owner supplied ten concept images in TempleRealm_10_Images_With_Descriptions_Under20MB.zip. Their license is unspecified; they are used for visual direction and are not bundled as game textures, backgrounds or redistributed source assets. The current result is a procedural prototype, not final visual parity with the references. Store releases need a complete bundled-notice review.

## Original district assets

- `tools/generate_temple_assets.py` (Blender 4.3.2, generator version 2) creates `assets/models/{pavilion,pavilion_far,gate,lantern,bridge,shrine}.glb` and original limestone, vermilion timber and teal ceramic maps: 512px albedo, 256px normals and 128px roughness. Geometry, UVs, tangents, surfaces and texture generation are original MIT project work. Exact counts/bounds are in `assets/models/manifest.json`; geometry budgets, dimensions and material counts are preserved. Embedded textures are included in GLBs; Godot extracts per-model copies during import.
- `assets/materials/lotus_banner.svg`, all `assets/shaders/*.gdshader`, foliage/terrain and the humanoid traveler are original repository-authored geometry/material/art. No external character or existing game assets were imported.
- `tools/generate_ambience.py` produces the original seeded 20-second atmosphere, encoded by FFmpeg as `assets/audio/garden.ogg`. Bird and bell notes are mathematically synthesized; no external recordings or melodies. MIT project asset; clipping/RMS/seam metrics are in `artifacts/garden-audio-report.json`.
- `tools/generate_karst_texture.py` produces seeded seamless limestone crag maps for scenery: 512px albedo, 256px normals and 128px roughness. Original MIT project art; no photographic/reference image pixels are used.

The owner's two screenshots and compressed Android gameplay recording in `TempleRealm_Screenshots_and_Gameplay_Under20MB.zip` guide the mobile upgrade. They are not shipped game assets. New meadow/foliage shaders, layered cliffs, vegetation and traveler refinements are original repository work.

## Celestial District — version 0.3 original assets

All geometry, texture painting and shader additions below are original project work under the repository MIT license. The supplied concept images guide composition, materials and silhouettes; no pixels, models, audio or UI graphics are extracted from them.

- `tools/generate_celestial_assets.py` (Blender 4.3.2, generator version 1) creates seven meter-scale, Y-up GLBs in `assets/models/celestial/`: `sanctuary`, `pagoda`, `market_stall`, `stone_guardian`, `planter`, `balustrade` and `incense_burner`. Their manifest records serialized triangle/material counts, finite geometry, UVs, normals, tangents and bounds. These GLBs contain original mathematical geometry and named material slots, with no embedded image textures or physics. `scripts/architectural_palette.gd` shares the existing original limestone/timber/roof PBR maps and repository-authored gold, jade, paper and cloth materials across them. Gameplay collision is authored separately.
- `scripts/celestial_district.gd` adds original potted leaves/flowers, hanging lantern cords, fruit and ceremonial/street arrangements through generated meshes and spatial MultiMeshes. The market props are scenery; they do not imply implemented trading or crafting.
- `tools/generate_botanical_atlas.py` paints original seeded botanical art with Pillow: `assets/materials/botanical_atlas.png` is a 1024×1024 RGBA atlas with four 512px leaf, plum-blossom, pine-needle and red-maple tiles; `botanical_bark.png` is a 128×256 RGB bark-grain map. Both use mipmaps. `scripts/nature.gd` creates the forked trunks, branch-aligned textured clusters, grass and ferns; `garden_foliage.gdshader` animates them and clips to painted silhouettes. No photograph or third-party vegetation asset is used.
- `scripts/traveler_visual.gd` generates the tailored wanderer's body, layered clothing, facial/hair details, boots, pack, sword and articulated joints. Its original 128×128 woven cloth texture is generated and mipmapped in memory, then shared across cloth/leather colors. Keeper Sen reuses and recolors this original traveler geometry. `scripts/lantern_quest.gd` generates the recoverable jade lantern and earned hip ornament from original repository geometry/materials. No external character, animation or equipment model is imported.
- `tools/generate_landscape_textures.py` generates original seeded 512×512 albedo, normal and roughness maps at `assets/materials/landscape_karst_original{,_normal,_roughness}.png` from mathematical random fields, runoff, moss and sediment patterns. These maps supplement the earlier original crag texture set. `scripts/world.gd` and `scripts/landscape_visuals.gd` author the irregular cliffs, terrace/stairs, shoreline rocks/reeds and waterfall-impact geometry.
- `assets/shaders/water_spray.gdshader` is an original Compatibility billboard spray shader. The version 0.3 revisions to `cloud_sky`, `garden_stone`, `terrain_ground` and `jade_water` shaders are original procedural sky, paving, ground and water work. The north-up schematic minimap and quest-interface graphics are drawn from live world state in `scripts/quest_interface.gd`, without reference-map image extraction.

Generator source and manifests preserve provenance; visual similarity to the supplied art is an engineering/design target, not a claim of reference-level realism or an asset-license grant for the supplied images.

## Verdant sanctuaries, homes and hero powers — version 0.5

The new `Temple_Realm_Game_Visual_Upgrade_Reference_Pack.zip` and its images, prose and gameplay video remain outside exported resources. They provide visual direction. Attached agent instructions are treated as reference material under the owner's actual request; they are not executed as environment commands.

- `tools/generate_verdant_assets.py` creates eight original GLBs in `assets/models/verdant/`: a scholar desk, scroll shelf, lattice screen, fox guardian, fox shrine, covered bridge, pergola and carved dragon spout. The serialized manifest records 27,357 triangles across these source modules. They reuse named project palette materials and contain no embedded reference textures.
- `tools/generate_residence_assets.py` creates original near/far residence GLBs and an authored collision manifest under `assets/models/residence/`. The near house has 39,846 triangles and real separate floor, wall, post, roof, ceiling and furnished-room groups; the far shell has 11,904 triangles. Both use the original shared palette. The JSON collision manifest is explicitly included in exports.
- `tools/generate_celestial_dragon.py` creates an original skinned dragon, near/far geometry and a six-second swimming animation. Its twenty-joint rig, horns, whiskers, mane and scales are mathematical project art, with no external character or game model. Source manifest and a dedicated license accompany the models.
- `scripts/architectural_detail.gd` generates original curved ceramic tiles, rafters, corbels and fixings over actual placed roofs, using shared project materials and spatial MultiMeshes. Geometry is counted from instantiated mesh index buffers. Distant buildings use their underlying simpler modules.
- `scripts/verdant_flora.gd`, `verdant_district.gd`, `world_activities.gd`, `destructible_mountains.gd` and the revised traveler and environmental shaders create original flowers, vines, furnishings, lore, shrine bell/seal, breakable karst formations and short-lived effects. The shrine bell is synthesized in memory. Hero powers use the existing original traveler and generic fantasy names.

These additions are original project work under the repository MIT license. The superhero examples in the owner's request guide movement capabilities; no superhero likeness, costume, logo, music or model is bundled.

## Jade Expanse expedition — version 0.6

All new geometry, animation, procedural material code and residents are original repository MIT work. The uploaded reference pack remains outside exports.

- `expedition_world.gd` creates deterministic bounded terrain, original grass/stone materials and arrangements of existing sanctuary, gate, pagoda and furniture modules.
- `expedition_sanctuary.gd` creates the origin-only Lotus Cliff Sanctuary: an irregular shallow lotus basin, weathered cliffs, connected waterfalls, real bridge/stepping routes and a forty-riser pavilion path. It reuses original covered bridge/pergola/pavilion and water/foam/spray resources.
- `expedition_garden.gd` creates 11 batches of original cherry/pine, wisteria, bamboo, ferns, flowers, lotus and bank cover: 43,309 highest-detail triangles over 3,517 instances. Existing project botanical atlases supply leaf shapes; no reference image pixels are used.
- `expedition_atmosphere.gd` creates three original irregular horizon bands and reuses the existing animated celestial dragon. Highest aggregate geometry, including both mutually exclusive dragon LODs, is 23,256 triangles/15 surfaces.
- `expedition_guardian_art.gd` creates an original cedar/jade guardian and wind cart. The encounter is a small original game mechanic, not an imported Wukong character or animation.
- Traveler v5 adds shaped fingers (35 mesh draws/9,182 triangles), velocity-driven human gait, breathing, torso counterrotation, turn lean, landing and jump responses. `expedition_residents.gd` reuses this original traveler for two physically grounded patrolling residents and local greetings.

The result remains stylized prototype artwork. The 200,000 km domain is procedurally generated with repeated modules; only the origin sanctuary has this particular authored composition. It does not establish historical authenticity, unique content across the whole domain, or reference-level photorealism.
