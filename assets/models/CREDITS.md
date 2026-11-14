# Models

Photo-scanned rocks from [Poly Haven](https://polyhaven.com), all **CC0** (public domain). Processed for the game
in Blender by `tools/blender/bake_rocks.py`: decimated to a game budget, re-unwrapped, and the scan's colour,
AO/roughness and surface detail baked onto the low-poly (2K for desktop, 1K for phones).

| file | source | used for |
|---|---|---|
| `boulder_01.glb` | [Boulder 01](https://polyhaven.com/a/boulder_01) | sea-wall riprap, beach boulders |
| `coast_land_rocks_03.glb` | [Coast Land Rocks 03](https://polyhaven.com/a/coast_land_rocks_03) | rock clusters on the shore |
| `coast_rocks_01.glb`, `coast_rocks_02.glb` | [Coast Rocks 01](https://polyhaven.com/a/coast_rocks_01), [02](https://polyhaven.com/a/coast_rocks_02) | rocky intertidal shelves |
| `rock_07.glb` | [Rock 07](https://polyhaven.com/a/rock_07) | pebbles and small stones |

## Built in Blender for Daman Duo

| file | made by | used for |
|---|---|---|
| `palm_coconut.glb`, `palm_coconut_lod.glb` | `tools/blender/palm_atlas.py` (painted frond/bark atlas) + `tools/blender/palm_model.py` (curved ringed trunk, 26 V-folded fronds, dry fronds, coconuts; 2.4k tris, LOD 460 tris) | every coconut palm in the world |
| `kit_facades.glb`, `kit_facades_lod.glb` | `tools/blender/kit_facades.py`: a modular facade kit (Portuguese-colonial arched windows with louvred shutters, iron balconies and arched doors; Indian town grilled windows, chajjas, shops with rolling shutters and sign bands; hotel glazing and balconies; cornices, parapets, string courses, plinths, pilasters) | dressing every town, colonial and hotel building near the camera |
| `farmhouse.glb`, `farmhouse_b.glb`, `cowshed.glb`, `haystack.glb`, `fodderstack.glb`, `watertank.glb`, `well.glb`, `bullockcart.glb`, `tractor.glb`, `fence_bamboo.glb`, `fence_paddock.glb`, `stable.glb`, `haybales.glb`, `trough.glb` | `tools/blender/farm.py`: farm and ranch props modelled with the game's CC0 Poly Haven texture sets (plaster, clay roof tiles, wood, tin, brick, stone) plus procedural straw and thatch, then baked to one albedo x AO texture and a normal map per prop | farmsteads round the villages, haystacks in the fields, Kesar Horse Ranch |
| `horse/horse.glb` (+ `horse.json` joint layout) | `tools/blender/horse.py`: anatomical lofts unioned with a voxel remesh into one smooth skin, mane and tail strands, AO baked to vertex colours, weighted to the game's horse joints | every horse (coat colour is set per horse in the game) |
| `cars/*.glb` | `tools/blender/carbody.py`, `cars.py`, `plane.py` (see `cars/CREDITS.md`) | hero cars and the business jet |
