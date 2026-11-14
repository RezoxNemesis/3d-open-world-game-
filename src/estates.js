// Jampore Villa Colony: walled estates with grand mansions (modern glass villas and Portuguese-colonial
// mansions), the Sagar Mahal palace, pools, lawns, driveways, tennis courts, fountains and gate lamps.
// Geometry is merged per material per map tile and hidden by distance (same LOD registry as the rest of the world).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from './mapdata.js';
import { U, patch } from './shaders.js';
import { mulberry32 } from './util.js';

let COL = () => {};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function prep(g, color) {
  if (g.index) g = g.toNonIndexed();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  const c = new THREE.Color(color), a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
function xf(g, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) { _e.set(rx, ry, rz); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); return g.applyMatrix4(_m); }
// box with world-size UVs (textures keep their scale on any box)
function boxUV(w, h, d, tile = 3) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  return g;
}
// hip roof: ridge along the longer side, four sloped faces, planar tile UVs along the slope
function hipRoof(W, D, h, ov) {
  const a = W / 2 + ov, b = D / 2 + ov, along = W >= D, r = Math.abs(a - b);
  const R1 = along ? [-r, h, 0] : [0, h, -r], R2 = along ? [r, h, 0] : [0, h, r];
  const c = [[-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b]];
  const P = [], UV = [];
  const tri = (p, q, s) => { for (const v of [p, q, s]) { P.push(...v); UV.push((v[0] + v[2]) / 2.2, Math.hypot(v[1], Math.min(Math.abs(Math.abs(v[0]) - a), Math.abs(Math.abs(v[2]) - b))) / 2.2); } };
  if (along) { tri(c[0], R1, c[1]); tri(c[1], R1, R2); tri(c[3], c[2], R2); tri(c[3], R2, R1); tri(c[0], c[3], R1); tri(c[1], R2, c[2]); }
  else { tri(c[0], R1, c[1]); tri(c[3], c[2], R2); tri(c[0], c[3], R1); tri(c[3], R2, R1); tri(c[1], R1, R2); tri(c[1], R2, c[2]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.computeVertexNormals();
  // make every face point outward/upward
  const pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i += 3) if (nor.getY(i) < 0) { for (const k of ['x', 'y', 'z']) { const t = pos['get' + k.toUpperCase()](i + 1); pos['set' + k.toUpperCase()](i + 1, pos['get' + k.toUpperCase()](i + 2)); pos['set' + k.toUpperCase()](i + 2, t); } }
  g.computeVertexNormals(); return g;
}

class Bag {
  constructor() { this.g = {}; }
  add(k, g, c) { (this.g[k] ||= []).push(prep(g, c)); }
  box(k, w, h, d, x, y, z, c, ry = 0, tile = 3) { this.add(k, xf(boxUV(w, h, d, tile), x, y + h / 2, z, ry), c); }
  cyl(k, r0, r1, h, x, y, z, c, seg = 16) { this.add(k, xf(new THREE.CylinderGeometry(r0, r1, h, seg), x, y + h / 2, z), c); }
  build(mats, parent) {
    for (const k in this.g) { const geo = mergeGeometries(this.g[k]); if (!geo) continue; const m = new THREE.Mesh(geo, mats[k]); m.castShadow = k !== 'glass' && k !== 'glow' && k !== 'water' && k !== 'rail' && k !== 'lawn' && k !== 'paver'; m.receiveShadow = true; parent.add(m); }
    this.g = {};
  }
}

function makeMats(base, TX) {
  const lawn = new THREE.MeshStandardMaterial({ map: TX.grass.d, normalMap: TX.grass.n, vertexColors: true, roughness: 0.95 });
  const paver = new THREE.MeshStandardMaterial({ map: TX.pavers.d, normalMap: TX.pavers.n, vertexColors: true, roughness: 0.8 });
  const wall = new THREE.MeshStandardMaterial({ map: TX.plaster.d, normalMap: TX.plaster.n, normalScale: new THREE.Vector2(0.4, 0.4), vertexColors: true, roughness: 0.82 });
  const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  // window glass: sky reflections by day, warm lived-in rooms at night
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.85, emissive: 0xffc27a, emissiveIntensity: 1.6 });
  patch(glass, (s) => {
    s.uniforms.uNight = U.uNight;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying vec3 vWp;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat room = fract(sin(dot(floor(vWp.xz*0.28) + floor(vWp.y*0.27)*7.1, vec2(12.9898,78.233)))*43758.5453);\ntotalEmissiveRadiance *= uNight * step(0.3, room) * (0.6 + 0.6*room);');
  }, 'estateGlass');
  const rail = new THREE.MeshStandardMaterial({ color: 0xbfe3ef, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false });
  // pool water: tiled floor showing through, animated caustics and ripples, underwater lights at night
  const water = new THREE.MeshStandardMaterial({ color: 0x2bb3d6, roughness: 0.04, metalness: 0.05, emissive: 0x0a8ab8, emissiveIntensity: 1 });
  patch(water, (s) => {
    s.uniforms.uTime = U.uTime; s.uniforms.uNight = U.uNight;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uTime, uNight; varying vec3 vWp;
      float cau(vec2 p){ float t = uTime*0.8; vec2 q = p; float c = 0.;
        for (int i = 0; i < 3; i++) { q = vec2(q.x + sin(q.y*1.7 + t)*0.6, q.y + cos(q.x*1.9 - t*1.1)*0.6); c += 0.05/abs(sin(q.x*2.3) * sin(q.y*2.1) + 0.06); t *= 1.3; q *= 1.4; }
        return clamp(c*0.18, 0., 1.4); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 tl = abs(fract(vWp.xz*1.25) - 0.5); float grout = step(0.46, max(tl.x, tl.y));
        float c = cau(vWp.xz*0.7);
        diffuseColor.rgb = mix(vec3(0.05,0.45,0.62), vec3(0.25,0.8,0.9), 0.35 + 0.25*c) * (1. - grout*0.25);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 wq = vWp.xz*2.2; float tt = uTime*1.6;
        vec3 wn = normalize(vec3(sin(wq.x + tt)*0.06 + sin(wq.y*1.3 - tt*0.8)*0.05, 1., cos(wq.y + tt*1.1)*0.06 + sin(wq.x*0.7 + tt)*0.04));
        normal = normalize((viewMatrix * vec4(wn, 0.)).xyz);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 0.06 + uNight*(0.9 + 0.4*cau(vWp.xz*0.7));');
  }, 'estatePool');
  return { ...base, lawn, paver, wall, trim, glass, rail, water, hedge: lawn };
}

// ---------------- one estate ----------------
function estate(B, e) {
  const rng = mulberry32(Math.floor(e.seed * 1e9)), f = e.face, y = e.y, H = e.house;
  const hx = (H.x0 + H.x1) / 2, hz = (H.z0 + H.z1) / 2, W = H.x1 - H.x0, D = H.z1 - H.z0, FH = 3.7;
  const big = e.kind !== 'villa', cream = 0xf1ebe0, white = 0xf7f5f0, stoneC = 0xd8cdb8;
  const Z = (l) => hz + f * l;                                  // local "forward" offset from the house centre
  const lotW = e.x1 - e.x0, lotD = e.z1 - e.z0;
  // ground: lawn slab over the whole compound (thick so the edges never float)
  B.box('lawn', lotW - 0.6, 1.2, lotD - 0.6, e.cx, y - 1.2, e.cz, 0x9fbf6a, 0, 4);
  // compound wall with the gate in the front wall
  const gx = Math.min(e.x1 - 9, hx + W / 2 + 4), front = f > 0 ? e.z1 : e.z0, back = f > 0 ? e.z0 : e.z1, wh = big ? 2.6 : 2.1;
  const wallSeg = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.5) return; const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, horiz = Math.abs(z1 - z0) < 0.1;
    const w = horiz ? len : 0.4, d = horiz ? 0.4 : len;
    B.box('stone', w + 0.1, 0.7, d + 0.1, cx, y - 0.3, cz, stoneC, 0, 2);
    B.box('wall', w, wh - 0.4, d, cx, y + 0.4, cz, e.style === 'colonial' ? e.color : cream);
    B.box('trim', w + 0.16, 0.12, d + 0.16, cx, y + wh, cz, white);
    for (let s = 0; s <= len; s += big ? 9 : 7) { const px = horiz ? x0 + Math.sign(x1 - x0) * s : x0, pz = horiz ? z0 : z0 + Math.sign(z1 - z0) * s; B.box('trim', 0.6, wh + 0.25, 0.6, px, y, pz, white); }
    COL(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y - 1, y + wh);
  };
  wallSeg(e.x0, back, e.x1, back); wallSeg(e.x0, e.z0, e.x0, e.z1); wallSeg(e.x1, e.z0, e.x1, e.z1);
  wallSeg(e.x0, front, gx - 4, front); wallSeg(gx + 4, front, e.x1, front);
  // gate pillars with lamps, a sliding gate parked open, guard cabin
  for (const sx of [-1, 1]) {
    B.box('stone', 1.1, wh + 0.9, 1.1, gx + sx * 4.6, y - 0.2, front, stoneC, 0, 2); B.box('trim', 1.3, 0.2, 1.3, gx + sx * 4.6, y + wh + 0.7, front, white);
    B.add('glow', xf(new THREE.SphereGeometry(0.28, 10, 8), gx + sx * 4.6, y + wh + 1.25, front), 0xffe2a8);
    B.cyl('metal', 0.05, 0.05, 0.35, gx + sx * 4.6, y + wh + 0.85, front, 0x222222, 6);
  }
  for (let k = 0; k < 16; k++) B.box('metal', 0.07, wh - 0.3, 0.07, gx + 4.5 + k * 0.5, y + 0.1, front - f * 0.45, 0x1b1b1b);
  B.box('metal', 8, 0.1, 0.1, gx + 8.3, y + wh - 0.25, front - f * 0.45, 0x1b1b1b); B.box('metal', 8, 0.1, 0.1, gx + 8.3, y + 0.3, front - f * 0.45, 0x1b1b1b);
  if (big) { B.box('wall', 2.6, 2.7, 2.6, gx - 8, y, front - f * 3, white); B.box('glass', 2.65, 1.0, 1.6, gx - 8, y + 1.2, front - f * 3, 0x1d2a33); B.box('trim', 3.2, 0.2, 3.2, gx - 8, y + 2.7, front - f * 3, 0x444444); }
  // driveway from the gate to the porch, then across the front of the house
  const porchZ = Z(D / 2 + 3.5), dwW = big ? 6.5 : 4.5;
  B.box('paver', dwW, 0.08, Math.abs(front - porchZ), gx, y, (front + porchZ) / 2, 0xd8d2c4, 0, 2.5);
  B.box('paver', Math.abs(gx - hx) + dwW, 0.08, 7, (gx + hx) / 2, y, porchZ, 0xd8d2c4, 0, 2.5);
  for (let s = 6; s < Math.abs(front - porchZ) - 4; s += 7) for (const sx of [-1, 1]) { const lz = front - f * s; B.cyl('metal', 0.06, 0.08, 0.9, gx + sx * (dwW / 2 + 0.6), y, lz, 0x2a2a2a, 6); B.add('glow', xf(new THREE.SphereGeometry(0.13, 8, 6), gx + sx * (dwW / 2 + 0.6), y + 0.98, lz), 0xffe9b8); }
  // clipped hedges along the drive
  B.box('hedge', 0.9, 0.9, Math.abs(front - porchZ) - 6, gx - dwW / 2 - 1.6, y, (front + porchZ) / 2 - f * 1, 0x2f5a22, 0, 2);
  // ---------------- the house ----------------
  if (e.style === 'modern') modernHouse(B, e, hx, hz, W, D, FH, y, f, rng); else colonialHouse(B, e, hx, hz, W, D, FH, y, f, rng);
  // ---------------- pool + deck + loungers + umbrellas ----------------
  const P = e.pool, pw = P.x1 - P.x0, pd = P.z1 - P.z0, pcx = (P.x0 + P.x1) / 2, pcz = (P.z0 + P.z1) / 2;
  B.box(big ? 'wood' : 'paver', pw + 7, 0.3, pd + 6, pcx, y, pcz, big ? 0xb58a62 : 0xe6e0d4, 0, 2.5);
  for (const sz of [-1, 1]) { B.box('trim', pw + 1.0, 0.42, 0.5, pcx, y, pcz + sz * (pd / 2 + 0.25), 0xffffff); B.box('trim', 0.5, 0.42, pd, pcx + sz * (pw / 2 + 0.25), y, pcz, 0xffffff); }
  B.box('water', pw, 0.06, pd, pcx, y + 0.28, pcz, 0xffffff);
  const nL = big ? 6 : 2;
  for (let k = 0; k < nL; k++) {
    const lx = P.x0 + 1.5 + k * (pw - 3) / Math.max(1, nL - 1), lz = pcz + f * (pd / 2 + 2.2);
    B.box('trim', 0.75, 0.32, 1.9, lx, y + 0.3, lz, 0xffffff); B.add('trim', xf(boxUV(0.75, 0.08, 0.8), lx, y + 0.85, lz + f * 0.85, 0, f * 0.9), 0xffffff);
    if (k % 2 === 1) { B.cyl('metal', 0.04, 0.04, 2.3, lx - 0.9, y + 0.3, lz, 0xdddddd, 6); B.add('rail', xf(new THREE.ConeGeometry(1.6, 0.6, 10, 1, true), lx - 0.9, y + 2.7, lz), 0xffffff); B.add('trim', xf(new THREE.ConeGeometry(1.62, 0.6, 10, 1, true), lx - 0.9, y + 2.71, lz), [0xf2efe8, 0x1f3b5a, 0xc0392b][Math.floor(rng() * 3)]); }
  }
  // ---------------- garden: fountain (colonial), tennis court (some mansions), flower beds ----------------
  if (e.style === 'colonial' && big) {
    const fz = (front + Z(D / 2 + 12)) / 2, fx = (hx + gx) / 2 - 6;
    B.cyl('stone', 4.2, 4.4, 0.6, fx, y, fz, stoneC, 28); B.cyl('water', 3.8, 3.8, 0.05, fx, y + 0.5, fz, 0xffffff, 28);
    B.cyl('stone', 0.5, 0.7, 1.6, fx, y + 0.5, fz, stoneC, 12); B.cyl('stone', 1.6, 1.2, 0.3, fx, y + 2.1, fz, stoneC, 18); B.cyl('stone', 0.25, 0.35, 1.1, fx, y + 2.4, fz, stoneC, 10);
    B.add('stone', xf(new THREE.SphereGeometry(0.4, 12, 8), fx, y + 3.6, fz), white);
    for (let a = 0; a < 6.28; a += 0.5) B.box('hedge', 1.4, 0.7, 1.4, fx + Math.cos(a) * 7, y, fz + Math.sin(a) * 7, 0x2f5a22, 0, 2);
  }
  if (e.tennis) {
    const tx = hx - W / 2 - 22 < e.x0 + 14 ? hx + W / 2 + 22 : hx - W / 2 - 22, tz = hz + f * 4;
    if (tx > e.x0 + 10 && tx < e.x1 - 10) {
      B.box('trim', 18, 0.06, 36, tx, y, tz, 0x2e7d55); B.box('trim', 11, 0.07, 24, tx, y, tz, 0x3e6db5);
      for (const lx of [-5.5, 5.5, -4.1, 4.1]) B.box('trim', 0.08, 0.075, 23.8, tx + lx, y + 0.005, tz, 0xffffff);
      for (const lz of [-12, 12, -6.4, 6.4]) B.box('trim', lz === -12 || lz === 12 ? 11 : 8.2, 0.075, 0.08, tx, y + 0.005, tz + lz, 0xffffff);
      B.box('trim', 0.06, 0.075, 12.8, tx, y + 0.005, tz, 0xffffff);
      B.box('dark', 12.8, 0.92, 0.04, tx, y, tz, 0x111111); B.box('trim', 12.8, 0.06, 0.06, tx, y + 0.92, tz, 0xffffff);
      for (const [cx, cz] of [[-9, -18], [9, -18], [-9, 18], [9, 18]]) B.cyl('metal', 0.06, 0.06, 3.5, tx + cx, y, tz + cz, 0x1e3a2c, 6);
    }
  }
  // flower beds hugging the house front
  for (let k = 0; k < (big ? 8 : 3); k++) {
    const bx = H.x0 + 2 + k * (W - 4) / Math.max(1, (big ? 7 : 2)), bz = Z(D / 2 + 1.3);
    if (Math.abs(bx - hx) < 4) continue;
    B.box('hedge', 2.4, 0.5, 1.2, bx, y, bz, 0x356b2a, 0, 2);
    for (let n = 0; n < 4; n++) B.add('trim', xf(new THREE.IcosahedronGeometry(0.22, 0), bx - 0.9 + n * 0.6, y + 0.6, bz + (rng() - 0.5) * 0.6), [0xe53966, 0xff9f1c, 0xffd23f, 0xf7f7ff, 0xc2185b][Math.floor(rng() * 5)]);
  }
}

// contemporary villa: stacked offset boxes, glass walls, cantilevered upper floor, wood + stone accents, roof terrace
function modernHouse(B, e, hx, hz, W, D, FH, y, f, rng) {
  const Z = (l) => hz + f * l, white = 0xf6f4ef, big = e.kind !== 'villa', y0 = y + 0.6;
  B.box('stone', W + 1.6, 0.6, D + 1.6, hx, y, hz, 0xc9bda6, 0, 2);
  // front steps
  for (let k = 0; k < 3; k++) B.box('stone', 5, 0.2, 0.45, hx, y + k * 0.2, Z(D / 2 + 1.4 - k * 0.45), 0xd8cdb8, 0, 2);
  const floors = e.house.floors;
  for (let fl = 0; fl < floors; fl++) {
    const top = fl === floors - 1 && floors === 3;
    const fw = top ? W * 0.5 : fl === 0 ? W : W * 0.86, fd = top ? D * 0.6 : fl === 0 ? D : D * 0.92;
    const ox = top ? -W * 0.16 : fl === 1 ? (rng() < 0.5 ? -1 : 1) * W * 0.07 : 0, oz = fl === 1 ? f * 2.4 : top ? -f * D * 0.12 : 0;
    const cx = hx + ox, cz = hz + oz, yb = y0 + fl * FH;
    // core walls (slightly inset so the glass sits proud of them)
    B.box('wall', fw - 0.4, FH - 0.35, fd - 0.4, cx, yb, cz, e.color);
    // floor slab / roof slab with a crisp white overhang
    B.box('trim', fw + (fl === 0 ? 0.6 : 1.6), 0.38, fd + 1.4, cx, yb + FH - 0.38, cz, white);
    // front facade: floor-to-ceiling glass with slim black mullions (wood cladding block on one side)
    const fz = cz + f * (fd / 2 - 0.15), glassW = fw * (fl === 0 ? 0.72 : 0.6), gx0 = cx - fw / 2 + 0.6;
    B.box('glass', glassW, FH - 0.7, 0.12, gx0 + glassW / 2, yb + 0.15, fz, 0x24323c);
    for (let m = 0; m <= glassW; m += 1.6) B.box('metal', 0.07, FH - 0.7, 0.18, gx0 + m, yb + 0.15, fz, 0x161616);
    B.box('metal', glassW, 0.08, 0.18, gx0 + glassW / 2, yb + 1.1, fz, 0x161616);
    const woodW = fw - glassW - 1.4; if (woodW > 1.5) { B.box('wood', woodW, FH - 0.45, 0.14, gx0 + glassW + 0.4 + woodW / 2, yb + 0.05, fz, 0x9a6b45, 0, 1.5); for (let s = 0; s < woodW; s += 0.32) B.box('wood', 0.06, FH - 0.45, 0.06, gx0 + glassW + 0.4 + s, yb + 0.05, fz + f * 0.1, 0x6d4a2e, 0, 1.5); }
    // back + side ribbon windows
    for (const sd of [-1, 1]) {
      B.box('glass', fw * 0.7, 1.5, 0.1, cx, yb + 1.0, cz - f * (fd / 2 - 0.15) * (sd > 0 ? 1 : 1), 0x24323c);
      B.box('glass', 0.1, 1.5, fd * 0.6, cx + sd * (fw / 2 - 0.15), yb + 1.0, cz, 0x24323c);
    }
    // balcony with glass rail in front of the upper floors
    if (fl >= 1) {
      const bz = cz + f * (fd / 2 + 1.3);
      B.box('trim', fw * 0.7, 0.3, 2.6, cx - fw * 0.1, yb - 0.3, bz, white);
      B.box('rail', fw * 0.7, 1.05, 0.06, cx - fw * 0.1, yb, bz + f * 1.27, 0xffffff);
      B.box('metal', fw * 0.7, 0.06, 0.1, cx - fw * 0.1, yb + 1.05, bz + f * 1.27, 0x1a1a1a);
    }
    // roof terrace: rail + pergola on the top floor's roof, parapet below it
    if (fl === floors - 1) {
      B.box('rail', fw, 1.0, 0.06, cx, yb + FH, cz + f * (fd / 2 + 0.5), 0xffffff);
      for (let s = -fw / 2 + 1; s < fw / 2 - 1; s += 0.55) B.box('wood', 0.1, 0.14, fd * 0.55, cx + s, yb + FH + 2.6, cz, 0x8a5d3b, 0, 1.5);
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box('metal', 0.14, 2.6, 0.14, cx + px * (fw / 2 - 1), yb + FH, cz + pz * fd * 0.27, 0x1a1a1a);
      if (big) { B.box('trim', 2.2, 0.8, 1.2, cx + fw * 0.3, yb + FH, cz - f * fd * 0.3, 0xdddddd); B.box('rail', 3.4, 0.05, 2.2, cx - fw * 0.3, yb + FH + 0.02, cz - f * fd * 0.25, 0xffffff); }
    }
  }
  // stone-clad feature fin running the full height + a cantilevered porch canopy over the front door
  const finX = hx + (rng() < 0.5 ? -1 : 1) * (W / 2 - 0.4);
  B.box('stone', 0.9, floors * FH + 0.8, D * 0.8, finX, y0, hz, 0xb7a990, 0, 2);
  B.box('trim', 7, 0.3, 4.2, hx, y0 + 3.0, Z(D / 2 + 1.6), white);
  B.box('wood', 2.6, 2.7, 0.18, hx, y0, Z(D / 2 - 0.1), 0x5b3a22, 0, 1.5);
  B.add('glow', xf(new THREE.BoxGeometry(6, 0.05, 0.2), hx, y0 + 2.95, Z(D / 2 + 3.6)), 0xfff1d0);
}

// Portuguese-colonial mansion: colour-washed walls, white cornices and pilasters, shuttered windows,
// columned portico with balcony, triangular pediment, hip roof in clay tiles. The palace adds domes.
function colonialHouse(B, e, hx, hz, W, D, FH, y, f, rng) {
  const Z = (l) => hz + f * l, white = 0xfbfaf6, y0 = y + 0.7, floors = e.house.floors, top = y0 + floors * FH, palace = e.kind === 'palace';
  const shut = [0x2e5d3a, 0x1f4e79, 0x7b2d26, 0x2f6b6b][Math.floor(rng() * 4)];
  B.box('stone', W + 2, 0.7, D + 2, hx, y, hz, 0xd5c8ae, 0, 2);
  B.box('wall', W, floors * FH, D, hx, y0, hz, e.color);
  for (let fl = 0; fl <= floors; fl++) B.box('trim', W + 0.3, fl === floors ? 0.55 : 0.3, D + 0.3, hx, y0 + fl * FH - (fl === floors ? 0.2 : 0.15), hz, white);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box('trim', 0.7, floors * FH, 0.7, hx + sx * (W / 2 - 0.2), y0, hz + sz * (D / 2 - 0.2), white);
  // windows on all four sides: glass + white frame + louvred shutters
  const win = (cx, cz, yb, nx, nz) => {
    const along = nz !== 0, ww = 1.3, wh = 2.2, ox = nx * 0.06, oz = nz * 0.06;
    B.box('glass', along ? ww : 0.08, wh, along ? 0.08 : ww, cx + ox, yb, cz + oz, 0x1e2a33);
    B.box('trim', along ? ww + 0.4 : 0.12, 0.25, along ? 0.12 : ww + 0.4, cx + ox * 2, yb + wh, cz + oz * 2, white);
    B.box('trim', along ? ww + 0.3 : 0.14, 0.12, along ? 0.14 : ww + 0.3, cx + ox * 2, yb - 0.12, cz + oz * 2, white);
    for (const s of [-1, 1]) B.box('wood', along ? 0.62 : 0.07, wh, along ? 0.07 : 0.62, cx + (along ? s * (ww / 2 + 0.36) : 0) + ox * 2, yb, cz + (along ? 0 : s * (ww / 2 + 0.36)) + oz * 2, shut, 0, 1);
  };
  for (let fl = 0; fl < floors; fl++) {
    const yb = y0 + fl * FH + 0.9;
    for (let x = hx - W / 2 + 2.5; x <= hx + W / 2 - 2.4; x += 3.6) { if (fl === 0 && Math.abs(x - hx) < 3.2) continue; win(x, hz + D / 2, yb, 0, 1); win(x, hz - D / 2, yb, 0, -1); }
    for (let z = hz - D / 2 + 2.5; z <= hz + D / 2 - 2.4; z += 3.6) { win(hx - W / 2, z, yb, -1, 0); win(hx + W / 2, z, yb, 1, 0); }
  }
  // grand front door
  B.box('wood', 2.4, 3.2, 0.2, hx, y0, Z(D / 2 + 0.05), 0x4a2c17, 0, 1.2);
  B.add('trim', xf(new THREE.CylinderGeometry(1.45, 1.45, 0.24, 18, 1, false, -Math.PI / 2, Math.PI), hx, y0 + 3.2, Z(D / 2 + 0.08), 0, Math.PI / 2), white);
  // portico: columns, balcony with balustrade, pediment
  const pw = palace ? W * 0.42 : Math.min(W * 0.38, 16), pd = palace ? 7 : 5, nCol = palace ? 8 : 4, pz = Z(D / 2 + pd / 2);
  for (let k = 0; k < nCol; k++) {
    const cx = hx - pw / 2 + 0.5 + k * (pw - 1) / (nCol - 1);
    B.box('trim', 1.1, 0.4, 1.1, cx, y0, Z(D / 2 + pd - 0.6), white); B.cyl('trim', 0.36, 0.42, FH - 0.7, cx, y0 + 0.4, Z(D / 2 + pd - 0.6), white, 14); B.box('trim', 1.0, 0.3, 1.0, cx, y0 + FH - 0.3, Z(D / 2 + pd - 0.6), white);
    if (palace) { B.cyl('trim', 0.36, 0.42, FH - 0.7, cx, y0 + FH + 0.4, Z(D / 2 + pd - 0.6), white, 14); }
  }
  B.box('trim', pw + 1, 0.45, pd + 0.4, hx, y0 + FH, pz, white);
  B.box('stone', pw, 0.12, pd, hx, y0 + 0.02, pz, 0xe9e2d2, 0, 2);
  for (let s = -pw / 2 + 0.4; s <= pw / 2 - 0.3; s += 0.42) B.cyl('trim', 0.09, 0.12, 0.8, hx + s, y0 + FH + 0.45, Z(D / 2 + pd), white, 6);
  B.box('trim', pw + 0.6, 0.14, 0.4, hx, y0 + FH + 1.25, Z(D / 2 + pd), white);
  const pedY = palace ? y0 + 2 * FH + 0.45 : top;
  const ped = new THREE.CylinderGeometry(1, 1, 1, 3, 1); ped.rotateZ(Math.PI / 2); ped.rotateY(Math.PI / 2);
  B.add('trim', xf(ped, hx, pedY + 1.2, Z(D / 2 + (palace ? pd : 0.3)), 0, 0, 0, pw * 0.58 + 1, 1.6, 0.9), white);
  if (palace) B.box('trim', pw + 1, 0.45, pd + 0.4, hx, y0 + 2 * FH, pz, white);
  // clay-tile hip roof
  B.add('tile', xf(hipRoof(W, D, Math.min(W, D) * 0.33, 1.0), hx, top + 0.3, hz), 0xc8714b);
  if (palace) {
    // central dome on a drum + four corner chhatris (domed pavilions) — Sagar Mahal
    B.cyl('trim', 6.2, 6.2, 4.5, hx, top + 4, hz, white, 32);
    for (let a = 0; a < 6.28; a += 0.39) B.box('glass', 0.9, 2.6, 0.2, hx + Math.sin(a) * 6.22, top + 4.8, hz + Math.cos(a) * 6.22, 0x1e2a33, a);
    B.add('trim', xf(new THREE.SphereGeometry(6.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), hx, top + 8.5, hz, 0, 0, 0, 1, 1.15, 1), 0xf2efe6);
    B.cyl('metal', 0.25, 0.5, 2.6, hx, top + 15.7, hz, 0xd4af37, 10); B.add('metal', xf(new THREE.SphereGeometry(0.55, 12, 8), hx, top + 18.4, hz), 0xd4af37);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = hx + sx * (W / 2 - 2.5), cz = hz + sz * (D / 2 - 2.5);
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cyl('trim', 0.18, 0.2, 3, cx + px * 1.4, top, cz + pz * 1.4, white, 8);
      B.box('trim', 3.6, 0.35, 3.6, cx, top + 3, cz, white);
      B.add('trim', xf(new THREE.SphereGeometry(1.8, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), cx, top + 3.3, cz, 0, 0, 0, 1, 1.25, 1), 0xf2efe6);
      B.cyl('metal', 0.08, 0.16, 1, cx, top + 5.4, cz, 0xd4af37, 6);
    }
  }
}

// ---------------- build everything, tiled for LOD ----------------
export function buildEstates(scene, q, baseMats, TX, regLod, addCol) {
  if (!M.estates.length) return; COL = addCol;
  const mats = makeMats(baseMats, TX), tiles = new Map(), size = 400;
  for (const e of M.estates) { const k = Math.floor((e.cx + M.HALF) / size) + Math.floor((e.cz + M.HALF) / size) * 1000; if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(e); }
  for (const [k, list] of tiles) {
    const g = new THREE.Group(), B = new Bag();
    for (const e of list) estate(B, e);
    B.build(mats, g); scene.add(g);
    regLod(g, (k % 1000) * size - M.HALF + size / 2, Math.floor(k / 1000) * size - M.HALF + size / 2, Math.min(q.bldFar || 3000, 2600));
  }
}
