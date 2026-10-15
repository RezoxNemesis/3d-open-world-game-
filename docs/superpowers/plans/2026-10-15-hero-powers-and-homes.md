# Hero powers and homes implementation plan

**Goal:** Continue the current environment chapter into a real mobile superhero exploration sandbox with enterable housing and refined character art.
**Spec:** docs/superpowers/specs/2026-10-15-hero-powers-and-homes-design.md
**Architecture:** Native action controls drive a composed HeroPowers controller through the existing Player; explicit destructible registry separates mutable rocks from protected world. Root owns persistence/UI integration and the checkpoint boundary.

- [ ] Prepare original residence shell/furnishings/LOD and serialized geometry tests; actual isolated preview must read as an interior, not a box.
- [ ] Implement flight/leap/speed/smash through failing real-physics regression tests, preserving off-state movement and camera.
- [ ] Implement native power controls, cancellation and safe mobile layouts; expose only functioning actions.
- [ ] Integrate residence approach/steps/solid collision and test actual capsule room-to-room traversal.
- [ ] Refine traveler visuals in a separate owned builder, preserving Player/rig APIs and flying pose requirements.
- [ ] Finish and verify the Verdant activities/checkpoint milestone before root exposes new powers UI.
- [ ] Add schema5 strict hero-state migration, actual destroyed-state restoration and airborne checkpoint/resume.
- [ ] Run all existing/new tests and independent review. Record actual15s+ ability/interior/destruction footage and matched environment/mobile views with frozen source hashes; tune visible budgets.
- [ ] Run final autonomous cycle/native attempt and honest limit reporting; export code5/name0.5.0.
- [ ] Push exact verified source, verify successful GitHub Actions upload, deliver real APK artifact link and updated continuity docs.

Review focus: no flight collision tunneling, leap on canceled touch, stale speed/FOV after overlays, unloaded terrain at extreme speed, destructible collision surviving visual removal, or airborne resume losing flight state. No paid services, signing changes or copied reference imagery.
