# Expedition and mobile responsiveness upgrade

User intent: improve mobile responsiveness and reference-directed visual quality while preserving another account's stability work; build enormous exploration, human movement, vehicle travel and legendary encounters. Target Realme P1 Speed. Current remote main 0d97750; no other remote work visible at initial fetch. Work on agent/expedition-mobile-upgrade; re-fetch before integration. The owner explicitly authorizes autonomous decisions and implementation; no repeated design approvals.

## Design
Preserve the existing district, quests, save schema and controls. Add a distinct expedition destination and return route through the existing map. The expedition uses integer region coordinates plus small local float offsets: 200,000 km east-west traversable domain, streamed nearby terrain, deterministic variation, bounded resident region count, and a separate validated expedition save. A world atlas permits long trips without requiring years of real walking. Report procedural versus authored coverage honestly.

A playable destination contains ornate reusable temple modules with accessible interior, a road/travel vehicle and an original legendary guardian encounter with readable telegraph, melee/dodge, health and recovery. Reuse existing art and renderer; original assets only. Preserve precise collisions and touch ownership. The expedition scene isolates new mechanics from existing saved quests. Human motion gains gait phases, breathing, grounded transitions and turn/landing response with no changes to movement/collision rules unless tested.

Mobile first: profile current source, reduce proven draw/CPU work with batching/culling and bounded terrain work. Preserve lighting/material clarity and existing render correctness. Render screenshots from the built source; no concept art presented as game output. Compare same camera/quality metrics. Software host timings do not establish Realme FPS. Native Android coverage remains subject to unavailable KVM.

## Acceptance
Real behavior tests for origin rebasing at extreme coordinates, deterministic chunks and bounded unload; atlas/return/save roundtrip; human animation states; vehicle mount/dismount and blocking; guardian damage/dodge/defeat/recovery. Existing regressions, lint and security checks pass. Actual gameplay screenshots, signed APK and successful GitHub artifact link. Document remaining fidelity and device gaps.

## Art-direction correction after first live screenshots

The owner rejected the first expedition scenery as soulless and unlike the supplied Chinese mythology references. The generated road/temple grid is a foundation, not final art. Before delivery add a deliberately composed origin sanctuary: asymmetric lotus garden, covered bridge, winding stone approaches, layered waterfalls/cliffs, an elevated listening pavilion with walkable stair access, dense planted banks, and two original animated monastery residents. Keep the legacy court/guardian/cart routes intact. Distant ridges should have broad irregular forms and atmospheric separation, not a wall of identical spikes. Reference fidelity remains a target; do not call these procedural assets photorealistic or a finished Wukong-scale world.
