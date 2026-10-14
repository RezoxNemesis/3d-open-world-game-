# Environment acceptance and test evidence

Validated 2026-10-14 in the current Codex cloud instance. User target: Realme P1 Speed Android; the owner has no computer. This report covers environment readiness and a small runnable test project, not a complete production game.

| Required criterion | Status | Executed evidence |
| --- | --- | --- |
| 1. Official stable Godot installed/runnable | PASS | `4.7.2.stable.official.ed1daf0bf`; official binary and matching template SHA-512 pins in `tools/engine-lock.json` |
| 2. Essential tools work | PASS | Python 3.12.14, Git/Bash, GCC/Make/jq, CMake/Ninja, FFmpeg, Blender background invocation, Pillow, gdtoolkit and pip-audit; Android SDK 36/build-tools 36.0.0 and Java runtime successfully export/sign |
| 3. Reproducible setup/start scripts | PASS | Complete `tools/setup_environment.sh` rerun exited 0 including SDK/template checks; `tools/start_environment.sh smoke` passed; cloud `install_script` and `start_skill` saved with backend `status=saved` |
| 4. Six valid discoverable skills | PASS | `tools/check_skills.py`: six valid frontmatter names/descriptions and local command references; independent agent pressure tests UNVERIFIED |
| 5. Valid project import | PASS | Headless editor import and gdtoolkit lint/format checks passed with no engine errors |
| 6. Main scene execution | PASS | Ready marker plus **28 behavior checks, zero failures**, including grounded movement, jumping/landing, wall collision, camera views, multi-touch joystick actions/release, save/schema handling and deterministic bounded terrain streaming |
| 7. Security/provenance documentation | PASS | Limited source scan, `pip check`, and current PyPI advisories: 42 Python dependencies, zero known vulnerable packages; source SHA-256 inventory generated |
| 8. Versioned recovery instructions | PASS | Original Git checkpoint preserved; verified work committed locally; rollback and continuation documented in `docs/DEVELOPMENT.md` |

## Additional checks

- Android debug APK export **PASS**: package `org.templerealm.prototype`, version `0.1.0`, arm64-v8a, minimum API 24, target API 36. APK v2 and v3 signing verification passed. No app permissions requested. Artifact: `artifacts/TempleRealm-Android-debug.apk` (28,288,560 bytes at the recorded run). Hash is recorded in `artifacts/apk-sha256.txt`.
- Actual visual rendering **PASS**: 1280×720 nonblank viewport capture with Xvfb and Mesa llvmpipe/OpenGL 4.5. Evidence: `artifacts/temple-courtyard.png` and `artifacts/render.log`. V-Sync changes are unsupported by this software driver; this warning is expected and is not GPU evidence.
- Initial Linux diagnostic export/smoke **PASS**; Android is now the primary build target.
- CI configuration **PASS** for YAML parse and local equivalent checks. Hosted GitHub Actions execution **UNVERIFIED**: workflow has not been pushed or run remotely.
- Device installation, actual mobile touch ergonomics, sustained FPS, heat, memory and audio **UNVERIFIED** until the owner tests the APK on the Realme phone. No Android emulator or physical phone execution occurred here.
- Forward+/Vulkan, shader effects beyond the actual Compatibility material render, full Gradle/JDK/AAB workflow, store release signing and fresh published-task restoration **UNVERIFIED**. These do not block the current debug-APK development path.

## Diagnosed and resolved failures

Read-only home caches were redirected to workspace XDG/SDK paths; the pinned gdtoolkit wrapper handles its legacy cache field. Malformed save JSON now uses a checked parser without engine error spam. Headless synthetic input tests send viewport-local events and wait for dispatch. Xvfb readiness truncates the previous display-number artifact before waiting. Android SDK tools 23 attempted home-directory writes, so official compatible tools 19 were verified and pinned. Android export required ETC2/ASTC imports and a project icon. USB polling is disabled through the non-runnable Android deployment preset; direct APK export remains available. No verification or assertions were disabled to resolve these issues.

## Saved versus activated state

The cloud installation and startup draft was confirmed saved; no new network domains or secret bindings were added. The draft requires the owner to review/save in environment settings and publish the prepared environment. Saving did not publish, apply a runtime update, push repository commits or prove restoration in a new task.

## Evidence locations

Current logs and generated inventories are ignored under `artifacts/`: `setup-repeatability.log`, `validation.log`, `tests.log`, `security-audit.log`, `dependency-audit.json`, `source-inventory.json`, `android-export-check.log`, `apk-signature.log`, `apk-badging.log`, `apk-permissions.log`, `apk-sha256.txt`, `render-check.log` and `render.log`. They describe this run; future agents must rerun affected checks rather than assume old artifacts are current.


## Autonomous environment extension

The bounded `tools/autonomous_cycle.sh` workflow was exercised in the current workspace. The latest `auto` run returned **PARTIAL** with gameplay/import/lint, advisory/source security checks, real Mesa rendering, phone APK export, emulator setup and x86_64 emulator build all **PASS**. Gameplay remains **28 checks, zero failures**. Three new runtime-cache safeguard tests **PASS**, including invalidation after a game change and refusal to cache a game ANR as an infrastructure block.

Android Emulator **37.2.12**, AOSP API29 x86_64 revision **8**, and authenticated adb storage are installed and reusable. Native Android boot, APK installation and the game-ready marker executed. The legacy SwiftShader backend failed shader linking; supported ANGLE/SwiftShader rendered the temple scene. **Interactive Android validation remains BLOCKED** because stock Android System UI became unresponsive in software CPU emulation and captured foreground. The corrected Android display dump records `Application Not Responding: com.android.systemui` while the game is the focused application. The official acceleration probe reports that KVM requires CPU virtualization features unavailable on this host.

The first loose ANGLE smoke report returned PASS, but subsequent visual review found a launcher ANR overlay; that result is explicitly rejected by `artifacts/android-runtime-swangle-review/visual-review.json`. The hardened tester requires an actual foreground window from Android's display diagnostics, a readable game title, absence of ANR dialogs, a meaningful camera-swipe image change and creation of an app-local save. It does not substitute signatures, nonblank screenshots or PIDs for gameplay evidence. Android runtime error capture is filtered to Godot and AndroidRuntime tags to avoid excessive system-log transfer. Strict mode rejects unresolved Android runtime checks; auto mode retains the verified phone APK and reports PARTIAL so independent development can continue without waiting for the owner's phone.

No physical Realme, sustained mobile performance or full interactive Android pass is claimed. Emulator checks automatically use CPU acceleration when the official probe reports it available; otherwise software emulation is used. Cached infrastructure limits expire and are invalidated by changed app/host inputs. Processes are temporary, not a persistent AI worker.

Current extension evidence: `artifacts/autonomous-final-check.log`, the latest `artifacts/cycles/*/result.json`, `artifacts/android-runtime/result.json`, `artifacts/android-runtime/before.png.window.txt`, `artifacts/emulator-acceleration.log`, and `/workspace/.temple-realm/autonomy/android-host-block.json`. Earlier failed/blocked probe evidence remains retained separately.
