// Daman geography + road network + building lots (all procedural, seeded)
import { fbm, vnoise, smooth, clamp, lerp, R, rr, ri, pick, mulberry32 } from './util.js';

// 20 km x 20 km island world. Daman city on the west coast, jungle + Ghats mountains to the east.
export const HALF = 10000;
export let N = 1024, CELL = (2 * HALF) / N, W1 = N + 1;
export let H = null;
export function setRes(n) { N = n; CELL = (2 * HALF) / N; W1 = N + 1; H = new Float32Array(W1 * W1); }

// ---------- coast, river, lake ----------
export function coastX(z) {
  return -3150 + 140 * Math.sin(z / 1500 + 0.6) + 55 * Math.sin(z / 530 + 2.0) + (fbm(z * 0.004, 7.3, 3) - 0.5) * 50;
}
export const coastRoadX = (z) => coastX(z) + 200;
export function rivZ(x) { const u = x + 3150; return smooth(0, 1800, u) * (170 * Math.sin(u / 1150) + 60 * Math.sin(u / 420)); }
export const RIVER_END = 6000;
export function kolZ(x) { return -7300 + 150 * Math.sin((x + 3000) / 900) + 60 * Math.sin((x + 3000) / 330); }
export function kolHalfW(x) { return lerp(70, 26, smooth(-3200, 1200, x)); }
export const KOLAK_END = 1600;
export const PLAT = { x: 6650, z: 0, r: 640, h: 160, lx: 6720, lz: 0, lr: 270, water: 158 };
export const ISLAND = { x: -6400, z: 1800, r: 560 };
export const PANI = { x: 0, z: 0, r: 40 };
function edgeDist(x, z) { return Math.min(z + 9300, 9300 - z, 9650 - x) + (fbm(x * 0.0007 + 5, z * 0.0007, 3) - 0.5) * 600; }
function ridged(x, z) {
  let s = 0, a = 1, f = 0.00034, w = 0;
  for (let i = 0; i < 5; i++) { let n = 1 - Math.abs(2 * vnoise(x * f + 13.7 * i, z * f - 7.1 * i) - 1); n *= n; s += n * a; w += a; a *= 0.5; f *= 2.13; }
  return Math.pow(s / w, 1.55);
}
export function rivHalfW(x) { return lerp(165, 80, smooth(-3200, -1200, x)); }
export const LAKE = { x: -1350, z: -1700, r: 170, ir: 40 };

const flats = [];
function baseLand(x, z) {
  let h = 3.5 + fbm(x * 0.0011 + 3.1, z * 0.0011 - 1.7, 4) * 7 + smooth(-2500, 5000, x) * 7;
  const f = smooth(3800, 7200, x);
  if (f > 0) h += f * (35 + 150 * fbm(x * 0.0008 + 11, z * 0.0008 + 4, 4));
  const mm = smooth(6900, 8700, x);
  if (mm > 0) h += mm * (140 + 1650 * ridged(x, z));
  // plateau with lake (Naag Sarovar). Gentle on the north/east, a sheer cliff on the west (waterfall).
  const dx = x - PLAT.x, dz = z - PLAT.z, dp = Math.hypot(dx, dz);
  const west = smooth(0.25, 0.75, -dx / (dp + 1e-3)), wd = lerp(520, 55, west);
  if (dp < PLAT.r + wd) {
    const t = smooth(PLAT.r + wd, PLAT.r, dp);
    h = lerp(h, PLAT.h + (fbm(x * 0.01, z * 0.01, 2) - 0.5) * 4, t);
    const dl = Math.hypot(x - PLAT.lx, z - PLAT.lz);
    if (dl < PLAT.lr + 40) h = lerp(h, PLAT.h - 16, smooth(PLAT.lr + 40, PLAT.lr - 25, dl));
    if (x < PLAT.lx && x > PLAT.x - PLAT.r - 10 && Math.abs(z - PLAT.z) < 30) h = lerp(h, PLAT.water - 2.5, smooth(30, 12, Math.abs(z - PLAT.z)));
  }
  return h;
}
function addFlat(x0, z0, x1, z1, b = 60) { flats.push({ x0, z0, x1, z1, h: baseLand((x0 + x1) / 2, (z0 + z1) / 2), b }); }

export function rawHeight(x, z) {
  let land = baseLand(x, z);
  for (const f of flats) {
    const dx = Math.max(f.x0 - x, 0, x - f.x1), dz = Math.max(f.z0 - z, 0, z - f.z1);
    const d = Math.hypot(dx, dz);
    if (d < f.b) land = lerp(f.h, land, smooth(0, f.b, d));
  }
  const cx = coastX(z), dc = Math.min(x - cx, edgeDist(x, z));
  let h;
  if (dc < 0) h = Math.max(-30, -0.7 + dc * 0.035);
  else if (dc < 75) h = lerp(-0.7, 1.4, dc / 75);
  else h = lerp(1.4, land, smooth(75, 260, dc));
  if (x > cx - 400 && x < RIVER_END + 120) {
    const hw = rivHalfW(x);
    let dr = Math.abs(z - rivZ(x));
    if (x > RIVER_END - 60) dr = Math.hypot(x - (RIVER_END - 60), z - rivZ(RIVER_END - 60));
    if (dr < hw + 50) { const t = smooth(hw + 50, hw - 12, dr); const bed = -0.8 - 4 * smooth(hw, 0, dr); h = lerp(h, bed, t); }
  }
  if (x > cx - 400 && x < KOLAK_END + 80) {
    const hw = kolHalfW(x);
    let dr = Math.abs(z - kolZ(x)); if (x > KOLAK_END) dr = Math.hypot(x - KOLAK_END, z - kolZ(KOLAK_END));
    if (dr < hw + 35) h = lerp(h, -0.6 - 2.5 * smooth(hw, 0, dr), smooth(hw + 35, hw - 8, dr));
  }
  const di = Math.hypot(x - ISLAND.x, z - ISLAND.z);
  if (di < ISLAND.r) h = Math.max(h, lerp(-0.7, 5 + 32 * fbm(x * 0.004, z * 0.004, 3) * smooth(ISLAND.r, 0, di), smooth(ISLAND.r, ISLAND.r - 140, di)));
  const dpk = Math.hypot(x - PANI.x, z - PANI.z);
  if (dpk < PANI.r + 20) h = Math.max(h, lerp(-1.5, 2.4, smooth(PANI.r + 12, PANI.r - 6, dpk)));
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r + 40) h = lerp(h, -2.5, smooth(LAKE.r + 40, LAKE.r - 8, dl));
  if (dl < LAKE.ir + 15) h = lerp(h, 2.2, smooth(LAKE.ir + 15, LAKE.ir - 5, dl));
  return h;
}

export function terrainH(x, z) {
  let fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
  if (fx < 0) fx = 0; if (fz < 0) fz = 0; if (fx > N - 1e-4) fx = N - 1e-4; if (fz > N - 1e-4) fz = N - 1e-4;
  const i = fx | 0, j = fz | 0; fx -= i; fz -= j;
  const h00 = H[i + j * W1], h10 = H[i + 1 + j * W1], h01 = H[i + (j + 1) * W1], h11 = H[i + 1 + (j + 1) * W1];
  if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

// ---------- landmarks ----------
export const L = {};
const EXCL = []; // {x0,z0,x1,z1} or {x,z,r}; road:true blocks roads too
function exRect(x0, z0, x1, z1, road = false, tag = '') { EXCL.push({ x0, z0, x1, z1, road, tag }); }
function exCirc(x, z, r, road = false) { EXCL.push({ x, z, r, road }); }
export function excluded(x, z, m = 0, roadOnly = false) {
  for (const e of EXCL) {
    if (roadOnly && !e.road) continue;
    if (e.r !== undefined) { if (Math.hypot(x - e.x, z - e.z) < e.r + m) return true; }
    else if (x > e.x0 - m && x < e.x1 + m && z > e.z0 - m && z < e.z1 + m) return true;
  }
  return false;
}

function computeLandmarks() {
  PLAT.z = rivZ(RIVER_END); PLAT.lz = PLAT.z - 20;
  PANI.x = coastX(0) + 160; PANI.z = rivZ(PANI.x);
  L.falls = { x: PLAT.x - PLAT.r - 8, z: PLAT.z, top: PLAT.water, pool: RIVER_END - 60 };
  L.plateau = { x: PLAT.x, z: PLAT.z };
  L.caveFalls = { x: RIVER_END - 30, z: PLAT.z + 70 };
  L.caveNaag = { x: 8150, z: 2600 };
  L.island = { x: ISLAND.x, z: ISLAND.z };
  L.pani = { x: PANI.x, z: PANI.z };
  L.temple = { x: PLAT.lx + 120, z: PLAT.lz - 300 };
  L.jungleCamp = { x: 5200, z: 3600 };
  L.peak = { x: 8600, z: -2600 };
  L.saltPans = { x0: -3000, z0: -6600, x1: -2300, z1: -5600 };
  L.wind = { z0: 6300, z1: 9000 };
  L.kolak = { x: -2350, z: -7800 };
  let mx = -1e9; for (let z = 300; z <= 770; z += 10) mx = Math.max(mx, coastRoadX(z));
  const mx0 = mx + 45; L.motiFort = { x0: mx0, z0: 330, x1: Math.min(mx0 + 430, -2305), z1: 760 };
  mx = -1e9; for (let z = -540; z <= -290; z += 10) mx = Math.max(mx, coastRoadX(z));
  L.naniFort = { x0: mx + 45, z0: -530, x1: mx + 45 + 210, z1: -300 };
  const mf = L.motiFort, nf = L.naniFort;
  L.lighthouse = { x: mf.x0 + 60, z: mf.z0 + 70 };
  L.bomJesus = { x: (mf.x0 + mf.x1) / 2 + 20, z: (mf.z0 + mf.z1) / 2 + 30 };
  L.ladySea = { x: (nf.x0 + nf.x1) / 2, z: (nf.z0 + nf.z1) / 2 };
  L.skyTower = { x: -2575, z: -3420 };
  L.ferris = { x: -2835, z: -4140 };
  L.stadium = { x: -1450, z: 1200 };
  L.hospital = { x: -1900, z: 650 };
  L.airport = { x0: -800, z0: 1950, x1: 1900, z1: 2650, runZ: 2300, runX0: -560, runX1: 1700 };
  L.helipad = { x: -360, z: 2470 };
  L.hideout = { x: 2250, z: -560 };
  L.jetty = { x: -2380, z: rivZ(-2380) - rivHalfW(-2380) - 20 };
  L.devkaBeach = { x: coastX(-3900) + 45, z: -3900 };
  L.jamporeBeach = { x: coastX(3300) + 45, z: 3300 };
  exRect(mf.x0 - 12, mf.z0 - 12, mf.x1 + 12, mf.z1 + 12, false, 'motiFort');
  exRect(nf.x0 - 12, nf.z0 - 12, nf.x1 + 12, nf.z1 + 12, false, 'naniFort');
  exCirc(LAKE.x, LAKE.z, LAKE.r + 35, true);
  exCirc(L.skyTower.x, L.skyTower.z, 46);
  exCirc(L.ferris.x, L.ferris.z, 52);
  exRect(L.stadium.x - 95, L.stadium.z - 80, L.stadium.x + 95, L.stadium.z + 80, true);
  exRect(L.airport.x0, L.airport.z0, L.airport.x1, L.airport.z1, true, 'airport');
  exRect(L.hideout.x - 90, L.hideout.z - 70, L.hideout.x + 90, L.hideout.z + 70, false, 'hideout');
  exRect(L.hospital.x - 30, L.hospital.z - 25, L.hospital.x + 30, L.hospital.z + 25);
  exRect(L.saltPans.x0, L.saltPans.z0, L.saltPans.x1, L.saltPans.z1, true, 'salt');
  exCirc(L.temple.x, L.temple.z, 60);
  addFlat(L.airport.x0, L.airport.z0, L.airport.x1, L.airport.z1, 80);
  { const V = ZONES.villa; for (let x = V.x0; x < V.x1; x += V.sp) for (let z = V.z0; z < V.z1; z += V.sp) addFlat(x + 10, z + 10, x + V.sp - 10, z + V.sp - 10, 18); }
  L.villas = { x: (ZONES.villa.x0 + ZONES.villa.x1) / 2, z: (ZONES.villa.z0 + ZONES.villa.z1) / 2 };
  addFlat(mf.x0, mf.z0, mf.x1, mf.z1, 40);
  addFlat(L.stadium.x - 95, L.stadium.z - 80, L.stadium.x + 95, L.stadium.z + 80, 40);
}

// ---------- road graph ----------
export const nodes = [], edges = [];
const nodeKey = new Map();
function addNode(x, z) {
  const k = Math.round(x) + ',' + Math.round(z);
  if (nodeKey.has(k)) return nodeKey.get(k);
  const y = terrainH(x, z) + 0.12;
  nodes.push({ x, z, y, e: [], elev: false });
  nodeKey.set(k, nodes.length - 1);
  return nodes.length - 1;
}
function adjacent(a, b) { for (const ei of nodes[a].e) { const e = edges[ei]; if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return true; } return false; }
function addEdge(a, b, w, lanes, type) {
  if (a === b || adjacent(a, b)) return -1;
  const A = nodes[a], B = nodes[b];
  const e = { a, b, w, lanes, type, len: Math.hypot(B.x - A.x, B.z - A.z), elev: false, zone: zoneAt((A.x + B.x) / 2, (A.z + B.z) / 2) };
  edges.push(e); A.e.push(edges.length - 1); B.e.push(edges.length - 1);
  return edges.length - 1;
}
function segLand(x0, z0, x1, z1, min = 0.9) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 12));
  for (let k = 0; k <= n; k++) { const t = k / n; if (terrainH(lerp(x0, x1, t), lerp(z0, z1, t)) < min) return false; if (excluded(lerp(x0, x1, t), lerp(z0, z1, t), 0, true)) return false; }
  return true;
}

export const ZONES = {
  nani: { x0: -2910, z0: -2690, x1: -910, z1: -270, sp: 110 },
  moti: { x0: -2250, z0: 300, x1: -450, z1: 1500, sp: 100 },
  devka: { x0: -2900, z0: -4800, x1: -1860, z1: -3000, sp: 130, spz: 120 },
  jampore: { x0: -2900, z0: 2620, x1: -1860, z1: 4180, sp: 130 },
  industry: { x0: 1000, z0: -2650, x1: 4250, z1: -400, sp: 250 },
  dabhel: { x0: 0, z0: -4400, x1: 2400, z1: -2800, sp: 200 },
  villa: { x0: -1800, z0: 2800, x1: -600, z1: 4000, sp: 200 },   // Jampore Villa Colony: mansions + villas on big walled lots
};
export function zoneAt(x, z) {
  for (const k in ZONES) { const Z = ZONES[k]; if (x >= Z.x0 - 20 && x <= Z.x1 + 20 && z >= Z.z0 - 20 && z <= Z.z1 + 20) return k; }
  if (L.motiFort && x > L.motiFort.x0 && x < L.motiFort.x1 && z > L.motiFort.z0 && z < L.motiFort.z1) return 'fort';
  return 'rural';
}

const MAJ = [
  { axis: 'x', v: -2250, a: -9000, b: 9000, w: 14, lanes: 2, bridge: true, name: 'Rajiv Gandhi Setu Road' },
  { axis: 'z', v: -1150, a: -2250, b: 4600, w: 14, lanes: 2, name: 'Vapi Road' },
  { axis: 'z', v: 900, a: -2250, b: 4500, w: 11, lanes: 1, name: 'Dalwada Road' },
  { axis: 'x', v: 1000, a: -8800, b: 8800, w: 11, lanes: 1, bridge: true, name: 'Kachigam Bridge Road' },
  { axis: 'x', v: 3500, a: -8800, b: 8800, w: 14, lanes: 2, bridge: true, name: 'Ring Road' },
  { axis: 'z', v: -3600, a: -2250, b: 4500, w: 10, lanes: 1, name: 'Devka-Dabhel Road' },
  { axis: 'z', v: -6000, a: -2250, b: 3500, w: 10, lanes: 1, name: 'Kolak Road' },
  { axis: 'z', v: 6000, a: -2250, b: 3500, w: 10, lanes: 1, name: 'Umbergaon Road' },
  { axis: 'z', v: -8400, a: -2250, b: 3500, w: 9, lanes: 1, name: 'North Farm Road' },
  { axis: 'z', v: 8200, a: -2250, b: 3500, w: 9, lanes: 1, name: 'South Farm Road' },
  { axis: 'z', v: 3400, a: -2250, b: 3500, w: 10, lanes: 1, name: 'Jampore Road' },
  { axis: 'z', v: 1800, a: -2250, b: 3500, w: 10, lanes: 1, name: 'Airport Road' },
];
function onMajor(A, B) {
  for (const m of MAJ) {
    if (m.axis === 'x' && Math.abs(A.x - m.v) < 1 && Math.abs(B.x - m.v) < 1 && Math.min(A.z, B.z) >= m.a - 1 && Math.max(A.z, B.z) <= m.b + 1) return true;
    if (m.axis === 'z' && Math.abs(A.z - m.v) < 1 && Math.abs(B.z - m.v) < 1 && Math.min(A.x, B.x) >= m.a - 1 && Math.max(A.x, B.x) <= m.b + 1) return true;
  }
  return false;
}

function grid(Z, w, lanes, type, drop = 0.06) {
  const spx = Z.sp, spz = Z.spz || Z.sp;
  const nx = Math.round((Z.x1 - Z.x0) / spx), nz = Math.round((Z.z1 - Z.z0) / spz);
  const id = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = Z.x0 + i * spx, z = Z.z0 + j * spz;
    if (terrainH(x, z) > 1.0 && !excluded(x, z, 12) && x > coastRoadX(z) + 50) id[j * (nx + 1) + i] = addNode(x, z);
  }
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const a = id[j * (nx + 1) + i]; if (a < 0) continue;
    const nb = [i < nx ? id[j * (nx + 1) + i + 1] : -1, j < nz ? id[(j + 1) * (nx + 1) + i] : -1];
    for (const b of nb) {
      if (b < 0) continue;
      const A = nodes[a], B = nodes[b];
      if (onMajor(A, B)) continue;
      if (R() < drop) continue;
      if (segLand(A.x, A.z, B.x, B.z, 1.0)) addEdge(a, b, w, lanes, type);
    }
  }
}

function chainBuild(pts, w, lanes, type, allowBridge) {
  // pts: [{x,z,id?}] ordered. creates nodes, bridges, edges. returns array of chains (node id arrays)
  const n = pts.length, water = pts.map((p) => terrainH(p.x, p.z) < 0.9), blocked = pts.map((p) => excluded(p.x, p.z, 0, true));
  const runLen = new Array(n).fill(0);
  for (let i = 0; i < n;) {
    if (!water[i]) { i++; continue; }
    let j = i; while (j < n && water[j]) j++;
    const len = Math.hypot(pts[Math.min(j, n - 1)].x - pts[Math.max(i - 1, 0)].x, pts[Math.min(j, n - 1)].z - pts[Math.max(i - 1, 0)].z);
    for (let k = i; k < j; k++) runLen[k] = len;
    i = j;
  }
  const okWater = (i) => water[i] && allowBridge && runLen[i] < 760;
  // distance to nearest bridge point along chain
  const dist = new Array(n).fill(1e9);
  let acc = 1e9;
  for (let i = 0; i < n; i++) { if (okWater(i)) acc = 0; else if (i > 0) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); dist[i] = acc; }
  acc = 1e9;
  for (let i = n - 1; i >= 0; i--) { if (okWater(i)) acc = 0; else if (i < n - 1) acc += Math.hypot(pts[i].x - pts[i + 1].x, pts[i].z - pts[i + 1].z); dist[i] = Math.min(dist[i], acc); }
  const chains = []; let cur = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (blocked[i] || (water[i] && !okWater(i))) { if (cur.length > 1) chains.push(cur); cur = []; continue; }
    const id = p.id !== undefined && p.id >= 0 ? p.id : addNode(p.x, p.z);
    const nd = nodes[id], th = terrainH(p.x, p.z);
    if (dist[i] < 120) { const y = Math.max(th + 0.12, 8 - dist[i] * 0.065); if (y > th + 0.4) { nd.y = y; nd.elev = true; } }
    if (cur.length) addEdge(cur[cur.length - 1], id, w, lanes, type);
    cur.push(id);
  }
  if (cur.length > 1) chains.push(cur);
  return chains;
}

function buildMajor(m) {
  const list = [];
  nodes.forEach((nd, i) => {
    const c = m.axis === 'x' ? nd.x : nd.z, s = m.axis === 'x' ? nd.z : nd.x;
    if (Math.abs(c - m.v) < 1 && s >= m.a - 1 && s <= m.b + 1) list.push({ s, id: i });
  });
  const ex = list.slice();
  for (let s = m.a; s <= m.b; s += 50) if (!ex.some((e) => Math.abs(e.s - s) < 30)) list.push({ s, id: -1 });
  list.sort((a, b) => a.s - b.s);
  const pts = list.map((e) => (m.axis === 'x' ? { x: m.v, z: e.s, id: e.id } : { x: e.s, z: m.v, id: e.id }));
  return chainBuild(pts, m.w, m.lanes, 'major', m.bridge);
}

function connectChain(chain, maxD, w) {
  const set = new Set(chain);
  const used = new Set();
  for (const ci of chain) {
    const C = nodes[ci]; let best = -1, bd = maxD;
    for (let i = 0; i < nodes.length; i++) {
      if (set.has(i) || used.has(i)) continue;
      const d = Math.hypot(nodes[i].x - C.x, nodes[i].z - C.z);
      if (d < bd && nodes[i].e.length < 4) { bd = d; best = i; }
    }
    if (best >= 0 && segLand(C.x, C.z, nodes[best].x, nodes[best].z, 0.9) && !nodes[best].elev && !C.elev) { if (addEdge(ci, best, w, 1, 'link') >= 0) used.add(best); }
  }
}

function ghatRoad(pts) {
  const n = pts.length, ys = pts.map((p) => terrainH(p.x, p.z));
  for (let it = 0; it < 6; it++) for (let i = 1; i < n - 1; i++) ys[i] = (ys[i - 1] + ys[i] * 2 + ys[i + 1]) / 4;
  ys[n - 1] = terrainH(pts[n - 1].x, pts[n - 1].z);
  const g = 0.085;
  for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); ys[i] = clamp(ys[i], ys[i - 1] - g * d, ys[i - 1] + g * d); }
  for (let i = n - 2; i >= 0; i--) { const d = Math.hypot(pts[i].x - pts[i + 1].x, pts[i].z - pts[i + 1].z); ys[i] = clamp(ys[i], ys[i + 1] - g * d, ys[i + 1] + g * d); }
  // cut & fill the terrain grid along the road
  const half = 6, band = 22;
  for (let i = 0; i < n - 1; i++) {
    const A = pts[i], B = pts[i + 1];
    const i0 = Math.max(0, Math.floor((Math.min(A.x, B.x) - band + HALF) / CELL)), i1 = Math.min(N, Math.ceil((Math.max(A.x, B.x) + band + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(A.z, B.z) - band + HALF) / CELL)), j1 = Math.min(N, Math.ceil((Math.max(A.z, B.z) + band + HALF) / CELL));
    const dx = B.x - A.x, dz = B.z - A.z, l2 = dx * dx + dz * dz;
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
      const x = -HALF + ii * CELL, z = -HALF + j * CELL;
      const t = clamp(((x - A.x) * dx + (z - A.z) * dz) / l2, 0, 1), d = Math.hypot(A.x + dx * t - x, A.z + dz * t - z);
      if (d > band) continue;
      const yr = lerp(ys[i], ys[i + 1], t) - 0.15, k = ii + j * W1, w = smooth(band, half, d);
      if (w > (H[k + 0] === undefined ? 0 : 0)) H[k] = lerp(H[k], yr, w);
    }
  }
  const ids = pts.map((p) => addNode(p.x, p.z));
  for (let i = 0; i < ids.length; i++) nodes[ids[i]].y = terrainH(pts[i].x, pts[i].z) + 0.12;
  for (let i = 1; i < ids.length; i++) addEdge(ids[i - 1], ids[i], 10, 1, 'major');
  L.ghatEnd = { x: pts[n - 1].x, z: pts[n - 1].z };
}
export function waterLevelAt(x, z) {
  const dl = Math.hypot(x - PLAT.lx, z - PLAT.lz);
  if (dl < PLAT.lr + 30 || (x < PLAT.lx && x > PLAT.x - PLAT.r - 6 && Math.abs(z - PLAT.z) < 22)) return PLAT.water;
  return 0;
}

export const villages = [];
function village(cx, cz) {
  if (excluded(cx, cz, 120) || terrainH(cx, cz) < 1.5) return;
  const sp = 70, ids = [];
  const nx = ri(2, 3), nz = ri(2, 3);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = cx + (i - nx / 2) * sp, z = cz + (j - nz / 2) * sp;
    ids.push(terrainH(x, z) > 1 && !excluded(x, z, 10) ? addNode(x, z) : -1);
  }
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const a = ids[j * (nx + 1) + i]; if (a < 0) continue;
    if (i < nx) { const b = ids[j * (nx + 1) + i + 1]; if (b >= 0 && segLand(nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z)) addEdge(a, b, 6, 1, 'village'); }
    if (j < nz) { const b = ids[(j + 1) * (nx + 1) + i]; if (b >= 0 && segLand(nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z)) addEdge(a, b, 6, 1, 'village'); }
  }
  const valid = ids.filter((i) => i >= 0); if (!valid.length) return;
  // connect to nearest major node
  let best = -1, bd = 900, from = valid[0];
  for (const vi of valid) for (let i = 0; i < nodes.length; i++) {
    if (valid.includes(i)) continue;
    const nd = nodes[i]; if (nd.e.length === 0) continue;
    const d = Math.hypot(nd.x - nodes[vi].x, nd.z - nodes[vi].z);
    if (d < bd && edges[nd.e[0]].type === 'major') { bd = d; best = i; from = vi; }
  }
  if (best >= 0) {
    const A = nodes[from], B = nodes[best], n = Math.max(1, Math.round(bd / 80));
    const pts = []; for (let k = 0; k <= n; k++) pts.push({ x: lerp(A.x, B.x, k / n), z: lerp(A.z, B.z, k / n), id: k === 0 ? from : k === n ? best : -1 });
    if (segLand(A.x, A.z, B.x, B.z)) chainBuild(pts, 7, 1, 'village', false);
  }
  villages.push({ x: cx, z: cz });
}

function fortLanes(F, sp) {
  const Z = { x0: F.x0 + 35, z0: F.z0 + 35, x1: F.x1 - 35, z1: F.z1 - 35 };
  const nx = Math.max(1, Math.round((Z.x1 - Z.x0) / sp)), nz = Math.max(1, Math.round((Z.z1 - Z.z0) / sp));
  const ids = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) ids.push(addNode(Z.x0 + i * (Z.x1 - Z.x0) / nx, Z.z0 + j * (Z.z1 - Z.z0) / nz));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const a = ids[j * (nx + 1) + i];
    if (i < nx) addEdge(a, ids[j * (nx + 1) + i + 1], 7, 1, 'fort');
    if (j < nz) addEdge(a, ids[(j + 1) * (nx + 1) + i], 7, 1, 'fort');
  }
  return { ids, nx, nz };
}

export const gates = [];
function gateTo(fromId, x, z, w) {
  // connect a fort node out to the nearest outside node in the given direction
  let best = -1, bd = 400; const A = nodes[fromId];
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i]; if (nd.e.length === 0 || i === fromId) continue;
    if (edges[nd.e[0]].type === 'fort') continue;
    const d = Math.hypot(nd.x - x, nd.z - z);
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) return;
  const B = nodes[best];
  const mid = addNode(x, z);
  addEdge(fromId, mid, w, 1, 'link'); addEdge(mid, best, w, 1, 'link');
  gates.push({ x, z, from: A, to: B });
}

// ---------- spatial hash of edges ----------
export const edgeHash = new Map();
const EH = 60;
function hashEdges() {
  edges.forEach((e, i) => {
    const A = nodes[e.a], B = nodes[e.b];
    const x0 = Math.floor((Math.min(A.x, B.x) - e.w) / EH), x1 = Math.floor((Math.max(A.x, B.x) + e.w) / EH);
    const z0 = Math.floor((Math.min(A.z, B.z) - e.w) / EH), z1 = Math.floor((Math.max(A.z, B.z) + e.w) / EH);
    if (A.elev || B.elev) e.elev = true;
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const k = gx * 100000 + gz; if (!edgeHash.has(k)) edgeHash.set(k, []); edgeHash.get(k).push(i); }
  });
}
export function markSidewalks() { for (const e of edges) e.side = !e.elev && ['nani', 'moti', 'devka', 'jampore'].includes(e.zone) && (e.type === 'street' || e.type === 'major' || e.type === 'link'); }
export function edgesNear(x, z) { return edgeHash.get(Math.floor(x / EH) * 100000 + Math.floor(z / EH)) || []; }
export function nearestRoad(x, z) {
  let best = null, bd = 1e9;
  for (let r = 0; r <= 2 && !best; r++) for (let gx = -r; gx <= r; gx++) for (let gz = -r; gz <= r; gz++) {
    const list = edgeHash.get((Math.floor(x / EH) + gx) * 100000 + Math.floor(z / EH) + gz); if (!list) continue;
    for (const ei of list) {
      const e = edges[ei], A = nodes[e.a], B = nodes[e.b];
      const dx = B.x - A.x, dz = B.z - A.z, l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - A.x) * dx + (z - A.z) * dz) / l2, 0, 1);
      const d = Math.hypot(A.x + dx * t - x, A.z + dz * t - z);
      if (d < bd) { bd = d; best = { e: ei, t, d, x: A.x + dx * t, z: A.z + dz * t, ang: Math.atan2(dx, dz) }; }
    }
  }
  return best;
}

// ---------- occupancy (4m grid) ----------
const OC = 5, ON = (2 * HALF) / OC;
export const occ = new Uint8Array(ON * ON);
const oi = (x, z) => { const i = Math.floor((x + HALF) / OC), j = Math.floor((z + HALF) / OC); return i < 0 || j < 0 || i >= ON || j >= ON ? -1 : i + j * ON; };
export function occFree(x0, z0, x1, z1) {
  for (let z = z0; z <= z1 + 0.01; z += OC) for (let x = x0; x <= x1 + 0.01; x += OC) { const k = oi(Math.min(x, x1), Math.min(z, z1)); if (k < 0 || occ[k]) return false; }
  return true;
}
export function occMark(x0, z0, x1, z1, v = 1) { for (let z = z0; z <= z1 + 0.01; z += OC) for (let x = x0; x <= x1 + 0.01; x += OC) { const k = oi(Math.min(x, x1), Math.min(z, z1)); if (k >= 0) occ[k] = v; } }
export const occAt = (x, z) => { const k = oi(x, z); return k < 0 ? 1 : occ[k]; };
function rasterRoads() {
  for (const e of edges) {
    const A = nodes[e.a], B = nodes[e.b], r = e.w / 2 + 2.5, n = Math.ceil(e.len / 2);
    for (let k = 0; k <= n; k++) {
      const x = lerp(A.x, B.x, k / n), z = lerp(A.z, B.z, k / n);
      for (let dz = -r; dz <= r; dz += OC) for (let dx = -r; dx <= r; dx += OC) if (dx * dx + dz * dz <= r * r + 4) { const q = oi(x + dx, z + dz); if (q >= 0) occ[q] = 2; }
    }
  }
}

// ---------- buildings ----------
export const buildings = []; // {x0,z0,x1,z1,y,h,style,color,seed,roof}
const PAL = { warm: [0xf2e3c6, 0xe9d59a, 0xf4f1e8, 0xd9e6ef, 0xf0c8b4, 0xe8b9c9, 0xc9e4ca, 0xf3d36b, 0xe6a86c, 0xb8d0e8, 0xffffff, 0xddd5c8, 0xc4b49a, 0xa8d8d0, 0xf5b971],
  colonial: [0xf3d36b, 0xf6e7b0, 0xffffff, 0xf2c36b, 0xe8e2d0, 0x9fc5e8], ind: [0x9aa3a8, 0xb8b8b0, 0x8fa0b5, 0xc0b8a8, 0xa9b7a0], hotel: [0xffffff, 0xe8eef2, 0xd6e2ea, 0xf0e6d8, 0xc7d6e0] };
export function addBuilding(x0, z0, x1, z1, h, style, color, roof = 0) {
  const y = Math.min(terrainH(x0, z0), terrainH(x1, z0), terrainH(x0, z1), terrainH(x1, z1), terrainH((x0 + x1) / 2, (z0 + z1) / 2)) - 0.4;
  buildings.push({ x0, z0, x1, z1, y, h, style, color, seed: R(), roof });
  occMark(x0, z0, x1, z1, 1);
}
function zoneSpec(zone, nearMajor) {
  switch (zone) {
    case 'nani': return { bw: [8, 18], bd: [10, 18], fl: nearMajor ? [2, 6] : [1, 4], style: R() < 0.35 ? 1 : 0, pal: PAL.warm, roof: 0.12, gap: [0, 2] };
    case 'moti': return { bw: [9, 20], bd: [10, 18], fl: [1, 3], style: R() < 0.5 ? 4 : 0, pal: R() < 0.6 ? PAL.colonial : PAL.warm, roof: 0.45, gap: [0, 4] };
    case 'devka': return { bw: [12, 30], bd: [12, 24], fl: [2, 8], style: R() < 0.5 ? 2 : 0, pal: R() < 0.5 ? PAL.hotel : PAL.warm, roof: 0.1, gap: [2, 8] };
    case 'jampore': return { bw: [8, 18], bd: [8, 16], fl: [1, 3], style: 0, pal: PAL.warm, roof: 0.5, gap: [2, 9] };
    case 'industry': return { bw: [30, 70], bd: [25, 55], fl: [3, 4], style: 3, pal: PAL.ind, roof: 0, gap: [6, 20] };
    case 'dabhel': return { bw: [14, 40], bd: [14, 35], fl: [1, 4], style: R() < 0.5 ? 3 : 0, pal: R() < 0.5 ? PAL.ind : PAL.warm, roof: 0.1, gap: [4, 14] };
    case 'fort': return { bw: [12, 26], bd: [12, 20], fl: [1, 3], style: 4, pal: PAL.colonial, roof: 0.6, gap: [3, 10] };
    default: return { bw: [7, 13], bd: [7, 12], fl: [1, 2], style: 0, pal: PAL.warm, roof: 0.7, gap: [3, 14] };
  }
}
function lotsAlong(e) {
  const A = nodes[e.a], B = nodes[e.b];
  if (e.elev || e.zone === 'villa') return;
  const ax = Math.abs(A.x - B.x) < 0.5, az = Math.abs(A.z - B.z) < 0.5; if (!ax && !az) return;
  for (const side of [-1, 1]) {
    let t = 7 + rr(0, 3);
    while (t < e.len - 7) {
      const sp = zoneSpec(e.zone === 'rural' && e.type === 'village' ? 'village' : e.zone, e.type === 'major');
      if (e.type === 'link' && R() < 0.7) { t += 20; continue; }
      if (e.zone === 'rural' && e.type !== 'village' && R() < 0.7) { t += 25; continue; }
      const bw = rr(sp.bw[0], sp.bw[1]), bd = rr(sp.bd[0], sp.bd[1]);
      if (t + bw > e.len - 6) break;
      const off = e.w / 2 + 3, s0 = t, s1 = t + bw;
      let x0, x1, z0, z1;
      if (ax) { const zs = Math.min(A.z, B.z); z0 = zs + s0; z1 = zs + s1; const xc = A.x + side * (off + bd / 2); x0 = xc - bd / 2; x1 = xc + bd / 2; }
      else { const xs = Math.min(A.x, B.x); x0 = xs + s0; x1 = xs + s1; const zc = A.z + side * (off + bd / 2); z0 = zc - bd / 2; z1 = zc + bd / 2; }
      if (occFree(x0, z0, x1, z1) && terrainH(x0, z0) > 1.2 && terrainH(x1, z1) > 1.2 && terrainH(x0, z1) > 1.2 && terrainH(x1, z0) > 1.2 && !excluded((x0 + x1) / 2, (z0 + z1) / 2, 4)) {
        let fl = ri(sp.fl[0], sp.fl[1]); if (R() < 0.35) fl = Math.max(sp.fl[0], fl - 1);
        const h = sp.style === 3 ? rr(8, 15) : fl * 3.3 + 0.6;
        addBuilding(x0, z0, x1, z1, h, sp.style, pick(sp.pal), sp.style !== 3 && sp.style !== 2 && R() < sp.roof ? 1 : 0);
      }
      t += bw + rr(sp.gap[0], sp.gap[1]);
    }
  }
}
function fillZone(Z, tries, zone) {
  for (let k = 0; k < tries; k++) {
    const x = rr(Z.x0, Z.x1), z = rr(Z.z0, Z.z1);
    const sp = zoneSpec(zone, false);
    const w = rr(sp.bw[0], sp.bw[1]) * 0.8, d = rr(sp.bd[0], sp.bd[1]) * 0.8;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    if (!occFree(x0 - 2, z0 - 2, x1 + 2, z1 + 2) || terrainH(x, z) < 1.5 || excluded(x, z, 8)) continue;
    const fl = ri(sp.fl[0], Math.max(sp.fl[0], sp.fl[1] - 1));
    addBuilding(x0, z0, x1, z1, sp.style === 3 ? rr(7, 12) : fl * 3.3 + 0.6, sp.style, pick(sp.pal), sp.style === 3 ? 0 : R() < sp.roof + 0.15 ? 1 : 0);
  }
}
// ---------- Jampore Villa Colony: walled estates (one grand mansion or four villas per block) ----------
export const estates = [];   // {x0,z0,x1,z1,cx,cz,y,kind,style,face,seed,house:{x0,z0,x1,z1,h,floors},pool:{...},color,trim}
const estateCars = [];
function placeEstates() {
  const V = ZONES.villa, rng = mulberry32(4242), rr2 = (a, b) => a + (b - a) * rng();
  const wallC = [0xf4efe6, 0xefe6d2, 0xe9e4dc, 0xf6f1ea], colonial = [0xf3d36b, 0xf2c36b, 0xf6e7b0, 0x9fc5e8, 0xf0b9a0, 0xffffff];
  let bi = 0;
  for (let i = 0; i * V.sp < V.x1 - V.x0; i++) for (let j = 0; j * V.sp < V.z1 - V.z0; j++, bi++) {
    const bx0 = V.x0 + i * V.sp + 9, bz0 = V.z0 + j * V.sp + 9, bx1 = bx0 + V.sp - 18, bz1 = bz0 + V.sp - 18;
    const palace = i === 3 && j === 1, four = !palace && rng() < 0.42;
    const lots = four ? [[bx0, bz0, (bx0 + bx1) / 2 - 2, (bz0 + bz1) / 2 - 2], [(bx0 + bx1) / 2 + 2, bz0, bx1, (bz0 + bz1) / 2 - 2], [bx0, (bz0 + bz1) / 2 + 2, (bx0 + bx1) / 2 - 2, bz1], [(bx0 + bx1) / 2 + 2, (bz0 + bz1) / 2 + 2, bx1, bz1]] : [[bx0, bz0, bx1, bz1]];
    for (let k = 0; k < lots.length; k++) {
      const [x0, z0, x1, z1] = lots[k], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, kind = palace ? 'palace' : four ? 'villa' : 'mansion';
      const face = four ? (k < 2 ? -1 : 1) : rng() < 0.5 ? -1 : 1;           // front faces -z or +z (always onto a street)
      const style = palace ? 'colonial' : rng() < (four ? 0.25 : 0.45) ? 'colonial' : 'modern';
      const Lw = x1 - x0, Ld = z1 - z0;
      const W = palace ? 74 : kind === 'mansion' ? rr2(42, 56) : rr2(18, 24), D = palace ? 36 : kind === 'mansion' ? rr2(24, 30) : rr2(12, 15);
      const floors = palace ? 3 : kind === 'mansion' ? (rng() < 0.5 ? 3 : 2) : 2;
      const hx = cx + (four ? 0 : rr2(-10, 10)), backZ = cz - face * (Ld / 2 - (four ? 10 : 26));     // house sits toward the back of the lot
      const hz = backZ + face * D / 2;
      const house = { x0: hx - W / 2, z0: hz - D / 2, x1: hx + W / 2, z1: hz + D / 2, h: floors * 3.7 + 0.6, floors };
      const pl = palace ? { w: 46, d: 14 } : kind === 'mansion' ? { w: rr2(20, 28), d: rr2(8, 11) } : { w: rr2(8, 11), d: 4.5 };
      const pz = hz + face * (D / 2 + (four ? 7 : 16) + pl.d / 2);
      const pool = { x0: hx - pl.w / 2, z0: pz - pl.d / 2, x1: hx + pl.w / 2, z1: pz + pl.d / 2 };
      let y = -1e9; for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) y = Math.max(y, terrainH(x0 + (x1 - x0) * a / 4, z0 + (z1 - z0) * b / 4)); y += 0.08;
      const e = { x0, z0, x1, z1, cx, cz, y, kind, style, face, seed: rng(), house, pool, bi, color: style === 'colonial' ? colonial[Math.floor(rng() * colonial.length)] : wallC[Math.floor(rng() * wallC.length)], tennis: kind === 'mansion' && rng() < 0.5, name: palace ? 'Sagar Mahal' : null };
      estates.push(e);
      occMark(x0, z0, x1, z1, 1);
      // the house is a real building: collision, minimap, walk-in interior (drawn by estates.js, not the box renderer)
      buildings.push({ x0: house.x0, z0: house.z0, x1: house.x1, z1: house.z1, y: y + 0.6, h: house.h - 0.6, style: 5, color: e.color, seed: e.seed, roof: 0, hidden: true, estate: estates.length - 1 });
      // palms along the compound wall and beside the pool, flowering trees on the lawn
      const step = four ? 11 : 13;
      for (let x = x0 + 5; x < x1 - 4; x += step) for (const zz of [z0 + 4, z1 - 4]) if (Math.abs(x - cx) > 9 || zz * face < cz * face) trees.palm.push({ x, z: zz, y, s: rr2(0.8, 1.15), r: rng() * 6.28, lean: rr2(-0.1, 0.1) });
      for (let z = z0 + 5 + step; z < z1 - 4 - step / 2; z += step) for (const xx of [x0 + 4, x1 - 4]) trees.palm.push({ x: xx, z, y, s: rr2(0.8, 1.15), r: rng() * 6.28, lean: rr2(-0.1, 0.1) });
      for (const sx of [-1, 1]) trees.palm.push({ x: hx + sx * (pl.w / 2 + 3), z: pz, y, s: rr2(0.85, 1.05), r: rng() * 6.28, lean: rr2(-0.12, 0.12) });
      if (!four) for (let n = 0; n < 4; n++) trees.round.push({ x: cx + rr2(-Lw * 0.4, Lw * 0.4), z: cz + face * rr2(Ld * 0.22, Ld * 0.36), y, s: rr2(0.6, 0.9), r: rng() * 6.28, lean: 0 });
      if (rng() < (palace ? 1 : kind === 'mansion' ? 0.75 : 0.4)) estateCars.push({ x: hx + W / 2 + 4, z: hz + face * (D / 2 + 3.5), ang: face > 0 ? 0 : Math.PI, kind: pick(['super', 'gt', 'muscle']), color: pick([0xffffff, 0x111111, 0xd01020, 0x1a8cff, 0xffd400, 0x22cc66, 0x8a8f98]) });
    }
  }
}
export const towers = [];
function placeTowers() {
  const spots = [[-2410, -3170, 26, 98], [-2120, -3280, 24, 84], [-2380, -4380, 28, 72], [-2165, -1060, 22, 66], [-2335, -1240, 22, 58], [-2160, -700, 20, 52], [-2110, 990, 22, 46], [-1880, -3780, 24, 60]];
  for (const [x, z, s, h] of spots) {
    const x0 = x - s / 2, x1 = x + s / 2, z0 = z - s / 2, z1 = z + s / 2;
    if (!occFree(x0, z0, x1, z1)) { continue; }
    addBuilding(x0, z0, x1, z1, h, 2, pick(PAL.hotel), 0);
    towers.push({ x, z, h });
  }
}

// ---------- vegetation / props ----------
export const trees = { palm: [], cas: [], round: [], teak: [], bamboo: [], bush: [] };
export function isJungle(x, z) { return x > 4100 && x < 7600 && z > -7600 && z < 8200 && Math.hypot(x - PLAT.x, z - PLAT.z) > PLAT.r - 30; }
function plantTrees() {
  const tryAdd = (arr, x, z, sMin, sMax) => {
    const h = terrainH(x, z), o = occAt(x, z); if (h < 0.6 || (o && o !== 3)) return false;
    if (waterLevelAt(x, z) > 1 && h < PLAT.water + 0.5) return false;
    arr.push({ x, z, y: h, s: rr(sMin, sMax), r: R() * Math.PI * 2, lean: rr(-0.18, 0.18) }); return true;
  };
  for (let z = -9200; z < 9200; z += 6) {
    const c = coastX(z), jam = z > 2300 && z < 4500, dev = z < -2900 && z > -4900;
    const n = jam ? 3 : dev ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const d = rr(45, 330);
      if (jam && R() < 0.65) tryAdd(trees.cas, c + rr(55, 210), z + rr(-3, 3), 0.8, 1.3);
      else if (R() < 0.6) tryAdd(trees.palm, c + d, z + rr(-3, 3), 0.75, 1.25);
    }
  }
  for (let x = -2900; x < RIVER_END - 100; x += 9) for (const sg of [-1, 1]) if (R() < 0.55) { const z = rivZ(x) + sg * (rivHalfW(x) + rr(30, 90)); tryAdd(R() < 0.6 ? trees.palm : trees.round, x, z, 0.8, 1.3); }
  for (let x = -2900; x < KOLAK_END; x += 7) for (const sg of [-1, 1]) if (R() < 0.7) { const z = kolZ(x) + sg * (kolHalfW(x) + rr(8, 40)); tryAdd(trees.bush, x, z, 0.8, 1.6); }
  for (let a = 0; a < Math.PI * 2; a += 0.05) { const r = LAKE.r + rr(25, 60); tryAdd(trees.palm, LAKE.x + Math.cos(a) * r, LAKE.z + Math.sin(a) * r, 0.8, 1.2); }
  for (let a = 0; a < Math.PI * 2; a += 0.35) tryAdd(trees.palm, LAKE.x + Math.cos(a) * 25, LAKE.z + Math.sin(a) * 25, 0.7, 1.0);
  for (let k = 0; k < 900; k++) { const a = R() * 6.283, r = Math.sqrt(R()) * (ISLAND.r - 60); tryAdd(R() < 0.7 ? trees.palm : trees.round, ISLAND.x + Math.cos(a) * r, ISLAND.z + Math.sin(a) * r, 0.8, 1.3); }
  // countryside + town gaps
  for (let k = 0; k < 52000; k++) {
    const x = rr(-3100, 4300), z = rr(-9200, 9200), zn = zoneAt(x, z);
    const town = zn === 'nani' || zn === 'moti' || zn === 'devka' || zn === 'jampore';
    if (town && R() < 0.5) continue;
    if (zn === 'industry' && R() < 0.85) continue;
    const f = fbm(x * 0.002, z * 0.002, 3);
    if (!town && f < 0.42 && R() < 0.75) continue;
    tryAdd(R() < 0.45 ? trees.palm : R() < 0.8 ? trees.round : trees.bush, x, z, 0.7, 1.4);
  }
  // the jungle (teak, banyan, bamboo, undergrowth)
  for (let k = 0; k < 150000; k++) {
    const x = rr(4100, 7600), z = rr(-7600, 8200);
    if (!isJungle(x, z)) continue;
    const f = fbm(x * 0.003 + 2, z * 0.003, 3); if (f < 0.32) continue;
    const h = terrainH(x, z); if (h > 700) continue;
    const r = R();
    if (r < 0.42) tryAdd(trees.teak, x, z, 0.8, 1.5); else if (r < 0.62) tryAdd(trees.round, x, z, 1.1, 1.9);
    else if (r < 0.8) tryAdd(trees.bamboo, x, z, 0.8, 1.3); else tryAdd(trees.bush, x, z, 0.8, 1.6);
  }
  // mountain scrub + plateau groves
  for (let k = 0; k < 30000; k++) {
    const x = rr(6800, 9600), z = rr(-9000, 9000), h = terrainH(x, z);
    if (h < 40 || h > 1050) continue;
    const slope = Math.abs(terrainH(x + 6, z) - h) + Math.abs(terrainH(x, z + 6) - h); if (slope > 7) continue;
    tryAdd(h > 650 ? trees.bush : R() < 0.5 ? trees.teak : trees.bush, x, z, 0.7, 1.3);
  }
  for (let k = 0; k < 2500; k++) { const a = R() * 6.283, r = PLAT.lr + 40 + R() * 280; tryAdd(R() < 0.4 ? trees.round : R() < 0.6 ? trees.bamboo : trees.teak, PLAT.lx + Math.cos(a) * r, PLAT.lz + Math.sin(a) * r, 0.9, 1.5); }
  for (const e of edges) {
    if (e.type !== 'major' || e.elev) continue;
    const A = nodes[e.a], B = nodes[e.b], dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len;
    for (let t = 10; t < e.len - 10; t += 24) for (const sg of [-1, 1]) if (R() < 0.5) tryAdd(trees.round, A.x + dx * t + dz * sg * (e.w / 2 + 4.5), A.z + dz * t - dx * sg * (e.w / 2 + 4.5), 0.7, 1.1);
  }
}
export const lights = []; // street lights {x,z,y,ang}
function placeLights() {
  for (const e of edges) {
    if (!(e.type === 'major' || e.type === 'coast' || e.type === 'fort')) continue;
    const A = nodes[e.a], B = nodes[e.b], dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len;
    let s = 1;
    for (let t = 15; t < e.len - 8; t += 38) {
      s = -s; const off = e.w / 2 + 1.2;
      const x = A.x + dx * t + dz * s * off, z = A.z + dz * t - dx * s * off;
      const y = e.elev ? lerp(A.y, B.y, t / e.len) : terrainH(x, z);
      lights.push({ x, z, y, ang: Math.atan2(-dz * s, dx * s) });
    }
  }
}

// electric poles + overhead wires along town streets and village lanes (the classic Indian streetscape)
export const poles = [], wires = [];
function placePoles() {
  edges.forEach((e, ei) => {
    if (e.elev || e.len < 30 || !(e.type === 'street' || e.type === 'village' || (e.type === 'major' && e.zone !== 'rural'))) return;
    if (e.zone === 'villa' || e.zone === 'fort') return;
    const A = nodes[e.a], B = nodes[e.b], dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len, s = ei % 2 ? 1 : -1, off = e.w / 2 + 1.7;
    let prev = -1;
    for (let t = 6; t < e.len - 4; t += 31) {
      const x = A.x + dx * t + dz * s * off, z = A.z + dz * t - dx * s * off, y = terrainH(x, z);
      if (y < 0.6 || excluded(x, z, 2)) { prev = -1; continue; }
      poles.push({ x, z, y, ang: Math.atan2(dx, dz), tr: R() < 0.12 });
      if (prev >= 0) wires.push([prev, poles.length - 1]); prev = poles.length - 1;
    }
  });
}
// ---------- ramps (stunts) ----------
export const ramps = [];
function addRamp(x, z, ang, w, len, h) { ramps.push({ x, z, ang, w, len, h, y: terrainH(x, z), c: Math.cos(ang), s: Math.sin(ang) }); }

// ---------- spawns ----------
export const spawns = {};

export async function buildMap(progress) {
  if (!H) setRes(1024);
  computeLandmarks();
  for (let j = 0; j <= N; j++) { for (let i = 0; i <= N; i++) H[i + j * W1] = rawHeight(-HALF + i * CELL, -HALF + j * CELL); if (j % 64 === 0) await progress('Shaping Daman coastline', j / N); }
  // grids
  grid(ZONES.nani, 9, 1, 'street', 0.08);
  grid(ZONES.moti, 9, 1, 'street', 0.06);
  grid(ZONES.devka, 10, 1, 'street', 0.05);
  grid(ZONES.jampore, 8, 1, 'street', 0.12);
  grid(ZONES.industry, 11, 1, 'street', 0.05);
  grid(ZONES.dabhel, 8, 1, 'street', 0.15);
  grid(ZONES.villa, 9, 1, 'street', 0);
  await progress('Laying roads', 0.2);
  const majorChains = [];
  for (const m of MAJ) majorChains.push(...buildMajor(m));
  // coastal highways
  const cn = [], cs = [];
  for (let z = -8900; z <= -300; z += 55) cn.push({ x: coastRoadX(z), z });
  for (let z = 330; z <= 8900; z += 55) cs.push({ x: coastRoadX(z), z });
  const coastChains = [...chainBuild(cn, 12, 1, 'coast', true), ...chainBuild(cs, 12, 1, 'coast', true)];
  // ghat road up to the plateau (Naag Sarovar), grade-limited
  {
    const pts = [], wp = [[4600, -1150], [5000, -1080], [5450, -900], [5800, -820], [6150, -720], [6450, -560], [PLAT.x - 60, PLAT.z - PLAT.r + 60]];
    for (let k = 0; k < wp.length - 1; k++) { const [ax, az] = wp[k], [bx, bz] = wp[k + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 40)); for (let i = 0; i < n; i++) pts.push({ x: lerp(ax, bx, i / n), z: lerp(az, bz, i / n) }); }
    pts.push({ x: wp[wp.length - 1][0], z: wp[wp.length - 1][1] });
    ghatRoad(pts);
  }
  for (const c of coastChains) connectChain(c, 95, 9);
  await progress('Connecting villages', 0.4);
  const vs = [[1900, 600], [2900, 1400], [1800, 3600], [3900, 3000], [-300, 3700], [2600, 4400], [4300, 1900], [-600, -3400], [300, 300], [4200, -3300], [-1300, 4950], [-200, 4500], [4400, 4300], [2400, 2600],
    [-2300, -7900], [-1200, -6800], [600, -7600], [2200, -6600], [3300, -8200], [-1500, -8900], [-1800, 6900], [-400, 7600], [1300, 6800], [2600, 7900], [-1000, 8700], [3600, 6600], [-2600, 7600], [4100, -5200]];
  for (const [x, z] of vs) village(x + rr(-60, 60), z + rr(-60, 60));
  // forts
  const mf = fortLanes(L.motiFort, 75), nf = fortLanes(L.naniFort, 70);
  const midRowM = Math.floor(mf.nz / 2);
  gateTo(mf.ids[midRowM * (mf.nx + 1) + mf.nx], L.motiFort.x1 + 25, nodes[mf.ids[midRowM * (mf.nx + 1) + mf.nx]].z, 8);
  gateTo(mf.ids[midRowM * (mf.nx + 1)], L.motiFort.x0 - 25, nodes[mf.ids[midRowM * (mf.nx + 1)]].z, 8);
  gateTo(nf.ids[Math.floor(nf.nz / 2) * (nf.nx + 1) + nf.nx], L.naniFort.x1 + 25, nodes[nf.ids[Math.floor(nf.nz / 2) * (nf.nx + 1) + nf.nx]].z, 8);
  gateTo(nf.ids[nf.nx], nodes[nf.ids[nf.nx]].x, L.naniFort.z0 - 25, 8);
  hashEdges();
  // remove orphan nodes from consideration in traffic (degree 0)
  await progress('Planning buildings', 0.5);
  rasterRoads();
  // reserve landmark areas
  const mfr = L.motiFort, nfr = L.naniFort;
  occMark(mfr.x0 - 6, mfr.z0 - 6, mfr.x1 + 6, mfr.z0 + 6); occMark(mfr.x0 - 6, mfr.z1 - 6, mfr.x1 + 6, mfr.z1 + 6);
  occMark(mfr.x0 - 6, mfr.z0, mfr.x0 + 6, mfr.z1); occMark(mfr.x1 - 6, mfr.z0, mfr.x1 + 6, mfr.z1);
  occMark(nfr.x0 - 6, nfr.z0 - 6, nfr.x1 + 6, nfr.z1 + 6);
  occMark(L.lighthouse.x - 9, L.lighthouse.z - 9, L.lighthouse.x + 9, L.lighthouse.z + 9);
  occMark(L.bomJesus.x - 20, L.bomJesus.z - 35, L.bomJesus.x + 20, L.bomJesus.z + 40);
  for (const ex of EXCL) { if (ex.r !== undefined) occMark(ex.x - ex.r, ex.z - ex.r, ex.x + ex.r, ex.z + ex.r); else if (ex.tag !== 'motiFort' && ex.tag !== 'naniFort') occMark(ex.x0, ex.z0, ex.x1, ex.z1); }
  // beaches: no buildings on sand
  for (let z = -9996; z < 9996; z += 5) { const c = coastX(z); occMark(c - 400, z, c + 120, z, 3); }
  for (let x = -3300; x < RIVER_END + 60; x += 5) { const rz = rivZ(x), hw = rivHalfW(x); occMark(x, rz - hw - 30, x, rz + hw + 30); }
  for (let x = -3300; x < KOLAK_END + 60; x += 5) { const rz = kolZ(x), hw = kolHalfW(x); occMark(x, rz - hw - 12, x, rz + hw + 12); }
  occMark(PLAT.lx - PLAT.lr - 30, PLAT.lz - PLAT.lr - 30, PLAT.lx + PLAT.lr + 30, PLAT.lz + PLAT.lr + 30);
  occMark(L.falls.x - 80, PLAT.z - 40, PLAT.lx, PLAT.z + 40);
  placeTowers();
  placeEstates();
  for (const e of edges) lotsAlong(e);
  await progress('Raising buildings', 0.65);
  fillZone(ZONES.nani, 5200, 'nani'); fillZone(ZONES.moti, 2800, 'moti'); fillZone(ZONES.devka, 1400, 'devka');
  fillZone(ZONES.jampore, 900, 'jampore'); fillZone(ZONES.industry, 300, 'industry'); fillZone(ZONES.dabhel, 300, 'dabhel');
  fillZone({ x0: mfr.x0 + 20, z0: mfr.z0 + 20, x1: mfr.x1 - 20, z1: mfr.z1 - 20 }, 400, 'fort');
  for (const v of villages) fillZone({ x0: v.x - 130, z0: v.z - 130, x1: v.x + 130, z1: v.z + 130 }, 70, 'village');
  // ramps
  const ap = L.airport;
  addRamp(1350, 2520, Math.PI / 2, 10, 26, 6); addRamp(1500, 2560, Math.PI / 2, 12, 40, 11); addRamp(-150, 2560, -Math.PI / 2, 9, 20, 4);
  addRamp(coastX(-3700) + 50, -3700, Math.PI, 8, 18, 3.5); addRamp(coastX(3100) + 50, 3100, 0, 8, 18, 3.5);
  for (const r of ramps) occMark(r.x - r.len, r.z - r.len, r.x + r.len, r.z + r.len);
  plantTrees();
  placeLights();
  placePoles();
  markSidewalks();
  await progress('Planting palms', 0.8);
  // spawns
  spawns.start = { x: -2241.6, z: -760, ang: Math.PI };
  spawns.cars = [
    { x: -2244.6, z: -790, ang: Math.PI, kind: 'super', color: 0xff6a00 }, { x: -2244.6, z: -805, ang: Math.PI, kind: 'gt', color: 0xd01020 },
    { x: -2244.6, z: -820, ang: Math.PI, kind: 'super', color: 0x1a8cff }, { x: 120, z: 2440, ang: Math.PI / 2, kind: 'super', color: 0xffd400 },
    { x: -2255.4, z: -3560, ang: 0, kind: 'gt', color: 0x22cc66 }, { x: -2255.4, z: 600, ang: 0, kind: 'muscle', color: 0x111111 },
    { x: 1250, z: 2440, ang: Math.PI / 2, kind: 'muscle', color: 0xffffff },
  ];
  spawns.cars.push(...estateCars.slice(0, 14));
  // parked motorbikes: by the start, at Devka and Jampore beaches, outside the villa colony
  spawns.bikes = [{ key: 'thunder', x: -2244.6, z: -838, ang: Math.PI, paint: 0 }, { key: 'vayurr', x: -2244.6, z: -850, ang: Math.PI, paint: 0 }, { key: 'shera220', x: -2244.6, z: -862, ang: Math.PI, paint: 1 },
    { key: 'thunder', x: coastRoadX(-3780) + 9, z: -3780, ang: 0, paint: 3 }, { key: 'vayurr', x: coastRoadX(-3800) + 9, z: -3800, ang: 0, paint: 1 },
    { key: 'shera220', x: coastRoadX(3260) + 9, z: 3260, ang: 0, paint: 2 }, { key: 'thunder', x: ZONES.villa.x0 - 8, z: 3420, ang: Math.PI / 2, paint: 4 }, { key: 'vayurr', x: ZONES.villa.x0 - 8, z: 3435, ang: Math.PI / 2, paint: 3 }];
  spawns.heli = [{ x: L.helipad.x, z: L.helipad.z }, { x: -2420, z: -3080 }];
  spawns.plane = [{ x: ap.runX0 + 40, z: ap.runZ, ang: Math.PI / 2 }];
  spawns.horses = [
    { x: coastX(3250) + 40, z: 3250 }, { x: coastX(3290) + 45, z: 3290 }, { x: coastX(3330) + 38, z: 3330 },
    { x: coastX(-3950) + 40, z: -3950 }, { x: coastX(-4000) + 42, z: -4000 },
  ];
  spawns.hospital = { x: L.hospital.x, z: L.hospital.z + 32 };
  spawns.horses.push({ x: 5200, z: 3500 }, { x: 5230, z: 3530 }, { x: 5180, z: 3570 }, { x: 4900, z: -2600 }, { x: 4950, z: -2650 });
  spawns.heli.push({ x: ISLAND.x + 60, z: ISLAND.z - 80 }, { x: PLAT.x - 200, z: PLAT.z - 300 });
  spawns.jet = [{ x: L.airport.runX0 + 140, z: L.airport.runZ + 70, ang: Math.PI / 2 }];
  spawns.boats = [{ x: L.jetty.x + 10, z: L.jetty.z + 80 }, { x: coastX(-3800) - 60, z: -3800 }];
}

// ---------- surface query (terrain + elevated roads + ramps + roofs) ----------
export let colliders = [];
export const colHash = new Map();
const CH = 40;
export function setColliders(list) {
  colliders = list; colHash.clear();
  list.forEach((c, i) => {
    for (let gx = Math.floor(c.x0 / CH); gx <= Math.floor(c.x1 / CH); gx++) for (let gz = Math.floor(c.z0 / CH); gz <= Math.floor(c.z1 / CH); gz++) {
      const k = gx * 100000 + gz; if (!colHash.has(k)) colHash.set(k, []); colHash.get(k).push(i);
    }
  });
}
export function collidersNear(x, z) { return colHash.get(Math.floor(x / CH) * 100000 + Math.floor(z / CH)) || []; }
export function rampHeight(x, z) {
  let best = -1e9;
  for (const r of ramps) {
    const dx = x - r.x, dz = z - r.z; if (dx * dx + dz * dz > r.len * r.len * 1.5) continue;
    const along = dx * r.s + dz * r.c, side = dx * r.c - dz * r.s;
    if (along > -r.len / 2 && along < r.len / 2 && Math.abs(side) < r.w / 2) best = Math.max(best, r.y + r.h * (along / r.len + 0.5));
  }
  return best;
}
export function groundAt(x, z, y = 1e9, step = 0.7) {
  let g = terrainH(x, z);
  const t0 = g;
  for (const ei of edgesNear(x, z)) {
    const e = edges[ei];
    const A = nodes[e.a], B = nodes[e.b], dx = B.x - A.x, dz = B.z - A.z, l2 = dx * dx + dz * dz;
    const t = clamp(((x - A.x) * dx + (z - A.z) * dz) / l2, 0, 1), d = Math.hypot(A.x + dx * t - x, A.z + dz * t - z);
    if (e.elev) { if (d < e.w / 2 + 1.2) { const yy = lerp(A.y, B.y, t) + 0.05; if (yy <= y + step && yy > g) g = yy; } }
    // ordinary roads are drawn 17 cm above the terrain (20 cm on junction pads): stand and drive on the asphalt, not in it
    else if (d < e.w / 2 + (e.side ? 2.8 : 0.3)) { const yy = t0 + ((t < 0.02 && A.e.length > 2) || (t > 0.98 && B.e.length > 2) ? 0.25 : 0.17); if (yy <= y + step && yy > g) g = yy; }
  }
  const rh = rampHeight(x, z); if (rh > g && rh <= y + step + 0.6) g = rh;
  for (const ci of collidersNear(x, z)) {
    const c = colliders[ci];
    if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && c.y1 <= y + step && c.y1 > g && !c.noTop) g = c.y1;
  }
  return g;
}
