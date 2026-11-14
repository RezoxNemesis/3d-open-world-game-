# Hero avatars

Vikas, Mira and Arjun use avatars from the **Microsoft Rocketbox Avatar Library**
(https://github.com/microsoft/Microsoft-Rocketbox), released under the MIT License
(see `LICENSE-Rocketbox.md`, Copyright (c) 2020 Microsoft).

| Hero  | Rocketbox avatar | Files |
|-------|------------------|-------|
| Vikas | Male_Adult_11 body (clothing recoloured to the reference: black shirt, olive cargo trousers with side pockets, dark leather boots; skin tone matched) + Male_Adult_17 head texture | `vikas/` |
| Mira  | Military_Female_01 (Professions) re-textured to a black tactical outfit by `tools/blender/mira_tactical.py`: black jacket, charcoal cargo trousers, dark olive-black plate carrier and pouches, black boots and gloves; warm skin tone, dark brown hair, brown eyes. The helmet is not drawn | `mira/` |
| Arjun | Male_Adult_15    | `arjun/` |

The textures were resized to 1024² (512² for specular) and converted to JPEG/PNG for the game.
The models are animated at runtime by retargeting the game's procedural skeleton onto the biped rig (`src/avatars.js`).

## Motion capture

The walk, jog, run, sprint and idle cycles in `assets/anim/` are converted from the animation set of the same
**Microsoft Rocketbox** library (MIT License, Copyright (c) 2020 Microsoft): `idle_breathe_01`, `walk_neutral_01`,
`walk_fast_01`, `run_slow_01`, `run_neutral_01`, `run_fast_01` (male and female). `tools/anim/prep.mjs` removes the forward
drift so they play in place, measures each cycle's ground speed and foot-plant phase and writes compact JSON clips.
