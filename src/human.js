// Procedural skinned humans: smooth lofted body, clothing via vertex colours, skeleton + procedural animation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, damp } from './util.js';

export const BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'shL', 'armL', 'foreL', 'handL', 'shR', 'armR', 'foreR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
const PARENT = { hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shL: 'chest', armL: 'shL', foreL: 'armL', handL: 'foreL', shR: 'chest', armR: 'shR', foreR: 'armR', handR: 'foreR', thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR' };
// rest positions (world, metres) for a 1.78 m adult facing +z
function restWorld(f) {
  const sh = f ? 0.185 : 0.205, hipW = f ? 0.1 : 0.095;
  return {
    root: [0, 0, 0], hips: [0, 0.98, 0], spine: [0, 1.1, 0], chest: [0, 1.3, 0], neck: [0, 1.52, 0], head: [0, 1.62, 0],
    shL: [0.07, 1.47, 0], armL: [sh, 1.46, 0], foreL: [sh + 0.01, 1.17, 0], handL: [sh + 0.015, 0.92, 0.01],
    shR: [-0.07, 1.47, 0], armR: [-sh, 1.46, 0], foreR: [-sh - 0.01, 1.17, 0], handR: [-sh - 0.015, 0.92, 0.01],
    thighL: [hipW, 0.94, 0], shinL: [hipW, 0.5, 0.005], footL: [hipW, 0.085, 0], thighR: [-hipW, 0.94, 0], shinR: [-hipW, 0.5, 0.005], footR: [-hipW, 0.085, 0],
  };
}

// ---------- geometry builder ----------
class GB {
  constructor() { this.p = []; this.n = []; this.c = []; this.si = []; this.sw = []; this.idx = []; this.v = 0; }
  vert(x, y, z, nx, ny, nz, col, b0, b1, w) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); this.si.push(b0, b1, 0, 0); this.sw.push(1 - w, w, 0, 0); return this.v++; }
  // loft along a list of rings: {c:[x,y,z], ax:[x,y,z] (axis dir), a, b (radii), col, b0, b1, w}
  loft(rings, seg = 10, capA = true, capB = true) {
    const base = this.v;
    for (const r of rings) {
      const ax = new THREE.Vector3(...r.ax).normalize();
      let u = Math.abs(ax.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const v = new THREE.Vector3().crossVectors(ax, u).normalize(); u = new THREE.Vector3().crossVectors(v, ax).normalize();
      for (let k = 0; k < seg; k++) {
        const t = (k / seg) * Math.PI * 2, cs = Math.cos(t), sn = Math.sin(t);
        const off = u.clone().multiplyScalar(cs * r.a).addScaledVector(v, sn * (r.b ?? r.a));
        if (r.flat) off.addScaledVector(v, sn > 0 ? r.flat : 0);
        const nrm = u.clone().multiplyScalar(cs / r.a).addScaledVector(v, sn / (r.b ?? r.a)).normalize();
        this.vert(r.c[0] + off.x, r.c[1] + off.y, r.c[2] + off.z, nrm.x, nrm.y, nrm.z, typeof r.col === 'function' ? r.col(t) : r.col, r.b0, r.b1 ?? r.b0, r.w ?? 0);
      }
    }
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < seg; k++) {
      const a = base + i * seg + k, b = base + i * seg + ((k + 1) % seg), c = a + seg, d = b + seg;
      this.idx.push(a, c, b, b, c, d);
    }
    const cap = (ri, dir) => {
      const r = rings[ri], ax = new THREE.Vector3(...r.ax).normalize().multiplyScalar(dir);
      const cv = this.vert(r.c[0], r.c[1], r.c[2], ax.x, ax.y, ax.z, typeof r.col === 'function' ? r.col(0) : r.col, r.b0, r.b1 ?? r.b0, r.w ?? 0);
      for (let k = 0; k < seg; k++) { const a = base + ri * seg + k, b = base + ri * seg + ((k + 1) % seg); if (dir < 0) this.idx.push(cv, b, a); else this.idx.push(cv, a, b); }
    };
    if (capA) cap(0, -1); if (capB) cap(rings.length - 1, 1);
  }
  ellipsoid(cx, cy, cz, rx, ry, rz, col, b0, ws = 12, hs = 9, cut = 1) {
    const base = this.v;
    for (let j = 0; j <= hs; j++) {
      const ph = (j / hs) * Math.PI * cut;
      for (let i = 0; i <= ws; i++) {
        const th = (i / ws) * Math.PI * 2, x = Math.sin(ph) * Math.cos(th), y = Math.cos(ph), z = Math.sin(ph) * Math.sin(th);
        const nn = new THREE.Vector3(x / rx, y / ry, z / rz).normalize();
        this.vert(cx + x * rx, cy + y * ry, cz + z * rz, nn.x, nn.y, nn.z, typeof col === 'function' ? col(x, y, z) : col, b0, b0, 0);
      }
    }
    for (let j = 0; j < hs; j++) for (let i = 0; i < ws; i++) { const a = base + j * (ws + 1) + i, b = a + 1, c = a + ws + 1, d = c + 1; this.idx.push(a, b, c, b, d, c); }
  }
  box(cx, cy, cz, sx, sy, sz, col, b0, round = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz, 1, 1, 1);
    const p = g.attributes.position, n = g.attributes.normal, base = this.v;
    for (let i = 0; i < p.count; i++) this.vert(p.getX(i) + cx, p.getY(i) + cy, p.getZ(i) + cz, n.getX(i), n.getY(i), n.getZ(i), col, b0, b0, 0);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) this.idx.push(base + ix[i]);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx); g.computeBoundingSphere(); return g;
  }
}

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255].map((c) => Math.pow(c, 2.2));
export const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xa86b3c, 0xd29b67, 0x7a4a26];
// look: {female, skin, top, top2, bottom, shoes, hair, hairStyle:'short'|'long'|'pony'|'bald'|'bun', sleeves:'short'|'long', jacket, beard, cap, saree, build}
export function buildBodyGeometry(look, detail = 1) {
  const f = !!look.female, R = restWorld(f), g = new GB();
  const seg = detail ? 12 : 6, skin = hex(look.skin ?? 0xc68642), top = hex(look.top ?? 0x2a6fdb), top2 = hex(look.top2 ?? look.top ?? 0x2a6fdb), bot = hex(look.bottom ?? 0x22324a);
  const shoe = hex(look.shoes ?? 0x222222), hair = hex(look.hair ?? 0x1a1410), belt = hex(0x2b1d12);
  const bw = look.build ?? 1;
  // torso
  const tr = [];
  const prof = f ? [[0.88, 0.165, 0.12], [0.98, 0.17, 0.125], [1.08, 0.125, 0.095], [1.2, 0.13, 0.1], [1.3, 0.15, 0.12], [1.4, 0.165, 0.11], [1.47, 0.16, 0.095], [1.53, 0.07, 0.065]]
    : [[0.88, 0.16, 0.115], [0.98, 0.165, 0.12], [1.08, 0.145, 0.105], [1.2, 0.155, 0.115], [1.3, 0.175, 0.125], [1.4, 0.19, 0.115], [1.47, 0.185, 0.1], [1.53, 0.075, 0.07]];
  for (const [y, a, b] of prof) {
    let b0, b1, w;
    if (y < 1.0) { b0 = B.hips; b1 = B.hips; w = 0; } else if (y < 1.2) { b0 = B.hips; b1 = B.spine; w = (y - 1.0) / 0.2; } else if (y < 1.35) { b0 = B.spine; b1 = B.chest; w = (y - 1.2) / 0.15; } else { b0 = B.chest; b1 = B.chest; w = 0; }
    const isPants = y < 1.02, isBelt = Math.abs(y - 1.02) < 0.03;
    const col = look.saree && y < 1.12 ? top2 : isPants ? bot : isBelt && !look.saree ? belt : (f && look.midriff && y > 1.06 && y < 1.2) ? skin : top;
    tr.push({ c: [0, y, y > 1.25 ? -0.005 : 0], ax: [0, 1, 0], a: a * bw, b: b * (0.85 + 0.15 * bw), col, b0, b1, w });
  }
  g.loft(tr, seg + 2, true, true);
  // neck + head
  g.loft([{ c: [0, 1.5, 0], ax: [0, 1, 0], a: 0.055, b: 0.055, col: skin, b0: B.neck }, { c: [0, 1.66, 0.005], ax: [0, 1, 0], a: 0.05, b: 0.052, col: skin, b0: B.head }], seg, false, false);
  g.ellipsoid(0, 1.715, 0.012, 0.092, 0.118, 0.104, skin, B.head, detail ? 16 : 8, detail ? 12 : 6);
  if (detail) {
    g.ellipsoid(0, 1.69, 0.112, 0.016, 0.03, 0.02, skin, B.head, 6, 4); // nose
    g.ellipsoid(0.094, 1.705, 0.005, 0.016, 0.03, 0.014, skin, B.head, 6, 4); g.ellipsoid(-0.094, 1.705, 0.005, 0.016, 0.03, 0.014, skin, B.head, 6, 4);
    for (const sx of [-1, 1]) {
      g.ellipsoid(sx * 0.036, 1.728, 0.093, 0.016, 0.009, 0.006, [0.95, 0.95, 0.95], B.head, 6, 4);
      g.ellipsoid(sx * 0.036, 1.728, 0.097, 0.007, 0.007, 0.004, [0.03, 0.02, 0.01], B.head, 6, 4);
      g.box(sx * 0.037, 1.752, 0.094, 0.036, 0.007, 0.01, hair, B.head);
    }
    g.box(0, 1.655, 0.1, 0.034, 0.008, 0.01, [skin[0] * 0.6, skin[1] * 0.35, skin[2] * 0.35], B.head);
    if (look.beard) g.ellipsoid(0, 1.645, 0.045, 0.085, 0.06, 0.072, hair, B.head, 10, 6, 0.55);
  }
  // hair
  const hs = look.hairStyle ?? (f ? 'long' : 'short');
  if (hs !== 'bald') {
    g.ellipsoid(0, 1.735, -0.002, 0.099, 0.112, 0.11, hair, B.head, detail ? 14 : 8, detail ? 8 : 5, 0.55);
    g.ellipsoid(0, 1.72, -0.03, 0.098, 0.1, 0.09, hair, B.head, detail ? 12 : 6, detail ? 8 : 4, 0.85);
    if (hs === 'long') g.loft([{ c: [0, 1.72, -0.07], ax: [0, -1, -0.15], a: 0.1, b: 0.05, col: hair, b0: B.head }, { c: [0, 1.5, -0.1], ax: [0, -1, 0], a: 0.11, b: 0.04, col: hair, b0: B.neck }, { c: [0, 1.36, -0.11], ax: [0, -1, 0], a: 0.09, b: 0.03, col: hair, b0: B.chest }], seg, false, true);
    if (hs === 'pony') g.loft([{ c: [0, 1.74, -0.1], ax: [0, -0.4, -1], a: 0.035, b: 0.035, col: hair, b0: B.head }, { c: [0, 1.62, -0.16], ax: [0, -1, -0.2], a: 0.04, b: 0.035, col: hair, b0: B.head }, { c: [0, 1.45, -0.15], ax: [0, -1, 0], a: 0.02, b: 0.02, col: hair, b0: B.head }], seg, true, true);
    if (hs === 'bun') g.ellipsoid(0, 1.74, -0.12, 0.05, 0.045, 0.045, hair, B.head, 8, 6);
  }
  if (look.cap) { g.ellipsoid(0, 1.765, 0, 0.104, 0.07, 0.112, hex(look.cap), B.head, 12, 6, 0.5); g.box(0, 1.77, 0.12, 0.17, 0.012, 0.09, hex(look.cap), B.head); }
  // arms
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1, sh = R['arm' + side], el = R['fore' + side], wr = R['hand' + side];
    const sleeveCol = look.sleeves === 'long' || look.jacket ? (look.jacket ? hex(look.jacket) : top) : null;
    const upCol = (yy) => sleeveCol || (yy > 1.32 ? top : skin);
    const rings = [];
    const pts = [[sh[0] - s * 0.015, sh[1] + 0.03, sh[2], 0.06], [sh[0], sh[1] - 0.04, 0, 0.056], [lerp(sh[0], el[0], 0.5), lerp(sh[1], el[1], 0.5), 0, 0.048], [el[0], el[1] + 0.02, 0, 0.042], [el[0], el[1] - 0.03, 0, 0.041], [lerp(el[0], wr[0], 0.55), lerp(el[1], wr[1], 0.55), 0.005, 0.036], [wr[0], wr[1] + 0.02, 0.008, 0.028]];
    pts.forEach(([x, y, z, r], i) => {
      let b0 = B['arm' + side], b1 = b0, w = 0;
      if (i === 0) { b0 = B['sh' + side]; b1 = B['arm' + side]; w = 0.6; }
      if (i === 3) { b1 = B['fore' + side]; w = 0.35; } if (i === 4) { b1 = B['fore' + side]; w = 0.75; }
      if (i >= 5) b0 = b1 = B['fore' + side];
      const col = i <= 2 ? upCol(y) : sleeveCol ? (i <= 5 ? sleeveCol : skin) : skin;
      rings.push({ c: [x, y, z], ax: [0, -1, 0], a: r * bw, b: r * 0.92 * bw, col, b0, b1, w });
    });
    g.loft(rings, seg, true, true);
    g.box(wr[0], wr[1] - 0.06, wr[2] + 0.005, 0.03, 0.11, 0.075, skin, B['hand' + side]);
    g.box(wr[0] - s * 0.012, wr[1] - 0.04, wr[2] + 0.045, 0.025, 0.06, 0.025, skin, B['hand' + side]);
  }
  // legs
  for (const side of ['L', 'R']) {
    const th = R['thigh' + side], kn = R['shin' + side], an = R['foot' + side], s = side === 'L' ? 1 : -1;
    const legCol = look.shorts ? (yy) => (yy > 0.6 ? bot : skin) : () => bot;
    const pts = [[th[0], th[1] + 0.03, 0, f ? 0.088 : 0.085], [th[0], th[1] - 0.12, 0.005, 0.078], [kn[0], kn[1] + 0.12, 0.01, 0.058], [kn[0], kn[1], 0.012, 0.052], [kn[0], kn[1] - 0.05, 0.008, 0.05], [kn[0], kn[1] - 0.18, -0.01, 0.05], [an[0], an[1] + 0.12, -0.005, 0.034], [an[0], an[1] + 0.03, 0, 0.034]];
    const rings = pts.map(([x, y, z, r], i) => {
      let b0 = B['thigh' + side], b1 = b0, w = 0;
      if (i === 0) { b0 = B.hips; b1 = B['thigh' + side]; w = 0.7; }
      if (i === 3) { b1 = B['shin' + side]; w = 0.5; } if (i >= 4) b0 = b1 = B['shin' + side];
      if (i === 7) { b1 = B['foot' + side]; w = 0.3; }
      const col = look.saree && i > 0 ? top2 : legCol(y);
      return { c: [x, y, z], ax: [0, -1, 0], a: r * bw * (look.saree ? 1.25 : 1), b: r * bw * 0.95, col, b0, b1, w };
    });
    g.loft(rings, seg, false, true);
    g.box(an[0], an[1] - 0.04, 0.045, 0.085, 0.08, 0.25, shoe, B['foot' + side]);
    g.box(an[0], an[1] - 0.075, 0.05, 0.09, 0.02, 0.26, [shoe[0] * 0.5 + 0.2, shoe[1] * 0.5 + 0.2, shoe[2] * 0.5 + 0.2], B['foot' + side]);
  }
  if (look.saree) {
    // flowing lower drape
    g.loft([{ c: [0, 1.05, 0], ax: [0, -1, 0], a: 0.19, b: 0.15, col: top2, b0: B.hips }, { c: [0, 0.55, 0], ax: [0, -1, 0], a: 0.25, b: 0.2, col: top2, b0: B.hips }, { c: [0, 0.06, 0.01], ax: [0, -1, 0], a: 0.27, b: 0.22, col: top2, b0: B.hips }], seg + 2, false, true);
    g.loft([{ c: [0.12, 1.47, 0.06], ax: [-0.3, -1, 0.1], a: 0.05, b: 0.02, col: top2, b0: B.chest }, { c: [-0.05, 1.12, 0.12], ax: [-0.6, -1, 0], a: 0.07, b: 0.02, col: top2, b0: B.spine }], 6, false, false);
  }
  if (look.jacket) {
    const jc = hex(look.jacket);
    g.loft([{ c: [0, 1.0, 0], ax: [0, 1, 0], a: 0.175 * bw, b: 0.13, col: jc, b0: B.hips, b1: B.spine, w: 0.1 }, { c: [0, 1.25, 0], ax: [0, 1, 0], a: 0.18 * bw, b: 0.135, col: jc, b0: B.spine, b1: B.chest, w: 0.5 }, { c: [0, 1.45, -0.005], ax: [0, 1, 0], a: 0.2 * bw, b: 0.123, col: jc, b0: B.chest }, { c: [0, 1.53, -0.01], ax: [0, 1, 0], a: 0.085, b: 0.08, col: jc, b0: B.chest }], seg + 2, false, false);
  }
  return g.geometry();
}

export function makeSkeleton(female) {
  const R = restWorld(female), bones = {};
  for (const n of BONES) { const b = new THREE.Bone(); b.name = n; bones[n] = b; }
  for (const n of BONES) {
    if (n === 'root') continue;
    const p = PARENT[n], wp = R[n], pp = R[p];
    bones[n].position.set(wp[0] - pp[0], wp[1] - pp[1], wp[2] - pp[2]);
    bones[p].add(bones[n]);
  }
  return { bones, list: BONES.map((n) => bones[n]) };
}

const matCache = new Map();
export function humanMaterial() {
  if (!matCache.has('h')) matCache.set('h', new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.02 }));
  return matCache.get('h');
}
export class Human {
  constructor(look, detail = 1) {
    this.look = look;
    this.root = new THREE.Group();
    const sk = makeSkeleton(look.female);
    this.bones = sk.bones;
    const geo = buildBodyGeometry(look, detail);
    this.mesh = new THREE.SkinnedMesh(geo, humanMaterial());
    this.mesh.add(sk.bones.root);
    this.mesh.bind(new THREE.Skeleton(sk.list));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.cur = {}; for (const n of BONES) this.cur[n] = [0, 0, 0];
    this.hipY = 0; this.rootRot = [0, 0, 0];
    this.held = null;
  }
  hold(obj) { if (this.held) this.bones.handR.remove(this.held); this.held = obj; if (obj) this.bones.handR.add(obj); }
  // apply target pose with smoothing (k = responsiveness)
  apply(P, dt, k = 14) {
    for (const n of BONES) {
      const t = P[n], c = this.cur[n];
      if (!t) { c[0] = damp(c[0], 0, k, dt); c[1] = damp(c[1], 0, k, dt); c[2] = damp(c[2], 0, k, dt); }
      else { c[0] = damp(c[0], t[0], k, dt); c[1] = damp(c[1], t[1], k, dt); c[2] = damp(c[2], t[2], k, dt); }
      this.bones[n].rotation.set(c[0], c[1], c[2]);
    }
    this.hipY = damp(this.hipY, P.hipY || 0, k, dt);
    this.bones.hips.position.y = 0.98 + this.hipY;
    if (P.hipZ !== undefined) this.bones.hips.position.z = damp(this.bones.hips.position.z, P.hipZ, k, dt); else this.bones.hips.position.z = damp(this.bones.hips.position.z, 0, k, dt);
  }
  snap(P) { for (const n of BONES) { const t = P[n] || [0, 0, 0]; this.cur[n] = [t[0], t[1], t[2]]; this.bones[n].rotation.set(t[0], t[1], t[2]); } this.hipY = P.hipY || 0; this.bones.hips.position.y = 0.98 + this.hipY; }
}

// ---------- procedural poses ----------
const S = Math.sin, C = Math.cos;
export const Pose = {
  idle(t, v = 0) {
    const b = S(t * 1.7) * 0.025;
    return { spine: [b * 0.5, 0, 0], chest: [b, 0, 0], neck: [0, S(t * 0.37 + v) * 0.25, 0], head: [-0.03, S(t * 0.23 + v * 2) * 0.15, 0],
      armL: [0.04, 0, 0.08 + b], foreL: [-0.18, 0, 0], armR: [0.04, 0, -0.08 - b], foreR: [-0.18, 0, 0], thighL: [0, 0, 0.02], thighR: [0, 0, -0.02], hipY: -0.005 + b * 0.1 };
  },
  locomotion(ph, sp) {
    // sp: 0 walk ... 1 run ... 1.6 sprint
    const run = clamp(sp, 0, 1.6), A = lerp(0.42, 0.95, Math.min(run, 1)) + Math.max(0, run - 1) * 0.35, K = lerp(0.55, 1.55, Math.min(run, 1));
    const s = S(ph), c = C(ph);
    const lean = lerp(0.04, 0.22, Math.min(run, 1)) + Math.max(0, run - 1) * 0.18;
    const armA = lerp(0.35, 0.95, Math.min(run, 1)), elb = lerp(-0.25, -1.45, Math.min(run, 1));
    return {
      hips: [0, s * 0.08, 0], spine: [lean * 0.5, -s * 0.06, 0], chest: [lean * 0.5, -s * 0.12, 0], neck: [-lean * 0.6, s * 0.08, 0], head: [-lean * 0.3, 0, 0],
      thighL: [-s * A + 0.05, 0, 0.02], shinL: [Math.max(0, c) * K + 0.08, 0, 0], footL: [Math.max(0, -s) * 0.4 - 0.1, 0, 0],
      thighR: [s * A + 0.05, 0, -0.02], shinR: [Math.max(0, -c) * K + 0.08, 0, 0], footR: [Math.max(0, s) * 0.4 - 0.1, 0, 0],
      armL: [s * armA, 0, 0.12], foreL: [elb, 0, 0], armR: [-s * armA, 0, -0.12], foreR: [elb, 0, 0],
      hipY: -Math.abs(c) * lerp(0.03, 0.07, Math.min(run, 1)) + (run > 0.5 ? 0.02 : 0),
    };
  },
  jump(up) {
    return up ? { spine: [0.1, 0, 0], thighL: [-0.9, 0, 0.05], shinL: [1.3, 0, 0], thighR: [-0.25, 0, -0.05], shinR: [0.6, 0, 0], armL: [-1.2, 0, 0.5], foreL: [-0.6, 0, 0], armR: [0.5, 0, -0.4], foreR: [-0.5, 0, 0] }
      : { spine: [0.05, 0, 0], thighL: [-0.4, 0, 0.1], shinL: [0.7, 0, 0], thighR: [-0.2, 0, -0.1], shinR: [0.5, 0, 0], armL: [-0.4, 0, 1.0], foreL: [-0.4, 0, 0], armR: [-0.4, 0, -1.0], foreR: [-0.4, 0, 0] };
  },
  flip(t) { return { hips: [-t * Math.PI * 2, 0, 0], spine: [0.5, 0, 0], thighL: [-1.6, 0, 0], shinL: [2.2, 0, 0], thighR: [-1.6, 0, 0], shinR: [2.2, 0, 0], armL: [-0.6, 0, 0.3], foreL: [-1.6, 0, 0], armR: [-0.6, 0, -0.3], foreR: [-1.6, 0, 0], hipY: 0.15 }; },
  roll(t) { return { hips: [-t * Math.PI * 2, 0, 0], spine: [0.9, 0, 0], chest: [0.4, 0, 0], neck: [0.6, 0, 0], thighL: [-2.0, 0, 0], shinL: [2.4, 0, 0], thighR: [-2.0, 0, 0], shinR: [2.4, 0, 0], armL: [-1.0, 0, 0.2], foreL: [-1.2, 0, 0], armR: [-1.0, 0, -0.2], foreR: [-1.2, 0, 0], hipY: -0.45 }; },
  land() { return { spine: [0.35, 0, 0], thighL: [-0.9, 0, 0.1], shinL: [1.5, 0, 0], footL: [-0.4, 0, 0], thighR: [-0.9, 0, -0.1], shinR: [1.5, 0, 0], footR: [-0.4, 0, 0], armL: [-0.3, 0, 0.5], armR: [-0.3, 0, -0.5], hipY: -0.32 }; },
  climb(ph) {
    const s = S(ph);
    return { spine: [-0.1, 0, 0], chest: [-0.05, 0, 0], neck: [-0.4, 0, 0], armL: [-2.6 - s * 0.35, 0, 0.25], foreL: [-0.3 - Math.max(0, s) * 0.8, 0, 0], armR: [-2.6 + s * 0.35, 0, -0.25], foreR: [-0.3 - Math.max(0, -s) * 0.8, 0, 0],
      thighL: [-0.7 - s * 0.45, 0, 0.15], shinL: [1.2 + s * 0.3, 0, 0], thighR: [-0.7 + s * 0.45, 0, -0.15], shinR: [1.2 - s * 0.3, 0, 0], hipZ: -0.18 };
  },
  mantle(t) { return { spine: [0.6 * (1 - t), 0, 0], armL: [-1.6 + t * 1.5, 0, 0.3], foreL: [-0.5, 0, 0], armR: [-1.6 + t * 1.5, 0, -0.3], foreR: [-0.5, 0, 0], thighL: [-1.4 * (1 - t), 0, 0], shinL: [1.6 * (1 - t), 0, 0], thighR: [-0.4, 0, 0], shinR: [0.8, 0, 0] }; },
  vault(t) { return { spine: [0.5, 0, 0.2], armL: [-0.6, 0, 0.3], foreL: [-0.3, 0, 0], armR: [-1.4, 0, -0.1], foreR: [0, 0, 0], thighL: [-1.4, 0, 0.6], shinL: [0.4, 0, 0], thighR: [-1.2, 0, 0.5], shinR: [0.3, 0, 0] }; },
  swim(ph, moving) {
    const s = S(ph), c = C(ph);
    return { hips: [moving ? 1.25 : 0.25, 0, 0], neck: [moving ? -0.9 : 0, 0, 0], head: [moving ? -0.3 : 0, 0, 0],
      armL: [moving ? -1.5 + s * 1.6 : -0.3 + s * 0.3, 0, 0.3 + (moving ? 0 : 0.5)], foreL: [-0.3, 0, 0], armR: [moving ? -1.5 - s * 1.6 : -0.3 - s * 0.3, 0, -0.3 - (moving ? 0 : 0.5)], foreR: [-0.3, 0, 0],
      thighL: [S(ph * 2) * 0.35, 0, 0.1], shinL: [0.3 + C(ph * 2) * 0.2, 0, 0], thighR: [-S(ph * 2) * 0.35, 0, -0.1], shinR: [0.3 - C(ph * 2) * 0.2, 0, 0], hipY: -0.1 };
  },
  sit(drive = true) {
    return { thighL: [-1.45, 0, 0.12], shinL: [1.35, 0, 0], footL: [-0.2, 0, 0], thighR: [-1.45, 0, -0.12], shinR: [1.35, 0, 0], footR: [-0.2, 0, 0],
      armL: drive ? [-0.95, 0, 0.2] : [-0.3, 0, 0.1], foreL: drive ? [-0.75, 0, 0] : [-1.2, 0, 0], armR: drive ? [-0.95, 0, -0.2] : [-0.3, 0, -0.1], foreR: drive ? [-0.75, 0, 0] : [-1.2, 0, 0], spine: [-0.08, 0, 0], hipY: -0.45, hipZ: -0.05 };
  },
  drive(low) {
    return { hips: [low ? -0.32 : -0.12, 0, 0], spine: [0.05, 0, 0], neck: [low ? 0.25 : 0.08, 0, 0], thighL: [-1.25, 0, 0.1], shinL: [low ? 0.45 : 1.1, 0, 0], footL: [-0.3, 0, 0], thighR: [-1.25, 0, -0.1], shinR: [low ? 0.45 : 1.1, 0, 0], footR: [-0.3, 0, 0],
      armL: [-1.05, 0, 0.18], foreL: [-0.55, 0, 0], armR: [-1.05, 0, -0.18], foreR: [-0.55, 0, 0], hipY: -0.86, hipZ: -0.05 };
  },
  passenger(low) { const d = Pose.drive(low); return { ...d, armL: [-0.2, 0, 0.1], foreL: [-1.3, 0, 0], armR: [-0.2, 0, -0.1], foreR: [-1.3, 0, 0], neck: [d.neck[0], 0.25, 0] }; },
  ride(ph) {
    const b = S(ph) * 0.06;
    return { thighL: [-1.25, 0, 0.75], shinL: [1.4, 0, -0.2], thighR: [-1.25, 0, -0.75], shinR: [1.4, 0, 0.2], spine: [0.15 + b, 0, 0], armL: [-0.8, 0, 0.15], foreL: [-0.9, 0, 0], armR: [-0.8, 0, -0.15], foreR: [-0.9, 0, 0], hipY: -0.3 + b * 0.5 };
  },
  skydive(t) { return { hips: [1.4, 0, 0], neck: [-1.0, 0, 0], armL: [-0.4, 0, 1.4 + S(t * 4) * 0.08], foreL: [-0.6, 0, 0], armR: [-0.4, 0, -1.4 - S(t * 4) * 0.08], foreR: [-0.6, 0, 0], thighL: [0.15, 0, 0.3], shinL: [0.8, 0, 0], thighR: [0.15, 0, -0.3], shinR: [0.8, 0, 0] }; },
  chute(t) { return { armL: [-2.6, 0, 0.35], foreL: [-0.6, 0, 0], armR: [-2.6, 0, -0.35], foreR: [-0.6, 0, 0], thighL: [-0.3 + S(t * 2) * 0.1, 0, 0.05], shinL: [0.3, 0, 0], thighR: [-0.2 - S(t * 2) * 0.1, 0, -0.05], shinR: [0.4, 0, 0] }; },
  web(t, swing) { return { armR: [-2.9, 0, -0.15], foreR: [-0.1, 0, 0], armL: [-0.6 + swing * 0.5, 0, 0.6], foreL: [-1.2, 0, 0], spine: [-0.2 + swing * 0.3, 0, 0], thighL: [-0.6 - swing * 0.6, 0, 0.1], shinL: [1.2, 0, 0], thighR: [-0.2 + swing * 0.4, 0, -0.1], shinR: [0.5, 0, 0], neck: [-0.3, 0, 0] }; },
  aim(pitch, rifle) {
    return rifle ? { chest: [0, 0.35, 0], neck: [0, -0.3, 0], armR: [-1.4 - pitch, 0.1, -0.15], foreR: [-0.7, 0, 0], handR: [0.2, 0, 0], armL: [-1.5 - pitch, -0.2, 0.45], foreL: [-0.55, 0, 0], spine: [-pitch * 0.4, 0, 0] }
      : { chest: [0, 0.15, 0], armR: [-1.55 - pitch, 0.1, -0.05], foreR: [-0.05, 0, 0], armL: [-1.4 - pitch, -0.3, 0.5], foreL: [-0.5, 0, 0], spine: [-pitch * 0.4, 0, 0] };
  },
  // melee: k in [0,1] progress, move id
  attack(id, k) {
    const e = Math.sin(Math.min(k, 1) * Math.PI); // extension curve
    const guardL = [-1.1, 0, 0.35], guardR = [-1.1, 0, -0.35], fg = [-1.9, 0, 0];
    const base = { armL: guardL, foreL: fg, armR: guardR, foreR: fg, thighL: [-0.25, 0, 0.12], shinL: [0.35, 0, 0], thighR: [0.15, 0, -0.12], shinR: [0.3, 0, 0], hipY: -0.06 };
    switch (id) {
      case 'jab': return { ...base, chest: [0, 0.35 * e, 0], armL: [-1.5, 0, 0.35 - 0.3 * e], foreL: [-1.9 + 1.8 * e, 0, 0] };
      case 'cross': return { ...base, hips: [0, -0.3 * e, 0], chest: [0.1, -0.6 * e, 0], armR: [-1.55, 0, -0.35 + 0.3 * e], foreR: [-1.9 + 1.85 * e, 0, 0], thighR: [0.4 * e, 0, -0.1] };
      case 'hook': return { ...base, chest: [0, 0.7 * e, 0], armL: [-1.45, 0.6 * e, 0.35 + 0.9 * e], foreL: [-1.6, 0, 0] };
      case 'upper': return { ...base, spine: [0.3 - 0.5 * e, 0, 0], armR: [-0.4 - 1.9 * e, 0, -0.3], foreR: [-1.9 + 0.4 * e, 0, 0], hipY: -0.12 + 0.12 * e };
      case 'kick': return { ...base, spine: [-0.35 * e, 0, 0], thighR: [-1.7 * e, 0, -0.05], shinR: [1.6 * (1 - e) + 0.05, 0, 0], footR: [0.4, 0, 0], armL: [-0.5, 0, 0.6], armR: [-0.4, 0, -0.6] };
      case 'round': return { ...base, hips: [0, 1.2 * e, 0.0], spine: [0, 0, -0.5 * e], thighR: [-1.2 * e, 0, -1.3 * e], shinR: [1.2 * (1 - e), 0, 0], armL: [-0.6, 0, 0.9], armR: [-0.2, 0, -0.9] };
      case 'flykick': return { ...base, spine: [-0.4 * e, 0, 0], thighR: [-1.6 * e, 0, 0], shinR: [0.2, 0, 0], thighL: [-1.2, 0, 0], shinL: [1.8, 0, 0], armL: [-0.8, 0, 1.1], armR: [-0.8, 0, -1.1], hipY: 0.1 };
      case 'block': return { ...base, armL: [-1.9, 0, 0.1], foreL: [-2.2, 0, 0], armR: [-1.9, 0, -0.1], foreR: [-2.2, 0, 0], chest: [0.15, 0, 0] };
      default: return base;
    }
  },
  hit(k) { return { spine: [-0.4 * S(k * Math.PI), 0, 0], neck: [-0.5 * S(k * Math.PI), 0, 0], armL: [0.3, 0, 0.6], armR: [0.3, 0, -0.6] }; },
  down(k) { const e = Math.min(1, k); return { hips: [-1.45 * e, 0, 0], spine: [0.15, 0, 0], neck: [0.2, 0.4, 0], armL: [0.2, 0, 1.3], foreL: [-0.4, 0, 0], armR: [-0.4, 0, -1.1], foreR: [-0.8, 0, 0], thighL: [-0.25, 0, 0.2], shinL: [0.6, 0, 0], thighR: [0.05, 0, -0.2], shinR: [0.2, 0, 0], hipY: -0.82 * e, hipZ: -0.5 * e }; },
  chai(t) { const s = S(t * 5); return { neck: [0.35, 0, 0], armR: [-0.9 + s * 0.06, 0, -0.15 + C(t * 5) * 0.08], foreR: [-1.1, 0, 0], armL: [-0.7, 0, 0.15], foreL: [-1.3, 0, 0], spine: [0.15, 0, 0] }; },
  sip(t) { return { neck: [-0.15, 0, 0], armR: [-0.6, 0, -0.2], foreR: [-2.3, 0, 0], handR: [0, 0, 0.5], armL: [0.05, 0, 0.1] }; },
  wave(t) { return { armR: [-0.2, 0, -2.6], foreR: [0, 0, -0.4 + S(t * 9) * 0.45], neck: [0, -0.2, 0] }; },
  dance(t) { const s = S(t * 7), c = C(t * 3.5); return { hips: [0, s * 0.3, 0], chest: [0, -s * 0.4, c * 0.1], armL: [-1.6 + c * 0.5, 0, 1.0 + s * 0.5], foreL: [-0.8, 0, 0], armR: [-1.6 - c * 0.5, 0, -1.0 + s * 0.5], foreR: [-0.8, 0, 0], thighL: [-0.3 - Math.max(0, s) * 0.5, 0, 0.1], shinL: [0.6 + Math.max(0, s) * 0.6, 0, 0], thighR: [-0.3 - Math.max(0, -s) * 0.5, 0, -0.1], shinR: [0.6 + Math.max(0, -s) * 0.6, 0, 0], hipY: -0.12 - Math.abs(s) * 0.05 }; },
};
export function blendPose(a, b, t) {
  const out = {};
  for (const n of BONES) { const x = a[n] || [0, 0, 0], y = b[n] || [0, 0, 0]; if (!a[n] && !b[n]) continue; out[n] = [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]; }
  out.hipY = lerp(a.hipY || 0, b.hipY || 0, t); if (a.hipZ !== undefined || b.hipZ !== undefined) out.hipZ = lerp(a.hipZ || 0, b.hipZ || 0, t);
  return out;
}
export function overlay(base, top, bones) { const o = { ...base }; for (const n of bones) if (top[n]) o[n] = top[n]; return o; }
export const UPPER = ['spine', 'chest', 'neck', 'head', 'shL', 'armL', 'foreL', 'handL', 'shR', 'armR', 'foreR', 'handR'];

// ---------- crowd geometry (rigid parts, attribute-animated on the GPU) ----------
// part ids: 0 torso/head (static), 1 armL, 2 armR, 3 legL, 4 legR ; aPivot = joint ; aMat: 0 skin,1 top,2 bottom,3 hair,4 shoes,5 skirt
export function crowdGeometry(detail) {
  const look = { skin: 0xffffff, top: 0x00ff00, bottom: 0x0000ff, hair: 0xff0000, shoes: 0x000000, hairStyle: 'short' };
  const geo = buildBodyGeometry(look, detail ? 1 : 0);
  const R = restWorld(false), si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, col = geo.attributes.color, n = si.count;
  const part = new Float32Array(n), piv = new Float32Array(n * 3), matId = new Float32Array(n);
  const map = { armL: 1, foreL: 1, handL: 1, armR: 2, foreR: 2, handR: 2, thighL: 3, shinL: 3, footL: 3, thighR: 4, shinR: 4, footR: 4 };
  for (let i = 0; i < n; i++) {
    const b = sw.getX(i) >= sw.getY(i) ? si.getX(i) : si.getY(i), name = BONES[b], p = map[name] || 0;
    part[i] = p;
    const pv = p === 1 ? R.armL : p === 2 ? R.armR : p === 3 ? R.thighL : p === 4 ? R.thighR : [0, 0, 0];
    piv[i * 3] = pv[0]; piv[i * 3 + 1] = pv[1]; piv[i * 3 + 2] = pv[2];
    const r = col.getX(i), g = col.getY(i), bb = col.getZ(i);
    matId[i] = r > 0.9 && g > 0.9 ? 0 : g > 0.9 ? 1 : bb > 0.9 ? 2 : r > 0.9 ? 3 : r < 0.3 && g < 0.3 && bb < 0.3 ? 4 : 0;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', geo.attributes.position); out.setAttribute('normal', geo.attributes.normal); out.setIndex(geo.index);
  out.setAttribute('aPart', new THREE.BufferAttribute(part, 1)); out.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3)); out.setAttribute('aMat', new THREE.BufferAttribute(matId, 1));
  return out;
}

// very low poly crowd body (6 boxes) for distant people
export function crowdGeometryLow() {
  const R = restWorld(false), parts = [];
  const add = (sx, sy, sz, x, y, z, part, mat, piv) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); const n = g.attributes.position.count; g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1)); const pv = new Float32Array(n * 3); for (let i = 0; i < n; i++) pv.set(piv, i * 3); g.setAttribute('aPivot', new THREE.BufferAttribute(pv, 3)); g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n).fill(mat), 1)); g.deleteAttribute('uv'); parts.push(g); };
  add(0.34, 0.55, 0.22, 0, 1.24, 0, 0, 1, [0, 0, 0]); add(0.3, 0.16, 0.2, 0, 0.92, 0, 0, 2, [0, 0, 0]);
  add(0.18, 0.24, 0.2, 0, 1.68, 0.01, 0, 0, [0, 0, 0]); add(0.19, 0.08, 0.21, 0, 1.79, -0.01, 0, 3, [0, 0, 0]);
  add(0.09, 0.56, 0.1, R.armL[0] + 0.01, 1.18, 0, 1, 1, R.armL); add(0.09, 0.56, 0.1, R.armR[0] - 0.01, 1.18, 0, 2, 1, R.armR);
  add(0.13, 0.86, 0.14, R.thighL[0], 0.47, 0, 3, 2, R.thighL); add(0.13, 0.86, 0.14, R.thighR[0], 0.47, 0, 4, 2, R.thighR);
  return mergeGeometries(parts);
}
// ---------- random looks ----------
const TOPS = [0xffffff, 0x1e88e5, 0xe53935, 0x43a047, 0xfdd835, 0x8e24aa, 0xff7043, 0x00acc1, 0x5d4037, 0x263238, 0xf06292, 0xffb300, 0x3949ab, 0xc0ca33, 0xeceff1, 0x6d4c41];
const BOTS = [0x1a237e, 0x263238, 0x3e2723, 0x212121, 0x546e7a, 0xd7ccc8, 0x37474f, 0x4e342e, 0xbdbdbd];
const SAREE = [0xd81b60, 0xff6f00, 0x8e24aa, 0x00897b, 0xc62828, 0xfbc02d, 0x3949ab, 0x2e7d32, 0xf06292];
export function randomLook(r, female) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const f = female ?? r() < 0.45;
  if (f) { const s = r() < 0.55; const c = pick(SAREE); return { female: true, skin: pick(SKINS), top: s ? c : pick(TOPS), top2: c, bottom: s ? c : pick(BOTS), shoes: 0x3e2723, hair: 0x120c08, hairStyle: r() < 0.5 ? 'bun' : 'long', saree: s }; }
  return { female: false, skin: pick(SKINS), top: pick(TOPS), bottom: pick(BOTS), shoes: pick([0x212121, 0x3e2723, 0xeeeeee]), hair: pick([0x120c08, 0x2b1d12, 0x5d5d5d]), hairStyle: r() < 0.1 ? 'bald' : 'short', beard: r() < 0.3, sleeves: r() < 0.4 ? 'long' : 'short', cap: r() < 0.08 ? pick([0xffffff, 0xd32f2f, 0x1565c0]) : null };
}
