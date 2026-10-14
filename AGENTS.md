# Temple Realm

- Use the existing isolated checkout; do not create a worktree unless requested.
- Android and touch are primary; the owner only has a Realme P1 Speed phone. Build APKs in cloud.
- Read `docs/DEVELOPMENT.md` and `docs/TEST_RESULTS.md` before changes.
- Run `tools/setup_environment.sh`, then `tools/validate_environment.sh` and `tools/security_audit.sh`.
- Keep changes small, add real behavior tests, and preserve assets and user changes.
- Consult `.agents/skills/` for Godot engineering, generation, art, cinematics, performance and QA/security workflows.
- Pin official stable Godot and matching templates; use inherited TLS/proxy trust and never disclose secrets.
- Report actual rendering/device coverage. Do not publish, purchase, force-push or delete remote history without authorization.
- Make recoverable local commits after verified milestones. See `docs/DEVELOPMENT.md` for recovery and backlog.
