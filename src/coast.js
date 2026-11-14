// Daman fishing fleet: painted wooden boats hauled up on Devka and Jampore beaches (resting on their keels, bows to
// the sea, flags flying, nets piled inside) and a few more riding at anchor beyond the surf.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from './mapdata.js';
import { U } from './shaders.js';
import { mulberry32 } from './util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function prep(g, color) {
  if (g.index) g = g.toNonIndexed();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (color !== undefined) { const c = new THREE.Color(color), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

// palettes: [hull body, stripe, gunwale, bottom, cabin]
const PAL = [
  [0x1f6fb8, 0xf2f0e6, 0xd8342b, 0x5a1a14, 0xf4f1e8],
  [0x2a9d6f, 0xf5c518, 0xc0392b, 0x2b2b2b, 0xe9f2f7],
  [0xe8e4d8, 0x2b6cb0, 0xf08a24, 0x6b1d1d, 0x7fc3e8],
  [0xc9302c, 0xf4d03f, 0x1d4f91, 0x222222, 0xf7f3ea],
  [0x16a3b8, 0xffffff, 0xe84a5f, 0x3a2a20, 0xfff3c4],
];

// lofted hull: stations along the length, a rounded V section, raised bow, flat transom
function hullGeo(pal, L = 10, B = 2.7, D = 1.25) {
  const NS = 18, NV = 12;
  const body = new THREE.Color(pal[0]), stripe = new THREE.Color(pal[1]), rim = new THREE.Color(pal[2]), bot = new THREE.Color(pal[3]), inner = new THREE.Color(0x9a7650);
  const sec = (u) => {
    const half = B / 2 * Math.pow(Math.sin(Math.PI * Math.min(u * 0.92 + 0.06, 1)), 0.55) * (u < 0.08 ? 0.85 + u * 1.8 : 1);
    const sheer = D + 0.75 * Math.pow(Math.max(u - 0.55, 0) / 0.45, 2) + 0.15 * Math.pow(Math.max(0.2 - u, 0) / 0.2, 2);
    const keel = 0.1 * Math.pow(Math.max(u - 0.7, 0) / 0.3, 1.5);
    return { half, sheer, keel };
  };
  const pt = (u, v, side) => { const s = sec(u), a = v * Math.PI / 2, x = side * s.half * Math.pow(Math.sin(a), 0.6), y = s.keel + (s.sheer - s.keel) * (1 - Math.cos(a)) * 0.98 + v * 0.02; return [x, y, -L / 2 + u * L]; };
  const colAt = (y, sheer) => { const t = y / sheer; return t < 0.3 ? bot : t > 0.93 ? rim : t > 0.74 && t < 0.85 ? stripe : body; };
  const P = [], C = [], I = []; let base = 0;
  for (const side of [-1, 1]) for (const inside of [false, true]) {
    for (let i = 0; i <= NS; i++) for (let j = 0; j <= NV; j++) {
      const u = i / NS, [x, y, z] = pt(u, j / NV, side), c = inside ? inner : colAt(y, sec(u).sheer);
      P.push(inside ? x * 0.94 : x, inside ? y + 0.05 : y, z); C.push(c.r, c.g, c.b);
    }
    const out = (side > 0) !== inside;
    for (let i = 0; i < NS; i++) for (let j = 0; j < NV; j++) {
      const a = base + i * (NV + 1) + j, b = a + NV + 1;
      if (out) I.push(a, a + 1, b, b, a + 1, b + 1); else I.push(a, b, a + 1, b, b + 1, a + 1);
    }
    base += (NS + 1) * (NV + 1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals();
  const parts = [prep(g)];
  // transom
  const s0 = sec(0); const tr = new THREE.Shape(); tr.moveTo(-s0.half * 0.98, s0.sheer); tr.quadraticCurveTo(-s0.half * 0.9, 0.05, 0, s0.keel); tr.quadraticCurveTo(s0.half * 0.9, 0.05, s0.half * 0.98, s0.sheer); tr.lineTo(-s0.half * 0.98, s0.sheer);
  parts.push(prep(new THREE.ShapeGeometry(tr).translate(0, 0, -L / 2 + 0.01), pal[0]));
  // stem post, thwarts, rubbing strake
  const sb = sec(1); parts.push(prep(new THREE.BoxGeometry(0.14, sb.sheer + 0.35, 0.18).translate(0, (sb.sheer + 0.35) / 2, L / 2 - 0.05), pal[2]));
  for (const u of [0.3, 0.5, 0.68]) { const s = sec(u); parts.push(prep(new THREE.BoxGeometry(s.half * 1.8, 0.07, 0.3).translate(0, s.sheer * 0.72, -L / 2 + u * L), 0x8a6640)); }
  return parts;
}
function boatGeo(pal, cabin, rnd) {
  const L = 9 + rnd() * 2.5, parts = hullGeo(pal, L);
  if (cabin) {
    parts.push(prep(new THREE.BoxGeometry(1.7, 1.35, 1.6).translate(0, 1.6, -L / 2 + 2.0), pal[4]));
    parts.push(prep(new THREE.BoxGeometry(1.9, 0.12, 1.9).translate(0, 2.33, -L / 2 + 2.0), pal[2]));
    for (const sx of [-1, 1]) parts.push(prep(new THREE.PlaneGeometry(1.1, 0.45).rotateY(sx * Math.PI / 2).translate(sx * 0.86, 1.85, -L / 2 + 2.0), 0x1b2a38));
  }
  // mast + flags (saffron, red, green pennants)
  const mz = L / 2 - 2.2; parts.push(prep(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 6).translate(0, 2.6, mz), 0x6d4c33));
  [0xff8f1f, 0xd62828, 0x2a9d4f].forEach((c, k) => { const f = new THREE.BufferGeometry(); f.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.42, 0, 0.0, -0.21, 0.85].map((v, i) => v + [0, 4.6 - k * 0.5, mz][i % 3]), 3)); f.computeVertexNormals(); parts.push(prep(f, c)); });
  // net pile + floats
  const net = new THREE.IcosahedronGeometry(0.75, 1).scale(1.3, 0.38, 1.0).translate(0, 0.55, L / 2 - 3.9); parts.push(prep(net, [0x2f6b5a, 0x1f4d8c, 0x7a2d3b][Math.floor(rnd() * 3)]));
  for (let k = 0; k < 4; k++) parts.push(prep(new THREE.SphereGeometry(0.14, 6, 4).translate((rnd() - 0.5) * 1.2, 0.8, L / 2 - 3.9 + (rnd() - 0.5) * 1.2), 0xff6a13));
  const g = mergeGeometries(parts); g.userData.L = L; return g;
}

export function buildCoast(scene, q, H) {
  const rnd = mulberry32(2026);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide });
  // weathered paint: subtle streaks and salt bleaching
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;\nfloat hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat st = hh(vec2(floor(vLP.z*6.0), floor(vLP.y*1.5)))*0.18 + hh(floor(vLP.zy*vec2(40.0, 3.0)))*0.08;\ndiffuseColor.rgb *= 0.86 + st;\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8,0.78,0.72), smoothstep(0.35, 0.0, vLP.y)*0.25);');
  };
  mat.customProgramCacheKey = () => 'boatpaint';
  const variants = []; for (let k = 0; k < 8; k++) variants.push(boatGeo(PAL[k % PAL.length], k % 2 === 0, rnd));
  const beached = [], anchored = [];
  const beach = (z0, z1, n) => {
    for (let i = 0; i < n; i++) {
      const z = z0 + (z1 - z0) * (i + rnd() * 0.6) / n, c = M.coastX(z), dc = 14 + rnd() * 34, x = c + dc;
      if (M.SEA.pts.length && z > M.SEA.z0 - 5 && z < M.SEA.z1 + 5 && dc > 62) continue;
      const y = M.terrainH(x, z), slope = (M.terrainH(x + 2, z) - M.terrainH(x - 2, z)) / 4;
      beached.push({ x, z, y: y - 0.12, yaw: -Math.PI / 2 + (rnd() - 0.5) * 0.7, pitch: slope, roll: (rnd() - 0.5) * 0.16, v: (rnd() * variants.length) | 0 });
    }
  };
  beach(-4560, -3140, 22); beach(2700, 4000, 16);
  for (let i = 0; i < 18; i++) { const z = (i < 10 ? -4500 : 2700) + rnd() * (i < 10 ? 1300 : 1200), x = M.coastX(z) - 70 - rnd() * 260; anchored.push({ x, z, y: 0, yaw: rnd() * 6.28, pitch: 0, roll: 0, v: (rnd() * variants.length) | 0, p: rnd() * 6 }); }
  const sets = variants.map((g, k) => {
    const b = beached.filter((o) => o.v === k), a = anchored.filter((o) => o.v === k);
    if (b.length) H.instTiles(scene, g, mat, b, 600, q.desktop ? 1400 : 700, (m, o, i) => { _m.compose(_p.set(o.x, o.y, o.z), _q.setFromEuler(_e.set(o.pitch, o.yaw, o.roll, 'YXZ')), _s.set(1, 1, 1)); m.setMatrixAt(i, _m); });
    if (!a.length) return null;
    const m = new THREE.InstancedMesh(g, mat, a.length); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
    return { m, a };
  }).filter(Boolean);
  for (const o of beached) { const c = Math.cos(o.yaw), s = Math.sin(o.yaw); const hx = Math.abs(s) * 5 + Math.abs(c) * 1.4, hz = Math.abs(c) * 5 + Math.abs(s) * 1.4; H.addCol(o.x - hx * 0.8, o.z - hz * 0.8, o.x + hx * 0.8, o.z + hz * 0.8, o.y, o.y + 1.4); }
  H.animated.push((t) => {
    for (const S of sets) { S.a.forEach((o, i) => { _m.compose(_p.set(o.x, Math.sin(t * 1.1 + o.p) * 0.18 - 0.35, o.z), _q.setFromEuler(_e.set(Math.sin(t * 0.9 + o.p) * 0.05, o.yaw + Math.sin(t * 0.13 + o.p) * 0.2, Math.cos(t * 1.05 + o.p) * 0.07)), _s.set(1, 1, 1)); S.m.setMatrixAt(i, _m); }); S.m.instanceMatrix.needsUpdate = true; }
  });
  return { beached: beached.length, anchored: anchored.length, list: beached };
}
