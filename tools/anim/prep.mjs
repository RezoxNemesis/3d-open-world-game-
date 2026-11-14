// Rocketbox mocap (MIT) -> compact in-place clips for the game: assets/anim/<name>.json
import * as THREE from '/home/claude/3d-open-world-game-/node_modules/three/build/three.module.js';
import { FBXLoader } from '/home/claude/3d-open-world-game-/node_modules/three/examples/jsm/loaders/FBXLoader.js';
import { readFileSync, writeFileSync } from 'fs';
const SRC = '/home/claude/microsoft/microsoft-rocketbox/Assets/Animations/', OUT = '/home/claude/3d-open-world-game-/assets/anim/';
const JOBS = [];
for (const g of ['m', 'f']) {
  JOBS.push([`all_animations_max_motextr_static/${g}_idle_breathe_01`, `${g}_idle`, 0]);
  for (const n of ['walk_neutral_01', 'walk_fast_01', 'run_slow_01', 'run_neutral_01', 'run_fast_01']) JOBS.push([`all_animations_max_motextr_xy/${g}_${n}`, `${g}_${n.replace('_neutral_01', '').replace('_01', '')}`, 1]);
}
const meta = {};
const r4 = (v) => Math.round(v * 10000) / 10000;
for (const [src, name, loco] of JOBS) {
  const buf = readFileSync(SRC + src + '.max.fbx');
  const grp = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const clip = grp.animations[0];
  let tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale') && !t.name.startsWith('Bip01_Footsteps') && !/Nub\./.test(t.name));
  // positions: only the root (bob/sway) and the pelvis; every other bone keeps its rest offset
  tracks = tracks.filter((t) => !t.name.endsWith('.position') || t.name === 'Bip01.position' || t.name === 'Bip01_Pelvis.position');
  let speed = 0;
  const root = tracks.find((t) => t.name === 'Bip01.position');
  if (root && loco) {
    // in place: remove the linear forward drift (x and z), keep the sway and the vertical bob
    const T = root.times, V = root.values, n = T.length, d = T[n - 1] - T[0];
    const vx = (V[(n - 1) * 3] - V[0]) / d, vz = (V[(n - 1) * 3 + 2] - V[2]) / d;
    speed = Math.hypot(vx, vz) / 100;
    for (let i = 0; i < n; i++) { V[i * 3] -= vx * (T[i] - T[0]); V[i * 3 + 2] -= vz * (T[i] - T[0]); }
  } else if (root) { const V = root.values; for (let i = 0; i < V.length; i += 3) { V[i] = V[0]; V[i + 2] = V[2]; } }
  for (const t of tracks) { const a = t.values; for (let i = 0; i < a.length; i++) a[i] = r4(a[i]); const b = t.times; for (let i = 0; i < b.length; i++) b[i] = r4(b[i]); }
  const c = new THREE.AnimationClip(name, clip.duration, tracks);
  c.optimize();
  // left-foot plant phase so every cycle can be phase-locked when blending
  const mixer = new THREE.AnimationMixer(grp); const act = mixer.clipAction(c); act.play();
  const foot = grp.getObjectByName('Bip01_L_Foot'); let lo = 1e9, ph = 0; const p = new THREE.Vector3();
  for (let i = 0; i < 60; i++) { mixer.setTime(c.duration * i / 60); grp.updateMatrixWorld(true); foot.getWorldPosition(p); if (p.y < lo) { lo = p.y; ph = i / 60; } }
  const json = JSON.stringify(THREE.AnimationClip.toJSON(c));
  writeFileSync(OUT + name + '.json', json);
  meta[name] = { dur: +c.duration.toFixed(4), speed: +speed.toFixed(3), plant: +ph.toFixed(3), kb: Math.round(json.length / 1024) };
}
writeFileSync(OUT + 'clips.json', JSON.stringify(meta, null, 1));
console.log(meta);
