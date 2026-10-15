# Realms and powers — v0.7

Enter the Jade Expanse from the temple district. MAP opens the atlas, destination buttons, day/weather/season choices, save, guardian retry and return to the district. The mobile buttons are the primary controls.

| Action | Touch | Expedition keyboard | Behavior |
|---|---|---|---|
| Flight | FLY | T | Crouch and launch upward automatically, then hover; movement steers flight. Tap again to land. |
| Super jump | Hold/release LEAP | Hold/release L | Charge while grounded, launch on release, land with an impact ring. |
| Speed | SPEED + movement | G + movement | Faster movement with body lean, streaks, echoes and camera response tied to actual speed. |
| Smash | SMASH | R | Face a marked breakable crag within 30 m; windup precedes destruction and debris. |
| Descend/dive | DOWN / DIVE | Hold C | Descend during flight or swim deeper in the sea. JUMP rises while flying/swimming. |
| Combat | STRIKE / DODGE | F / Q | Fight the sentinel on land; observe its attack warning and use space, jumping or cover. |
| Vehicle | RIDE | E | Board the nearby wind cart or dismount. Powers relinquish movement ownership when mounting. |

The original temple district retains its existing F/Q flight/leap keyboard bindings. Expedition F/Q are combat bindings; scene transitions restore the appropriate mappings. Atlas/focus changes release held touch actions and cancel pending power charges/impacts.

## Places and creatures

- **Lotus Cliff Sanctuary:** expanded garden and karst scenery, revised traveler portrait/cloth, hand-held sword attacks and an original sculpted jade sentinel.
- **Dragonwall Pass, 8 km east:** a Great Wall-inspired fortified ridge across three streamed sectors, walkable stairs/ramparts and gatehouses, stone courses and planted slopes.
- **Imperial Terrace, 16 km east:** a raised court, climbable stairs, side rampart and enterable palace hall.
- **Azure Sea, 33 km east:** a bounded 1,152 m sea, surface swimming, diving, coral/seaweed and underwater ruins. Spirit breathing allows exploration without an oxygen timer. A roughly 12 m articulated tide wyrm warns, lunges and damages the sea ward; depletion triggers gradual recovery toward the surface.
- **Land sentinel:** stomp, advancing low jade wave and directional breath. Each locks its warning direction, resolves at most one hit per attack and respects physical cover. The wave can be jumped; attacks have different recoveries. Calm/alert/furious poses respond to encounter state.

The 200,000 km coordinate domain uses repeated deterministic regions. These authored destinations add specific places to it; they do not make every kilometer unique. The visuals remain a stylized prototype, below the production scale and asset quality of GTA or Genshin Impact.

## Climate and saves

A full day takes approximately 24 minutes. The atlas offers dawn, day, sunset and night, plus automatic/clear/rain/snow weather and summer/autumn/winter seasons. Sun/moon lighting, stars, precipitation and seasonal materials change smoothly. Underwater visibility uses a camera-local environment; airborne precipitation stops underwater.

Expedition save version 3 retains local coordinates, the latest 128 discovered/calmed-region records and environmental settings. Versions 1 and 2 migrate. Invalid climate or coordinates reject the whole restore before changing the current world. Power modes and destroyed expedition crags are session state; atlas travel resets crag formations. The original temple journey retains its separate save.

## Scope of verification

Behavior tests cover actual Godot physics, scene changes, touch cancellation, routes, encounter patterns, swimming, power animation state and persistence. Screenshots and action footage are actual Compatibility renders from the cloud workspace. Desktop software rendering and APK export do not establish Realme P1 Speed frame rate, thermal behavior or touch ergonomics. See TEST_RESULTS.md for the final cycle and hosted APK result.
