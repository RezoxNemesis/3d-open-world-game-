// Procedural skinned humans: smooth lofted body, clothing via vertex colours, skeleton + procedural animation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, damp } from './util.js';
import { patch } from './shaders.js';

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
  constructor() { this.p = []; this.n = []; this.c = []; this.si = []; this.sw = []; this.idx = []; this.v = 0; this.m = []; this.mat = 0; }
  vert(x, y, z, nx, ny, nz, col, b0, b1, w, m) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); this.si.push(b0, b1, 0, 0); this.sw.push(1 - w, w, 0, 0); this.m.push(m ?? this.mat); return this.v++; }
  // shaped loft: rings {c, a, b, ax?, col, b0, b1, w, m, shape(t)->radius scale, seam}; open>0 leaves a gap of that many radians-fraction at the front (+z)
  loftS(rings, seg = 10, capA = true, capB = true, open = 0) {
    const base = this.v, wrap = open <= 0, ns = wrap ? seg : seg + 1;
    for (const r of rings) {
      const ax = new THREE.Vector3(...(r.ax || [0, 1, 0])).normalize();
      let u = Math.abs(ax.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const v = new THREE.Vector3().crossVectors(ax, u).normalize(); u = new THREE.Vector3().crossVectors(v, ax).normalize();
      if (Math.abs(ax.y) > 0.9 && v.z < 0) v.negate(); // keep angle pi/2 = front (+z) for vertical lofts
      for (let k = 0; k < ns; k++) {
        const t = wrap ? (k / seg) * Math.PI * 2 : Math.PI / 2 + open * Math.PI + (k / seg) * (Math.PI * 2 - open * Math.PI * 2), cs = Math.cos(t), sn = Math.sin(t);
        const kk = r.shape ? r.shape(t) : 1;
        const off = u.clone().multiplyScalar(cs * r.a * kk).addScaledVector(v, sn * (r.b ?? r.a) * kk);
        let col = typeof r.col === 'function' ? r.col(t) : r.col;
        if (r.seam && Math.abs(cs) > 0.93) col = [col[0] * 0.7, col[1] * 0.7, col[2] * 0.75];
        this.vert(r.c[0] + off.x, r.c[1] + off.y, r.c[2] + off.z, 0, 0, 0, col, r.b0, r.b1 ?? r.b0, r.w ?? 0, r.m);
      }
    }
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < (wrap ? seg : seg); k++) {
      const a = base + i * ns + k, b = base + i * ns + (wrap ? (k + 1) % seg : k + 1), c = a + ns, d = b + ns;
      this.idx.push(a, c, b, b, c, d);
      if (!wrap) this.idx.push(a, b, c, b, d, c); // open shells are seen from both sides
    }
    const cap = (ri, dir) => {
      const r = rings[ri];
      const cv = this.vert(r.c[0], r.c[1], r.c[2], 0, 0, 0, typeof r.col === 'function' ? r.col(0) : r.col, r.b0, r.b1 ?? r.b0, r.w ?? 0, r.m);
      for (let k = 0; k < seg; k++) { const a = base + ri * ns + k, b = base + ri * ns + ((k + 1) % seg); if (dir < 0) this.idx.push(cv, b, a); else this.idx.push(cv, a, b); }
    };
    if (wrap) { if (capA) cap(0, -1); if (capB) cap(rings.length - 1, 1); }
  }
  // ellipsoid tilted about x (rot) — used for hair shells with a higher front hairline
  ellipsoidR(cx, cy, cz, rx, ry, rz, col, b0, ws, hs, cut, rot) {
    const base = this.v, c = Math.cos(rot), s = Math.sin(rot);
    for (let j = 0; j <= hs; j++) {
      const ph = (j / hs) * Math.PI * cut;
      for (let i = 0; i <= ws; i++) {
        const th = (i / ws) * Math.PI * 2, x = Math.sin(ph) * Math.cos(th) * rx, y = Math.cos(ph) * ry, z = Math.sin(ph) * Math.sin(th) * rz;
        this.vert(cx + x, cy + y * c - z * s, cz + y * s + z * c, 0, 0, 0, col, b0, b0, 0);
      }
    }
    for (let j = 0; j < hs; j++) for (let i = 0; i < ws; i++) { const a = base + j * (ws + 1) + i, b = a + 1, cc = a + ws + 1, d = cc + 1; this.idx.push(a, b, cc, b, d, cc); }
  }
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
        this.vert(r.c[0] + off.x, r.c[1] + off.y, r.c[2] + off.z, nrm.x, nrm.y, nrm.z, typeof r.col === 'function' ? r.col(t) : r.col, r.b0, r.b1 ?? r.b0, r.w ?? 0, r.m);
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
    g.setAttribute('aHM', new THREE.Float32BufferAttribute(this.m, 1));
    g.setIndex(this.idx); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }
}

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255].map((c) => Math.pow(c, 2.2));
export const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xa86b3c, 0xd29b67, 0x7a4a26];
// material ids (per vertex, read by humanMaterial): cloth, skin, hair, leather, eye, rubber, metal, denim
export const HM = { cloth: 0, skin: 1, hair: 2, leather: 3, eye: 4, rubber: 5, metal: 6, denim: 7 };
const mulC = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
// look: {female, skin, top, top2, bottom, shoes, hair, hairStyle:'short'|'long'|'pony'|'bald'|'bun'|'spiky', sleeves:'short'|'long', jacket, beard, cap, saree, build, eyes, sole}
export function buildBodyGeometry(look, detail = 1) {
  const f = !!look.female, R = restWorld(f), g = new GB();
  const seg = detail >= 2 ? 18 : detail ? 12 : 8, skin = hex(look.skin ?? 0xc68642), top = hex(look.top ?? 0x2a6fdb), top2 = hex(look.top2 ?? look.top ?? 0x2a6fdb), bot = hex(look.bottom ?? 0x22324a);
  const shoe = hex(look.shoes ?? 0x222222), hair = hex(look.hair ?? 0x1a1410), belt = hex(0x2b1d12), lip = [skin[0] * 0.62, skin[1] * 0.36, skin[2] * 0.36];
  const botMat = look.saree ? HM.cloth : (look.denim ?? true) ? HM.denim : HM.cloth;
  const bw = look.build ?? 1, fx = f ? 0.93 : 1;
  // ---------- torso (shaped rings: chest/bust at the front, shoulder blades and seat at the back) ----------
  const prof = f
    ? [[0.86, 0.15, 0.115, 0.04, -0.03], [0.93, 0.168, 0.128, 0.0, 0.06], [1.0, 0.165, 0.12, 0, 0.03], [1.08, 0.125, 0.092, 0, 0], [1.16, 0.125, 0.094, 0, 0], [1.25, 0.14, 0.105, 0.1, 0], [1.32, 0.152, 0.118, 0.22, 0.02], [1.39, 0.158, 0.112, 0.12, 0.04], [1.45, 0.16, 0.098, 0, 0.03], [1.5, 0.12, 0.08, 0, 0], [1.535, 0.065, 0.06, 0, 0]]
    : [[0.86, 0.15, 0.11, 0.02, -0.02], [0.93, 0.162, 0.12, 0.0, 0.05], [1.0, 0.162, 0.118, 0, 0.02], [1.08, 0.146, 0.104, 0.02, 0], [1.16, 0.15, 0.108, 0.03, 0], [1.25, 0.165, 0.118, 0.06, 0.02], [1.33, 0.18, 0.126, 0.1, 0.05], [1.4, 0.19, 0.118, 0.08, 0.06], [1.46, 0.188, 0.102, 0.02, 0.04], [1.5, 0.14, 0.085, 0, 0], [1.535, 0.072, 0.066, 0, 0]];
  const tr = [];
  for (const [y, a, b, front, back] of prof) {
    let b0, b1, w;
    if (y < 1.0) { b0 = B.hips; b1 = B.hips; w = 0; } else if (y < 1.2) { b0 = B.hips; b1 = B.spine; w = (y - 1.0) / 0.2; } else if (y < 1.35) { b0 = B.spine; b1 = B.chest; w = (y - 1.2) / 0.15; } else { b0 = B.chest; b1 = B.chest; w = 0; }
    const isPants = y < 1.02, isBelt = Math.abs(y - 1.02) < 0.035 && !look.saree;
    const col = look.saree && y < 1.12 ? top2 : isPants ? bot : isBelt ? belt : (f && look.midriff && y > 1.06 && y < 1.2) ? skin : top;
    const m = isPants ? botMat : isBelt ? HM.leather : HM.cloth;
    tr.push({ c: [0, y, y > 1.25 ? -0.005 : 0], a: a * bw * fx, b: b * (0.85 + 0.15 * bw), col, b0, b1, w, m,
      shape: (t) => { const sn = Math.sin(t), cs = Math.cos(t); return 1 + front * Math.max(0, sn) * Math.pow(Math.abs(cs) < 0.75 ? 1 - Math.abs(cs) / 0.75 : 0, 0.7) * (f && y > 1.24 && y < 1.42 ? 1.0 : 0.6) + back * Math.max(0, -sn); } });
  }
  g.loftS(tr, seg + 2, true, true);
  if (!look.saree && detail >= 1) {
    // belt buckle
    g.mat = HM.metal; g.box(0, 1.02, 0.125 * (0.85 + 0.15 * bw), 0.045, 0.032, 0.012, [0.6, 0.55, 0.42], B.hips);
  }
  // ---------- neck + head ----------
  g.mat = HM.skin;
  g.loftS([{ c: [0, 1.5, -0.005], a: 0.058 * fx, b: 0.058, col: skin, b0: B.neck }, { c: [0, 1.6, 0.0], a: 0.05 * fx, b: 0.052, col: skin, b0: B.neck, b1: B.head, w: 0.5 }, { c: [0, 1.64, 0.0], a: 0.05 * fx, b: 0.05, col: skin, b0: B.head }], seg, false, false);
  // head: lofted skull with jaw, cheekbones and a flatter face plane
  const hk = f ? 0.94 : 1, jaw = f ? 0.86 : 1;
  const HR = [[1.597, 0.022, 0.02, 0.083], [1.612, 0.045 * jaw, 0.04, 0.066], [1.635, 0.07 * jaw, 0.068, 0.038], [1.665, 0.083, 0.088, 0.02], [1.698, 0.09, 0.096, 0.012], [1.73, 0.093, 0.101, 0.006], [1.76, 0.093, 0.103, 0.003], [1.79, 0.088, 0.1, -0.002], [1.814, 0.072, 0.087, -0.006], [1.832, 0.04, 0.054, -0.008]];
  const eyeY = 1.728;
  g.loftS(HR.map(([y, a, b, cz]) => ({ c: [0, y, cz], a: a * hk, b: b * hk, col: skin, b0: B.head,
    shape: (t) => { const sn = Math.sin(t), cs = Math.cos(t); let k = 1; if (sn > 0.55) k *= 0.965; if (sn > 0.2 && Math.abs(cs) > 0.45 && y > 1.68 && y < 1.72) k *= 1.03; if (sn < -0.2 && y > 1.7 && y < 1.8) k *= 1.04; return k; } })), detail >= 2 ? 22 : detail ? 14 : 8, true, true);
  if (detail >= 1) {
    const fz = (y) => { let best = HR[0]; for (const r of HR) if (Math.abs(r[0] - y) < Math.abs(best[0] - y)) best = r; return best[3] + best[2] * hk * 0.965; };
    const eSeg = detail >= 2 ? 8 : 5, eRing = detail >= 2 ? 6 : 4;
    const iris = hex(look.eyes ?? 0x3b2314);
    for (const sx of [-1, 1]) {
      const ex = sx * 0.034 * hk, ez = fz(eyeY) - 0.011;
      g.mat = HM.eye; g.ellipsoid(ex, eyeY, ez, 0.0135, 0.0095, 0.009, [0.93, 0.92, 0.9], B.head, eSeg, eRing);
      g.ellipsoid(ex, eyeY - 0.0005, ez + 0.0072, 0.0068, 0.0068, 0.0035, iris, B.head, eSeg, eRing);
      g.ellipsoid(ex, eyeY - 0.0005, ez + 0.0094, 0.003, 0.003, 0.0015, [0.01, 0.01, 0.01], B.head, 5, 3);
      // upper lid + crease shadow, lower lid
      g.mat = HM.skin; g.ellipsoid(ex, eyeY + 0.007, ez + 0.002, 0.016, 0.006, 0.0105, mulC(skin, 0.82), B.head, eSeg, eRing, 0.5);
      g.ellipsoid(ex, eyeY - 0.0085, ez + 0.001, 0.0145, 0.0035, 0.009, mulC(skin, 0.92), B.head, eSeg, eRing);
      // eyebrows
      g.mat = HM.hair; g.ellipsoid(sx * 0.036 * hk, eyeY + 0.022, fz(eyeY + 0.022) + 0.001, 0.021, f ? 0.004 : 0.0055, 0.006, hair, B.head, 6, 3);
      // ears
      g.mat = HM.skin; g.ellipsoid(sx * 0.094 * hk, 1.712, -0.004, 0.011, 0.03, 0.019, mulC(skin, 0.95), B.head, eSeg, eRing);
    }
    // nose: bridge, tip, nostril wings
    g.mat = HM.skin;
    g.ellipsoid(0, 1.708, fz(1.708) - 0.004, 0.0085, 0.022, 0.012, skin, B.head, eSeg, eRing);
    g.ellipsoid(0, 1.689, fz(1.689) + 0.006, 0.0125 * (f ? 0.9 : 1), 0.011, 0.012, skin, B.head, eSeg, eRing);
    for (const sx of [-1, 1]) g.ellipsoid(sx * 0.011, 1.684, fz(1.684) + 0.001, 0.008, 0.007, 0.008, mulC(skin, 0.93), B.head, 5, 3);
    // lips
    const lz = fz(1.664);
    g.ellipsoid(0, 1.667, lz - 0.001, 0.021 * (f ? 1.02 : 1), 0.0055, 0.0075, f ? hex(0xb2564f) : lip, B.head, eSeg, eRing);
    g.ellipsoid(0, 1.659, lz - 0.002, 0.019, 0.0065, 0.0075, f ? hex(0xa04a45) : mulC(lip, 1.08), B.head, eSeg, eRing);
    if (look.beard) {
      g.mat = HM.hair;
      // short boxed beard along the jaw + moustache
      g.loftS([[1.598, 0.026, 0.024, 0.081], [1.612, 0.048, 0.044, 0.066], [1.635, 0.072, 0.07, 0.039], [1.652, 0.08, 0.082, 0.026]].map(([y, a, b, cz], i) => ({ c: [0, y, cz], a: a * 1.035, b: b * 1.035, col: mulC(hair, 1.25), b0: B.head,
        shape: (t) => { const sn = Math.sin(t); return sn < -0.2 ? 0.92 : 1; } })), detail >= 2 ? 22 : 14, true, false);
      g.ellipsoid(0, 1.674, lz + 0.001, 0.026, 0.005, 0.007, mulC(hair, 1.1), B.head, 6, 3);
    }
  }
  // ---------- hair ----------
  const hs = look.hairStyle ?? (f ? 'long' : 'short');
  g.mat = HM.hair;
  if (hs !== 'bald') {
    const hz = (hs === 'spiky' || hs === 'short') ? 1.075 : 1.09;
    // hair shell sits just outside the skull everywhere (skull top ~1.848)
    g.ellipsoidR(0, 1.732, -0.006, 0.104 * hk * hz / 1.03, 0.122 * hk, 0.118 * hk * hz / 1.03, hair, B.head, detail >= 2 ? 18 : 10, detail >= 2 ? 10 : 6, 0.6, -0.3);
    g.ellipsoidR(0, 1.72, -0.035, 0.1 * hk, 0.108 * hk, 0.094 * hk, hair, B.head, detail >= 2 ? 14 : 8, detail >= 2 ? 8 : 5, 0.8, 0);
    if (detail >= 1 && (hs === 'spiky' || hs === 'short')) {
      // textured crop: a few tufts on top and a short fringe
      // tufts sit on the skull surface (radius ~0.1 around the head centre) so the crop reads as textured, not a topknot
      const tufts = hs === 'spiky' ? [[0, 0.5], [0.5, 0.45], [-0.5, 0.45], [0.25, 0.75], [-0.25, 0.75], [0, 0.95], [0.6, 0.15], [-0.6, 0.15]] : [[0, 0.55], [0.45, 0.4], [-0.45, 0.4], [0, 0.85]];
      for (const [ax, az] of tufts) {
        const nx = ax, nz = az, ny = Math.sqrt(Math.max(0.05, 1 - nx * nx * 0.6 - nz * nz * 0.5)), L = Math.hypot(nx, ny, nz);
        const px = (nx / L) * 0.108 * hk, py = 1.735 + (ny / L) * 0.112 * hk, pz = -0.004 + (nz / L) * 0.108 * hk;
        g.ellipsoid(px, py, pz, 0.034, 0.016, 0.03, mulC(hair, 1.15), B.head, 7, 4);
      }
    }
    if (hs === 'long') g.loftS([{ c: [0, 1.72, -0.07], a: 0.1, b: 0.05, col: hair, b0: B.head }, { c: [0, 1.5, -0.1], a: 0.11, b: 0.04, col: hair, b0: B.neck }, { c: [0, 1.36, -0.11], a: 0.09, b: 0.03, col: hair, b0: B.chest }], seg, false, true);
    if (hs === 'pony') {
      g.loftS([{ c: [0, 1.76, -0.1], a: 0.032, b: 0.032, col: hair, b0: B.head }, { c: [0, 1.7, -0.145], a: 0.042, b: 0.038, col: hair, b0: B.head }, { c: [0, 1.6, -0.155], a: 0.04, b: 0.034, col: hair, b0: B.head }, { c: [0, 1.48, -0.14], a: 0.026, b: 0.022, col: hair, b0: B.head }, { c: [0, 1.4, -0.13], a: 0.008, b: 0.008, col: hair, b0: B.head }], seg, true, true);
      if (detail >= 1) { g.ellipsoid(0.05 * hk, 1.775, 0.075, 0.035, 0.022, 0.03, hair, B.head, 8, 5); g.ellipsoid(-0.03 * hk, 1.785, 0.08, 0.04, 0.02, 0.028, hair, B.head, 8, 5); }
    }
    if (hs === 'bun') g.ellipsoid(0, 1.74, -0.12, 0.05, 0.045, 0.045, hair, B.head, 8, 6);
  }
  if (look.police && detail >= 1) {
    // Indian police uniform details: epaulettes, chest pockets, name plate, whistle cord, Sam Browne style belt
    g.mat = HM.cloth; const kh = mulC(top, 0.85);
    for (const sx of [-1, 1]) { g.box(sx * 0.15, 1.495, -0.005, 0.07, 0.012, 0.09, kh, B.chest); g.box(sx * 0.075, 1.36, 0.122, 0.055, 0.06, 0.012, kh, B.chest); }
    g.mat = HM.metal; g.box(0.075, 1.405, 0.13, 0.05, 0.012, 0.006, [0.75, 0.65, 0.3], B.chest);
    g.mat = HM.cloth; g.box(-0.075, 1.405, 0.13, 0.05, 0.012, 0.006, [0.1, 0.15, 0.4], B.chest);
    g.box(-0.11, 1.33, 0.128, 0.008, 0.16, 0.006, [0.7, 0.1, 0.1], B.chest);
    g.mat = HM.leather; g.box(0, 1.02, 0.0, 0.34 * (look.build ?? 1), 0.04, 0.26, hex(0x3a2412), B.hips);
  }
  if (look.cap && look.police) { g.mat = HM.cloth; g.ellipsoidR(0, 1.79, -0.005, 0.11, 0.05, 0.115, hex(look.cap), B.head, 14, 6, 0.55, -0.12); g.ellipsoid(0.055, 1.83, 0.05, 0.05, 0.02, 0.05, hex(look.cap), B.head, 10, 4); g.mat = HM.metal; g.box(-0.045, 1.79, 0.108, 0.022, 0.026, 0.006, [0.8, 0.68, 0.3], B.head); }
  else if (look.cap) { g.mat = HM.cloth; g.ellipsoid(0, 1.765, 0, 0.104, 0.07, 0.112, hex(look.cap), B.head, 12, 6, 0.5); g.box(0, 1.77, 0.12, 0.17, 0.012, 0.09, hex(look.cap), B.head); }
  // ---------- arms (deltoid, biceps, forearm) + hands ----------
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1, sh = R['arm' + side], el = R['fore' + side], wr = R['hand' + side];
    const sleeveCol = look.sleeves === 'long' || look.jacket ? (look.jacket ? hex(look.jacket) : top) : null, sleeveM = look.jacket ? (look.jacketMat ?? HM.leather) : HM.cloth;
    const pts = [[sh[0] - s * 0.02, sh[1] + 0.035, sh[2], 0.065], [sh[0] + s * 0.004, sh[1] - 0.03, 0, 0.062], [lerp(sh[0], el[0], 0.35), lerp(sh[1], el[1], 0.35), 0.003, 0.054], [lerp(sh[0], el[0], 0.7), lerp(sh[1], el[1], 0.7), 0, 0.047], [el[0], el[1] + 0.015, 0, 0.042], [el[0], el[1] - 0.03, 0.002, 0.044], [lerp(el[0], wr[0], 0.4), lerp(el[1], wr[1], 0.4), 0.004, 0.04], [lerp(el[0], wr[0], 0.8), lerp(el[1], wr[1], 0.8), 0.006, 0.031], [wr[0], wr[1] + 0.012, 0.008, 0.027]];
    const rings = pts.map(([x, y, z, r], i) => {
      let b0 = B['arm' + side], b1 = b0, w = 0;
      if (i === 0) { b0 = B['sh' + side]; b1 = B['arm' + side]; w = 0.6; }
      if (i === 4) { b1 = B['fore' + side]; w = 0.35; } if (i === 5) { b1 = B['fore' + side]; w = 0.75; }
      if (i >= 6) b0 = b1 = B['fore' + side];
      const shortSleeve = !sleeveCol && i <= 1;
      const col = sleeveCol ? (i <= 7 ? sleeveCol : skin) : shortSleeve ? top : skin;
      const m = sleeveCol ? (i <= 7 ? sleeveM : HM.skin) : shortSleeve ? HM.cloth : HM.skin;
      const fem = f ? 0.88 : 1;
      return { c: [x, y, z], a: r * bw * fem * (shortSleeve ? 1.12 : 1), b: r * 0.9 * bw * fem, col, b0, b1, w, m, ax: [0, -1, 0] };
    });
    g.loftS(rings, seg, true, true);
    g.mat = HM.skin;
    const hb = B['hand' + side], hy = wr[1] - 0.012, hz0 = wr[2] + 0.004;
    if (detail >= 2) {
      // palm + four fingers (two segments, slightly curled) + thumb
      g.loftS([{ c: [wr[0], hy + 0.004, hz0], a: 0.016, b: 0.034, col: skin, b0: hb, ax: [0, -1, 0] }, { c: [wr[0], hy - 0.045, hz0 + 0.004], a: 0.014, b: 0.04, col: skin, b0: hb, ax: [0, -1, 0] }, { c: [wr[0], hy - 0.078, hz0 + 0.006], a: 0.011, b: 0.037, col: skin, b0: hb, ax: [0, -1, 0] }], 8, true, true);
      for (let k = 0; k < 4; k++) {
        const fzz = hz0 + 0.026 - k * 0.017, L = [0.042, 0.048, 0.045, 0.036][k], bx = wr[0] + s * 0.001;
        g.loftS([{ c: [bx, hy - 0.08, fzz], a: 0.0078, b: 0.0082, col: skin, b0: hb, ax: [0, -1, 0] }, { c: [bx, hy - 0.08 - L * 0.55, fzz + 0.006], a: 0.007, b: 0.0074, col: skin, b0: hb, ax: [0, -1, 0.2] }, { c: [bx, hy - 0.08 - L, fzz + 0.016], a: 0.0058, b: 0.006, col: skin, b0: hb, ax: [0, -1, 0.4] }], 6, false, true);
      }
      g.loftS([{ c: [wr[0] - s * 0.008, hy - 0.025, hz0 + 0.03], a: 0.009, b: 0.009, col: skin, b0: hb, ax: [-s * 0.4, -1, 0.5] }, { c: [wr[0] - s * 0.016, hy - 0.05, hz0 + 0.048], a: 0.0078, b: 0.0078, col: skin, b0: hb, ax: [-s * 0.3, -1, 0.6] }, { c: [wr[0] - s * 0.02, hy - 0.072, hz0 + 0.058], a: 0.0062, b: 0.0062, col: skin, b0: hb, ax: [0, -1, 0.4] }], 6, false, true);
    } else {
      g.box(wr[0], wr[1] - 0.06, wr[2] + 0.005, 0.03, 0.11, 0.075, skin, hb);
      g.box(wr[0] - s * 0.012, wr[1] - 0.04, wr[2] + 0.045, 0.025, 0.06, 0.025, skin, hb);
    }
  }
  // ---------- legs (thigh, knee, calf) + shoes ----------
  for (const side of ['L', 'R']) {
    const th = R['thigh' + side], kn = R['shin' + side], an = R['foot' + side], s = side === 'L' ? 1 : -1;
    const legCol = look.shorts ? (yy) => (yy > 0.6 ? bot : skin) : () => bot;
    const pts = [[th[0], th[1] + 0.03, 0, f ? 0.092 : 0.088], [th[0], th[1] - 0.1, 0.006, 0.083], [th[0] - s * 0.003, th[1] - 0.26, 0.008, 0.07], [kn[0], kn[1] + 0.1, 0.012, 0.058], [kn[0], kn[1], 0.014, 0.054], [kn[0], kn[1] - 0.06, 0.004, 0.054], [kn[0], kn[1] - 0.14, -0.012, 0.056], [kn[0], kn[1] - 0.26, -0.006, 0.044], [an[0], an[1] + 0.1, -0.004, 0.035], [an[0], an[1] + 0.03, 0, 0.034]];
    const rings = pts.map(([x, y, z, r], i) => {
      let b0 = B['thigh' + side], b1 = b0, w = 0;
      if (i === 0) { b0 = B.hips; b1 = B['thigh' + side]; w = 0.7; }
      if (i === 4) { b1 = B['shin' + side]; w = 0.5; } if (i >= 5) b0 = b1 = B['shin' + side];
      if (i === 9) { b1 = B['foot' + side]; w = 0.3; }
      const col = look.saree && i > 0 ? top2 : legCol(y);
      const jean = (look.saree ? 1 : 1);
      return { c: [x, y, z], a: r * bw * (look.saree ? 1.25 : 1) * (f ? 0.95 : 1) * jean, b: r * bw * 0.95 * (f ? 0.95 : 1), col, b0, b1, w, m: look.shorts && y < 0.6 ? HM.skin : botMat, ax: [0, -1, 0],
        // outer side seam: slightly darker stripe on jeans
        seam: botMat === HM.denim };
    });
    g.loftS(rings, seg, false, true);
    // shoe: lofted from heel to toe, rubber sole with a lighter midsole
    const fb = B['foot' + side], sy = an[1] - 0.085, sc = detail >= 1 ? 1 : 0;
    g.mat = HM.leather;
    if (detail >= 1) {
      g.loftS([[-0.045, 0.04, 0.05, 0.05], [-0.01, 0.046, 0.055, 0.055], [0.05, 0.05, 0.046, 0.04], [0.12, 0.05, 0.034, 0.03], [0.175, 0.043, 0.024, 0.022], [0.2, 0.03, 0.016, 0.017]].map(([z, a, b, cy]) => ({ c: [an[0], sy + 0.012 + cy, z], a, b, col: shoe, b0: fb, ax: [0, 0, 1] })), seg, true, true);
      g.mat = HM.rubber; const sole = hex(look.sole ?? 0xeeeeee);
      g.loftS([[-0.05, 0.043, 0.012], [0.05, 0.047, 0.012], [0.15, 0.045, 0.011], [0.205, 0.033, 0.01]].map(([z, a, b]) => ({ c: [an[0], sy + 0.008, z], a, b, col: sole, b0: fb, ax: [0, 0, 1] })), seg, true, true);
      if (detail >= 2) { g.mat = HM.cloth; for (let k = 0; k < 4; k++) g.box(an[0], sy + 0.012 + 0.05 - k * 0.002 + 0.0, 0.03 + k * 0.022, 0.03, 0.004, 0.006, [0.9, 0.9, 0.88], fb); }
    } else {
      g.box(an[0], an[1] - 0.04, 0.045, 0.085, 0.08, 0.25, shoe, fb);
      g.box(an[0], an[1] - 0.075, 0.05, 0.09, 0.02, 0.26, [shoe[0] * 0.5 + 0.2, shoe[1] * 0.5 + 0.2, shoe[2] * 0.5 + 0.2], fb);
    }
  }
  if (look.saree) {
    g.mat = HM.cloth;
    g.loftS([{ c: [0, 1.05, 0], a: 0.19, b: 0.15, col: top2, b0: B.hips }, { c: [0, 0.55, 0], a: 0.25, b: 0.2, col: top2, b0: B.hips }, { c: [0, 0.06, 0.01], a: 0.27, b: 0.22, col: top2, b0: B.hips }], seg + 2, false, true);
    g.loftS([{ c: [0.12, 1.47, 0.06], a: 0.05, b: 0.02, col: top2, b0: B.chest, ax: [-0.3, -1, 0.1] }, { c: [-0.05, 1.12, 0.12], a: 0.07, b: 0.02, col: top2, b0: B.spine, ax: [-0.6, -1, 0] }], 6, false, false);
  }
  if (look.jacket) {
    // open jacket: a shell around the torso with a gap at the front (the tee shows through) + collar
    const jc = hex(look.jacket), jm = look.jacketMat ?? HM.leather;
    g.mat = jm;
    const open = detail >= 1 ? 0.33 : 0;
    g.loftS([[0.97, 0.172, 0.127, 0.02], [1.1, 0.162, 0.116, 0.04], [1.25, 0.178, 0.128, 0.07], [1.36, 0.198, 0.132, 0.1], [1.45, 0.201, 0.118, 0.04], [1.51, 0.15, 0.094, 0]].map(([y, a, b, front], i) => ({ c: [0, y, y > 1.25 ? -0.005 : 0], a: a * bw, b: b * (0.85 + 0.15 * bw), col: jc, b0: y < 1.2 ? B.spine : B.chest, b1: y < 1.2 ? B.chest : B.chest, w: y < 1.2 ? 0.3 : 0, m: jm,
      shape: (t) => 1 + front * Math.max(0, Math.sin(t)) * 0.5 })), seg + 4, false, false, open);
    if (detail >= 1) g.loftS([{ c: [0, 1.5, -0.01], a: 0.092, b: 0.08, col: mulC(jc, 0.9), b0: B.chest, m: jm }, { c: [0, 1.56, -0.02], a: 0.085, b: 0.075, col: mulC(jc, 0.9), b0: B.neck, m: jm }], seg + 4, false, false, 0.22);
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
  if (!matCache.has('h')) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.0 });
    patch(m, (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aHM; varying float vHM; varying vec3 vLP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHM = aHM; vLP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHM; varying vec3 vLP; float hm(float k){ return step(k-0.5, vHM)*step(vHM, k+0.5); }')
        .replace('#include <color_fragment>', `#include <color_fragment>
          // denim twill + subtle cloth weave break up flat colours
          float tw = fract((vLP.x + vLP.y*0.7)*260.0); diffuseColor.rgb *= mix(1.0, 0.86 + 0.14*step(0.5, tw), hm(7.) + hm(0.)*0.4);
          diffuseColor.rgb *= 1.0 + hm(1.)*0.03*sin(vLP.y*900.0);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = hm(0.)*0.85 + hm(1.)*0.55 + hm(2.)*0.7 + hm(3.)*0.48 + hm(4.)*0.06 + hm(5.)*0.92 + hm(6.)*0.3 + hm(7.)*0.9;`)
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = hm(6.);')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // cheap subsurface: skin picks up a little warm light even on the shadow side
          totalEmissiveRadiance += diffuseColor.rgb*vec3(0.11,0.045,0.03)*hm(1.);`);
    }, 'human2');
    matCache.set('h', m);
  }
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
