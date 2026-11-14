// Procedural vehicle models (fictional brands). Each model -> merged geometry with vertex colours and
// attributes aPaint (body paint mask) + aEmit (1 headlight, 2 tail light), plus wheel placement for player cars.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const lin = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255].map((c) => Math.pow(c, 2.2));
function finish(g, col, paint = 0, emit = 0) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count, c = lin(col), C = new Float32Array(n * 3), P = new Float32Array(n), E = new Float32Array(n);
  for (let i = 0; i < n; i++) { C[i * 3] = c[0]; C[i * 3 + 1] = c[1]; C[i * 3 + 2] = c[2]; P[i] = paint; E[i] = emit; }
  g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setAttribute('aPaint', new THREE.BufferAttribute(P, 1)); g.setAttribute('aEmit', new THREE.BufferAttribute(E, 1));
  return g;
}
const tr = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
function prism(pts, width, bevel = 0.05, curveSegs = 2) {
  const sh = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: curveSegs, curveSegments: 4 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(-Math.PI / 2); // shape x -> world z
  return g;
}
function shapeBody(P) {
  const { L, ground: g0, noseY, hoodY, ws, rf, rr, rw, roofY, deckY, tailY, r, zf, zr, nr = 0.25 } = P;
  const pts = [[L / 2 - nr, g0], [L / 2, g0 + 0.18], [L / 2, noseY - 0.06], [L / 2 - nr * 0.6, noseY], [ws + 0.35, hoodY - 0.03], [ws, hoodY], [rw, deckY], [-L / 2 + 0.25, deckY - 0.02], [-L / 2, tailY], [-L / 2, g0 + 0.18], [-L / 2 + 0.22, g0]];
  // bottom with wheel arches, rear -> front
  for (const zc of [zr, zf]) { const ar = r + 0.07, yc = Math.max(g0, r * 0.95); pts.push([zc - ar, g0]); for (let k = 0; k <= 10; k++) { const a = Math.PI - (k / 10) * Math.PI; pts.push([zc + Math.cos(a) * ar, yc + Math.sin(a) * ar]); } pts.push([zc + ar, g0]); }
  return pts;
}
// generic road car: a lofted body (rounded cross-sections along the length) with glass, pillars, lights, grille and
// door seams painted per face, plus mirrors, handles, number plates and exhausts. aEmit: 1 head, 2 tail, 3/4 lightbar, 5 glass, 6 chrome
function carModel(P, low = false) {
  const parts = [];
  const { L, W, ground: g0, noseY, hoodY, ws, rf, rr, rw, roofY, deckY, tailY, r, zf, zr } = P;
  const nr = P.nr ?? 0.25, H2 = W / 2;
  // ---- top profile (front -> rear) and bottom line with wheel arches
  const tp = [[L / 2, noseY - 0.1], [L / 2 - nr * 0.6, noseY], [ws + 0.35, hoodY - 0.03], [ws, hoodY], [rf, roofY], [rr, roofY], [rw, deckY], [-L / 2 + 0.25, deckY - 0.02], [-L / 2, tailY]];
  const topAt = (z) => { for (let i = 0; i < tp.length - 1; i++) { const [z0, y0] = tp[i], [z1, y1] = tp[i + 1]; if (z <= z0 && z >= z1) { const t = (z0 - z) / Math.max(1e-6, z0 - z1), s = (i === 3 || i === 5) ? t : t * t * (3 - 2 * t); return y0 + (y1 - y0) * s; } } return tailY; };
  const beltAt = (z) => Math.min(topAt(z), z > ws ? hoodY : z < rw ? deckY : hoodY + (deckY - hoodY) * (ws - z) / Math.max(0.01, ws - rw));
  const ar = r + 0.07, ayc = Math.max(g0, r * 0.95);
  const botAt = (z) => { let b = g0 + 0.02; for (const zc of [zf, zr]) { const d = z - zc; if (Math.abs(d) < ar) b = Math.max(b, ayc + Math.sqrt(ar * ar - d * d) - 0.02); } return b; };
  const halfW = (z) => { const zz = Math.abs(z) / (L / 2); return H2 * (1 - Math.pow(Math.max(0, zz - 0.62) / 0.38, 2) * (P.round ?? 0.12) * 1.4 - (zz > 0.985 ? 0.05 : 0)); };
  // stations: dense near ends, pillars and door seams for crisp edges
  const seams = [ws - 0.32, (rf + rr) / 2 - 0.12, rw + 0.12];
  const NZ = low ? 14 : 46; let zs = []; for (let k = 0; k <= NZ; k++) zs.push(-L / 2 + (L * k) / NZ);
  for (const z of [ws, ws - 0.07, rw, rw + 0.07, rf, rr, ...(P.bpillar ? [(rf + rr) / 2 - 0.06, (rf + rr) / 2 + 0.03] : []), ...(low ? [] : seams.flatMap((z) => [z - 0.006, z + 0.006])), zf - ar, zf + ar, zr - ar, zr + ar]) if (z > -L / 2 && z < L / 2) zs.push(z);
  zs = [...new Set(zs.map((z) => Math.round(z * 1000) / 1000))].sort((a, b) => a - b);
  // cross-section loop (x, y) for a station: bottom centre -> right side -> roof -> left side
  const section = (z) => {
    const w = halfW(z), top = topAt(z), bot = Math.min(botAt(z), top - 0.12), belt = Math.max(bot + 0.08, Math.min(beltAt(z), top - 0.02)), rb = Math.min(0.1, (belt - bot) * 0.3);
    const cabin = top - belt > 0.06, wt = cabin ? w * (P.tumble ?? 0.8) : w * 0.97, rt = Math.min(0.13, (top - belt) * 0.5 + 0.04);
    const half = [[0, bot], [w * 0.55, bot], [w - rb, bot + 0.005], [w - rb * 0.3, bot + rb * 0.4], [w, bot + rb], [w * 1.012, bot + (belt - bot) * 0.45], [w * 1.018, belt - 0.05], [w * 0.995, belt - 0.005], [w * 0.985, belt + 0.004]];
    // always 4 points here so every station has the same vertex count (cabin or not)
    if (cabin) half.push([w * 0.975, belt + 0.03], [wt + (w - wt) * 0.25, top - rt * 0.9], [wt - rt * 0.35, top - rt * 0.15], [wt - rt, top]);
    else { const h = Math.max(0.004, top - belt); half.push([w * 0.975, belt + h * 0.3], [w * 0.94, belt + h * 0.65], [w * 0.88, top - 0.004], [w * 0.75, top]); }
    half.push([wt * 0.4, top + 0.012], [0, top + 0.016]);
    const loop = half.slice(); for (let i = half.length - 2; i > 0; i--) loop.push([-half[i][0], half[i][1]]);
    return { loop, belt, top, bot, cabin };
  };
  const S = zs.map(section), n = S[0].loop.length;
  const pos = [], idx = [];
  zs.forEach((z, si) => { for (const [x, y] of S[si].loop) pos.push(x, y, z); });
  for (let si = 0; si < zs.length - 1; si++) for (let k = 0; k < n; k++) { const a = si * n + k, b = si * n + (k + 1) % n, c = a + n, d = b + n; idx.push(a, b, c, b, d, c); }
  // end caps
  for (const [si, dir] of [[0, -1], [zs.length - 1, 1]]) { const ci = pos.length / 3; const s = S[si]; pos.push(0, (s.bot + s.top) / 2, zs[si] + dir * 0.004); for (let k = 0; k < n; k++) { const a = si * n + k, b = si * n + (k + 1) % n; if (dir > 0) idx.push(ci, a, b); else idx.push(ci, b, a); } }
  let body = new THREE.BufferGeometry(); body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); body.setIndex(idx); body.computeVertexNormals(); body = body.toNonIndexed();
  // per-face classification -> colour / paint / emit
  const bp = body.attributes.position, nf = bp.count / 3, C = new Float32Array(bp.count * 3), PA = new Float32Array(bp.count), EM = new Float32Array(bp.count);
  const dark = lin(0x0c0c0c), glass = lin(0x0e1418), head = lin(0xfff6e0), tail = lin(0xd01010), grille = lin(P.grille ?? 0x121212), white = [1, 1, 1];
  for (let f = 0; f < nf; f++) {
    let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += bp.getX(f * 3 + k) / 3; cy += bp.getY(f * 3 + k) / 3; cz += bp.getZ(f * 3 + k) / 3; }
    const ax = Math.abs(cx), belt = beltAt(cz), top = topAt(cz), w = halfW(cz);
    let col = white, paint = 1, emit = 0;
    const inCabinZ = cz < ws - 0.02 && cz > rw + 0.02 && top - belt > 0.06;
    const pillar = (cz > ws - 0.075 && cz < ws) || (cz < rw + 0.075 && cz > rw) || (P.bpillar && cz > (rf + rr) / 2 - 0.06 && cz < (rf + rr) / 2 + 0.03);
    if (inCabinZ && cy > belt + 0.02 && cy < top - 0.035 && !pillar) { col = glass; paint = 0; emit = 5; }
    else if (inCabinZ && cy > belt + 0.02 && cy < top - 0.035 && pillar && !P.bodyPillars) { col = dark; paint = 0; }
    if (cz > ws && cy > hoodY - 0.02 && cz < ws + 0.05) { col = glass; paint = 0; emit = 5; } // wiper cowl
    if (seams.some((s) => Math.abs(cz - s) < 0.006) && cy < belt - 0.01 && cy > botAt(cz) + 0.04) { col = dark; paint = 0; }
    // front: headlights + grille, rear: tail lights
    const front = cz > L / 2 - 0.16, rear = cz < -L / 2 + 0.14;
    if (front && ax < W * (P.grilleW ?? 0.2) && cy > g0 + 0.16 && cy < noseY - 0.12) { col = grille; paint = 0; }
    if (front && cy < g0 + 0.15) { col = lin(P.bumper ?? 0x1a1a1a); paint = 0; }
    if (rear && cy < g0 + 0.15) { col = lin(P.bumper ?? 0x1a1a1a); paint = 0; }
    if (cy < botAt(cz) + 0.03 && ax < w * 0.7) { col = dark; paint = 0; } // underbody
    // police livery: blue band with a red pinstripe along the sides, blue bonnet stripe
    if (P.livery && paint === 1) {
      const band = belt - cy;
      if (ax > w * 0.85 && band > 0.12 && band < 0.3) { col = lin(0x0d47a1); paint = 0; }
      if (ax > w * 0.85 && band > 0.3 && band < 0.34) { col = lin(0xc62828); paint = 0; }
      if (cz > ws + 0.1 && ax < 0.12 && cy > noseY) { col = lin(0x0d47a1); paint = 0; }
    }
    for (let k = 0; k < 3; k++) { const i = f * 3 + k; C.set(col, i * 3); PA[i] = paint; EM[i] = emit; }
  }
  body.setAttribute('color', new THREE.BufferAttribute(C, 3)); body.setAttribute('aPaint', new THREE.BufferAttribute(PA, 1)); body.setAttribute('aEmit', new THREE.BufferAttribute(EM, 1));
  parts.push(body);
  if (low) { for (const sx of [-1, 1]) { parts.push(finish(tr(new THREE.BoxGeometry(0.36, 0.06, 0.1), sx * W * 0.32, topAt(L / 2 - nr * 0.35) - 0.035, L / 2 - nr * 0.35), 0xfff6e0, 0, 1)); parts.push(finish(tr(new THREE.BoxGeometry(0.4, 0.07, 0.06), sx * W * 0.31, tailY - 0.1, -L / 2 + 0.01), 0xd01010, 0, 2)); } if (P.lightbar) { parts.push(finish(tr(new THREE.BoxGeometry(0.5, 0.1, 0.22), -0.28, roofY + 0.08, rf - 0.25), 0xe53935, 0, 3)); parts.push(finish(tr(new THREE.BoxGeometry(0.5, 0.1, 0.22), 0.28, roofY + 0.08, rf - 0.25), 0x1e88e5, 0, 4)); } return { parts, wheels: [[P.track, r, zf], [-P.track, r, zf], [P.track, r, zr], [-P.track, r, zr]], r, rimCol: P.rim ?? 0xb0b4b8, low: true }; }
  // ---- lamps: lens pieces set into the nose and tail, tilted to follow the bodywork
  const noseSlope = Math.atan2(hoodY - noseY, (L / 2 - nr * 0.6) - (ws + 0.35));
  for (const sx of [-1, 1]) {
    const hx = sx * W * (P.lampX ?? 0.32), hz = L / 2 - nr * 0.35, hy = topAt(hz) - 0.035;
    const lens = new THREE.BoxGeometry(P.lampW ?? 0.36, 0.055, 0.2); lens.rotateX(-noseSlope * 0.9); lens.rotateY(-sx * 0.18); lens.translate(hx, hy, hz);
    parts.push(finish(lens, 0xfff6e0, 0, 1));
    const drl = new THREE.BoxGeometry((P.lampW ?? 0.36) * 0.9, 0.018, 0.04); drl.rotateY(-sx * 0.18); drl.translate(hx, hy - 0.06, L / 2 - 0.02); parts.push(finish(drl, 0xfffaf0, 0, 1));
    const tz = -L / 2 + 0.01, ty = tailY - 0.1, tl = new THREE.BoxGeometry(P.tailW ?? 0.42, 0.075, 0.06); tl.rotateY(sx * 0.12); tl.translate(sx * W * 0.31, ty, tz); parts.push(finish(tl, 0xd01010, 0, 2));
  }
  if (P.tailBar) { parts.push(finish(tr(new THREE.BoxGeometry(W * 0.62, 0.025, 0.04), 0, tailY - 0.1, -L / 2 + 0.005), 0xd01010, 0, 2)); }
  // ---- details
  const mirZ = ws - 0.1, mirY = beltAt(mirZ) + 0.05, plateC = lin(0xf2f2f2);
  for (const sx of [-1, 1]) {
    parts.push(finish(tr(new THREE.BoxGeometry(0.16, 0.1, 0.12), sx * (halfW(mirZ) + 0.1), mirY, mirZ), 0xffffff, 1));
    parts.push(finish(tr(new THREE.BoxGeometry(0.02, 0.08, 0.1), sx * (halfW(mirZ) + 0.18), mirY, mirZ - 0.01), 0x0e1418, 0, 5));
    for (const hz of [seams[0] - 0.22, seams[1] - 0.22]) if (hz > rw + 0.1) parts.push(finish(tr(new THREE.BoxGeometry(0.02, 0.025, 0.14), sx * (halfW(hz) * 1.012 + 0.01), beltAt(hz) - 0.09, hz), 0xc8c8c8, 0, 6));
  }
  // number plates (white, black characters), exhaust tips
  const plate = (z, y, dir) => { parts.push(finish(tr(new THREE.BoxGeometry(0.52, 0.12, 0.012), 0, y, z), 0xf2f2f2)); for (let k = 0; k < 7; k++) parts.push(finish(tr(new THREE.BoxGeometry(0.035, 0.07, 0.006), -0.18 + k * 0.06, y, z + dir * 0.008), 0x111111)); };
  plate(L / 2 + 0.005, g0 + 0.24, 1); plate(-L / 2 - 0.005, g0 + 0.3, -1);
  for (const sx of (P.quadExhaust ? [-0.2, -0.32, 0.2, 0.32] : [-0.32])) parts.push(finish(tr(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 10, 1, true), sx * (W / 2) / 0.9, g0 + 0.12, -L / 2 - 0.02, Math.PI / 2), 0xd0d0d0, 0, 6));
  if (P.spoiler) { parts.push(finish(tr(new THREE.BoxGeometry(W * 0.86, 0.04, 0.32), 0, deckY + 0.28, -L / 2 + 0.25), 0x111111)); for (const sx of [-1, 1]) parts.push(finish(tr(new THREE.BoxGeometry(0.05, 0.28, 0.1), sx * W * 0.33, deckY + 0.13, -L / 2 + 0.3), 0x111111)); }
  if (P.intake) for (const sx of [-1, 1]) parts.push(finish(tr(new THREE.BoxGeometry(0.03, 0.16, 0.55), sx * (halfW(-0.6) * 1.01), (botAt(-0.6) + beltAt(-0.6)) / 2, -0.6), 0x0a0a0a));
  if (P.chrome) { parts.push(finish(tr(new THREE.BoxGeometry(W * 0.95, 0.06, 0.06), 0, g0 + 0.27, L / 2 + 0.02), 0xdedede, 0, 6)); parts.push(finish(tr(new THREE.BoxGeometry(W * 0.95, 0.06, 0.06), 0, g0 + 0.27, -L / 2 - 0.02), 0xdedede, 0, 6)); }
  if (P.lightbar) { parts.push(finish(tr(new THREE.BoxGeometry(0.5, 0.1, 0.22), -0.28, roofY + 0.08, rf - 0.25), 0xe53935, 0, 3)); parts.push(finish(tr(new THREE.BoxGeometry(0.5, 0.1, 0.22), 0.28, roofY + 0.08, rf - 0.25), 0x1e88e5, 0, 4)); parts.push(finish(tr(new THREE.BoxGeometry(1.2, 0.05, 0.28), 0, roofY + 0.03, rf - 0.25), 0x222222)); }
  if (P.rack) { for (const sx of [-1, 1]) parts.push(finish(tr(new THREE.BoxGeometry(0.04, 0.05, (rf - rr) * 0.9), sx * halfW(0) * 0.62, roofY + 0.06, (rf + rr) / 2), 0x222222)); }
  if (P.spare) parts.push(finish(tr(new THREE.CylinderGeometry(r, r, 0.25, 16), 0, deckY - 0.1, -L / 2 - 0.12, Math.PI / 2), 0x111111));
  return { parts, wheels: [[P.track, r, zf], [-P.track, r, zf], [P.track, r, zr], [-P.track, r, zr]], r, rimCol: P.rim ?? 0xb0b4b8, caliper: P.caliper };
}
// wheel: lathed tyre with rounded sidewalls, spoked rim with lip, brake disc (+ caliper on sports cars)
function wheelGeo(r, w, rimCol, segs = 18, caliper = null, low = false) {
  if (low) { const t = tr(new THREE.CylinderGeometry(r, r, w, 8, 1), 0, 0, 0, 0, 0, Math.PI / 2); const h = tr(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.02, 8, 1), 0, 0, 0, 0, 0, Math.PI / 2); return mergeGeometries([finish(t, 0x141414), finish(h, rimCol, 0, 6)]); }
  const prof = [[r * 0.62, -w / 2], [r * 0.9, -w / 2 - 0.006], [r * 0.98, -w / 2 + 0.02], [r, -w / 2 + 0.05], [r, w / 2 - 0.05], [r * 0.98, w / 2 - 0.02], [r * 0.9, w / 2 + 0.006], [r * 0.62, w / 2]];
  const tire = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), segs); tire.rotateZ(Math.PI / 2);
  const parts = [finish(tire, 0x141414)];
  const lip = new THREE.CylinderGeometry(r * 0.64, r * 0.64, w * 0.9, segs, 1, true); lip.rotateZ(Math.PI / 2); parts.push(finish(lip, rimCol, 0, 6));
  for (const sx of [-1, 1]) {
    const face = new THREE.CircleGeometry(r * 0.22, 12); face.rotateY(sx * Math.PI / 2); face.translate(sx * w * 0.36, 0, 0); parts.push(finish(face, rimCol, 0, 6));
    const disc = new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.02, 16); disc.rotateZ(Math.PI / 2); disc.translate(sx * w * 0.12, 0, 0); parts.push(finish(disc, 0x6a6a6a));
    for (let k = 0; k < 6; k++) { const sp = new THREE.BoxGeometry(0.035, r * 0.46, 0.045); sp.translate(0, r * 0.38, 0); sp.rotateX((k / 6) * Math.PI * 2); sp.translate(sx * w * 0.36, 0, 0); parts.push(finish(sp, rimCol, 0, 6)); }
    if (caliper) { const c = new THREE.BoxGeometry(0.05, r * 0.32, r * 0.22); c.translate(sx * w * 0.2, r * 0.32, -r * 0.18); parts.push(finish(c, caliper)); }
  }
  return mergeGeometries(parts);
}
// ---- special models ----
function autoRickshaw() {
  const parts = [];
  parts.push(finish(prism([[1.25, 0.25], [1.32, 0.8], [1.1, 1.0], [0.8, 1.05], [0.6, 0.95], [-1.1, 0.95], [-1.25, 0.8], [-1.25, 0.3], [-0.95, 0.25], [-0.5, 0.3], [0.9, 0.25]], 1.3, 0.06), 0xffffff, 1));
  parts.push(finish(prism([[0.85, 1.05], [0.75, 1.75], [-1.2, 1.75], [-1.25, 1.0], [0.6, 0.95]], 1.34, 0.08), 0x101010));
  parts.push(finish(tr(new THREE.BoxGeometry(1.2, 0.5, 0.05), 0, 1.35, 0.82, -0.25), 0x1a2128));
  parts.push(finish(tr(new THREE.BoxGeometry(1.1, 0.35, 0.9), 0, 0.95, -0.55), 0x3e2723));
  parts.push(finish(tr(new THREE.BoxGeometry(0.22, 0.12, 0.08), 0, 0.85, 1.32), 0xfff6e0, 0, 1));
  for (const sx of [-1, 1]) parts.push(finish(tr(new THREE.BoxGeometry(0.15, 0.08, 0.05), sx * 0.5, 0.6, -1.26), 0xd01010, 0, 2));
  return { parts, wheels: [[0, 0.22, 1.0], [0.6, 0.22, -0.85], [-0.6, 0.22, -0.85]], r: 0.22, rimCol: 0x9e9e9e };
}
function bus(state) {
  const parts = [], L = 10.5, W = 2.5, H = 3.1;
  parts.push(finish(tr(new THREE.BoxGeometry(W, H - 0.45, L), 0, 0.45 + (H - 0.45) / 2, 0), 0xffffff, 1));
  parts.push(finish(tr(new THREE.BoxGeometry(W + 0.02, 0.9, L - 1.2), 0, 2.05, -0.3), 0x1a2128));
  parts.push(finish(tr(new THREE.BoxGeometry(W - 0.1, 1.2, 0.05), 0, 2.0, L / 2 + 0.01), 0x1a2128));
  parts.push(finish(tr(new THREE.BoxGeometry(W + 0.03, 0.18, L), 0, 1.35, 0), state ? 0xf5f5f5 : 0x1565c0));
  for (const sx of [-1, 1]) { parts.push(finish(tr(new THREE.BoxGeometry(0.3, 0.2, 0.06), sx * 0.9, 0.85, L / 2 + 0.01), 0xfff6e0, 0, 1)); parts.push(finish(tr(new THREE.BoxGeometry(0.3, 0.2, 0.06), sx * 0.9, 0.85, -L / 2 - 0.01), 0xd01010, 0, 2)); }
  return { parts, wheels: [[1.05, 0.5, 3.4], [-1.05, 0.5, 3.4], [1.05, 0.5, -3.3], [-1.05, 0.5, -3.3]], r: 0.5, rimCol: 0x777777 };
}
function truck() {
  const parts = [], W = 2.4;
  parts.push(finish(tr(new THREE.BoxGeometry(W, 1.7, 2.0), 0, 1.45, 3.0), 0xffffff, 1));
  parts.push(finish(tr(new THREE.BoxGeometry(W - 0.2, 0.7, 0.05), 0, 1.95, 4.01), 0x1a2128));
  parts.push(finish(tr(new THREE.BoxGeometry(W, 0.6, 2.0), 0, 2.55, 3.0), 0xffc107));
  parts.push(finish(tr(new THREE.BoxGeometry(W + 0.1, 2.3, 5.4), 0, 1.95, -0.9), 0xe65100));
  for (let k = 0; k < 5; k++) parts.push(finish(tr(new THREE.BoxGeometry(W + 0.12, 0.25, 5.42), 0, 1.0 + k * 0.45, -0.9), [0x2e7d32, 0xffeb3b, 0xd81b60, 0x1e88e5, 0xffffff][k]));
  parts.push(finish(tr(new THREE.BoxGeometry(W, 0.4, 7.8), 0, 0.6, 0.6), 0x222222));
  for (const sx of [-1, 1]) { parts.push(finish(tr(new THREE.BoxGeometry(0.3, 0.2, 0.06), sx * 0.85, 1.0, 4.01), 0xfff6e0, 0, 1)); parts.push(finish(tr(new THREE.BoxGeometry(0.3, 0.2, 0.06), sx * 0.9, 0.9, -3.62), 0xd01010, 0, 2)); }
  return { parts, wheels: [[1.05, 0.5, 3.1], [-1.05, 0.5, 3.1], [1.05, 0.5, -1.9], [-1.05, 0.5, -1.9], [1.05, 0.5, -3.0], [-1.05, 0.5, -3.0]], r: 0.5, rimCol: 0x777777 };
}
function scooter() {
  const parts = [];
  parts.push(finish(prism([[0.75, 0.35], [0.8, 1.0], [0.62, 1.05], [0.45, 0.45], [-0.2, 0.45], [-0.25, 0.7], [-0.75, 0.75], [-0.85, 0.45], [-0.6, 0.3]], 0.42, 0.05), 0xffffff, 1));
  parts.push(finish(tr(new THREE.BoxGeometry(0.7, 0.05, 0.05), 0, 1.08, 0.66), 0x222222));
  parts.push(finish(tr(new THREE.BoxGeometry(0.34, 0.12, 0.6), 0, 0.82, -0.45), 0x1a1a1a));
  parts.push(finish(tr(new THREE.BoxGeometry(0.14, 0.1, 0.06), 0, 0.95, 0.8), 0xfff6e0, 0, 1));
  // rider (simple)
  parts.push(finish(tr(new THREE.CylinderGeometry(0.17, 0.2, 0.62, 8), 0, 1.25, -0.4, 0.25), 0x1e88e5, 1));
  parts.push(finish(tr(new THREE.SphereGeometry(0.15, 10, 8), 0, 1.72, -0.28), 0x212121));
  for (const sx of [-1, 1]) { parts.push(finish(tr(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6), sx * 0.13, 0.95, -0.1, 1.3), 0x263238)); parts.push(finish(tr(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 6), sx * 0.2, 1.3, 0.12, -1.0, 0, sx * 0.3), 0x8d5524)); }
  return { parts, wheels: [[0, 0.24, 0.62], [0, 0.24, -0.62]], r: 0.24, rimCol: 0x999999, narrow: true };
}
// ---- spec table ----
export const CARS = {
  rakshas: { name: 'Vayu Rakshas', cls: 'Hypercar', top: 105, acc: 15, grip: 1.25, nitro: true, mass: 1.5, sound: 'super', paints: [0xff6a00, 0x9bff00, 0xffd400, 0xffffff],
    P: { L: 4.7, W: 2.05, ground: 0.12, noseY: 0.55, hoodY: 0.86, ws: 0.95, rf: 0.15, rr: -0.55, rw: -1.45, roofY: 1.16, deckY: 0.98, tailY: 0.93, r: 0.36, zf: 1.45, zr: -1.5, track: 0.86, nr: 0.35, spoiler: true, intake: true, round: 0.18, tumble: 0.7, caliper: 0xd32f2f, quadExhaust: true, rim: 0x2a2a2a, grilleW: 0.28, lampW: 0.42, tailBar: true } },
  agni: { name: 'Agni GT', cls: 'Supercar', top: 95, acc: 13, grip: 1.2, nitro: true, mass: 1.5, sound: 'super', paints: [0xd01020, 0xfafafa, 0x111111, 0xffd600],
    P: { L: 4.6, W: 1.98, ground: 0.13, noseY: 0.62, hoodY: 0.95, ws: 0.55, rf: -0.15, rr: -0.75, rw: -1.6, roofY: 1.22, deckY: 1.0, tailY: 0.98, r: 0.35, zf: 1.4, zr: -1.4, track: 0.84, nr: 0.4, round: 0.2, tumble: 0.72, caliper: 0xffc107, quadExhaust: true, grilleW: 0.26, lampW: 0.4 } },
  shera: { name: 'Shera S9', cls: 'Sports', top: 88, acc: 12, grip: 1.15, nitro: true, mass: 1.4, sound: 'super', paints: [0x1a8cff, 0x9e9e9e, 0x2e7d32, 0xfafafa],
    P: { L: 4.45, W: 1.85, ground: 0.13, noseY: 0.62, hoodY: 0.9, ws: 0.7, rf: 0.05, rr: -0.45, rw: -1.9, roofY: 1.28, deckY: 1.0, tailY: 0.95, r: 0.34, zf: 1.3, zr: -1.3, track: 0.78, nr: 0.3, spoiler: true, round: 0.22, tumble: 0.76, caliper: 0xd32f2f, quadExhaust: true } },
  bison: { name: 'Bison 69', cls: 'Classic Muscle', top: 78, acc: 11, grip: 0.95, nitro: false, mass: 1.7, sound: 'super', paints: [0x111111, 0xffffff, 0xd84315, 0x1565c0],
    P: { L: 4.85, W: 1.92, ground: 0.17, noseY: 0.82, hoodY: 0.98, ws: 0.15, rf: -0.4, rr: -1.2, rw: -1.65, roofY: 1.33, deckY: 1.0, tailY: 0.98, r: 0.36, zf: 1.5, zr: -1.45, track: 0.82, nr: 0.12, chrome: true, round: 0.05 } },
  amba: { name: 'Royal Amba', cls: 'Classic', top: 42, acc: 5, grip: 0.85, nitro: false, mass: 1.6, sound: 'car', paints: [0xf5f5f5, 0x212121, 0x8d6e63, 0x1b5e20, 0xb71c1c],
    P: { L: 4.35, W: 1.66, ground: 0.22, noseY: 0.92, hoodY: 1.0, ws: 0.65, rf: 0.25, rr: -0.95, rw: -1.25, roofY: 1.58, deckY: 0.98, tailY: 0.92, r: 0.34, zf: 1.35, zr: -1.3, track: 0.7, nr: 0.3, chrome: true, bpillar: true, round: 0.3, grille: 0xdedede } },
  regent: { name: 'Sterling Regent', cls: 'Premium', top: 80, acc: 9, grip: 1.05, nitro: false, mass: 1.9, sound: 'car', paints: [0x0d0d0d, 0xb0bec5, 0xeceff1, 0x1a237e],
    P: { L: 5.15, W: 1.95, ground: 0.17, noseY: 0.78, hoodY: 0.98, ws: 0.9, rf: 0.3, rr: -1.15, rw: -1.75, roofY: 1.47, deckY: 1.03, tailY: 1.0, r: 0.36, zf: 1.65, zr: -1.55, track: 0.83, nr: 0.3, chrome: true, bpillar: true, round: 0.18, grille: 0xcfd8dc } },
  kaveri: { name: 'Kaveri SUV', cls: 'SUV', top: 58, acc: 7, grip: 1.0, nitro: false, mass: 2.1, sound: 'car', paints: [0xffffff, 0x424242, 0xb71c1c, 0x0d47a1],
    P: { L: 4.6, W: 1.9, ground: 0.3, noseY: 1.08, hoodY: 1.2, ws: 1.15, rf: 0.6, rr: -2.1, rw: -2.2, roofY: 1.82, deckY: 1.25, tailY: 1.22, r: 0.4, zf: 1.4, zr: -1.4, track: 0.82, nr: 0.15, bpillar: true, rack: true, round: 0.1 } },
  jeep: { name: 'Kesari 4x4', cls: 'Off-road', top: 50, acc: 8, grip: 1.15, nitro: false, mass: 1.8, sound: 'car', paints: [0x556b2f, 0xd84315, 0x000000, 0xf9a825],
    P: { L: 3.95, W: 1.82, ground: 0.38, noseY: 1.15, hoodY: 1.2, ws: 0.75, rf: 0.6, rr: -1.6, rw: -1.75, roofY: 1.9, deckY: 1.22, tailY: 1.2, r: 0.42, zf: 1.25, zr: -1.2, track: 0.8, nr: 0.05, spare: true, rack: true, round: 0.04 } },
  police: { name: 'Daman Police SUV', cls: 'Police', top: 62, acc: 8, grip: 1.05, nitro: false, mass: 2.0, sound: 'car', paints: [0xfafafa],
    P: { L: 4.6, W: 1.9, ground: 0.3, noseY: 1.08, hoodY: 1.2, ws: 1.15, rf: 0.6, rr: -2.1, rw: -2.2, roofY: 1.82, deckY: 1.25, tailY: 1.22, r: 0.4, zf: 1.4, zr: -1.4, track: 0.82, nr: 0.15, bpillar: true, lightbar: true, round: 0.1, livery: 'police' } },
  chhota: { name: 'Chhota Hatch', cls: 'Hatchback', top: 45, acc: 6, grip: 0.95, nitro: false, mass: 1.0, sound: 'car', paints: [0xffffff, 0xd32f2f, 0x9e9e9e, 0x1976d2, 0xfbc02d, 0x6d4c41, 0x2e7d32],
    P: { L: 3.65, W: 1.62, ground: 0.17, noseY: 0.82, hoodY: 0.98, ws: 0.95, rf: 0.45, rr: -1.4, rw: -1.75, roofY: 1.52, deckY: 1.05, tailY: 1.05, r: 0.3, zf: 1.15, zr: -1.15, track: 0.7, nr: 0.25, bpillar: true, round: 0.2 } },
  sedan: { name: 'Sahara Sedan', cls: 'Sedan', top: 52, acc: 7, grip: 1.0, nitro: false, mass: 1.2, sound: 'car', paints: [0xffffff, 0xc0c0c0, 0x8b0000, 0x0d47a1, 0x424242, 0x795548],
    P: { L: 4.3, W: 1.72, ground: 0.16, noseY: 0.78, hoodY: 0.96, ws: 0.85, rf: 0.25, rr: -0.95, rw: -1.45, roofY: 1.46, deckY: 1.0, tailY: 0.98, r: 0.31, zf: 1.35, zr: -1.3, track: 0.74, nr: 0.3, bpillar: true, round: 0.18 } },
};
const SPECIAL = {
  auto: { name: 'Auto-rickshaw', cls: 'Auto', top: 18, acc: 3, grip: 0.9, mass: 0.6, sound: 'auto', paints: [0x2e7d32, 0xfdd835], build: autoRickshaw },
  bus: { name: 'State Bus', cls: 'Bus', top: 24, acc: 2.5, grip: 0.8, mass: 6, sound: 'car', paints: [0xc62828, 0x1565c0, 0xef6c00], build: () => bus(0) },
  truck: { name: 'Goods Truck', cls: 'Truck', top: 26, acc: 2.5, grip: 0.8, mass: 7, sound: 'car', paints: [0xffffff], build: truck },
  scooter: { name: 'Chetak Scooter', cls: 'Scooter', top: 24, acc: 5, grip: 0.9, mass: 0.3, sound: 'auto', paints: [0x1e88e5, 0xfafafa, 0xd32f2f, 0x43a047, 0x212121], build: scooter },
};
Object.assign(CARS, SPECIAL);
const cache = new Map();
export function vehicleGeometry(key) {
  if (cache.has(key)) return cache.get(key);
  const spec = CARS[key], m = spec.build ? spec.build() : carModel(spec.P);
  const wg = wheelGeo(m.r, m.narrow ? 0.12 : 0.26, m.rimCol, 14, m.caliper);
  const statics = [...m.parts];
  for (const [x, r, z] of m.wheels) { const w = wg.clone(); w.translate(x, r, z); statics.push(w); }
  let lowAll = null;
  if (spec.P) { const ml = carModel(spec.P, true), wl = wheelGeo(ml.r, 0.26, ml.rimCol, 8, null, true), st = [...ml.parts]; for (const [x, r, z] of ml.wheels) { const w = wl.clone(); w.translate(x, r, z); st.push(w); } lowAll = mergeGeometries(st); }
  const res = { low: lowAll, all: mergeGeometries(statics), body: mergeGeometries(m.parts), wheel: wheelGeo(m.r, m.narrow ? 0.12 : 0.26, m.rimCol, 22, m.caliper), wheels: m.wheels, r: m.r, len: spec.P ? spec.P.L : key === 'bus' ? 10.5 : key === 'truck' ? 7.8 : key === 'scooter' ? 1.8 : 2.6, wid: spec.P ? spec.P.W : key === 'scooter' ? 0.7 : key === 'auto' ? 1.4 : 2.5 };
  cache.set(key, res); return res;
}

// ---- aircraft & boat ----
export function heliGeometry() {
  const parts = [];
  const body = new THREE.SphereGeometry(1.4, 18, 12); body.scale(1, 0.95, 2.0); parts.push(finish(tr(body, 0, 1.75, 0.6), 0xffffff, 1));
  parts.push(finish(tr(new THREE.SphereGeometry(1.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2).scale(1, 0.9, 1.3), 0, 1.75, 1.6, -1.1), 0x1a2128));
  parts.push(finish(tr(new THREE.CylinderGeometry(0.25, 0.45, 5.2, 10), 0, 2.15, -3.4, Math.PI / 2 - 0.06), 0xffffff, 1));
  parts.push(finish(tr(new THREE.BoxGeometry(0.12, 1.5, 0.9), 0, 2.85, -5.85, 0, 0, 0), 0xff6f00));
  parts.push(finish(tr(new THREE.BoxGeometry(1.6, 0.08, 0.5), 0, 2.2, -5.4), 0xffffff, 1));
  parts.push(finish(tr(new THREE.BoxGeometry(2.85, 0.18, 4.4), 0, 1.45, 0.4), 0xff6f00));
  parts.push(finish(tr(new THREE.CylinderGeometry(0.22, 0.32, 0.6, 10), 0, 3.05, 0.3), 0x333333));
  for (const sx of [-1, 1]) { parts.push(finish(tr(new THREE.CylinderGeometry(0.06, 0.06, 3.8, 6), sx * 1.1, 0.12, 0.4, Math.PI / 2), 0x333333)); for (const z of [-0.6, 1.4]) parts.push(finish(tr(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), sx * 1.0, 0.55, z, 0, 0, sx * 0.3), 0x333333)); }
  parts.push(finish(tr(new THREE.BoxGeometry(0.2, 0.12, 0.08), 0, 1.0, 3.35), 0xfff6e0, 0, 1));
  const rotor = mergeGeometries([0, 1, 2, 3].map((k) => finish(tr(new THREE.BoxGeometry(0.32, 0.05, 11), 0, 0, 0, 0, (k * Math.PI) / 2), 0x222222)));
  const tail = mergeGeometries([0, 1].map((k) => finish(tr(new THREE.BoxGeometry(0.06, 1.8, 0.18), 0, 0, 0, (k * Math.PI) / 2), 0x222222)));
  return { body: mergeGeometries(parts), rotor, tail, rotorY: 3.4, tailPos: [0.18, 2.85, -5.8] };
}
export function jetGeometry(fighter) {
  const parts = [];
  if (fighter) {
    const fus = new THREE.CylinderGeometry(0.75, 0.55, 13, 14); fus.rotateX(Math.PI / 2); parts.push(finish(tr(fus, 0, 1.9, -0.5), 0xffffff, 1));
    parts.push(finish(tr(new THREE.ConeGeometry(0.75, 3.2, 14).rotateX(Math.PI / 2), 0, 1.9, 7.6), 0xffffff, 1));
    parts.push(finish(tr(new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 2.6), 0, 2.4, 3.6), 0x2a3d4f));
    const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 3.5, 5.6, 0, -2.6, 0, 0, -4.6, 0, 0, 3.5, 0, 0, -4.6, -5.6, 0, -2.6], 3)); wing.computeVertexNormals();
    parts.push(finish(tr(new THREE.BufferGeometry().copy(wing), 0, 1.75, -0.8), 0xffffff, 1)); parts.push(finish(tr(wing.clone().scale(1, -1, 1), 0, 1.73, -0.8), 0xffffff, 1));
    parts.push(finish(tr(new THREE.BoxGeometry(0.1, 2.6, 2.4), 0, 3.1, -5.6, 0.3), 0xffffff, 1));
    parts.push(finish(tr(new THREE.CylinderGeometry(0.5, 0.55, 0.8, 12).rotateX(Math.PI / 2), 0, 1.9, -7.2), 0x333333));
    for (const sx of [-1, 1]) parts.push(finish(tr(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8).rotateX(Math.PI / 2), sx * 3.6, 1.55, -1.2), 0xbdbdbd));
    for (const [x, z] of [[0, 4.5], [1.6, -1.6], [-1.6, -1.6]]) parts.push(finish(tr(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 6), x, 0.9, z), 0x444444));
    parts.push(finish(tr(new THREE.BoxGeometry(5.0, 0.06, 0.5), 0, 1.92, -1.0), 0xff9933)); parts.push(finish(tr(new THREE.BoxGeometry(5.0, 0.065, 0.5), 0, 1.93, -1.5), 0x138808));
  } else {
    const fus = new THREE.CylinderGeometry(1.05, 0.7, 13, 16); fus.rotateX(Math.PI / 2); parts.push(finish(tr(fus, 0, 2.2, 0), 0xffffff, 1));
    parts.push(finish(tr(new THREE.SphereGeometry(1.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1, 2.2).rotateX(Math.PI / 2), 0, 2.2, 6.5), 0xffffff, 1));
    parts.push(finish(tr(new THREE.BoxGeometry(0.9, 0.35, 0.05), 0, 2.75, 7.6, -0.6), 0x1a2128));
    for (let k = 0; k < 7; k++) for (const sx of [-1, 1]) parts.push(finish(tr(new THREE.BoxGeometry(0.03, 0.32, 0.38), sx * 1.04, 2.45, 3.5 - k * 1.1), 0x1a2128));
    const wing = new THREE.BoxGeometry(15, 0.16, 2.4); const wp = wing.attributes.position; for (let i = 0; i < wp.count; i++) wp.setZ(i, wp.getZ(i) - Math.abs(wp.getX(i)) * 0.18); wing.computeVertexNormals();
    parts.push(finish(tr(wing, 0, 1.6, 0.4), 0xffffff, 1));
    parts.push(finish(tr(new THREE.BoxGeometry(0.15, 2.8, 2.2), 0, 3.6, -6.0, 0.35), 0x0d47a1));
    parts.push(finish(tr(new THREE.BoxGeometry(5.0, 0.12, 1.4), 0, 4.9, -6.6), 0xffffff, 1));
    for (const sx of [-1, 1]) parts.push(finish(tr(new THREE.CylinderGeometry(0.42, 0.42, 2.4, 12).rotateX(Math.PI / 2), sx * 1.6, 2.7, -4.4), 0xcfd8dc));
    parts.push(finish(tr(new THREE.BoxGeometry(2.12, 0.2, 13), 0, 1.9, 0), 0x0d47a1));
    for (const [x, z] of [[0, 5.2], [1.4, -0.4], [-1.4, -0.4]]) parts.push(finish(tr(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 6), x, 0.9, z), 0x444444));
  }
  for (const sx of [-1, 1]) parts.push(finish(tr(new THREE.SphereGeometry(0.12, 6, 4), sx * (fighter ? 5.2 : 7.4), 1.7, fighter ? -2.4 : -0.9), sx > 0 ? 0x00ff44 : 0xff2222, 0, 1));
  return mergeGeometries(parts);
}
export function boatGeometry() {
  const parts = [];
  const sh = [[3.2, 0.9], [2.4, 0.2], [-2.6, 0.15], [-2.8, 0.95]];
  parts.push(finish(prism(sh, 2.1, 0.12), 0xffffff, 1));
  parts.push(finish(tr(new THREE.BoxGeometry(2.0, 0.12, 4.8), 0, 0.95, -0.2), 0x8d6e63));
  parts.push(finish(tr(new THREE.BoxGeometry(1.6, 0.5, 0.06), 0, 1.25, 0.9, -0.5), 0x1a2128));
  parts.push(finish(tr(new THREE.BoxGeometry(0.6, 0.5, 0.6), 0, 1.25, -1.0), 0xeeeeee));
  parts.push(finish(tr(new THREE.BoxGeometry(0.5, 0.6, 0.4), 0, 0.9, -2.9), 0x222222));
  return mergeGeometries(parts);
}
