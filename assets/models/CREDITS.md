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
