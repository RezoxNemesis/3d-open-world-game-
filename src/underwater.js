// The sea below the surface: underwater fog + tint, light shafts, bubbles, Jampore Reef (corals, sea fans,
// kelp, rocks), fish schools, sea turtles, a manta ray, the wreck of the Portuguese galleon São Jerónimo,
// and ten treasure chests to find. Everything near the reef is only updated when the camera is close.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from './mapdata.js';
import { U, patch } from './shaders.js';
import { mulberry32, damp, clamp, lerp } from './util.js';
import { tube } from './serpent.js';
import { sfx, say } from './audio.js';

const V3 = THREE.Vector3;
export const REEF = { z0: 2750, z1: 3850, off0: 70, off1: 560 };     // along the Jampore coast, 70–560 m offshore
const reefPt = (rng) => { const z = lerp(REEF.z0, REEF.z1, rng()), off = lerp(REEF.off0, REEF.off1, Math.pow(rng(), 0.8)); return { x: M.coastX(z) - off, z }; };
export const WRECK = { get x() { return M.coastX(3320) - 300; }, z: 3320 };

// a little fish: lofted body + forked tail fin (tail wiggles in the vertex shader)
function fishGeo() {
  const body = tube([[0.0, 0.01, 0.01], [0.06, 0.07, 0.11], [0.16, 0.09, 0.15], [0.3, 0.07, 0.12], [0.42, 0.03, 0.05], [0.47, 0.012, 0.02]].map(([z, a, b]) => ({ c: [0, 0, 0.22 - z], ax: [0, 0, -1], a, b })), 8);
  const tail = new THREE.BufferGeometry(); tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.24, 0, 0.11, -0.36, 0, 0.0, -0.3, 0, 0, -0.24, 0, 0.0, -0.3, 0, -0.11, -0.36], 3)); tail.computeVertexNormals();
  const dorsal = new THREE.BufferGeometry(); dorsal.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.08, 0.08, 0, 0.15, -0.02, 0, 0.07, -0.08], 3)); dorsal.computeVertexNormals();
  for (const g of [tail, dorsal]) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return mergeGeometries([body.toNonIndexed(), tail, dorsal]);
}
function turtleGeo() {
  const shell = new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55); shell.scale(0.85, 0.55, 1.1);
  const belly = new THREE.CircleGeometry(0.5, 16).rotateX(Math.PI / 2); belly.scale(0.85, 1, 1.1); belly.translate(0, 0.0, 0);
  const head = new THREE.SphereGeometry(0.16, 10, 8).scale(0.9, 0.8, 1.3).translate(0, 0.04, 0.68);
  const fl = []; for (const [sx, z, L] of [[1, 0.3, 0.75], [-1, 0.3, 0.75], [1, -0.4, 0.35], [-1, -0.4, 0.35]]) { const f = new THREE.SphereGeometry(0.5, 8, 6).scale(L, 0.06, 0.22); f.translate(sx * (0.4 + L * 0.45), -0.02, z); fl.push(f.toNonIndexed()); }
  return mergeGeometries([shell.toNonIndexed(), belly.toNonIndexed(), head.toNonIndexed(), ...fl]);
}
function mantaGeo() {
  const g = new THREE.PlaneGeometry(4.6, 2.6, 16, 6).rotateX(-Math.PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), ax = Math.abs(x) / 2.3; const half = 1.3 * (1 - ax * 0.85) * (z > 0 ? 1 : 0.7); p.setZ(i, clamp(z, -half, half) + ax * ax * -0.6); p.setY(i, (1 - ax) * 0.18 * Math.cos(z * 1.2)); }
  g.computeVertexNormals();
  const tail = new THREE.CylinderGeometry(0.03, 0.005, 2.4, 5).rotateX(Math.PI / 2).translate(0, 0, -2.2);
  return mergeGeometries([g.toNonIndexed(), tail.toNonIndexed()]);
}

export class Underwater {
  constructor(game) {
    this.game = game; const S = game.scene, q = game.q, low = !q.desktop, rng = mulberry32(777);
    this.root = new THREE.Group(); this.root.visible = false; S.add(this.root);
    this.under = false; this.k = 0; this.found = new Set();
    // ---- screen tint (cheap, works on every GPU) ----
    this.tint = document.createElement('div'); this.tint.id = 'uw'; document.body.appendChild(this.tint);
    this.breathEl = document.createElement('div'); this.breathEl.id = 'breath'; this.breathEl.innerHTML = '<b>AIR</b><div><i></i></div>'; document.body.appendChild(this.breathEl);
    // ---- light shafts from the surface ----
    const rayMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uTime: U.uTime, uSun: U.uSunColor, uK: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying float vI; void main(){ vUv = uv; vI = float(gl_InstanceID); vec4 w = modelMatrix*instanceMatrix*vec4(position,1.); gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: 'uniform float uTime, uK; uniform vec3 uSun; varying vec2 vUv; varying float vI; void main(){ float x = abs(vUv.x - 0.5)*2.; float f = (1. - smoothstep(0.2, 1., x)) * vUv.y*vUv.y * (0.55 + 0.45*sin(uTime*0.7 + vI*1.7 + vUv.y*3.)); gl_FragColor = vec4(uSun*vec3(0.55,0.85,0.9)*f*0.16*uK, 1.); }' });
    const rayG = new THREE.PlaneGeometry(2.2, 34); rayG.translate(0, -17, 0);
    this.rays = new THREE.InstancedMesh(rayG, rayMat, 14); this.rays.frustumCulled = false; this.root.add(this.rays);
    this.rayOff = Array.from({ length: 14 }, () => ({ a: rng() * 6.28, r: 4 + rng() * 22, w: 0.6 + rng() * 1.6 }));
    // ---- bubbles ----
    this.bub = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: 0xdff8ff, transparent: true, opacity: 0.6, depthWrite: false }), 64);
    this.bub.frustumCulled = false; this.bub.count = 0; this.root.add(this.bub); this.bubbles = []; this.bubT = 0;
    // ---- the reef (always present near the coast, cheap static instancing) ----
    this.reef = new THREE.Group(); S.add(this.reef);
    const sway = (m, amp, key) => patch(m, (s) => {
      s.uniforms.uTime = U.uTime;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = float(gl_InstanceID)*1.37; float hk = max(position.y, 0.);
        transformed.x += sin(uTime*1.1 + ph + position.y*0.9)*hk*${amp.toFixed(3)}; transformed.z += cos(uTime*0.9 + ph*1.3 + position.y*0.7)*hk*${(amp * 0.7).toFixed(3)};`);
    }, key);
    const place = (geo, mat, n, scale, yOff, color) => {
      const m = new THREE.InstancedMesh(geo, mat, n), d = new THREE.Object3D(), c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        let P = reefPt(rng), y = M.terrainH(P.x, P.z); for (let t = 0; t < 4 && (y > -1.6 || y < -26); t++) { P = reefPt(rng); y = M.terrainH(P.x, P.z); }
        d.position.set(P.x, y + yOff, P.z); d.rotation.set((rng() - 0.5) * 0.3, rng() * 6.28, (rng() - 0.5) * 0.3); const s = scale[0] + rng() * (scale[1] - scale[0]); d.scale.set(s, s * (0.7 + rng() * 0.6), s); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
        m.setColorAt(i, c.set(color(rng)));
      }
      m.instanceMatrix.needsUpdate = true; m.receiveShadow = true; this.reef.add(m); return m;
    };
    const N = (a) => Math.round(a * (low ? 0.45 : 1));
    // brain + boulder corals
    const brain = new THREE.IcosahedronGeometry(0.7, 2); { const p = brain.attributes.position; for (let i = 0; i < p.count; i++) { const v = new V3().fromBufferAttribute(p, i), n = 1 + 0.08 * Math.sin(v.x * 9) * Math.sin(v.z * 9) + 0.05 * Math.sin(v.y * 14); p.setXYZ(i, v.x * n, Math.max(v.y, -0.15) * n * 0.75, v.z * n); } brain.computeVertexNormals(); }
    place(brain, new THREE.MeshStandardMaterial({ roughness: 0.85 }), N(900), [0.5, 2.2], 0, (r) => [0xd9a066, 0xc97b6b, 0x9fae6a, 0xe8c8a0, 0x7f9c8f, 0xb98aa8][Math.floor(r() * 6)]);
    // staghorn (branching) coral
    const br = []; { const r2 = mulberry32(5); for (let k = 0; k < 9; k++) { const c = new THREE.CylinderGeometry(0.03, 0.07, 0.9 + r2() * 0.6, 5); c.translate(0, 0.45, 0); c.rotateZ((r2() - 0.5) * 1.3); c.rotateY(r2() * 6.28); br.push(c.toNonIndexed()); } }
    place(mergeGeometries(br), new THREE.MeshStandardMaterial({ roughness: 0.7 }), N(900), [0.7, 1.8], -0.05, (r) => [0xff7f50, 0xf4a3c0, 0xc8a2e8, 0xffd27f, 0x8fd3c7, 0xe85d75][Math.floor(r() * 6)]);
    // sea fans (sway)
    const fanG = new THREE.CircleGeometry(0.8, 14, 0, Math.PI).rotateZ(0); fanG.translate(0, 0, 0);
    const fanM = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }); sway(fanM, 0.05, 'reefFan');
    place(fanG, fanM, N(600), [0.6, 1.6], 0, (r) => [0x9c27b0, 0xd84315, 0xffb300, 0xc2185b, 0x6a1b9a][Math.floor(r() * 5)]);
    // tube sponges
    const sp = []; for (let k = 0; k < 4; k++) { const c = new THREE.CylinderGeometry(0.13, 0.1, 0.6 + k * 0.2, 9, 1, true); c.translate(Math.cos(k * 1.7) * 0.18, 0.3 + k * 0.1, Math.sin(k * 1.7) * 0.18); sp.push(c.toNonIndexed()); }
    const spM = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
    place(mergeGeometries(sp), spM, N(500), [0.8, 1.6], 0, (r) => [0xffeb3b, 0x7e57c2, 0xff7043, 0x26a69a][Math.floor(r() * 4)]);
    // kelp / sea grass (tall swaying ribbons)
    const kg = []; for (const a of [0, Math.PI / 2]) { const pl = new THREE.PlaneGeometry(0.09, 1, 1, 6); pl.translate(0, 0.5, 0); pl.rotateY(a); kg.push(pl); }
    const kelpM = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }); sway(kelpM, 0.12, 'reefKelp');
    const kelp = place(mergeGeometries(kg), kelpM, N(1400), [1.5, 5.5], 0, (r) => [0x4e7d2b, 0x6b8e23, 0x3b6e3b, 0x8a7a2b][Math.floor(r() * 4)]);
    kelp.castShadow = false;
    // rocks
    if (game.world && game.world.TX) place(new THREE.DodecahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ map: game.world.TX.rock.d, normalMap: game.world.TX.rock.n, roughness: 0.95 }), N(420), [0.8, 3.5], -0.4, () => 0x8a8f86);
    // ---- the wreck of the São Jerónimo (Portuguese galleon, 1640) ----
    this.buildWreck(S, rng);
    // ---- treasure chests: 6 at the wreck, 4 hidden on the reef ----
    this.chests = [];
    const chestMat = new THREE.MeshStandardMaterial({ color: 0x5d3a1a, roughness: 0.7 }), goldMat = new THREE.MeshStandardMaterial({ color: 0xffc94a, emissive: 0xffa000, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.25 });
    const wx = WRECK.x, wz = WRECK.z;
    const spots = [[wx + 6, wz + 4], [wx - 5, wz - 9], [wx + 2, wz + 15], [wx - 8, wz + 8], [wx + 9, wz - 14], [wx - 2, wz - 20]];
    for (let k = 0; k < 4; k++) { const P = reefPt(rng); spots.push([P.x, P.z]); }
    spots.forEach(([x, z], i) => {
      const y = M.terrainH(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rng() * 6.28;
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.65).translate(0, 0.27, 0), chestMat), lid = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 1.0, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0.55, 0), chestMat);
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.08, 0.67).translate(0, 0.45, 0), goldMat), gold = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6, 0, 6.28, 0, 1.2).translate(0, 0.5, 0), goldMat);
      g.add(base, lid, band, gold); this.reef.add(g); this.chests.push({ g, x, z, y, id: i, done: false });
    });
    // ---- fish schools, turtles, manta (animated only when close) ----
    const fishMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.25 });
    patch(fishMat, (s) => {
      s.uniforms.uTime = U.uTime;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
        float bend = smoothstep(0.1, -0.36, position.z); transformed.x += sin(uTime*11. + float(gl_InstanceID)*2.1 + position.z*6.)*0.07*bend;`);
    }, 'fish');
    this.nSchools = low ? 8 : 16; this.perSchool = low ? 22 : 34;
    this.fish = new THREE.InstancedMesh(fishGeo(), fishMat, this.nSchools * this.perSchool); this.fish.frustumCulled = false; this.fish.castShadow = false; this.reef.add(this.fish);
    this.schools = []; const palette = [[0xffd54f, 1.0], [0x29b6f6, 0.9], [0xcfd8dc, 1.4], [0xff8a65, 0.8], [0xba68c8, 0.9], [0x81c784, 1.1], [0xfff176, 0.7], [0x4dd0e1, 1.2]];
    const col = new THREE.Color();
    for (let s = 0; s < this.nSchools; s++) {
      const P = reefPt(rng), floor = M.terrainH(P.x, P.z), [c, sz] = palette[s % palette.length];
      const sc = { cx: P.x, cz: P.z, y: clamp(floor + 2 + rng() * 4, floor + 1.5, -1.8), r: 6 + rng() * 14, w: (0.12 + rng() * 0.18) * (rng() < 0.5 ? -1 : 1), ph: rng() * 6.28, sz, off: [] };
      for (let i = 0; i < this.perSchool; i++) { sc.off.push(new V3((rng() - 0.5) * 4, (rng() - 0.5) * 1.6, (rng() - 0.5) * 4)); this.fish.setColorAt(s * this.perSchool + i, col.set(c).offsetHSL((rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.12)); }
      this.schools.push(sc);
    }
    const turtleMat = new THREE.MeshStandardMaterial({ color: 0x6b7a4a, roughness: 0.6 });
    this.turtles = []; for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(turtleGeo(), turtleMat); m.scale.setScalar(1.2 + rng() * 0.5); const P = reefPt(rng); this.reef.add(m); this.turtles.push({ m, cx: P.x, cz: P.z, r: 25 + rng() * 40, w: 0.04 + rng() * 0.04, ph: rng() * 6.28, y: Math.max(M.terrainH(P.x, P.z) + 3, -14) }); }
    const mantaMat = new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.55, side: THREE.DoubleSide });
    patch(mantaMat, (s) => { s.uniforms.uTime = U.uTime; s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat wx = abs(position.x)/2.3; transformed.y += sin(uTime*1.6 - wx*1.8)*wx*wx*0.9;'); }, 'manta');
    this.manta = new THREE.Mesh(mantaGeo(), mantaMat); this.reef.add(this.manta); this.mantaP = { ph: 0 };
    this._d = new THREE.Object3D(); this.reefNear = false;
    this.count = this.chests.length;
  }
  buildWreck(S, rng) {
    const wx = WRECK.x, wz = WRECK.z, y = M.terrainH(wx, wz), TX = this.game.world.TX;
    const wood = new THREE.MeshStandardMaterial({ map: TX ? TX.wood.d : null, color: 0x6a5a48, roughness: 0.95, side: THREE.DoubleSide });
    const algae = new THREE.MeshStandardMaterial({ map: TX ? TX.wood.d : null, color: 0x4a6a44, roughness: 1, side: THREE.DoubleSide });
    const g = new THREE.Group(); g.position.set(wx, y - 0.6, wz); g.rotation.set(0.04, 0.6, 0.28); this.reef.add(g);
    // galleon hull: open-topped planked shell with a keel, rising bow and stern; broken in two amidships
    const hull = (z0, z1) => {
      const NZ = 14, NK = 14, P = [], UV = [], I = [];
      for (let i = 0; i <= NZ; i++) {
        const z = lerp(z0, z1, i / NZ), u = clamp((z + 20) / 40, 0, 1), w = 4.4 * Math.pow(Math.sin(Math.PI * clamp(u, 0.04, 0.96)), 0.55), sheer = 3.6 + 2.2 * Math.pow(Math.abs(u - 0.45) * 2, 2.2);
        for (let k = 0; k <= NK; k++) { const th = (k / NK - 0.5) * Math.PI * 1.04, sx = Math.sin(th), cy = Math.cos(th); P.push(w * sx, sheer - (sheer + 0.6) * Math.pow(Math.max(cy, 0), 0.75) * (1 + 0.25 * (1 - Math.abs(sx))) * 0.82, z); UV.push(k / NK * 3, z / 3); }
      }
      for (let i = 0; i < NZ; i++) for (let k = 0; k < NK; k++) { const a = i * (NK + 1) + k, b = a + NK + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); geo.setIndex(I); geo.computeVertexNormals(); return geo;
    };
    const h1 = new THREE.Mesh(hull(-20, -1.2), wood), h2 = new THREE.Mesh(hull(1.5, 20), algae); h2.position.set(1.4, -0.5, 1.2); h2.rotation.set(0.05, 0.22, -0.25);
    for (const h of [h1, h2]) { h.castShadow = true; g.add(h); }
    // ribs showing where planks have rotted away, a broken deck, the stern castle and the bowsprit
    for (let z = -18; z < 18; z += 2.4) { if (Math.abs(z) < 2.5) continue; const u = clamp((z + 20) / 40, 0, 1), w = 4.4 * Math.pow(Math.sin(Math.PI * clamp(u, 0.04, 0.96)), 0.55); const rib = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 5, 12, Math.PI), wood); rib.rotation.set(0, 0, Math.PI); rib.scale.set(w * 1.02, 3.2, 3); rib.position.set(z > 0 ? 1.4 : 0, 3.6, z); g.add(rib); }
    for (let k = 0; k < 9; k++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 6 + rng() * 6), wood); pl.position.set(-3 + k * 0.8, 3.2 + rng() * 0.3, -9 + rng() * 3); pl.rotation.set(rng() * 0.2, 0, rng() * 0.15); if (rng() < 0.7) g.add(pl); }
    const castle = new THREE.Mesh(new THREE.BoxGeometry(7.4, 3.4, 6), wood); castle.position.set(0, 5.6, -16.5); g.add(castle);
    for (let k = 0; k < 4; k++) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.1), new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 1 })); win.position.set(-2.4 + k * 1.6, 5.8, -19.55); g.add(win); }
    const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 9, 8), wood); bow.position.set(1.4, 6.5, 22); bow.rotation.set(1.1, 0, 0); g.add(bow);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 18, 10), wood); mast.position.set(2, 4, 8); mast.rotation.set(1.2, 0, 0.4); g.add(mast);
    const mast2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 9, 10), wood); mast2.position.set(0, 6.5, -8); mast2.rotation.set(0.2, 0, 0.15); g.add(mast2);
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 9, 8), wood); yard.position.set(0, 10.5, -8); yard.rotation.set(0, 0, Math.PI / 2 + 0.3); g.add(yard);
    // tattered sail draped from the yard
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(7, 5, 6, 4), new THREE.MeshStandardMaterial({ color: 0x8c8470, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })); { const p = sail.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 0.9) * 0.5 + Math.sin(p.getY(i) * 1.3) * 0.3); sail.geometry.computeVertexNormals(); }
    sail.position.set(0.2, 8, -7.6); sail.rotation.set(0.25, 0, 0.3); g.add(sail);
    const iron = new THREE.MeshStandardMaterial({ color: 0x2d2a26, roughness: 0.6, metalness: 0.6 });
    for (let k = 0; k < 7; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 2.3, 10), iron); const x = wx - 9 + rng() * 18, z = wz - 16 + rng() * 32; c.rotation.set(Math.PI / 2, 0, rng() * 6); c.position.set(x, M.terrainH(x, z) + 0.2, z); this.reef.add(c); }
    for (let k = 0; k < 14; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7 + rng(), 0.6, 0.7), rng() < 0.4 ? algae : wood); const x = wx - 14 + rng() * 28, z = wz - 22 + rng() * 44; b.position.set(x, M.terrainH(x, z) + 0.25, z); b.rotation.set(rng(), rng() * 6, rng()); this.reef.add(b); }
    this.wreck = g;
  }
  // ---- per frame ----
  update(dt) {
    const g = this.game, cam = g.cam, cp = cam.position, wl = M.waterLevelAt(cp.x, cp.z), ground = M.terrainH(cp.x, cp.z);
    const under = cp.y < wl - 0.08 && ground < wl - 0.3 && !g.inside;
    this.k = damp(this.k, under ? 1 : 0, 10, dt); this.under = under;
    // fog hides everything past ~120 m under water: pull the far plane in so the city is culled
    const far = under ? 160 : g.q.far; if (cam.far !== far) { cam.far = far; cam.updateProjectionMatrix(); }
    this.root.visible = this.k > 0.01;
    this.tint.style.opacity = this.k.toFixed(3);
    // fog + sky while submerged (sky/clouds hidden so the open water reads as a blue void)
    if (this.k > 0.01) {
      const day = clamp(U.uSunColor.value.r * 1.2 + 0.06, 0.06, 1), deep = clamp(-cp.y / 30, 0, 1);
      const fc = new THREE.Color(0.04, 0.27, 0.32).multiplyScalar(day * (1 - deep * 0.55)).lerp(new THREE.Color(0.02, 0.06, 0.09), 0.25 * (1 - day));
      g.scene.fog.color.lerp(fc, this.k); U.uFogColor.value.lerp(fc, this.k);
      const dens = lerp(g.scene.fog.density, 0.032 + deep * 0.012, this.k); g.scene.fog.density = dens; U.uFogDensity.value = dens;
      g.renderer.setClearColor(fc, 1);
      const sk = g.sky, hide = this.k > 0.5;
      if (hide && !this.skyHidden) { this.skyHidden = [sk.sky.visible, sk.night.visible, sk.clouds.visible]; sk.sky.visible = sk.night.visible = sk.clouds.visible = false; }
      else if (!hide && this.skyHidden) this.unhide();
      // light shafts hang from the surface around the camera, facing it
      this.rays.material.uniforms.uK.value = this.k * clamp(U.uSunDir.value.y * 3, 0, 1);
      const d = this._d;
      this.rayOff.forEach((o, i) => { o.a += dt * 0.02; d.position.set(cp.x + Math.cos(o.a) * o.r, wl, cp.z + Math.sin(o.a) * o.r); d.rotation.set(0.12 * Math.sin(o.a * 3), Math.atan2(cp.x - d.position.x, cp.z - d.position.z), 0.15); d.scale.set(o.w, 1, 1); d.updateMatrix(); this.rays.setMatrixAt(i, d.matrix); });
      this.rays.instanceMatrix.needsUpdate = true;
    } else if (this.skyHidden) this.unhide();
    if (this.wasUnder !== under) { if (under) sfx('splash', 0.6); }
    this.wasUnder = under;
    // bubbles from the diver
    const p = g.player;
    if (p.state === 'dive') { this.bubT -= dt; if (this.bubT < 0) { this.bubT = 0.5 + Math.random() * 0.8; const h = p.pos.clone().add(new V3(Math.sin(p.yaw) * 0.3, 1.2 + (p.divePitch || 0) * 0.5, Math.cos(p.yaw) * 0.3)); for (let k = 0; k < 4; k++) this.bubbles.push({ p: h.clone().add(new V3((Math.random() - 0.5) * 0.1, k * 0.08, (Math.random() - 0.5) * 0.1)), s: 0.6 + Math.random() * 1.2, t: 0 }); } }
    const d = this._d; let n = 0;
    for (let i = this.bubbles.length - 1; i >= 0; i--) { const b = this.bubbles[i]; b.t += dt; b.p.y += dt * (0.9 + b.s * 0.4); b.p.x += Math.sin(b.t * 7 + b.s * 9) * dt * 0.15; if (b.p.y > M.waterLevelAt(b.p.x, b.p.z) - 0.05 || b.t > 12 || n >= 64) { this.bubbles.splice(i, 1); continue; } d.position.copy(b.p); d.rotation.set(0, 0, 0); d.scale.setScalar(b.s); d.updateMatrix(); this.bub.setMatrixAt(n++, d.matrix); }
    this.bub.count = n; this.bub.instanceMatrix.needsUpdate = true;
    // breath meter
    const br = p.breath ?? 45, show = p.state === 'dive' || br < 44.5;
    this.breathEl.style.opacity = show ? '1' : '0'; this.breathEl.querySelector('i').style.width = (br / 45 * 100).toFixed(1) + '%'; this.breathEl.classList.toggle('low', br < 10);
    if (p.state === 'dive' && br < 10 && !this.warned) { this.warned = true; g.hud.toast('Running out of air — swim up! (Space)', 2.5, '#ff5252'); }
    if (br > 20) this.warned = false;
    // reef life only animates near the reef
    const rz = clamp(cp.z, REEF.z0, REEF.z1), near = Math.hypot(cp.x - (M.coastX(rz) - 300), cp.z - rz) < 700;
    this.reef.visible = near || under; this.reefNear = near;
    if (!near) return;
    const t = g.time;
    for (let s = 0; s < this.schools.length; s++) {
      const sc = this.schools[s], a = sc.ph + t * sc.w, cx = sc.cx + Math.cos(a) * sc.r, cz = sc.cz + Math.sin(a) * sc.r, yaw = Math.atan2(-Math.sin(a) * Math.sign(sc.w), Math.cos(a) * Math.sign(sc.w));
      for (let i = 0; i < this.perSchool; i++) {
        const o = sc.off[i], w = Math.sin(t * 1.3 + i) * 0.4;
        d.position.set(cx + o.x * Math.cos(yaw) + o.z * Math.sin(yaw) + w, sc.y + o.y + Math.sin(t * 2 + i * 0.7) * 0.15, cz - o.x * Math.sin(yaw) + o.z * Math.cos(yaw));
        // scatter away from the diver
        const dx = d.position.x - p.pos.x, dy = d.position.y - p.pos.y - 1, dz = d.position.z - p.pos.z, dd = dx * dx + dy * dy + dz * dz;
        if (dd < 16) { const k = (16 - dd) / 16 * 1.5 / Math.sqrt(dd + 0.01); d.position.x += dx * k; d.position.y += dy * k; d.position.z += dz * k; }
        d.rotation.set(0, yaw, 0); d.scale.setScalar(sc.sz); d.updateMatrix(); this.fish.setMatrixAt(s * this.perSchool + i, d.matrix);
      }
    }
    this.fish.instanceMatrix.needsUpdate = true;
    for (const T of this.turtles) { T.ph += dt * T.w; const x = T.cx + Math.cos(T.ph) * T.r, z = T.cz + Math.sin(T.ph) * T.r; T.m.position.set(x, Math.max(T.y + Math.sin(T.ph * 3) * 1.5, M.terrainH(x, z) + 1), z); T.m.rotation.set(Math.sin(t) * 0.08, Math.atan2(-Math.sin(T.ph), Math.cos(T.ph)), Math.sin(t * 1.3) * 0.1); }
    { const mp = this.mantaP; mp.ph += dt * 0.05; const cz0 = (REEF.z0 + REEF.z1) / 2, x = M.coastX(cz0) - 320 + Math.cos(mp.ph) * 160, z = cz0 + Math.sin(mp.ph * 1.3) * 380; this.manta.position.set(x, Math.max(M.terrainH(x, z) + 4, -12 + Math.sin(mp.ph * 4) * 3), z); const dx = -Math.sin(mp.ph) * 160, dz = Math.cos(mp.ph * 1.3) * 380 * 1.3; this.manta.rotation.set(0, Math.atan2(dx, dz), Math.sin(t * 0.8) * 0.15); }
  }
  unhide() { const sk = this.game.sky, v = this.skyHidden; sk.sky.visible = v[0]; sk.night.visible = v[1]; sk.clouds.visible = v[2]; this.skyHidden = null; }
  // the treasure-chest interaction (shown when the diver is next to a chest)
  action(pos) {
    for (const c of this.chests) if (!c.done && Math.hypot(c.x - pos.x, c.z - pos.z) < 2.6 && Math.abs(c.y - pos.y) < 3.5) return { label: 'Open treasure chest', id: 'seachest', c };
    return null;
  }
  open(c) {
    c.done = true; this.found.add(c.id); c.g.visible = false; const g = this.game; g.money += 5000; sfx('coin', 1);
    const n = this.found.size; g.hud.toast(`Sunken treasure ${n}/${this.count} · + ₹5,000`, 3, '#ffd54f');
    if (n === this.count) { g.money += 50000; setTimeout(() => { g.hud.toast('ALL TREASURE FOUND!  + ₹50,000', 5, '#ffd54f'); say('Mira', 'Every chest of the São Jerónimo! We are rich, Vikas!'); }, 1500); }
    g.save && g.save();
  }
  restore(ids) { for (const id of ids || []) { const c = this.chests[id]; if (c) { c.done = true; c.g.visible = false; this.found.add(id); } } }
}
