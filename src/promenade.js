// Devka Sea Face: the seafront promenade from the Daman references. A paver walkway with granite borders and
// terracotta bands, a planting strip of bougainvillea behind black-and-white curbs, Victorian triple-lantern lamp
// posts, benches facing the sea, palms in stone planters, yellow gate pillars, a welcome arch, and a stone sea wall
// with iron bollards and sagging chains above a basalt riprap shore. Geometry is merged per 200 m chunk.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from './mapdata.js';
import { U, NOISE, patch } from './shaders.js';
import { TEX_GLSL } from './textures.js';
import { addGlow } from './glow.js';
import { mulberry32 } from './util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function prep(g, color) {
  if (g.index) g = g.toNonIndexed();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color || color !== undefined) {
    const c = new THREE.Color(color ?? 0xffffff), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
  }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
function xf(g, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) { _e.set(rx, ry, rz); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); return g.applyMatrix4(_m); }
function boxUV(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  return g;
}
const merge = (parts) => mergeGeometries(parts.map((p) => prep(p.g, p.c)));

// ---------- reusable models (local frame: +x toward the sea, +z along the promenade, y up) ----------
function lampModel() {
  const iron = 0x15181a, gold = 0x8a6a2a, P = [], G = [];
  const add = (g, c = iron) => P.push({ g, c });
  add(new THREE.CylinderGeometry(0.24, 0.3, 0.55, 8).translate(0, 0.275, 0));
  add(new THREE.CylinderGeometry(0.2, 0.24, 0.12, 8).translate(0, 0.61, 0), gold);
  add(new THREE.CylinderGeometry(0.13, 0.19, 0.5, 8).translate(0, 0.92, 0));
  add(new THREE.CylinderGeometry(0.085, 0.11, 3.3, 8).translate(0, 2.82, 0));
  for (const y of [1.25, 2.4, 4.42]) add(new THREE.CylinderGeometry(0.135, 0.135, 0.09, 8).translate(0, y, 0), y > 4 ? gold : iron);
  for (const sx of [-1, 1]) {
    const arm = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 4.25, 0), new THREE.Vector3(0.45 * sx, 4.62, 0), new THREE.Vector3(0.95 * sx, 4.68, 0), new THREE.Vector3(1.15 * sx, 4.56, 0)]);
    add(new THREE.TubeGeometry(arm, 10, 0.035, 5));
    const scroll = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 3.8, 0), new THREE.Vector3(0.32 * sx, 3.98, 0), new THREE.Vector3(0.55 * sx, 4.3, 0), new THREE.Vector3(0.45 * sx, 4.45, 0)]);
    add(new THREE.TubeGeometry(scroll, 8, 0.022, 4), gold);
    // hanging lantern
    const x = 1.15 * sx;
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 5).translate(x, 4.5, 0));
    add(new THREE.ConeGeometry(0.27, 0.22, 6).translate(x, 4.36, 0));
    add(new THREE.CylinderGeometry(0.16, 0.12, 0.06, 6).translate(x, 3.84, 0));
    add(new THREE.ConeGeometry(0.05, 0.14, 6).rotateX(Math.PI).translate(x, 3.74, 0), gold);
    G.push({ g: new THREE.CylinderGeometry(0.21, 0.14, 0.42, 6, 1, true).translate(x, 4.05, 0), c: 0xffffff });
  }
  // crown lantern
  add(new THREE.CylinderGeometry(0.11, 0.14, 0.1, 6).translate(0, 4.55, 0));
  G.push({ g: new THREE.CylinderGeometry(0.2, 0.13, 0.42, 6, 1, true).translate(0, 4.82, 0), c: 0xffffff });
  add(new THREE.ConeGeometry(0.26, 0.24, 6).translate(0, 5.15, 0));
  add(new THREE.SphereGeometry(0.05, 6, 4).translate(0, 5.32, 0), gold);
  return { body: merge(P), glass: merge(G), heads: [[-1.15, 4.05], [1.15, 4.05], [0, 4.82]] };
}
function bollardModel() {
  const c = 0x101214;
  return merge([
    { g: new THREE.CylinderGeometry(0.12, 0.13, 0.08, 8).translate(0, 0.04, 0), c },
    { g: new THREE.CylinderGeometry(0.075, 0.095, 0.62, 8).translate(0, 0.39, 0), c },
    { g: new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8).translate(0, 0.58, 0), c: 0xe8e4da },
    { g: new THREE.SphereGeometry(0.085, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.7, 0), c },
    { g: new THREE.TorusGeometry(0.035, 0.01, 4, 8).translate(0, 0.63, 0.09), c },
  ]);
}
function chainSpan(L) {
  const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(new THREE.Vector3(0, 0.63 - 0.17 * 4 * t * (1 - t), -L / 2 + L * t)); }
  return prep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.017, 4), 0x2a2c2e);
}
function benchModel() {
  const iron = 0x1a1c1e, wood = 0x7a4a2a, P = [];
  for (const z of [-0.8, 0.8]) {
    P.push({ g: new THREE.BoxGeometry(0.06, 0.45, 0.06).translate(0.2, 0.225, z), c: iron }, { g: new THREE.BoxGeometry(0.06, 0.82, 0.06).rotateZ(0.18).translate(-0.24, 0.42, z), c: iron });
    P.push({ g: new THREE.BoxGeometry(0.52, 0.05, 0.06).translate(0, 0.43, z), c: iron }, { g: new THREE.BoxGeometry(0.42, 0.04, 0.05).translate(0.02, 0.62, z), c: iron });
  }
  for (let k = 0; k < 5; k++) P.push({ g: new THREE.BoxGeometry(0.075, 0.035, 1.9).translate(-0.16 + k * 0.09, 0.465, 0), c: wood });
  for (let k = 0; k < 3; k++) P.push({ g: new THREE.BoxGeometry(0.03, 0.085, 1.9).rotateZ(0.2).translate(-0.27 - k * 0.025, 0.6 + k * 0.12, 0), c: wood });
  return merge(P);
}
function pillarModel(h = 2.3, w = 0.62) {
  const yel = 0xe8b31f, wh = 0xf2eee4, P = [];
  P.push({ g: boxUV(w + 0.2, 0.35, w + 0.2).translate(0, 0.175, 0), c: wh });
  P.push({ g: boxUV(w, h, w).translate(0, 0.35 + h / 2, 0), c: yel });
  for (const y of [0.35 + h * 0.3, 0.35 + h * 0.62]) P.push({ g: boxUV(w + 0.05, 0.06, w + 0.05).translate(0, y, 0), c: wh });
  P.push({ g: boxUV(w + 0.2, 0.16, w + 0.2).translate(0, 0.35 + h + 0.08, 0), c: wh });
  P.push({ g: new THREE.ConeGeometry((w + 0.1) * 0.72, 0.3, 4).rotateY(Math.PI / 4).translate(0, 0.35 + h + 0.31, 0), c: wh });
  P.push({ g: new THREE.SphereGeometry(0.17, 10, 8).translate(0, 0.35 + h + 0.62, 0), c: 0xfff4d8 });
  return { geo: merge(P), top: 0.35 + h + 0.62 };
}
function vhash(x, y, z, s) { const v = Math.sin(Math.round(x * 1e4) * 12.9898 + Math.round(y * 1e4) * 78.233 + Math.round(z * 1e4) * 37.719 + s * 4.1) * 43758.5453; return v - Math.floor(v); }
function rockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.75 + 0.45 * vhash(p.getX(i), p.getY(i), p.getZ(i), seed); p.setXYZ(i, p.getX(i) * k * 1.2, p.getY(i) * k * 0.7, p.getZ(i) * k); }
  g.computeVertexNormals(); return prep(g, 0x3a3836);
}

export function buildPromenade(scene, q, TX, H) {
  const S = M.SEA; if (!S.pts.length) return;
  const rnd = mulberry32(4242);
  const F = (z) => M.seaFrame(Math.min(Math.max(z, S.z0), S.z1));
  // point at distance a toward the sea from the road centre, at promenade height + dy
  const at = (z, a, dy = 0) => { const f = F(z); return { x: f.x - f.tz * a, z: f.z + f.tx * a, y: f.y + 0.03 + dy, ang: Math.atan2(f.tx, f.tz) + Math.PI, f }; };
  const CH = 200, chunks = new Map();
  const chunk = (z) => { const k = Math.floor((z - S.z0) / CH); if (!chunks.has(k)) chunks.set(k, { walk: [], bed: [], curb: [], stone: [], face: [], deco: [], z: S.z0 + (k + 0.5) * CH }); return chunks.get(k); };

  // ---- gaps in the planting strip (every 19 m) and gateways (every ~400 m, at the drive's link roads)
  const LAMP0 = S.z0 + 9.5, SP = 19;
  const gaps = []; for (let z = S.z0 + SP; z < S.z1 - 4; z += SP) gaps.push({ z, w: 2.4 });
  for (let z = S.z0 + 400; z < S.z1 - 50; z += 400) { let b = gaps[0]; for (const g of gaps) if (Math.abs(g.z - z) < Math.abs(b.z - z)) b = g; b.w = 4.2; b.gate = true; }
  const inGap = (z, pad = 0) => gaps.some((g) => Math.abs(z - g.z) < g.w / 2 + pad);

  // ---- walkway slab + sea wall face (2 m steps along z)
  const stairs = []; for (let z = S.z0 + 76; z < S.z1 - 30; z += 152) stairs.push(z);
  const inStair = (z, pad = 0) => stairs.some((s) => Math.abs(z - s) < 1.6 + pad);
  for (let z = S.z0; z < S.z1 - 0.01; z += 2) {
    const z2 = Math.min(z + 2, S.z1), c = chunk(z + 1);
    const A0 = at(z, S.walk0), A1 = at(z, S.walk1 + 0.05), B0 = at(z2, S.walk0), B1 = at(z2, S.walk1 + 0.05);
    c.walk.push([A0, A1, B1, B0, z, z2]);
    // wall face below the coping
    const W0 = at(z, S.wall1 - 0.05), W1 = at(z2, S.wall1 - 0.05);
    const g0 = Math.min(M.terrainH(W0.x - 1.2, W0.z), W0.y - 0.6) - 0.7, g1 = Math.min(M.terrainH(W1.x - 1.2, W1.z), W1.y - 0.6) - 0.7;
    c.face.push([W0, W1, g0, g1, z, z2]);
  }

  // ---- coping + bollards + chains + stairs
  const bollards = [], chains = [], BSP = SP / 8;
  for (let z = S.z0 + 0.6; z < S.z1 - 0.6; z += BSP) {
    if (inStair(z + BSP / 2, 0.2)) continue;
    const z2 = z + BSP, c = chunk(z + BSP / 2), A = at(z + BSP / 2, (S.walk1 + S.wall1) / 2, -0.28);
    c.stone.push({ g: boxUV(0.62, 0.5, BSP + 0.02, 1.2).translate(0, 0.25, 0).rotateY(A.ang).translate(A.x, A.y, A.z), col: 0xb8b2a6 });
    const B = at(z, (S.walk1 + S.wall1) / 2, 0.22); bollards.push(B);
    if (!inStair(z2, 0.2) && z2 < S.z1 - 0.6) { const B2 = at(z2, (S.walk1 + S.wall1) / 2, 0.22); chains.push({ x: (B.x + B2.x) / 2, y: (B.y + B2.y) / 2, z: (B.z + B2.z) / 2, ang: Math.atan2(B2.x - B.x, B2.z - B.z), len: Math.hypot(B2.x - B.x, B2.z - B.z) }); }
  }
  for (const sz of stairs) {
    const c = chunk(sz), top = at(sz, S.wall1);
    const ground = M.terrainH(at(sz, S.wall1 + 2.5).x, sz), drop = top.y - ground, n = Math.max(2, Math.ceil(drop / 0.19));
    for (let k = 0; k < n; k++) {
      const a = S.wall1 - 0.3 + k * 0.38, P0 = at(sz, a + 0.19), y = top.y - (k + 1) * drop / n;
      c.stone.push({ g: boxUV(0.4, Math.max(0.05, y - ground + 0.5), 3.0, 1.2).translate(0, (y - ground + 0.5) / 2, 0).rotateY(P0.ang).translate(P0.x, ground - 0.5, P0.z), col: 0xc4beb2 });
    }
    // two pillars of the yellow gate flank every stair down to the beach
    for (const s of [-1, 1]) { const P = at(sz + s * 1.9, (S.walk1 + S.wall1) / 2 - 0.1); H.pillars.push({ ...P, small: true }); }
  }

  for (const z of [S.z0, S.z1]) {
    const c = chunk(z), mid = at(z, (S.walk0 + S.wall1) / 2); let lo = mid.y;
    for (let a = S.walk0; a <= S.wall1; a += 2) { const P = at(z, a); lo = Math.min(lo, M.terrainH(P.x, P.z)); }
    const h = mid.y - lo + 0.5;
    c.stone.push({ g: boxUV(S.wall1 - S.walk0 + 0.6, h, 0.4, 1.2).translate(0, h / 2, 0).rotateY(mid.ang).translate(mid.x, lo - 0.5 - 0.03, mid.z), col: 0xb8b2a6 });
  }
  // ---- planting strip: curbs (alternating black/white 0.9 m blocks), soil bed, shrubs, lamps
  const shrubs = [], lamps = [];
  for (let z = S.z0 + 0.4; z < S.z1 - 0.4; z += 0.9) {
    const zm = z + 0.45; if (inGap(zm, 0.05) || zm > S.z1 - 0.4) continue;
    const c = chunk(zm), black = Math.floor((z - S.z0) / 0.9) % 2 === 0;
    for (const a of [S.walk0 + 0.12, S.plant1 - 0.12]) { const P = at(zm, a, -0.1); c.curb.push({ g: boxUV(0.24, 0.36, 0.88, 1).translate(0, 0.18, 0).rotateY(P.ang).translate(P.x, P.y, P.z), col: black ? 0x141414 : 0xf0eee8 }); }
  }
  for (let z = S.z0 + 0.4; z < S.z1 - 0.4; z += 2) {
    const zm = z + 1; if (inGap(zm, 0.9)) continue;
    const c = chunk(zm), P = at(zm, (S.walk0 + S.plant1) / 2, -0.1);
    c.bed.push({ g: boxUV(S.plant1 - S.walk0 - 0.48, 0.3, 2.02, 1).translate(0, 0.15, 0).rotateY(P.ang).translate(P.x, P.y, P.z), col: 0xffffff });
    H.addCol(P.x - 0.8, P.z - 1, P.x + 0.8, P.z + 1, P.y - 0.2, P.y + 0.2);
  }
  for (let z = S.z0 + 1.6; z < S.z1 - 1.5; z += 1.25) {
    if (inGap(z, 0.8) || Math.abs(((z - LAMP0) % SP + SP) % SP) < 0.9 || Math.abs(((z - LAMP0) % SP + SP) % SP - SP) < 0.9) continue;
    const P = at(z + (rnd() - 0.5) * 0.4, (S.walk0 + S.plant1) / 2 + (rnd() - 0.5) * 0.5, 0.2);
    shrubs.push({ ...P, s: 0.55 + rnd() * 0.35, r: rnd() * 6.28, pink: rnd() < 0.72 });
  }
  for (let z = LAMP0; z < S.z1 - 2; z += SP) { const P = at(z, (S.walk0 + S.plant1) / 2); lamps.push(P); H.addCol(P.x - 0.3, P.z - 0.3, P.x + 0.3, P.z + 0.3, P.y, P.y + 5.4); }

  // ---- benches (facing the sea), palm planters, gate pillars, arch
  const benches = [], planters = [];
  for (let z = S.z0 + SP; z < S.z1 - 4; z += SP) { if (inStair(z, 1.5)) continue; benches.push(at(z, S.walk1 - 1.1)); }
  for (const p of M.seaPalms) planters.push(p);
  for (const g of gaps) if (g.gate) for (const s of [-1, 1]) H.pillars.push({ ...at(g.z + s * (g.w / 2 + 0.36), (S.walk0 + S.plant1) / 2) });
  const arches = [S.z0 + 1.5, S.z1 - 1.5];

  // ---------- materials ----------
  const walkMat = new THREE.MeshStandardMaterial({ map: TX.pavers.d, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  patch(walkMat, (s) => {
    Object.assign(s.uniforms, { uNight: U.uNight, uWet: U.uWet, uZ0: { value: LAMP0 }, uSP: { value: SP }, uPN: { value: TX.pavers.n } });
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec2 vLoc;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvLoc = uv;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight, uWet, uZ0, uSP; uniform sampler2D uPN; varying vec3 vWP; varying vec2 vLoc; float pPool;\n' + NOISE + TEX_GLSL)
      .replace('#include <map_fragment>', `
        float a = vLoc.x, sz = vWP.z;
        vec3 pv = texture2D(map, vWP.xz*0.42).rgb;
        float lum = dot(pv, vec3(0.3,0.59,0.11));
        vec3 col = vec3(0.8,0.73,0.63)*(0.5 + 0.72*lum);                                   // buff field pavers
        float band = step(abs(mod(sz - uZ0, uSP*0.5) - uSP*0.25), 0.7);                          // terracotta cross bands
        col = mix(col, vec3(0.63,0.33,0.22)*(0.6 + 0.7*lum), band);
        float bord = step(a, ${(S.plant1 + 0.6).toFixed(2)}) + step(${(S.walk1 - 0.7).toFixed(2)}, a);   // granite borders
        vec2 gj = abs(fract(vec2(a*1.6, sz*1.6)) - 0.5);
        col = mix(col, vec3(0.5,0.5,0.49)*(0.75 + 0.5*lum)*(0.9 + 0.1*step(0.46, max(gj.x, gj.y))), clamp(bord, 0., 1.));
        float wave = smoothstep(0.08, 0.0, abs(a - 15.3 - sin(sz*0.33)*1.6)) * (1. - band);  // wave inlay down the middle
        col = mix(col, vec3(0.2,0.33,0.46), wave*0.85);
        col *= 0.9 + 0.2*vn(vWP.xz*0.15);
        diffuseColor.rgb *= col;
        float dz = mod(sz - uZ0 + uSP*0.5, uSP) - uSP*0.5;
        pPool = exp(-dz*dz/26.0)*(exp(-(a - 9.8)*(a - 9.8)/22.0) + 0.35*exp(-(a - 12.0)*(a - 12.0)/60.0));`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0,0.72,0.42)*pPool*uNight*0.32;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.18, uWet);\ndiffuseColor.rgb *= mix(1.0, 0.62, uWet);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nvec3 tn = unpackN(texture2D(uPN, vWP.xz*0.42), 0.9); tn = normalize(mix(vec3(0.,0.,1.), tn, 1.0 - smoothstep(8., 40., length(vViewPosition))));\nnormal = normalize((viewMatrix*vec4(nmapXZ(tn, vec3(0.,1.,0.)), 0.)).xyz);\nfloat sv = length(fwidth(normal)); roughnessFactor = clamp(sqrt(roughnessFactor*roughnessFactor + sv*sv*4.0), 0.0, 1.0);');
  }, 'promwalk');
  const stoneMat = new THREE.MeshStandardMaterial({ map: TX.fortwall.d, normalMap: TX.fortwall.n, vertexColors: true, roughness: 0.9 });
  const faceMat = new THREE.MeshStandardMaterial({ map: TX.fortwall.d, normalMap: TX.fortwall.n, color: 0x8a8378, roughness: 0.95 });
  const curbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const bedMat = new THREE.MeshStandardMaterial({ map: TX.soil.d, color: 0x6a5040, roughness: 1 });
  const ironMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.2, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const pillarMat = new THREE.MeshStandardMaterial({ map: TX.plaster.d, normalMap: TX.plaster.n, normalScale: new THREE.Vector2(0.4, 0.4), vertexColors: true, roughness: 0.8, emissive: 0x000000 });
  const rockMat = new THREE.MeshStandardMaterial({ map: TX.rock.d, normalMap: TX.rock.n, vertexColors: true, roughness: 0.85 });

  // ---------- chunk meshes ----------
  const far = q.desktop ? 1500 : 650;
  for (const c of chunks.values()) {
    const grp = new THREE.Group();
    // walkway ribbon
    { const P = [], N = [], UV = [], I = []; let v = 0;
      for (const [A0, A1, B1, B0] of c.walk) { P.push(A0.x, A0.y, A0.z, A1.x, A1.y, A1.z, B1.x, B1.y, B1.z, B0.x, B0.y, B0.z); N.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0); UV.push(S.walk0, 0, S.walk1, 0, S.walk1, 1, S.walk0, 1); I.push(v, v + 2, v + 1, v, v + 3, v + 2); v += 4; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I);
      g.computeVertexNormals(); for (let i = 0; i < g.attributes.normal.count; i++) if (g.attributes.normal.getY(i) < 0) { I.reverse(); g.setIndex(I); g.computeVertexNormals(); break; }
      const m = new THREE.Mesh(g, walkMat); m.receiveShadow = true; grp.add(m); }
    // sea wall face (rough stone, world-scaled UVs)
    { const P = [], UV = [], I = []; let v = 0;
      for (const [W0, W1, g0, g1, z0, z1] of c.face) { P.push(W0.x, W0.y - 0.26, W0.z, W1.x, W1.y - 0.26, W1.z, W1.x, g1, W1.z, W0.x, g0, W0.z); UV.push(z0 / 3, W0.y / 3, z1 / 3, W1.y / 3, z1 / 3, g1 / 3, z0 / 3, g0 / 3); I.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
      const nrm = g.attributes.normal; if (nrm.getX(0) > 0) { I.reverse(); g.setIndex(I); g.computeVertexNormals(); }
      const m = new THREE.Mesh(g, faceMat); m.receiveShadow = true; grp.add(m); }
    const bag = (list, mat, shadow = true) => { if (!list.length) return; const g = mergeGeometries(list.map((o) => prep(o.g, o.col))); const m = new THREE.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true; grp.add(m); };
    bag(c.stone, stoneMat); bag(c.curb, curbMat, false); bag(c.bed, bedMat, false);
    scene.add(grp); H.regLod(grp, S.pts[0].x, c.z, far + CH);
  }
  // ---------- riprap shore ----------
  const rocks = [];
  for (let z = S.z0 + 1; z < S.z1 - 1; z += 1.1) {
    if (inStair(z, 1.2) || rnd() < 0.25) continue;
    const a = S.wall1 + 0.6 + rnd() * rnd() * 5.5, P = at(z, a), y = M.terrainH(P.x, P.z);
    rocks.push({ x: P.x, z: P.z, y: y - 0.15, s: (0.45 + rnd() * 0.9) * (1.3 - (a - S.wall1) * 0.1), r: rnd() * 6.28, t: rnd() * 0.5 });
  }
  const rk = [rockGeo(1), rockGeo(2), rockGeo(3)];
  rk.forEach((g, i) => H.instTiles(scene, g, rockMat, rocks.filter((_, j) => j % 3 === i), 400, q.desktop ? 900 : 380, (m, r, k) => { _m.compose(_p.set(r.x, r.y, r.z), _q.setFromEuler(_e.set(r.t, r.r, r.t * 0.5)), _s.set(r.s, r.s, r.s)); m.setMatrixAt(k, _m); }));

  // ---------- instanced furniture ----------
  const place = (m, p, i) => { _m.compose(_p.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(0, p.ang, 0)), _s.set(1, 1, 1)); m.setMatrixAt(i, _m); };
  const L = lampModel();
  H.instTiles(scene, L.body, ironMat, lamps, 400, q.desktop ? 1600 : 700, place);
  H.instTiles(scene, L.glass, glassMat, lamps, 400, q.desktop ? 2400 : 1200, place, { shadow: false });
  const warm = [1.0, 0.72, 0.4];
  for (const p of lamps) for (const [hx, hy] of L.heads) {
    const c = Math.cos(p.ang), s = Math.sin(p.ang), x = p.x + hx * c, z = p.z - hx * s;
    addGlow(x, p.y + hy, z, hy > 4.5 ? 1.0 : 0.85, warm, p.y);
  }
  H.instTiles(scene, bollardModel(), ironMat, bollards, 400, q.desktop ? 700 : 300, place);
  const cs = chainSpan(BSP);
  H.instTiles(scene, cs, ironMat, chains, 400, q.desktop ? 500 : 220, (m, p, i) => { _m.compose(_p.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(0, p.ang, 0)), _s.set(1, 1, p.len / BSP)); m.setMatrixAt(i, _m); }, { shadow: false });
  H.instTiles(scene, benchModel(), ironMat, benches, 400, q.desktop ? 700 : 300, place);
  // planters (octagonal stone ring + soil)
  const pl = merge([{ g: new THREE.CylinderGeometry(1.15, 1.2, 0.5, 8, 1, true).translate(0, 0.25, 0), c: 0xd8d0c0 }, { g: new THREE.TorusGeometry(1.15, 0.09, 4, 8).rotateX(Math.PI / 2).translate(0, 0.5, 0), c: 0xeae4d8 }, { g: new THREE.CircleGeometry(1.12, 8).rotateX(-Math.PI / 2).translate(0, 0.42, 0), c: 0x3e2c20 }]);
  H.instTiles(scene, pl, stoneMat, planters, 400, q.desktop ? 900 : 400, (m, p, i) => { _m.compose(_p.set(p.x, p.y - 0.42, p.z), _q.identity(), _s.set(1, 1, 1)); m.setMatrixAt(i, _m); });
  for (const p of planters) H.addCol(p.x - 1, p.z - 1, p.x + 1, p.z + 1, p.y - 0.5, p.y + 0.05);
  // gate pillars
  const PB = pillarModel(), PS = pillarModel(1.5, 0.5);
  for (const [model, list] of [[PB, H.pillars.filter((p) => !p.small)], [PS, H.pillars.filter((p) => p.small)]]) {
    H.instTiles(scene, model.geo, pillarMat, list, 400, q.desktop ? 1200 : 600, place);
    for (const p of list) { addGlow(p.x, p.y + model.top, p.z, 0.75, [1.0, 0.85, 0.6], null); H.addCol(p.x - 0.4, p.z - 0.4, p.x + 0.4, p.z + 0.4, p.y, p.y + model.top); }
  }
  // welcome arches over the walkway at both ends
  {
    const sign = signTexture('DEVKA SEA FACE', 'NANI DAMAN  ·  PROMENADE');
    const signMat = new THREE.MeshStandardMaterial({ map: sign, roughness: 0.5, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0 });
    const P = [], G = [];
    for (const z of arches) {
      const mid = at(z, (S.plant1 + S.walk1) / 2), span = S.walk1 - S.plant1 + 0.6;
      for (const s of [-1, 1]) {
        const p = at(z, (S.plant1 + S.walk1) / 2 + s * span / 2);
        P.push({ g: boxUV(1.0, 0.45, 1.0).translate(0, 0.22, 0).rotateY(p.ang).translate(p.x, p.y, p.z), c: 0xf2eee4 });
        P.push({ g: boxUV(0.8, 4.4, 0.8).translate(0, 2.65, 0).rotateY(p.ang).translate(p.x, p.y, p.z), c: 0xe8b31f });
        P.push({ g: boxUV(1.0, 0.2, 1.0).translate(0, 4.95, 0).rotateY(p.ang).translate(p.x, p.y, p.z), c: 0xf2eee4 });
        P.push({ g: new THREE.SphereGeometry(0.22, 10, 8).translate(0, 5.95, 0).rotateY(p.ang).translate(p.x, p.y, p.z), c: 0xfff4d8 });
        P.push({ g: new THREE.ConeGeometry(0.62, 0.55, 4).rotateY(Math.PI / 4).translate(0, 5.32, 0).rotateY(p.ang).translate(p.x, p.y, p.z), c: 0xf2eee4 });
        addGlow(p.x, p.y + 5.95, p.z, 0.9, [1.0, 0.85, 0.6], null);
        H.addCol(p.x - 0.5, p.z - 0.5, p.x + 0.5, p.z + 0.5, p.y, p.y + 5);
      }
      P.push({ g: boxUV(span, 0.5, 0.6).translate(0, 4.7, 0).rotateY(mid.ang).translate(mid.x, mid.y, mid.z), c: 0xe8b31f });
      for (const s of [-1, 1]) {
        const g = new THREE.PlaneGeometry(span - 1.4, 1.1); if (s < 0) g.rotateY(Math.PI); g.translate(0, 3.85, 0.31 * s); g.rotateY(mid.ang).translate(mid.x, mid.y, mid.z);
        G.push({ g, c: 0xffffff });
      }
      P.push({ g: boxUV(span - 1.2, 1.25, 0.58).translate(0, 3.85, 0).rotateY(mid.ang).translate(mid.x, mid.y, mid.z), c: 0x1b3a6b });
      H.labels.push({ name: 'Devka Sea Face', x: mid.x, z: mid.z });
    }
    const a = new THREE.Mesh(merge(P), pillarMat); a.castShadow = true; a.receiveShadow = true; scene.add(a);
    const sm = new THREE.Mesh(merge(G), signMat); scene.add(sm);
    H.animated.push(() => { signMat.emissiveIntensity = U.uNight.value * 1.4; });
  }
  // ---------- bougainvillea + ixora shrubs (alpha leaf cards around a dome, soft spherical normals) ----------
  const atlas = shrubAtlas();
  const shrubMat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.78 });
  patch(shrubMat, (s) => { s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal); nonPerturbedNormal = normal;'); }, 'shrubcards');
  const shrubDepth = new THREE.MeshDepthMaterial({ map: atlas, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking });
  for (const [half, list] of [[0, shrubs.filter((b) => b.pink)], [1, shrubs.filter((b) => !b.pink)]]) {
    H.instTiles(scene, shrubCards(half), shrubMat, list, 400, q.desktop ? 800 : 320, (m, p, i) => { _m.compose(_p.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(0, p.r, 0)), _s.set(p.s * 1.25, p.s * 1.1, p.s * 1.25)); m.setMatrixAt(i, _m); }, { depth: shrubDepth });
  }
  H.animated.push(() => { glassMat.emissiveIntensity = 0.15 + U.uNight.value * 5.5; pillarMat.emissiveIntensity = 0; });
  return { lamps: lamps.length, benches: benches.length, bollards: bollards.length, shrubs: shrubs.length };
}

// ~12 crossed cards on a dome; normals point out from the bush centre so it shades like a soft mass
function shrubCards(half) {
  const r = mulberry32(31 + half), P = [], N = [], UV = [];
  for (let k = 0; k < 12; k++) {
    const az = r() * Math.PI * 2, el = 0.15 + r() * 1.1, rad = 0.35 + r() * 0.2, sz = 0.75 + r() * 0.35;
    const cx = Math.cos(az) * Math.cos(el) * rad, cy = 0.42 + Math.sin(el) * rad * 0.8, cz = Math.sin(az) * Math.cos(el) * rad;
    const yaw = r() * Math.PI, tilt = (r() - 0.5) * 1.2, g = new THREE.PlaneGeometry(sz, sz * 0.8);
    g.rotateX(tilt); g.rotateY(yaw); g.translate(cx, cy, cz);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (const i of [0, 2, 1, 1, 2, 3]) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); P.push(x, y, z);
      const n = new THREE.Vector3(x, (y - 0.25) * 0.8, z).normalize(); N.push(n.x, n.y + 0.25, n.z);
      UV.push(half * 0.5 + uv.getX(i) * 0.5, uv.getY(i));
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  return g;
}
// left: bougainvillea (green leaves smothered in magenta bracts), right: ixora / croton (glossy leaves, red-orange clusters)
function shrubAtlas() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d'), r = mulberry32(77);
  for (const half of [0, 1]) {
    const ox = half * 512, cx = ox + 256, cy = 256;
    const inside = (x, y, m = 0) => (x - cx) ** 2 + ((y - cy) * 1.15) ** 2 < (225 - m) ** 2;
    for (let k = 0; k < 520; k++) {
      const x = ox + 20 + r() * 472, y = 20 + r() * 472; if (!inside(x, y, 12)) continue;
      const a = r() * Math.PI * 2, L = 20 + r() * 26, W = L * 0.42, l = 0.7 + 0.3 * (1 - y / 512);
      const gg = (half ? 85 : 95) + r() * 60, rr = 20 + r() * 35, bb = 12 + r() * 20;
      g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = `rgb(${rr * l | 0},${gg * l | 0},${bb * l | 0})`;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.5, -W, L, 0); g.quadraticCurveTo(L * 0.5, W, 0, 0); g.fill(); g.restore();
    }
    for (let k = 0; k < (half ? 70 : 150); k++) {
      const x = ox + 40 + r() * 432, y = 30 + r() * 400; if (!inside(x, y, 30)) continue;
      const n = half ? 9 : 6 + (r() * 5 | 0);
      for (let j = 0; j < n; j++) {
        const px = x + (r() - 0.5) * (half ? 22 : 38), py = y + (r() - 0.5) * (half ? 22 : 30), s = half ? 6 + r() * 4 : 9 + r() * 9, l = 0.75 + r() * 0.35;
        g.fillStyle = half ? `rgb(${235 * l | 0},${(70 + r() * 70) * l | 0},${30 * l | 0})` : `rgb(${(215 + r() * 30) * l | 0},${(30 + r() * 35) * l | 0},${(120 + r() * 50) * l | 0})`;
        g.save(); g.translate(px, py); g.rotate(r() * 6.28); g.beginPath();
        if (half) { for (let q = 0; q < 4; q++) { g.rotate(Math.PI / 2); g.ellipse(s * 0.5, 0, s * 0.5, s * 0.28, 0, 0, Math.PI * 2); } }
        else { g.moveTo(0, 0); g.quadraticCurveTo(s * 0.7, -s * 0.6, s, 0); g.quadraticCurveTo(s * 0.7, s * 0.6, 0, 0); }
        g.fill(); g.restore();
      }
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function signTexture(t1, t2) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#22508f'); gr.addColorStop(1, '#122c55'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 160);
  g.strokeStyle = '#e9c45a'; g.lineWidth = 6; g.strokeRect(10, 10, 1004, 140);
  g.fillStyle = '#f6d36b'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 74px Georgia, "Times New Roman", serif'; g.fillText(t1, 512, 66);
  g.font = '32px "Noto Sans Devanagari", sans-serif'; g.fillStyle = '#ffffff'; g.fillText(t2, 512, 124);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
