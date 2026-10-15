# Celestial District Implementation Plan

**Goal:** Make a visibly denser, taller and more natural reference-directed mobile temple district with a playable upper route and a complete lantern quest.

**Spec:** `docs/CELESTIAL_DISTRICT_DESIGN.md`. Follow the existing isolated checkout and standing autonomous authorization. Use independent file ownership and cross-review; no extra design approval is needed under the owner's explicit instruction to make routine decisions.

- [ ] Original architecture kit: generate seven complementary assets, finite UV/normals/bounds/material validation, preserve sanctuary plinth and column footprint. Verify triangle counts and shared palette.
- [ ] District dressing: batch stalls, planted containers, guardians, rails, incense and hanging detail around walkable routes; expose `build(world)` and quality hook.
- [ ] Landscape and upper route: taller hero sanctuary, irregular mountains, better atmosphere/water, physical stairs/terrace/railing. Add failing then passing capsule traversal and floor tests.
- [ ] Natural vegetation: layered fine branch/leaf/flower structures with deterministic spatial batches, actual exclusions and canopy collision. Verify transform endpoints and quality effects.
- [ ] Traveler: original detailed clothed humanoid silhouette, readable face/hair/robe/boots and articulated gait while preserving camera/physics/input behavior.
- [ ] Journey: fourth landmark, schematic minimap, real keeper dialogue and proximity-based lantern quest, migrated version3 saves and visible earned reward. Test invalid data, reload, transitions and small-screen controls.
- [ ] Verification: import/lint/startup, all old/new meaningful assertions, actual reference-comparison renders and resource counters, independent code/visual review, corrections, security and bounded Android cycle.
- [ ] Delivery: verified source checkpoint, one successful GitHub Actions build/upload, exact source/artifact metadata and direct download URL. Document remaining visual and hardware limits.
