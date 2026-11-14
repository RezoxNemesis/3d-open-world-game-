# Hero avatars

Vikas, Mira and Arjun use avatars from the **Microsoft Rocketbox Avatar Library**
(https://github.com/microsoft/Microsoft-Rocketbox), released under the MIT License
(see `LICENSE-Rocketbox.md`, Copyright (c) 2020 Microsoft).

| Hero  | Rocketbox avatar | Files |
|-------|------------------|-------|
| Vikas | Male_Adult_17    | `vikas/` |
| Mira  | Female_Adult_11  | `mira/` |
| Arjun | Male_Adult_15    | `arjun/` |

The textures were resized to 1024² (512² for specular) and converted to JPEG/PNG for the game.
The models are animated at runtime by retargeting the game's procedural skeleton onto the biped rig (`src/avatars.js`).
