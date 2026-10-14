# Security and provenance

Godot 4.7.2 and export templates came from `godotengine/godot-builds` official stable assets, verified against published SHA-512 values now pinned in `tools/engine-lock.json`. Archive verification was not disabled or changed to force a pass. TLS verification and inherited cloud proxy/CA trust remain enabled.

Python tooling was resolved from PyPI; all transitive wheels are exact-version/hash pinned and installed into an isolated venv. `pip-audit --vulnerability-service pypi` checks known advisories for that environment; `pip check` verifies dependency consistency. Blender, FFmpeg, Git and Java come from the prepared base image, not unknown third-party binary plugins. Xvfb's SHA-256 is authenticated through Debian's archive keyring, InRelease and Packages index. Android tools are official Google archives with published SHA-1 integrity checking; this upstream checksum is weaker than SHA-256 and is not an independent signature. Archive paths are validated before extraction.

No third-party game plugins, downloaded textures or external runtime services are used. All project meshes/materials are procedural and deterministic. No server or TCP listener is started by the game. Capture Xvfb runs with `-nolisten tcp`; there is no public preview. The prototype APK requests no Internet access. SDK downloads and development advisory checks need network access during setup.

Debug signing uses a conventional local Android debug keystore outside the repository. It is replaceable and must never be used for a production/store release. No release signing secrets have been invented or requested. `.gitignore` excludes keystores, credentials, local environments and generated artifacts. Do not print process environments, credential files or real signing passwords.

`tools/security_audit.sh` checks source files for a limited set of credential patterns, escaping symlinks and setuid/setgid bits, records a SHA-256 inventory, checks Python dependencies and runs the advisory audit. It does not scan every OS binary, establish absence of malware or replace a professional supply-chain review. Six skills are structurally validated; independent agent pressure testing of their prose has not been performed.

Remaining review: mobile device behavior, all base-image CVEs, dependency advisories that may appear after this run, release signing and store requirements, and future external asset licensing. Do not disable TLS, checksums or tests to work around failures.
