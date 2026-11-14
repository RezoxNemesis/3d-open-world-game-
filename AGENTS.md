# Daman Duo — agent notes

- Open-world 3D game set in Daman, India, built in code (Three.js / WebGL2). Only CC0 photo textures (Poly Haven, `assets/tex/`, credits in `assets/tex/CREDITS.md`) come from outside; keep any new external assets CC0 and credited.
- The player is **Vikas** (single protagonist, the owner's name). Mira is an AI friend; do not reintroduce hero switching.
- One codebase, three shells: `dist/` (web), Electron desktop (`electron/`, Ultra graphics) and Capacitor Android (generated in CI, patched by `tools/patch_android.py`, Mobile graphics + touch controls).
- Build: `npm ci && npm run build`. Test: `python3 tools/render_test.py --ci` (headless Chrome, screenshots in `test-out/`). Every new system should register a scenario on `window.__TEST`.
- Delivery: GitHub Actions workflow **Build Daman Duo** builds the APK and desktop apps on every PR/push; every push to `main` (and any `v*` tag) publishes a GitHub Release with all downloads. Tag pushes from the agent sandbox are blocked by the proxy, so merge to main to release.
- The previous Godot project (Temple Realm) is preserved on branch `temple-realm-archive`.
- Owner works from an Android phone (Realme P1 Speed) and a Windows PC; keep the mobile preset fast.
