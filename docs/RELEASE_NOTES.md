## Daman Duo — v1.14 "Fixes from the first PC session"

**The black screen**
- **Fixed: large black rectangles covering the screen on PC.** They came from the way bloom handles a pixel that is out of range (a sun glint on car paint, an explosion flash, a marker beam). One such pixel was smeared into a black block about 1300 × 1000 pixels on a 1080p screen, which flickered as you moved and stayed after an explosion. The picture is now kept in range at three points, so a bad pixel can never spread again. Phones were not affected because they do not use bloom.
- Several shaders that could produce such pixels on real graphics cards were corrected (mission marker beams, zone lights, water, clouds).

**Driving**
- **Controls card.** When you get into a car, onto a bike, a boat, a horse, a helicopter or a plane, a card on the right lists the keys for it: accelerate, brake, steer, handbrake drift, nitro, horn, view, get out. It fades after a while. Press **K** to pin it open or hide it. There is a card for walking and one for web swinging too.
- **Grass and dirt are not tarmac any more.** Off the road a car is slower, slides more and throws up dust: a hypercar that reaches 378 km/h on the runway tops out near 190 km/h on grass.
- **The chase camera sits closer and lower** behind the car and widens less at speed, so the car no longer shrinks to a dot.

**Web swinging**
- **Hold R and you keep swinging.** Each web goes to a building ahead of you on alternating sides of the street, the line is reeled in so the bottom of the arc clears the ground, you gain speed on the way down, and you are thrown forward at the top. Let go between a third and two thirds of the way up for the longest launch.
- **Web zip:** where the buildings are too low to swing from, the web pulls you straight to the next roof edge and pops you over it.
- In a test run through the town the chain held 8 swings in 16 seconds at about 97 km/h without touching the ground (before: 2 swings, then a landing).

## Daman Duo — v1.13 "Outbreak" update

**The portal outbreak**
- **The sky tears open.** Once you have finished any three missions, a rift appears in the sky over Moti Daman: a churning violet tear with lightning under it, and the sky bruises dark around it. You can see it from town.
- **New mission: The Sky Tears Open.** Three anchors pin the rift to the ground. Stand inside an anchor ring until it breaks while shades keep stepping out of the gates beside them. When the second anchor falls, a Shade Lord comes through. Break all three and the rift collapses.
- **Shades:** tall horned figures of dark smoke-skin with burning eyes and a glowing heart. They fight hand to hand and are faster than gangsters.
- **New music and sounds** for the rift: a dark raga (Todi) with dhol, the tear opening, anchors breaking, and the shades.

**Your choices**
- **Missions can now end in a choice,** shown as a card: tap an option or press 1 to 4. The choice is saved and changes the game afterwards.
- **The rift shard** (after the outbreak):
  - *Shatter it:* the rifts end and the town pays its guardians ₹50,000.
  - *Keep it:* a new power, **Rift Step**, jumps you up to 20 m in the direction you face and knocks down anything where you land. But the shard pulls small rifts open around you from time to time (seal them for ₹3,000 each).
  - *Give it to Arjun for the Navy lab:* ₹20,000 and rift-forged rounds: your pistol and rifle hit 60% harder.
- **The gang boss** (after Kaala Naag Gang): hand him to the police (₹5,000, and wanted stars fade twice as fast from then on) or take his cash and let him run (₹20,000, but the gang ambushes you in town).

**A better-looking world**
- **Air and distance.** A new atmosphere model: haze that is thickest near the ground and thins with height, so far hills and the far side of town go pale and melt into the sky instead of ending sharply. Towards the sun the haze takes the colour of the sky around it, which shows most at sunrise and sunset. The sea uses the same haze.
- **The town is no longer bare earth.** The ground between buildings is now a patchwork of concrete yards, paved courts, gardens and packed earth with kerbs between the plots. From the air the town reads as built-up land; on foot you walk over slabs, paving and grass.

## Daman Duo — v1.12 "Motion and stability" update

**Movement**
- **Characters move every frame.** A fault in how the engine refreshed skeletons meant the heroes, horses and other animals were drawn with the previous frame's pose: one frame late on PC, and on phones only every second frame, so they animated at half the frame rate and trembled against the camera while running. They are now drawn at their current pose in every frame.
- **Motion-captured walking, jogging, running and sprinting** for Vikas, Mira and Arjun. The stride follows your real ground speed, so feet no longer slide, and the body leans into turns. Hold Caps Lock or Left Alt to walk; on touch and gamepad the stick goes smoothly from a stroll to a run.
- **Getting in and out:** the character walks to the door, ducks in and sits; swings a leg over a bike; uses the stirrup to mount a horse. Car glass is now see-through, so you can see who is driving.
- **Driving:** separate gas and brake (pedals on touch, triggers on a gamepad), steering that gets calmer with speed, tyres that run wide when you corner too fast, a handbrake that slides the tail, engine braking and slopes. The chase camera settles behind the car instead of snapping.

**Shooting**
- **New weapon handling.** The rifle sits in the shoulder and the pistol is held in both hands at eye level, with the barrel pointing exactly where you aim, up and down included. Both arms are placed on the gun, the fingers close on the grip, and each shot kicks. Without aiming the rifle is carried at low ready, also while running. Shots now leave from the muzzle. (Before, the gun was attached the wrong way round.)
- **Two new guns built in Blender:** the Vajra carbine (rail, reflex sight, slotted handguard, curved magazine, folding-style stock) and the Naag pistol. Both are original designs.

**A picture that stays put**
- **Nothing pops in or out any more.** Street furniture, rocks, boats, buildings, roofs, road tiles, wires, people and trees dissolve in over the last stretch of their draw distance instead of appearing a block at a time.
- **Detail changes are cross-dissolved:** 3D trees to their far versions, near palms to light palms, traffic and parked cars between their detail levels.
- **Sea showing through the land is fixed.** The sea was one 90 km polygon; at some render resolutions it bled through the ground as a grey haze. That could happen whenever Auto resolution changed the resolution. The sea is now a graded grid that follows the camera.
- Sun shadows fade out at the edge of their range instead of ending in a line, the meadow thins out further away instead of stopping, and Auto resolution now moves in small steps.

**Performance**
- **The phone preset is much lighter.** Measured in the same scenes: at the start point 774,000 → 615,000 triangles and 386 → 273 draw calls per frame (shadow pass 372,000 → 183,000 triangles); on the sea face 1,334,000 → 829,000 triangles.
  How: light far versions of the heavy rocks and farm props, automatic light versions of street furniture, buildings and roofs split into a near and a far layer, far terrain drawn in blocks, sleeping bosses and distant boats no longer drawn, the Ferris wheel and the hero avatars drawn in far fewer calls.
- **Shaders are built while the game loads.** Before, every material was compiled the first time it came into view, which caused small stutters in the first minutes of play, and Auto resolution could mistake those for an overloaded GPU and lower the resolution. In the test run 78 shader programs are now ready before the first frame and 12 are built later, instead of 74 during play.
- **90 fps option**, and on Android the game now asks the screen for the matching refresh rate (60, 90 or 120 Hz).
- **Upscaling (FSR-style)** in Menu → Graphics: Ultra Quality, Quality, Balanced or Performance render the 3D scene at a lower resolution and rebuild it sharp at screen resolution. It works on every GPU: NVIDIA, AMD, Intel and phones. (NVIDIA DLSS itself needs a native DirectX or Vulkan engine and cannot run in this one.)
- **Stress test** in Menu → Performance: six heavy scenes played on rails for about a minute. It shows this device's average frame rate, 1% low, worst frame, draw calls and triangles, and suggests settings.

**Also**
- **Chai is a hobby, not a task.** The opening chai mission is gone. Making a cup at any stall or kitchen is simply how Vikas unwinds: it heals the team and leaves them relaxed (slow healing) for three minutes.
- Mira wears her black tactical outfit.

## Daman Duo — v1.11 "Countryside" update

**What's new in 1.11**
- **Farmsteads round every village**, built in Blender with real photo materials (lime-washed plaster, clay roof tiles, wood, tin, brick and stone, baked with shadows and surface detail):
  - tiled-roof farmhouses with a veranda (otla), wooden posts, shuttered and barred windows, and a dish antenna;
  - thatched cow sheds with a feeding trough, brick water-tank towers, stone wells with a pulley;
  - tractors or bullock carts parked in the yard, and bamboo fences.
- **Haystacks in the fields:** conical rice-straw stacks and fodder ridges now line the field edges across the countryside.
- **Kesar Horse Ranch:** a timber stable with dutch doors, a tin roof and a cupola, a white-railed paddock, water troughs, hay bales and a herd of horses to ride. It is marked on the map.
- **New realistic horse** made in Blender as one smooth body: deep barrel, withers and croup, arched neck, a refined head, muscled legs with knees, hocks, fetlocks and hooves, plus a strand mane and tail. Each horse gets its own coat (bay, black, brown or grey) with dark legs. The neck now rests upright and lowers to graze, fixing the old horse's backward-leaning neck.

## Daman Duo — v1.10 "Garage" update

**What's new in 1.10**
- **Three hero cars built in Blender**, each with a lofted body, exact window cut-outs with recessed glass and trims, panel gaps, real lamps, grilles, bumpers, mirrors, an interior behind the glass and ambient occlusion baked into the paint:
  - **Bison 69**: a 1960s fastback muscle car (long hood, fastback roof, round lamps in a wide grille, tri-bar tail lamps, chrome bumpers, quarter scoops, 5-spoke wheels);
  - **Shera S9**: a modern sports coupe (twin upright grilles, LED head and tail lamps, quad exhausts, diffuser, black twin-spoke wheels with red calipers);
  - **Gajraj G6**: a boxy luxury off-roader (round lamps with LED rings, fender-top indicators, flared arches, exposed door hinges, side pipes, side steps, spare wheel on the tailgate).
  All three drive, park and appear in traffic (with two lighter versions for traffic far away). The designs and badges are fictional.
- **Rajhans R7 business jet** rebuilt in Blender for the airport: swept wings with winglets, T-tail, rear engines with fans, wrapped cockpit glazing, oval cabin windows, a navy-and-gold livery and full landing gear.
- **Better tyres and trims:** rubber and matte plastics no longer shine grey in low sun.

## Daman Duo — v1.9 "Built in Blender" update

**What's new in 1.9**
- **Real buildings up close (PC and Mac):** a modular facade kit built in Blender now dresses every town, colonial and hotel building near you:
  - Moti Daman's Portuguese-colonial houses get moulded arched windows with louvred shutters (one paint colour per house), cast-iron balconies, arched doors with fanlights, cornices and corner pilasters;
  - Nani Daman's bazaar streets get shops with rolling shutters and coloured sign boards (lit at night), grilled windows under concrete sunshades, AC units and balconies;
  - Devka's hotels get floor-to-ceiling glazing, deep balconies and glass-fronted lobbies with canopies.
  Two detail rings keep it fast, and windows light up at night. Phones keep the lighter facades.
- **New coconut palm** modelled in Blender (curved ringed trunk, 26 arching fronds, dry fronds, coconuts), with a light far version. It replaces every palm on the map.
- **New Vikas look** to match the reference: black shirt, olive cargo trousers with side pockets, dark boots.

## Daman Duo — v1.8 "Golden Daman" update

**What's new in 1.8**
- **Real photo skies:** ten CC0 photographed skies (Poly Haven) crossfade through the day: dawn, sunrise, a cumulus noon, a hazy afternoon, golden hour, a dramatic sunset, pink dusk, blue hour and a starry night. Rain blends in an overcast sky. The sea, wet sand and every shiny surface reflect the real sky, and the lighting is baked from it.
- **Realistic sun path:** the sun now follows Daman's November arc (about 52 degrees at noon), so shadows are long and soft all day. A big cinematic moon with a halo hangs low over the sea at night.
- **Devka Sea Face promenade:** a new seafront drive with a wide paver walkway, black-and-white curbs, bougainvillea beds, Victorian triple-lantern lamp posts, benches facing the sea, palms in stone planters, yellow gate pillars and a welcome arch. A stone sea wall with iron bollards and chains runs along it, with steps down to the beach.
- **Photo-scanned shore:** CC0 scanned boulders, rock clusters and rocky shelves (processed in Blender) line the sea wall and the surf.
- **Night lights:** soft glows around every lamp, light pools on the roads and walkway, and long lamp reflections on wet roads after rain.
- **Sea and beach:** turquoise shallows, rolling surf lines that break into whitewash, sun glitter, and glossy wet sand at the waterline.
- **Fishing fleet:** painted wooden Daman fishing boats hauled up on Devka and Jampore beaches (flags, nets, cabins), plus more riding at anchor.
- **Fixes:** the old "dotted road" artefact is gone (a precision bug in the road shader), and mission markers and boss beacons are now soft columns of light.

## Daman Duo — v1.7 "Real People" update

**What's new in 1.7**
- **Realistic heroes:** Vikas, Mira and Arjun now have photo-scanned bodies with real skin, faces, hair and clothing textures, plus normal maps. They come from the Microsoft Rocketbox avatar library (MIT):
  - **Vikas** wears a cap, a blue-and-white hoodie, jeans and white sneakers;
  - **Mira** wears a black dress with heeled boots;
  - **Arjun** wears a white kurta-pyjama and a prayer cap.
- **Every move carries over.** The game's animation system drives the new bodies through live retargeting, so walking, sprinting, freeflow combos and finishers, riding bikes (Mira on the pillion), driving, swimming, diving, web-swinging and flying all work.
- **Better clothes and skin on everyone else:** procedural fabric folds and bump detail, denim twill, leather creases, hair strands, cloth and skin sheen, and subsurface warmth that dims at night, so faces no longer glow in the dark.
- Mobile stays fast: the three avatars add about 25k triangles in total.

## Daman Duo — v1.6 "Golden Hour" update

**What's new in 1.6**
- **Cinematic colour grade on every device:**
  - richer colour, cool shadows and warm highlights, with a gentle filmic contrast curve;
  - built into the tone mapper, so it costs nothing on phones;
  - a soft lens vignette.
- **Indian streetscape:** concrete electric poles with crossarms, insulators and transformers line every town street and village lane, strung with sagging overhead wires.
- **Photo mode** (Menu → 📷 PHOTO MODE):
  - freezes the world and hides the HUD;
  - fly the camera with WASD or the stick, drag to look, Space to rise, Shift to go fast;
  - Enter, Esc or EXIT to leave.

## Daman Duo — v1.5 "Daman Stories" update

**What's new in 1.5**
- **Seven new story missions** featuring Vikas, Mira and Arjun:
  - **Sunken Gold:** swim out to the São Jerónimo and dive for three treasure chests.
  - **Bullet Run:** race a Thunder 350 down the coast road to Moti Daman Fort against the clock.
  - **Hot Pursuit:** steal the corrupt inspector's police bike and shake off a three-star chase.
  - **Street Kings of Devka:** three rounds of beach fight club. Your friends stay out of the ring, and the final round needs a 10-hit combo.
  - **The Sagar Mahal Job:** fight through the palace guards and walk into the palace for the gang's ledger.
  - **Makara Rising** and **Demon of the Ghats:** boss missions that take you straight to the Makara and the Rakshasa.
- **Missions live in the world now**, as in GTA:
  - Each one has a glowing yellow ring where you pick it up. Walk in and press Enter (or tap the action button).
  - Every mission you haven't played shows on the full map as an **M** with its name, so there's always something to do.
- Mission objectives show live progress: chests found, enemies left, best combo and wanted stars.

## Daman Duo — v1.4 "Freeflow" update

**What's new in 1.4**
- **Freeflow combat** (in the style of Arkham and Spider-Man):
  - Vikas locks onto the enemy you push toward, up to 7.5 m away, and lunges in to strike.
  - A five-hit punch chain: jab, cross, hook, elbow, uppercut (the uppercut launches). Kicks: front kick, roundhouse, leg sweep.
  - **Finishers:** every sixth hit of a combo becomes a spinning back kick or a two-handed ground slam that hits everyone around you. They play in slow motion with a close-up camera.
  - **Counters:** enemies telegraph their strikes with a pulsing red **!** ring. Right-click on PC, or tap the **COUNTER** button on the phone, to counter in slow motion.
  - **Perfect dodge:** tap Shift into an incoming attack for slow motion and extra invulnerability.
  - **Takedowns:** strike an enemy on the ground for a stomp finisher.
  - Every connected blow has hit-stop, with launches and knockdowns, and a **combo counter** keeps score. Getting hit resets it.
- **Smarter street fights:** only two thugs wind up at once while the rest circle you, so fights are readable and fair.
- **Friends:** **Arjun** joins Mira as a second friend. He follows you, fights beside you, comes into buildings and fast-travels with you, and gets back up if he's knocked out.

## Daman Duo — v1.3 "Deep Blue & Sirens" update

**What's new in 1.3**
- **Diving and swimming:**
  - In the sea, look down and swim forward to dive (on the phone, tap **DIVE**). Underwater you swim where you look; Space or UP takes you back to the surface.
  - Watch the **AIR** meter: running out hurts.
  - Jumping into deep water from a height plunges you under.
- **Under the sea:**
  - blue fog and tint, light shafts from the surface, bubbles, and a Snell's window when you look up;
  - shimmering caustics on the seabed, which you can also see through clear shallow water from above.
- **Jampore Reef:**
  - corals (brain, staghorn, sea fans, sponges), swaying kelp and rocks;
  - schools of fish that scatter when you swim through them;
  - sea turtles and a manta ray.
- **Wreck of the São Jerónimo:** a Portuguese galleon, broken in two, with masts, a torn sail and cannons. **10 treasure chests** are hidden at the wreck and on the reef: ₹5,000 each, plus a ₹50,000 bonus for all ten.
- **Motorbikes:**
  - **Amba Thunder 350**, a classic thumper;
  - **Shera 220**, a street bike;
  - **Vayu RR 1000**, a superbike with nitro wheelies;
  - **Police Interceptor** bikes.
  - Bikes lean into turns and rest on their side stands. Mira rides pillion.
  - Bikes now make up a large share of city traffic, with parked bikes at the start, at both beaches and at the villa colony.
- **Police pursuits:** each wanted star sends more units: patrol bikes first, then police SUVs. They route along the road network, slow for corners, cut you off, and box you in. Constables jump out to arrest you, all to a wailing siren. Steal a police car if you dare.
- **Performance:** the far plane is pulled in while you're underwater, which roughly halves draw calls there on phones.

## Daman Duo — v1.2 "Gods & Mansions" update

**Downloads:** same files as before: `DamanDuo-Android.apk` (installs over the old version), the Windows installer or portable `.exe`, the Linux AppImage, the macOS `.dmg`, and `DamanDuo-Web.html`.

**What's new in 1.2**
- **Vikas is the hero.** Mira is now your friend: she follows, fights and rides with you, and the switch button is gone.
- **New desktop controls.** You only need WASD/arrows, Tab, Shift, Space and Enter, plus the mouse:
  - roll the wheel forward to walk; move the mouse to turn;
  - hold the left button and drag to look around;
  - left click to fight, fire or use a power;
  - hold the right button to aim, then left click to fire any weapon, the web shooter or a power.
- **Bosses you can actually find.** Each boss has a glowing beacon pillar, a ☠ pointer on the minimap that always shows the way, a labelled icon on the full map, and a **Menu → Bosses → FIGHT** button that takes you straight there.
- **Kaala Naag, rebuilt:**
  - a sculpted cobra head with a hood, hinged jaw, fangs, forked tongue and glowing eyes;
  - armoured dorsal spikes and animated scales;
  - a cinematic intro, then sweep and venom-rain attacks.
- **Two new mythological bosses:**
  - **Makara**, a jade-and-gold sea monster at Devka. It lunges up the beach, spouts water, dives and erupts beneath you.
  - **Maha Rakshasa**, a 25 m demon king in the Ghats. He wields a mace and attacks with a charge, ground-stomp shockwaves and boulder throws.
- **New powers** (beat a boss to unlock one; select it with Tab or GUN):
  - **Flash Speed**: run 4× faster;
  - **Thunder Slam**: leap and smash a shockwave;
  - **Flight**: fly anywhere.
- **Jampore Villa Colony:**
  - dozens of walled estates with modern glass villas and Portuguese-colonial mansions;
  - pools with caustics, lit loungers, lawns, hedges, tennis courts, fountains, gate lamps and guard cabins;
  - parked supercars to take;
  - the domed **Sagar Mahal** palace;
  - mansion interiors with a marble hall, chandelier, grand staircase and piano.

## Daman Duo — v1.1 "Smooth & Real" update

**Downloads**
- **Android phone:** `DamanDuo-Android.apk`: download on your phone, open it, and allow "install unknown apps" if asked. It installs over the previous version.
- **Windows PC:** `DamanDuo-Windows-Setup.exe` (installer) or `DamanDuo-Windows-Portable.exe` (no install).
- **Linux:** `DamanDuo-Linux.AppImage` (chmod +x, then run).
- **macOS:** `DamanDuo-macOS.dmg` (unsigned: right-click → Open the first time).
- **Browser:** `DamanDuo-Web.html`: open it in Chrome or Edge.

**What's new in 1.1**
- **Performance:** 3–4× fewer triangles per frame on phones.
  - Crowds and distant trees are drawn as impostors baked from the real 3D models.
  - Buildings, roads, street lights and traffic are split into map tiles and culled by distance and view.
  - Each animal is a single draw call.
  - Shadows update less often on phones, and there are no more stutters at sunset.
  - Automatic resolution scaling keeps the frame rate steady. Choose a 30/45/60/Max frame-rate cap in the pause menu.
  - The first launch picks a graphics preset from your GPU.
- **Real photo textures:** CC0 scans from Poly Haven cover sand, grass, forest floor, laterite soil, rock, asphalt, sidewalk pavers, fort stone, weathered plaster, brick, clay roof tiles and rolling shutters.
- **Buildings:** weathered facades with real rooms behind the windows (interior mapping), curtains, shop interiors, painted signboards and AC units.
- **Trees:** leaf-card trees with bark trunks. Distant forests use impostors.
- **Grass and crops:** curved tufts lit correctly (no more black spikes), with crops planted in rows.
- **Characters:** sculpted faces (eyes, brows, nose, lips, ears), styled hair, fingers, real shoes, jacket and denim. Police wear proper uniforms and berets.
- **Cars:** new lofted bodies with glass, pillars, lamps, mirrors, number plates, spoked rims with brake calipers and clearcoat paint. The police SUV has a livery.
- **Horses:** a new anatomical model with mane, tail, hooves and a saddle with stirrups.
- **Water:** moonlight and moon glitter at night.

Desktop builds start on Ultra graphics. The Android build starts on the Mobile preset with touch controls. You can change both in the menu.
