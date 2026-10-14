# Autonomous Android environment

## Operating contract

The owner only has a Realme P1 Speed phone and requests autonomous engineering decisions. Work proceeds without waiting for phone feedback: implement one in-scope increment, validate it, diagnose/fix genuine failures, rebuild the APK and repeat while the active task permits. Existing access controls and task/session limits still apply. Neither a script nor a saved instruction creates an indefinitely running AI worker.

`tools/autonomous_cycle.sh` is the repeatable validator. It runs real gameplay/import/lint checks, source/dependency security checks, actual Mesa rendering, the signed phone APK build, and an Android emulator runtime smoke test. Each cycle has a unique report/log directory under `artifacts/cycles/`; state is retained under `/workspace/.temple-realm/autonomy`. A fully passing cycle archives a last-good phone APK. Application/test failures and strict blocked cycles return nonzero and do not promote the artifact. The default `auto` mode may finish **PARTIAL** when Android runtime is blocked by host limits, retaining passed host checks and the signed APK so independent development continues without phone feedback. The strict `--runtime required` mode still rejects a blocked Android runtime. A lock prevents two cycle runners from overwriting shared evidence.

An explicit `--runtime skip` invocation provides a **PARTIAL** host-only result for diagnosis; it must never be called full Android validation. Default cycles attempt Android runtime checks and record any host limitation explicitly. A demonstrated stock-system/launcher ANR can be cached for at most one hour, keyed to application inputs, engine/emulator pins, kernel, KVM presence and CPU quota. A game change or host change invalidates that record. A game ANR cannot be cached as a host limitation; three automated cache safeguards verify these rules. Do not loop unchanged failures. Read logs, correct a supported prerequisite or patch a demonstrated defect, then run the affected check followed by the full cycle. Never weaken an assertion merely to make it green.

## Android runtime topology

Official Android Emulator 37.2.12 and AOSP API 29 x86_64 image revision 8 are pinned with upstream Google SHA-1 archive metadata in `tools/emulator-lock.json`. SDK-manager installation preserves official checksum validation and TLS trust. `tools/setup_emulator.sh` initializes a local AVD. There is no KVM device on this host; CPU and graphics run in software. The supported `swangle` renderer uses ANGLE/SwiftShader. Tesseract 5.5.0 checks that Android captures contain the readable game title; a nonblank image alone is insufficient. The runtime checks game foreground and rejects Android ANR dialogs before sending touch input. This is Android runtime evidence, not a Realme GPU/frame-rate simulation.

`tools/build_emulator_apk.py` copies only the application inputs into `/workspace/.temple-realm/android/validation-project`, verifies identical source hashes, changes only the export ABI, and builds a separate signed x86_64 APK. The phone APK remains ARM64. No source or primary export preset is silently changed for emulator testing.

`tools/test_android_runtime.py` owns a temporary emulator and an isolated adb server on port 5038, checks actual boot completion, installs the APK, resolves/launches its activity, waits for the fresh game-ready marker, checks renderer/runtime errors, waits for stable readable Android pixels and foreground, tests touch-driven camera response, and verifies that SAVE creates an app-local file. The stock AOSP launcher is stopped on this dedicated test device to reduce software-emulation background load. Process counts and open ports alone are not success. Cold software boot and package compilation can take minutes; timeouts are bounded and reported.

The official adb binary hardcodes `.android` and the emulator console token under the user home. Platform-approved initialization linked only these runtime paths into private workspace storage. HOME was not changed, console authentication was retained, and no existing user Android data was overwritten. On a fresh machine, initialize missing paths through supported filesystem permissions if needed; do not bypass a denial. The installed packages and AVD are retained files; emulator/adb processes must restart and are cleaned up after testing.

## Continuity

Use the existing checkout; no extra worktree is needed. Read the latest cycle result, `docs/TEST_RESULTS.md`, and the scoped production backlog before changing code. Keep tested commits small and preserve user changes. Phone-only access does not block continued cloud work. Realme-specific thermals, GPU compatibility, battery, ergonomics and sustained performance remain unverified without device evidence.

Next production work begins after environment readiness: mobile quality presets and measured content budgets, followed by better hero-region art and streaming improvements. Do not expand setup into unrelated game features.


## Eastern Temple District handoff

The authored district, original module/foliage art, humanoid traveler, automatic stair traversal, discovery quest, actual map and distant position restoration are implemented. Latest evidence is in TEST_RESULTS.md. Run the bounded cycle after future meaningful changes; its render stage now verifies and archives five current-source views/metrics. The Android tester automatically records only a fresh, proven stock-SystemUI/launcher ANR obscuring its foreground check; game errors or unrelated assertions remain failures. Cache safeguard tests live in tools/test_runtime_cache.py.

Next in-scope development: richer natural terrain/foliage and material normals with measured budgets, adjustable mobile quality, then persistent discovery and one NPC quest. The ten supplied image descriptions remain a roadmap; unimplemented combat, dragon flight, crafting and life systems should not get fake controls. Continue implementation inside active tasks without waiting for owner phone testing, and retain accurate Android-runtime/phone coverage limits.
