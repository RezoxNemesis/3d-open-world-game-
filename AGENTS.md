# Daman Duo — agent notes

- Open-world 3D game set in Daman, India, written entirely in code (Three.js / WebGL2). No external art assets.
- One codebase, three shells: `dist/` (web), Electron desktop (`electron/`, Ultra graphics) and Capacitor Android (generated in CI, patched by `tools/patch_android.py`, Mobile graphics + touch controls).
- Build: `npm ci && npm run build`. Test: `python3 tools/render_test.py --ci` (headless Chrome, screenshots in `test-out/`). Every new system should register a scenario on `window.__TEST`.
- Delivery: GitHub Actions workflow **Build Daman Duo** builds the APK and desktop apps on every PR/push; tags `v*` publish a GitHub Release with all downloads.
- The previous Godot project (Temple Realm) is preserved on branch `temple-realm-archive`.
- Owner works from an Android phone (Realme P1 Speed) and a Windows PC; keep the mobile preset fast.
