# Verification evidence

## GitHub Actions APK delivery follow-up

The owner requires a GitHub Actions-built APK uploaded as a workflow artifact. Earlier raw repository/download-branch delivery is superseded. The workflow now imports/checks the game, installs matching export templates, Java21 and Android36 tooling, builds/verifies ARM64 debug APK, uploads APK/checksum/signature/install instructions, and writes the actual artifact URL in the run summary. Artifact retention is30days and download requires GitHub sign-in; extract the ZIP on Android.

The two earlier hosted runs failed workflow validation before any job: job-level `runner.temp` was not a permitted context. Build-root configuration now uses `RUNNER_TEMP` in a step and `GITHUB_ENV`. Fresh actionlint1.7.7 passes, action pins independently match upstreamv4 tags, and embedded Bash/Python syntax checks pass. Six portable-Java tests, six cache safeguards and all93 gameplay checks pass. Actual local Android setup/export/signature verification passes after portable Java21 selection. Hosted artifact execution is pending and must be confirmed before claiming delivery.

## Eastern Temple District — 2026-10-14

The first reference-directed exploration/art milestone is verified below. Earlier setup notes are historical baseline evidence.

- **93 gameplay assertions PASS:** 28 existing movement/jump/save/camera/touch/streaming checks, 48 discovery/map/focus/distant-load checks, eight route/landing/visible-floor/seam checks and nine stair/ceiling/wall checks. Lint, formatting, import and startup smoke also pass with no engine errors.
- **Six automation safeguards PASS:** unchanged host/app cache reuse, source-change invalidation, refusal to demote a game ANR, recognition of proven stock-SystemUI foreground blocks, refusal to hide a game crash, and refusal to demote unrelated assertions. New classification checks were observed failing before their implementation.
- **Five actual rendered views PASS:** live gameplay camera with HUD plus sanctuary, lotus, gate and overview at 1280×720. Xvfb/Mesa llvmpipe, Compatibility. Source/asset hashes verify current evidence; views are distinct and were visually reviewed. Player frame: 574 total draw calls and 450,551 triangles across passes, including 244,351 visible triangles. Approximately 75% fewer total triangles than the initial district render; no phone-FPS inference.
- **Original assets PASS:** six Blender/glTF modules with UVs/materials and finite geometry; hero/far bounds match. Original procedural textures and lotus banner render. Original 20-second Vorbis ambience imports/loops, is repeatable and clip-free; listening is unverified. Native audio cleanup gets a bounded mixing tick in startup/test/capture harnesses, rather than filtering shutdown errors.
- **Security checks PASS:** no detected known advisories across 42 locked Python packages; source credential-pattern/symlink/setuid checks pass. This is bounded checking, not a comprehensive security guarantee.
- **Android ARM64 debug APK PASS:** official matching engine/templates; API36 target/min24; v2/v3 signatures verified; no app permissions. APK candidate is approximately29 MiB and is archived per cycle.
- **Native Android interaction BLOCKED:** a fresh API29 x86_64 software-emulated run booted, installed the ABI-only equivalent APK, launched the scene and emitted its ready marker without captured game errors. Actual diagnostic pixels show the district behind a stock-SystemUI ANR dialog, and Android's window dump identifies that dialog as the current foreground window. The bounded recovery attempt did not clear it within the run. KVM/CPU virtualization are absent. Foreground, camera-swipe and save-touch assertions were not passed or disabled. The initial strict failure report is retained; the corrected host classifier and final auto cycle use the positively demonstrated stock-SystemUI block and return **PARTIAL**, without promoting a full Android last-good result.
- **Independent review:** fixed visible-floor/collision mismatch (actual model-geometry intersection regression RED→GREEN), distant-load fall-through (real physics RED→GREEN), stair/platform geometry, support collision alignment and repeated-lantern draw workload. Remaining reference-level realism, natural hero terrain/foliage, broader systems and physical Realme FPS/heat/touch coverage remain in development.

Current cycle: `20261014T204543Z-f26756`. Final report: `artifacts/cycles/20261014T204543Z-f26756/result.json`. Signed APK SHA-256: `d82e3afd5063efb6e9e176f2143ecc079b76a3862d853eb06da67628a35b8b70`.

Current evidence: `artifacts/district-autonomous-final.log`, four behavioral test logs, `artifacts/district-render-metrics.json`, five district PNGs, `artifacts/android-runtime/result.json`, `before.png.window.txt`, `logcat.log`, `artifacts/android-systemui-recovery-before.png`, and the source/advisory/export/signature logs. The rejected strict native result is retained under `artifacts/cycles/20261014T203558Z-8e3dc1/`.

---

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
