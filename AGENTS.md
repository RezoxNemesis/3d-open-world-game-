# Daman Duo — agent notes

- Open-world 3D game set in Daman, India, built in code (Three.js / WebGL2). External assets: CC0 photo textures (Poly Haven, `assets/tex/`, `assets/tex/CREDITS.md`) and the three hero avatars from Microsoft Rocketbox (MIT, `assets/avatars/`, `assets/avatars/CREDITS.md`). Keep any new external assets CC0/MIT and credited.
- Hero avatars are driven by retargeting the procedural `Human` skeleton every frame (`src/avatars.js`); poses are still authored in `human.js` `Pose`. If an avatar fails to load, the procedural body is used.
- The player is **Vikas** (single protagonist, the owner's name). Mira is an AI friend; do not reintroduce hero switching.
- One codebase, three shells: `dist/` (web), Electron desktop (`electron/`, Ultra graphics) and Capacitor Android (generated in CI, patched by `tools/patch_android.py`, Mobile graphics + touch controls).
- Build: `npm ci && npm run build`. Test: `python3 tools/render_test.py --ci` (headless Chrome, screenshots in `test-out/`). Every new system should register a scenario on `window.__TEST`.
- Delivery: GitHub Actions workflow **Build Daman Duo** builds the APK and desktop apps on every PR/push; every push to `main` (and any `v*` tag) publishes a GitHub Release with all downloads. Tag pushes from the agent sandbox are blocked by the proxy, so merge to main to release.
- The previous Godot project (Temple Realm) is preserved on branch `temple-realm-archive`.
- Owner works from an Android phone (Realme P1 Speed) and a Windows PC; keep the mobile preset fast.
- Standing brief from the owner (Nov 2026): push towards AAA quality in repeated updates; nothing may pop in or visibly drop in quality; phones must aim for 60-90 fps; every update gets a stress test and progress photos. Roadmap after v1.12: story (portal outbreak, mission choices, chai as a hobby rather than a mission, new music and voices), faces/hands/NPC quality, then India beyond Daman as downloadable regions.
- Rendering rules that keep the picture stable: every distance cut-off dissolves (`src/fade.js`: `aFadeCtl` far/dissolve and `aLodBand` cross-dissolve attributes, added automatically by `patch()` and `instTiles()`); new instanced prop sets go through `instTiles` (two-layer LOD, automatic far model); never add a single huge polygon (the old 90 km sea quad bled through the land at some resolutions) - tessellate.
- Weapons are placed by `src/aimrig.js` (two-bone IK on the avatar or the procedural body); gun models follow the convention origin = top of the pistol grip, +Z barrel, +Y up.
- `src/upscale.js` = FSR-style EASU + RCAS (DLSS is not possible in WebGL); `src/bench.js` = the in-game stress test, also exposed as `window.__TEST.bench()`.
- Shaders are compiled at load (`Game.precompile()` → `renderer.compile/compileAsync` against the real scene target). Objects created later with new materials still compile on first use, so build pooled effects (explosions, weather, bosses) and add them to the scene, hidden, before `precompile()` runs. A new material kind added mid-play is a stutter on phones.
- Performance budget for the Mobile preset (measure with a draw-call profile like `/tmp/prof/draws.py` in the agent sandbox): about 600k triangles and under 300 draw calls in town; the sandbox has no GPU, so real fps comes from the owner running the in-game stress test.

