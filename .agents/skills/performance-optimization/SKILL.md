---
name: performance-optimization
description: Use when profiling frame time, mesh density, LOD, instancing, visibility, memory or Android scalability.
---

# Performance Optimization

## Workflow

1. Establish a baseline using `tools/run_tests.sh` and `tools/render_environment.sh`. Record renderer, resolution, CPU/GPU and content seed.
2. Profile a named route before optimizing. Headless physics timing does not measure GPU frame time or Android performance.
3. Reduce one proven bottleneck: MultiMesh foliage, bounded active regions, simpler collision, LOD meshes, visibility ranges, compressed textures or fewer shadow lights.
4. Re-run the same route and correctness tests. Record frame percentiles and memory with the same hardware; reject visual/collision regressions.
5. Keep Android Compatibility defaults and conservative content budgets. Validate on a real device before asserting thermal, memory or frame-rate targets.

## Verification

Run `tools/run_tests.sh` and the workflow-specific check above. Preserve failing output and report unrun checks. Do not claim completion from a PID, zero-test run or a headless render placeholder.
