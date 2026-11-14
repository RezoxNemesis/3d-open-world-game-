# Daman Duo

An open-world 3D action game set in a 20 km × 20 km island version of **Daman, India**. You play as **Vikas**, with your friend Mira fighting and riding alongside you. The world is built in code with Three.js and WebGL2: terrain, buildings, people, cars, animals, bosses, sky, music and sound. Surfaces use CC0 photo-scanned textures from Poly Haven.

## Download

Get the latest build from the **[Releases page](../../releases/latest)**:

| Device | File | How to install |
|---|---|---|
| Android phone | `DamanDuo-Android.apk` | Open the file on your phone. If asked, allow "Install unknown apps" for your browser or file manager. |
| Windows PC | `DamanDuo-Windows-Setup.exe` | Run the installer. Windows SmartScreen may warn because the app is unsigned: click **More info → Run anyway**. |
| Windows (no install) | `DamanDuo-Windows-Portable.exe` | Double-click to play. |
| Linux | `DamanDuo-Linux.AppImage` | `chmod +x DamanDuo-Linux.AppImage`, then run it. |
| macOS | `DamanDuo-macOS.dmg` | Drag to Applications. The app is unsigned: the first time, right-click it and choose **Open**. |
| Any browser | `DamanDuo-Web.html` | Open it in Chrome or Edge. |

Every push also builds these files as workflow artifacts under **Actions → Build Daman Duo**.

The **desktop** builds start on the **Ultra** preset: 2048² terrain, 4K shadows, ambient occlusion, bloom, MSAA, dense grass and the full crowd. The **phone** build starts on the **Mobile** preset with touch controls. You can switch presets (Low / Mobile / High / Ultra) and the crowd size (50K – 3 lakh) on the title screen or in the pause menu.

## The world

- **Daman Ganga river** splits **Nani Daman** from **Moti Daman**, with bridges, the jetty and the Kachigam docks.
- **Landmarks:** Moti Daman Fort, Nani Daman Fort (St. Jerome), Bom Jesus Church, Our Lady of the Sea, the lighthouse, Devka and Jampore beaches, the Sky Tower (260 m), the ferris wheel, the stadium, the airport and helipad, and the hospital.
- **Kolak river**, salt pans, a wind farm, and 28 villages linked by farm roads, with crop fields worked by farmers.
- **Jungle** in the eastern hills, home to horses, deer, elephants, tigers, langurs and peacocks.
- **High mountains:** ridged peaks up to about 1.8 km, a grade-limited ghat road up to a **plateau lake**, a **waterfall**, and caves to explore.
- **Kalpa Island** resort and the **Pani Kotha** sea fort.
- **Jampore Villa Colony:** walled estates with modern glass villas and Portuguese-colonial mansions, pools, lawns, tennis courts, fountains and the domed **Sagar Mahal** palace. You can walk into the mansions.
- More than 16,000 buildings, each with procedural windows, balconies, shop signs and lit rooms at night. Homes, shops and cafés can be entered and have interiors.
- Up to **3 lakh (300,000) people** on the map, animated on the GPU, plus live traffic driving on the left.

## What you can do

- **Drive** fictional supercars, hypercars, classics, premium sedans, SUVs, a 4x4, autos, buses, trucks and scooters. Includes nitro, drifting and jumps off ramps.
- **Fly** a plane, a helicopter and a **fighter jet** with cannon and missiles. You can also take boats.
- **Ride horses**, with walk, trot, canter, gallop and jumps.
- **Parkour:** climb walls, mantle, vault, roll, flip and swim.
- **Web-swing** between towers, Spider-Man style.
- **Skydive** and open a **parachute**, or glide.
- **Fight** with jabs, crosses, hooks, uppercuts, kicks, roundhouses, flying kicks and blocks. Use a pistol or rifle. A wanted-star system brings the police after you.
- **Make masala chai:** at a chai tapri or on the stove in any home kitchen. It heals you and your friend.
- **Mythological bosses**, marked ☠ on the map and minimap. Start a fight from the map or from **Menu → Bosses → FIGHT**:
  - **Kaala Naag**, a 500 m cobra in Naag Sarovar. Its forehead gem is the weak point.
  - **Makara**, the sea monster of Devka. Its pearl is the weak point.
  - **Maha Rakshasa**, a 25 m demon king in the Ghats. The gem on his chest is the weak point.
- **Powers** won from the bosses: **Flash Speed**, **Thunder Slam** and **Flight**.
- **Play 8 story missions:** Chai Pe Charcha, Fort Run, Kaala Naag Gang, Devka Dash, Sky Tower Dive, Wings Over Daman, Into the Jungle, and The Serpent Awakens.
- **Time and weather:** a day–night cycle (morning, afternoon, golden-hour evening, starry night). Four seasons: summer, **monsoon** (rain, wet roads, lightning), post-monsoon and winter mist.
- **Music and voices:** a procedural Indian soundtrack (sitar, tabla, dhol, bansuri, drones) that changes raga with the time of day and the action. The heroes speak through the device's text-to-speech, with subtitles.
- **Fast travel** by tapping a place on the full map. The game autosaves every minute.

## Controls

**Desktop, on foot.** Only the arrow keys, WASD, Tab, Shift, Space and Enter are needed, plus the mouse.

| Action | Keyboard / mouse |
|---|---|
| Move | WASD or arrow keys, or **roll the mouse wheel forward** to walk |
| Turn | Move the mouse |
| Look around freely | Hold the left button and drag |
| Fight / fire / use | Left click (punch, shoot, web, or the selected power) |
| Aim | Hold the right button. Left click fires the selected weapon or power; hold it to keep firing. |
| Next weapon or power | Tab (Fists → Pistol → Rifle → Web Shooter → unlocked powers) |
| Sprint · dodge roll · kick | Hold Shift · tap Shift · Shift + click |
| Jump · flip · wingsuit · parachute | Space (again in the air) |
| Interact (vehicles, horses, doors, mansions, chai) | Enter |
| Map · menu | M · Esc |

**Desktop, in vehicles**

| Vehicle | Controls |
|---|---|
| Car | W/S gas and brake, A/D steer, Space handbrake drift, Shift nitro, left click horn, Enter exit |
| Helicopter | WASD fly, Space up, Shift down, left click guns |
| Plane / fighter jet | W/S pitch, A/D roll, ←/→ rudder, ↑ or Space throttle up, ↓ throttle down, Shift afterburner, left click cannon, right click missile, Enter eject |
| Horse | WASD, tap Shift repeatedly to gallop, Space jump, Enter dismount |
| Flight power | Fly where the camera points, Space climb, Shift boost, click again to drop |

**Phone:** left stick to move, drag on the right side to look. Context buttons: PUNCH/FIRE, JUMP, KICK, SPRINT, WEB, AIM, ROLL and **GUN**, which cycles weapons and powers. FLY, SLAM and FLASH replace PUNCH when a power is selected. **Gamepad** is supported too.

## Building from source

```bash
npm ci
npm run build                 # dist/index.html + dist/game.js, and dist-single/index.html (one file)
npm start                     # run the desktop (Electron) build
python3 tools/render_test.py  # headless screenshot tests (needs playwright + Chrome)
```

- **Android:** CI runs `npx cap add android`, `tools/patch_android.py`, `npx cap sync` and `./gradlew assembleDebug`.
- **Desktop installers:** `npm run dist:win`, `npm run dist:linux` or `npm run dist:mac`.
- **Releases:** every push to `main` (or a `v*` tag) builds everything and publishes a GitHub Release.

## Notes

- All vehicle brands (Vayu, Agni, Shera, Bison, Royal Amba, Sterling…) are fictional and inspired by real car classes.
- The game aims for a realistic look on phone hardware. Models and animation are generated in code; ground, wall and roof surfaces use CC0 photo-scanned textures (see `assets/tex/CREDITS.md`).
- The previous project in this repository, *Temple Realm* (Godot), is preserved on the `temple-realm-archive` branch.

MIT License.
