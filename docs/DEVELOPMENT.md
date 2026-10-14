# Cloud development and mobile delivery

Use the existing isolated checkout at `/workspace/3d-open-world-game-`. Do not create a worktree unless the user requests one. Preserve existing user files. No computer is required for the owner: agents build in cloud and provide APK downloads for phone testing.

## Pinned tools and paths

- Godot `4.7.2.stable.official.ed1daf0bf`, verified official SHA-512 archive and matching export templates; pins in `tools/engine-lock.json`.
- Python 3.12.14; isolated `/workspace/.temple-realm/venv`. All 42 dependency wheels are exact-version/hash locked for Linux x86_64/Python 3.12 in `tools/requirements.lock`.
- gdtoolkit 4.5.0, CMake 4.4.4, Ninja 1.13.2, Pillow 12.3.0, pip-audit 2.10.1.
- Base image: Debian 13 x86_64, Git 2.52.0, Bash, GCC 14.2, Make 4.4.1, jq 1.7, FFmpeg 7.1.5, Blender 4.3.2, Java 21 runtime. These base-image tools are checked, not replaced by root installs.
- Xvfb `2:21.1.16-1.3+deb13u4`, extracted under the environment root; its SHA-256 pin came from Debian's signed security index. Mesa llvmpipe provides software rendering.
- Android command-line tools 19, official repository SHA-1 verified; Android platform 36 and build-tools 36.0.0. SDK manager checks official package downloads. Tools 23 attempted writes to the read-only home; tools 19 support workspace-local SDK metadata.

The environment root defaults to `/workspace/.temple-realm`; override `TEMPLE_ENV_ROOT` only to a writable path. `tools/common.sh` prepends pinned executables to PATH and redirects XDG and pip caches; it preserves injected proxy/CA settings and HOME. Source it in each new shell before direct `godot` commands. `gdtools.py` adapts the pinned linter's legacy cache path without changing dependency files.

## Commands for agents

```bash
cd /workspace/3d-open-world-game-
tools/setup_environment.sh
tools/validate_environment.sh
tools/security_audit.sh
tools/export_android.sh
tools/render_environment.sh
```

Setup verifies archives, installs hash-locked tools, imports the project and configures the SDK and local debug key. A fresh task still needs startup/import checks; live processes do not survive snapshots. Headless smoke: `tools/start_environment.sh smoke`. GUI editor/game modes require a display; Xvfb is for capture, not a user-facing cloud preview.

APK: `artifacts/TempleRealm-Android-debug.apk`. Download on the Android phone and install for testing; Android may ask you to allow installation from the downloading app. No account, Internet permission or release signing key is required by this prototype. Report the phone's observed behavior instead of inferring results from desktop or headless checks.

Desktop diagnostic export after `source tools/common.sh`: `godot --headless --export-release 'Linux Desktop' artifacts/TempleRealm.x86_64`. Actual screenshots: `tools/render_environment.sh` creates `artifacts/temple-courtyard.png` using a temporary Xvfb process with TCP disabled; the script stops only its own process.

## Recovery and continuity

Verified engine/mobile environment milestone: `ef08c0d`.

Original empty-repository checkpoint: `15ca76636a069cebd2d1980f6afaacd39fed43fe`. New milestones are local Git commits, not remote pushes. Start with `git status` and inspect `git log`; preserve uncommitted work before recovery. Use `git revert <milestone>` for a deliberate undo rather than destructive reset. Re-run setup and validation after source or tool changes.

The preinstalled Godot 4.6.3 remains at `/opt/godot/4.6.3`; it is a tool rollback candidate, not a validated compatible engine for this 4.7.2 project. Change engine/template pins together only after verified upgrade/downgrade tests. Keep published checksums; if a cache checksum fails, quarantine only that downloaded cache artifact and fetch the official artifact again.

The cloud installation/startup draft is separate from runtime execution. Review and save it in environment settings and publish the environment to snapshot the prepared filesystem. Fresh-task restoration and remote repository integration must be independently verified; no remote branch or store publication is performed by this setup.

Required domains are the existing package-manager preset: github.com, release-assets.githubusercontent.com, raw.githubusercontent.com, pypi.org, files.pythonhosted.org, dl.google.com and security.debian.org. No new credential binding is needed. The Android preset disables one-click USB deployment/device polling; direct APK export remains enabled. Full Gradle/JDK workflows, release keystores and Play Store delivery remain outside this prototype's tested path.
