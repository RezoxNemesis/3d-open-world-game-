# Temple Realm

- Use the existing isolated checkout; do not create a worktree unless requested.
- Android and touch are primary; the owner only has a Realme P1 Speed phone. Build APKs in cloud.
- Always provide direct GitHub download URLs for APKs and other downloadable deliverables. Verify the download and its checksum; workspace paths are not the owner's download links. See `docs/AUTONOMOUS_WORKFLOW.md` for delivery.
- Read `docs/DEVELOPMENT.md` and `docs/TEST_RESULTS.md` before changes.
- Run `tools/setup_environment.sh`, then `tools/validate_environment.sh` and `tools/security_audit.sh`.
- Keep changes small, add real behavior tests, and preserve assets and user changes.
- Consult `.agents/skills/` for Godot engineering, generation, art, cinematics, performance and QA/security workflows.
- Pin official stable Godot and matching templates; use inherited TLS/proxy trust and never disclose secrets.
- Report actual rendering/device coverage. Do not publish, purchase, force-push or delete remote history without authorization.
- Make recoverable local commits after verified milestones. See `docs/DEVELOPMENT.md` for recovery and backlog.

## Autonomous working preference

The owner requests ordinary implementation decisions, builds, tests, fixes and Git checkpoints without repeated confirmation. Do not wait for phone testing before doing independent work. After a meaningful change, run `tools/autonomous_cycle.sh`; inspect its current report and diagnose failures before retrying. Use the next in-scope item from `docs/ARCHITECTURE.md` during development tasks. Preserve the last-good artifact and record the next step in `docs/AUTONOMOUS_WORKFLOW.md` when handing off.

Work within the active task and platform limits. The cycle is a bounded validator, not an AI worker that continues after a session ends. Use supported corrections and alternatives; never circumvent access controls, disable integrity checks or claim emulator results establish Realme performance. Routine repository work is authorized by the owner; paid services, store publication and destructive history changes remain separate actions.
