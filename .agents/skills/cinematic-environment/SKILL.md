---
name: cinematic-environment
description: Use when adjusting lighting, atmosphere, fog, shadows, cameras or environmental effects.
---

# Cinematic Environment

## Workflow

1. Review `scripts/world.gd:setup_sky`, player camera and the selected rendering method. Compatibility is the cloud baseline; Forward+ is an opt-in desktop path.
2. Preserve readable traversal and camera clearance. Tune sun angle, warm/cool contrast and exposure before adding expensive effects.
3. Use environment resources and bounded light ranges. Volumetric fog requires Forward+ and must have a mobile fallback; do not enable unsupported effects on Compatibility.
4. Capture actual pixels with `tools/render_environment.sh` under Xvfb/Mesa when available. Compare the current capture against an identified reference, never a fabricated image.
5. Test first-person/third-person camera transitions and occlusion. State whether evidence used software rendering, GPU rendering or only headless execution.

## Verification

Run `tools/run_tests.sh` and the workflow-specific check above. Preserve failing output and report unrun checks. Do not claim completion from a PID, zero-test run or a headless render placeholder.
