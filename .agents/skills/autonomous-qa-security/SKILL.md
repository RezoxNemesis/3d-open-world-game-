---
name: autonomous-qa-security
description: Use when testing Godot imports, gameplay regressions, dependencies, artifact provenance or setup failures.
---

# Autonomous Qa Security

## Workflow

1. Read `docs/TEST_RESULTS.md` and `docs/SECURITY.md`. Run `tools/validate_environment.sh`, then `tools/security_audit.sh`; preserve actual exit codes and current log timestamps.
2. Reproduce a failure with a focused real behavior check before patching. Inspect logs and installed versions; each bounded retry must test a new diagnosis.
3. Verify official archive checksums and pinned wheel hashes. Never disable TLS, signatures or assertions to make a check pass; never print credentials.
4. Run `tools/render_environment.sh` when a display is available and verify a nonblank actual render. Report unsupported rendering or device tests as UNVERIFIED.
5. Record PASS/FAIL/SKIPPED/UNVERIFIED distinctly. Advisory and source-pattern scans cannot establish that all software is malware-free. No paid services, remote publication or destructive Git actions without explicit scope.

## Verification

Run `tools/run_tests.sh` and the workflow-specific check above. Preserve failing output and report unrun checks. Do not claim completion from a PID, zero-test run or a headless render placeholder.
