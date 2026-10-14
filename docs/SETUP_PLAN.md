# Temple Realm setup plan

The requested file supplies the autonomous design brief. Build a small playable ancient temple courtyard, not an entire production open world. Use officially verified Godot 4.7.2, GDScript, deterministic procedural assets, modular player/world/save components, and bounded automated tests. The user confirmed mobile-only Android development on a Realme P1 Speed; add touch controls and cloud APK delivery, retaining desktop checks for diagnosis.

1. Verify the official release checksum; retain the preinstalled engine for rollback. Pin Python tool wheels with hashes in an isolated environment.
2. Write failing Godot behavioral tests for scene availability, grounded movement, jumping, collisions, save/load and deterministic region seeds. Implement the courtyard, character, camera, HUD and persistence.
3. Create idempotent setup/start/validate/test/security scripts and six discoverable skills; test their commands and frontmatter.
4. Import and lint; execute main scene and behavior tests; attempt actual software-rendered screenshots and desktop export with matching verified templates.
5. Record exact evidence, production backlog and rollback instructions; save cloud installation/startup configuration. No remote publication, paid services or signing credentials.

Review focus: missing runtime caches; interrupted downloads; clean-checkout imports; controls released between tests; invalid save files; unsupported rendering; platform export limits. Each must fail clearly or be reported unverified, never silently pass.
