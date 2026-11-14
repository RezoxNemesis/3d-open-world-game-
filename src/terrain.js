// Terrain: biome splat map, procedural detail textures, chunked LOD tiles, water, grass/crops.
import * as THREE from 'three';
import * as M from './mapdata.js';
import { U, NOISE, patch } from './shaders.js';
import { TEX_GLSL } from './textures.js';
import { fbm, smooth, clamp, lerp, mulberry32 } from './util.js';

export const T = { tiles: [], grass: null, splatCanvas: null };

// ---------- periodic noise for tileable textures ----------
function pnoise(P, seed) {
  const r = mulberry32(seed), g = new Float32Array(P * P); for (let i = 0; i < P * P; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const i0 = ((xi % P) + P) % P, j0 = ((yi % P) + P) % P, i1 = (i0 + 1) % P, j1 = (j0 + 1) % P;
    const a = g[i0 + j0 * P], b = g[i1 + j0 * P], c = g[i0 + j1 * P], d = g[i1 + j1 * P];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function texFrom(S, fn, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = S; const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S), d = img.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const o = fn(i / S, j / S, i, j), k = (i + j * S) * 4; d[k] = o[0] * 255; d[k + 1] = o[1] * 255; d[k + 2] = o[2] * 255; d[k + 3] = o[3] * 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}
function toTex(c) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; }
export function makeDetailTextures(S) {
  const n1 = pnoise(8, 1), n2 = pnoise(32, 2), n3 = pnoise(128, 3), n4 = pnoise(16, 4), n5 = pnoise(64, 5);
  const fb = (x, y) => n1(x * 8, y * 8) * 0.45 + n2(x * 32, y * 32) * 0.3 + n3(x * 128, y * 128) * 0.25;
  const grass = texFrom(S, (u, v) => {
    const b = fb(u, v), bl = n3(u * 128 + n2(u * 32, v * 32) * 2, v * 128 * 0.25), h = Math.pow(bl, 1.5);
    const l = 0.72 + 0.36 * h; return [(0.28 + 0.1 * b) * l, (0.42 + 0.12 * b) * l, (0.16 + 0.04 * b) * l, h];
  });
  const rock = texFrom(S, (u, v) => {
    const b = fb(u, v), cr = Math.abs(n2(u * 32 + 7, v * 32) - 0.5) < 0.025 ? 0.35 : 1, st = 0.5 + 0.5 * Math.sin((v * 16 + n1(u * 8, v * 8) * 3) * Math.PI);
    const l = (0.55 + 0.45 * b) * cr * (0.85 + 0.15 * st); return [0.42 * l, 0.39 * l, 0.36 * l, b * cr];
  });
  const sand = texFrom(S, (u, v) => {
    const rip = 0.5 + 0.5 * Math.sin((u * 8 + n1(u * 8, v * 8) * 2.5 + v * 2) * Math.PI * 2), gr = n3(u * 128, v * 128), b = n2(u * 32, v * 32);
    const l = 0.86 + 0.04 * rip + 0.06 * gr + 0.05 * b; return [0.86 * l, 0.77 * l, 0.6 * l, rip * 0.35 + gr * 0.25 + b * 0.4];
  });
  const dirt = texFrom(S, (u, v) => {
    const b = n1(u * 8, v * 8) * 0.6 + n2(u * 32, v * 32) * 0.3 + n3(u * 128, v * 128) * 0.1, peb = n3(u * 128 + 3, v * 128) > 0.86 ? 1 : 0, l = 0.8 + 0.22 * b + peb * 0.08;
    return [0.52 * l, 0.44 * l, 0.34 * l, b * 0.8 + peb * 0.2];
  });
  return { grass: toTex(grass), rock: toTex(rock), sand: toTex(sand), dirt: toTex(dirt) };
}

// ---------- splat (biome) map: r sand, g forest, b field, a urban/mud ----------
export function buildSplat(S = 1024) {
  const data = new Uint8Array(S * S * 4), px = (2 * M.HALF) / S;
  const can = document.createElement('canvas'); can.width = can.height = S; const ctx = can.getContext('2d'); const img = ctx.createImageData(S, S);
  for (let j = 0; j < S; j++) {
    const z = -M.HALF + (j + 0.5) * px, cx = M.coastX(z);
    for (let i = 0; i < S; i++) {
      const x = -M.HALF + (i + 0.5) * px, h = M.terrainH(x, z);
      let sa = 0, fo = 0, fi = 0, ur = 0;
      const zone = M.zoneAt(x, z), n = fbm(x * 0.004, z * 0.004, 3), n2 = fbm(x * 0.0012 + 9, z * 0.0012, 3);
      const dRiv = x < M.RIVER_END ? Math.abs(z - M.rivZ(x)) - M.rivHalfW(x) : 1e9, dKol = x < M.KOLAK_END ? Math.abs(z - M.kolZ(x)) - M.kolHalfW(x) : 1e9;
      const nearSea = h < 2.6 && dRiv > 25 && dKol > 15 && M.waterLevelAt(x, z) === 0;
      if (nearSea) sa = 1;
      else if (dRiv < 45 || dKol < 25) ur = 0.75;
      else if (zone === 'nani' || zone === 'moti' || zone === 'devka' || zone === 'jampore') ur = n2 > 0.55 && n > 0.45 ? 0.15 : 0.8;
      else if (zone === 'industry' || zone === 'dabhel') ur = 0.9;
      else if (zone === 'fort') ur = n > 0.5 ? 0.1 : 0.55;
      else {
        const ap = M.L.airport;
        if (!(x > ap.x0 && x < ap.x1 && z > ap.z0 && z < ap.z1)) {
          if (M.isJungle(x, z)) fo = clamp(0.4 + n * 0.8, 0, 1);
          else if (x > 6800 && h < 750) fo = clamp(n * 0.9 - 0.15, 0, 0.7);
          else if (n2 > 0.43 && h < 90 && x < 4300) fi = 1;
          else fo = n > 0.55 ? 0.35 : 0;
        }
      }
      for (const v of M.villages) if (Math.abs(v.x - x) < 140 && Math.abs(v.z - z) < 140) { ur = Math.max(ur, 0.55); fi = 0; }
      const k = (i + j * S) * 4; data[k] = sa * 255; data[k + 1] = fo * 255; data[k + 2] = fi * 255; data[k + 3] = ur * 255;
      // map colours
      let r = 0.42 + n * 0.12, g = 0.5 + n * 0.08, b = 0.27;
      if (h < 0 || M.waterLevelAt(x, z) > h) { const dd = clamp(-h / 12, 0, 1); r = 0.16 - dd * 0.1; g = 0.42 - dd * 0.15; b = 0.58 - dd * 0.12; }
      else if (sa) { r = 0.88; g = 0.8; b = 0.6; }
      else if (ur) { r = 0.62; g = 0.56; b = 0.47; }
      else if (fo) { r = 0.2; g = 0.38 - fo * 0.08; b = 0.17; }
      else if (fi) { const t = ((Math.floor(x / 70) * 73856093 ^ Math.floor(z / 48) * 19349663) >>> 0) % 5; r = [0.4, 0.55, 0.52, 0.75, 0.45][t]; g = [0.55, 0.62, 0.43, 0.7, 0.5][t]; b = [0.22, 0.26, 0.3, 0.3, 0.25][t]; }
      if (h > 60) { const sh = clamp((h - 60) / 900, 0, 1); r = lerp(r, 0.55, sh * 0.6); g = lerp(g, 0.52, sh * 0.6); b = lerp(b, 0.48, sh * 0.6); }
      const hs = clamp((M.terrainH(x + px, z + px) - h) / px, -1, 1); const sh2 = 1 - hs * 0.8;
      img.data[k] = clamp(r * sh2, 0, 1) * 255; img.data[k + 1] = clamp(g * sh2, 0, 1) * 255; img.data[k + 2] = clamp(b * sh2, 0, 1) * 255; img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  T.splatCanvas = can;
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// height texture (R32F) for GPU lookups (grass, water depth)
export function heightTexture() {
  const t = new THREE.DataTexture(M.H, M.W1, M.W1, THREE.RedFormat, THREE.FloatType); t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
}
export const HEIGHT_GLSL = /* glsl */`
uniform sampler2D uHeight; uniform float uHN; uniform float uHalf;
float hAt(vec2 p){
  vec2 g = (p + uHalf) / (2.0*uHalf) * uHN; g = clamp(g, vec2(0.), vec2(uHN-0.001));
  ivec2 i = ivec2(floor(g)); vec2 f = fract(g);
  float a = texelFetch(uHeight, i, 0).r, b = texelFetch(uHeight, i+ivec2(1,0), 0).r, c = texelFetch(uHeight, i+ivec2(0,1), 0).r, d = texelFetch(uHeight, i+ivec2(1,1), 0).r;
  return (f.x + f.y <= 1.0) ? a + (b-a)*f.x + (c-a)*f.y : d + (c-d)*(1.0-f.x) + (b-d)*(1.0-f.y);
}`;

// ---------- terrain material ----------
export function terrainMaterial(TX, splat, q) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  mat.defines = { HIGHQ: q.desktop ? 1 : 0, NEARD: (q.desktop ? 320 : 150).toFixed(1) };
  patch(mat, (s) => {
    Object.assign(s.uniforms, { uSplat: { value: splat }, uSeason: U.uSeason, uWet: U.uWet, uTime: U.uTime, uSunCaus: U.uSunDir, uSunCausC: U.uSunColor,
      uGrassD: { value: TX.grass.d }, uGrassN: { value: TX.grass.n }, uForestD: { value: TX.forest.d }, uForestN: { value: TX.forest.n },
      uSoilD: { value: TX.soil.d }, uSoilN: { value: TX.soil.n }, uGroundD: { value: TX.ground.d }, uGroundN: { value: TX.ground.n },
      uSandD: { value: TX.sand.d }, uSandN: { value: TX.sand.n }, uRockD: { value: TX.rock.d }, uRockN: { value: TX.rock.n } });
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix*vec4(transformed,1.)).xyz; vWN = normalize(mat3(modelMatrix)*objectNormal);');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP; varying vec3 vWN;
      uniform sampler2D uSplat, uGrassD, uGrassN, uForestD, uForestN, uSoilD, uSoilN, uGroundD, uGroundN, uSandD, uSandN, uRockD, uRockN;
      uniform vec4 uSeason; uniform float uWet, uTime; uniform vec3 uSunCaus, uSunCausC;
      ${NOISE}
      ${TEX_GLSL}
      float gNear; vec3 gWN; float gWet;
      // one ground layer: albedo (two scales when near, one far) + normal accumulation
      void layer(sampler2D D, sampler2D N, vec2 p, float s, float w, inout vec3 col, inout vec3 nrm){
        if (w < 0.004) return;
        vec4 c = gNear > 0.0 ? tex2s(D, p, s) : texture2D(D, mat2(0.8, -0.6, 0.6, 0.8)*p*s*0.23 + 0.31);
        col += c.rgb*w;
        if (gNear > 0.0) nrm += nmapXZ(unpackN(texture2D(N, p*s), 1.0), vWN)*w*gNear;
      }`)
      .replace('#include <map_fragment>', `
      vec2 suv = (vWP.xz + ${M.HALF.toFixed(1)}) / ${(2 * M.HALF).toFixed(1)};
      vec4 sp = texture2D(uSplat, suv);
      float slope = 1.0 - clamp(vWN.y, 0., 1.);
      vec2 p = vWP.xz;
      float camD = length(vViewPosition);
      gNear = 1.0 - smoothstep(NEARD*0.6, NEARD, camD);
      float nn = vn(p*0.02), nm = vn(p*0.0035);
      float lush = uSeason.x, dry = uSeason.y;
      float rk = smoothstep(0.17, 0.34, slope + (nn-0.5)*0.12) + smoothstep(420., 900., vWP.y + nn*120.)*0.55*(1.-sp.g);
      rk = clamp(max(rk, smoothstep(950., 1150., vWP.y)*0.7), 0., 1.);
      float wS = smoothstep(0.35, 0.65, sp.r + (nn-0.5)*0.3);
      float wU = smoothstep(0.1, 0.6, sp.a + (nn-0.5)*0.4);
      float wF = sp.b, wFo = sp.g;
      float kR = rk, kS = wS*(1.-rk), kU = wU*(1.-wS)*(1.-rk), kF = wF*(1.-wU)*(1.-wS)*(1.-rk);
      float kFo = wFo*(1.-wF)*(1.-wU)*(1.-wS)*(1.-rk), kG = max(0., 1. - kR - kS - kU - kF - kFo);
      vec3 col = vec3(0.), nrm = vec3(0.);
      vec3 gc = vec3(0.), dummy = vec3(0.);
      layer(uGrassD, uGrassN, p, 0.42, kG, gc, nrm);
      col += gc*mix(vec3(0.82,1.18,0.62), vec3(1.2,1.1,0.7), dry*0.85)*mix(1., 1.15, lush)*(0.85 + 0.3*nm);
      vec3 fo = vec3(0.); layer(uForestD, uForestN, p, 0.35, kFo, fo, nrm); col += fo*vec3(0.82,0.9,0.75);
      if (kF > 0.004) {
        vec3 so = vec3(0.); layer(uSoilD, uSoilN, p, 0.3, kF, so, nrm);
        // crop fields: rows of green / golden crops on red laterite soil, separated by earthen bunds
        vec2 fc = floor((p + vec2(13.,7.)) / vec2(70., 48.)); float fh = h21(mod(fc, 289.));
        vec2 ff = fract((p + vec2(13.,7.)) / vec2(70., 48.));
        float bund = 1. - step(0.035, min(min(ff.x, 1.-ff.x), min(ff.y, 1.-ff.y)));
        float rows = smoothstep(0.25, 0.75, 0.5 + 0.5*sin((fh > 0.5 ? p.x : p.y) * 3.4));
        vec3 crop = fh < 0.3 ? vec3(0.2,0.4,0.1) : fh < 0.5 ? vec3(0.36,0.5,0.14) : fh < 0.62 ? vec3(0.) : fh < 0.82 ? mix(vec3(0.4,0.5,0.12), vec3(0.75,0.62,0.2), dry*0.6 + uSeason.w) : vec3(0.58,0.5,0.25);
        float cover = fh < 0.5 ? 0.8 : fh < 0.62 ? 0.0 : 0.65;
        vec3 soilC = so/max(kF, 0.001);
        vec3 fieldC = mix(soilC, crop*(0.75 + 0.5*dot(soilC, vec3(0.5))), cover*rows*(1.-bund));
        col += fieldC*kF;
      }
      layer(uGroundD, uGroundN, p, 0.33, kU, col, nrm);
      layer(uSandD, uSandN, p, 0.24, kS, col, nrm);
      if (kR > 0.004) {
        #if HIGHQ == 1
        vec3 w3 = pow(abs(vWN), vec3(4.)); w3 /= (w3.x + w3.y + w3.z);
        vec3 rc = (texture2D(uRockD, vWP.zy*0.07).rgb*w3.x + texture2D(uRockD, vWP.xz*0.07).rgb*w3.y + texture2D(uRockD, vWP.xy*0.07).rgb*w3.z);
        rc = mix(rc, (texture2D(uRockD, vWP.zy*0.013).rgb*w3.x + texture2D(uRockD, vWP.xz*0.013).rgb*w3.y + texture2D(uRockD, vWP.xy*0.013).rgb*w3.z), 0.4);
        #else
        vec3 rc = texture2D(uRockD, p*0.06 + vec2(vWP.y*0.05, 0.)).rgb;
        #endif
        col += rc*kR;
        if (gNear > 0.0) nrm += nmapXZ(unpackN(texture2D(uRockN, p*0.06 + vec2(vWP.y*0.05, 0.)), 1.2), vWN)*kR*gNear;
      }
      float snow = smoothstep(880., 1020., vWP.y + nn*60.) * uSeason.w * (1. - smoothstep(0.45, 0.65, slope));
      col = mix(col, vec3(0.92,0.94,0.98), snow);
      gWet = uWet * (1. - rk*0.5);
      col *= mix(1.0, 0.6, gWet * (1. - kS*0.4));
      gWN = normalize(mix(vWN, nrm + vWN*(1.-gNear), gNear > 0.0 ? 1.0 : 0.0));
      gWN = normalize(mix(gWN, vWN, snow));
      diffuseColor.rgb = col;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.95, 0.32, gWet*0.85);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (vWP.y < -0.35) {
          vec2 cq = vWP.xz*0.55; float ct = uTime*0.9; float cc = 0.;
          for (int i = 0; i < 3; i++) { cq = vec2(cq.x + sin(cq.y*1.6 + ct)*0.55, cq.y + cos(cq.x*1.8 - ct*1.1)*0.55); cc += 0.045/abs(sin(cq.x*2.1)*sin(cq.y*1.9) + 0.07); ct *= 1.27; cq *= 1.37; }
          float ck = smoothstep(-0.35, -1.6, vWP.y) * exp(vWP.y*0.07) * clamp(uSunCaus.y*3., 0., 1.);
          totalEmissiveRadiance += diffuseColor.rgb*uSunCausC*clamp(cc*0.22 - 0.12, 0., 1.6)*ck*1.4;
          diffuseColor.rgb *= mix(vec3(1.), vec3(0.62,0.86,0.9), smoothstep(-0.3, -4., vWP.y));
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize((viewMatrix*vec4(gWN, 0.)).xyz);`);
  });
  return mat;
}

// ---------- chunked terrain tiles ----------
function tileGeo(ti, tj, tilesPer, segs, skirt) {
  const tileSize = (2 * M.HALF) / tilesPer, step = (M.N / tilesPer) / segs; // grid cells per vertex
  const v = segs + 1, nv = v * v + 4 * v;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
  const gi0 = ti * (M.N / tilesPer), gj0 = tj * (M.N / tilesPer);
  const Hh = (i, j) => M.H[clamp(i, 0, M.N) + clamp(j, 0, M.N) * M.W1];
  let k = 0;
  const put = (i, j, dy) => {
    const gi = gi0 + i * step, gj = gj0 + j * step;
    pos[k * 3] = -M.HALF + gi * M.CELL; pos[k * 3 + 1] = Hh(gi, gj) - dy; pos[k * 3 + 2] = -M.HALF + gj * M.CELL;
    const s = Math.max(1, step);
    const nx = Hh(gi - s, gj) - Hh(gi + s, gj), nz = Hh(gi, gj - s) - Hh(gi, gj + s), ny = 2 * s * M.CELL, l = Math.hypot(nx, ny, nz);
    nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l; k++;
  };
  for (let j = 0; j <= segs; j++) for (let i = 0; i <= segs; i++) put(i, j, 0);
  const idx = [];
  for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) { const a = i + j * v, b = a + 1, c = a + v, d = c + 1; idx.push(a, c, b, b, c, d); }
  // skirts (north, south, west, east)
  const edges = [[(i) => [i, 0], (i) => i], [(i) => [i, segs], (i) => i + segs * v], [(i) => [0, i], (i) => i * v], [(i) => [segs, i], (i) => segs + i * v]];
  edges.forEach(([ij, top], e) => {
    const base = k;
    for (let i = 0; i <= segs; i++) { const [a, b] = ij(i); put(a, b, skirt); }
    for (let i = 0; i < segs; i++) {
      const t0 = top(i), t1 = top(i + 1), s0 = base + i, s1 = base + i + 1;
      idx.push(t0, t1, s0, t1, s1, s0, t0, s0, t1, t1, s0, s1);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
export function buildTerrainTiles(scene, mat, q) {
  const tilesPer = q.desktop ? 32 : 16, segsL = [64, 32, 16, 8];
  const ts = (2 * M.HALF) / tilesPer;
  T.tilesPer = tilesPer;
  for (let tj = 0; tj < tilesPer; tj++) for (let ti = 0; ti < tilesPer; ti++) {
    const geos = [null, null, null, null];
    geos[3] = tileGeo(ti, tj, tilesPer, segsL[3], 80);
    const m = new THREE.Mesh(geos[3], mat); m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m);
    const cx = -M.HALF + (ti + 0.5) * ts, cz = -M.HALF + (tj + 0.5) * ts;
    T.tiles.push({ m, geos, ti, tj, cx, cz, cy: M.terrainH(cx, cz), lod: 3, segsL, tilesPer, size: ts });
  }
}
export function updateTerrain(cam, q, force = false) {
  const th = q.terrainLod; // distances (in tile sizes)
  let built = 0;
  for (const t of T.tiles) {
    const d = Math.max(Math.hypot(cam.x - t.cx, cam.z - t.cz) - t.size * 0.7, 0) + Math.max(0, cam.y - 300) * 0.3;
    const want = d < th[0] ? 0 : d < th[1] ? 1 : d < th[2] ? 2 : 3;
    if (want !== t.lod) {
      if (!t.geos[want]) { if (!force && ((built > 3 && want > t.lod) || built > 6)) continue; t.geos[want] = tileGeo(t.ti, t.tj, t.tilesPer, t.segsL[want], [8, 20, 40, 80][want]); built++; }
      t.lod = want; t.m.geometry = t.geos[want];
    }
  }
}

// ---------- water ----------
export function waterMaterial(level, hTex) {
  return new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, uniforms: { ...U, uHeight: { value: hTex }, uHN: { value: M.N }, uHalf: { value: M.HALF }, uLevel: { value: level } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform float uTime,uNight,uFogDensity,uLevel,uRain; uniform vec3 uSunDir,uSunColor,uZenith,uHorizon,uFogColor,uAmbient; varying vec3 vW;
    ${NOISE}
    ${HEIGHT_GLSL}
    float murky0(float m){ return 1. - m*0.6; }
    vec2 wv(vec2 p, vec2 d, float f, float a, float s){ float ph = dot(p,d)*f + uTime*s; return d*(cos(ph)*a*f); }
    void main(){
      vec2 p = vW.xz;
      float depth = (abs(p.x) < uHalf && abs(p.y) < uHalf) ? uLevel - hAt(p) : 40.;
      float dist = length(cameraPosition - vW);
      vec2 g = wv(p, normalize(vec2(0.9,0.3)), 0.06, 0.4, 1.2) + wv(p, normalize(vec2(0.7,-0.6)), 0.13, 0.17, 1.9) + wv(p, normalize(vec2(-0.2,1.)), 0.23, 0.08, 2.6) + wv(p, normalize(vec2(1.,0.9)), 0.51, 0.035, 3.6);
      g += (vec2(vn(p*0.9 + uTime*0.4), vn(p*0.9 - uTime*0.35+7.)) - 0.5)*0.12;
      float rn = vn(p*6. + uTime*7.); g += (vec2(rn, vn(p*6.-uTime*6.)) - 0.5)*0.35*uRain;
      g *= mix(1.0, 0.25, smoothstep(150., 3000., dist)) * mix(0.35, 1.0, smoothstep(0., 6., depth));
      // close-range capillary ripples: the sparkle in the sun / lamp glitter path
      float nearW = 1. - smoothstep(25., 380., dist);
      g += (vec2(vn(p*2.6 + uTime*vec2(1.3, 0.4)), vn(p*2.6 - uTime*vec2(0.5, 1.2) + 5.)) - 0.5)*0.22*nearW;
      vec3 n = normalize(vec3(-g.x, 1., -g.y));
      vec3 V = normalize(cameraPosition - vW);
      if (cameraPosition.y < uLevel - 0.02) {
        // seen from under water: bright Snell's window overhead, mirror-dark beyond the critical angle
        float up = clamp(-V.y, 0., 1.), win = smoothstep(0.62, 0.8, up + dot(g, g)*0.4);
        vec3 skyU = mix(uHorizon, uZenith, 0.6)*1.25 + uSunColor*pow(max(dot(-V, uSunDir), 0.), 40.)*2.5;
        vec3 deepU = uFogColor*0.75;
        vec3 cu = mix(deepU, skyU, win) + (vn(p*1.5 + uTime*0.6) - 0.5)*0.06*win;
        float fu = 1. - exp(-uFogDensity*uFogDensity*length(cameraPosition - vW)*length(cameraPosition - vW));
        gl_FragColor = vec4(mix(cu, uFogColor, fu*0.85), 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        return;
      }
      float fres = 0.02 + 0.98*pow(1. - max(dot(n,V),0.), 5.);
      vec3 Rf = reflect(-V, n);
      vec3 sky = mix(uHorizon, uZenith, clamp(Rf.y*1.6, 0., 1.)) + vec3(0.025,0.04,0.08)*uNight;
      vec3 moonD = normalize(vec3(-uSunDir.x, -uSunDir.y*0.5, 0.8));
      float murky = (uLevel > 1. || (p.x > -2900. && p.x < 6100.)) ? 1. : 0.;
      vec3 deep = mix(vec3(0.012,0.12,0.19), vec3(0.05,0.1,0.07), murky), shal = mix(vec3(0.05,0.5,0.47), vec3(0.2,0.24,0.14), murky);
      vec3 light = uAmbient + uSunColor*max(uSunDir.y,0.)*0.6 + vec3(0.05,0.07,0.12)*uNight*max(moonD.y, 0.3);
      vec3 col = mix(mix(shal, deep, smoothstep(0., 12., depth))*light, sky, fres*0.75);
      float sd = max(dot(Rf, uSunDir), 0.);
      col += uSunColor*(pow(sd, 700.)*25. + pow(sd, 2400.)*60.*nearW + pow(sd, 50.)*0.25 + pow(sd, 160.)*1.3*(1. - smoothstep(0.05, 0.4, uSunDir.y)))*step(0.,uSunDir.y)*(1.-uRain*0.8);
      float md = max(dot(Rf, moonD), 0.);
      col += vec3(0.55,0.65,0.9)*(pow(md, 400.)*6. + pow(md, 24.)*0.18)*uNight*step(0., moonD.y)*(1.-uRain*0.8);
      // surf: wave sets roll toward the beach, steepen and break in 0.3-3 m of water, leaving whitewash and lacy swash
      float ph = depth*1.15 + uTime*0.95 + vn(p*0.012)*4.0 + vn(p*0.05 + 3.)*1.4;
      float w = fract(ph/6.2832);
      float zone = smoothstep(3.4, 2.0, depth)*smoothstep(0.02, 0.35, depth)*murky0(murky);
      float brk = smoothstep(0.35, 0.7, vn(p*vec2(0.09, 0.03) + vec2(0., floor(ph/6.2832)*1.7)) + 0.25);
      float crest = smoothstep(0.955, 0.992, w)*smoothstep(1.0, 0.996, w) + exp(-w*9.0)*0.85;
      float wash = exp(-w*3.2)*0.45*smoothstep(0.45, 0.75, vn(p*0.45 + vec2(uTime*0.15, 0.)) + vn(p*1.7)*0.4);
      float foam = (crest + wash)*zone*brk;
      float lace = smoothstep(0.5, 0.72, vn(p*1.2 + uTime*vec2(0.2, 0.05)) + vn(p*4.0)*0.3)*smoothstep(0.45, 0.0, depth)*0.8;
      foam = clamp(max(foam, lace) + smoothstep(0.12, 0.0, depth)*0.5, 0., 1.)*(1. - murky*0.5);
      col = mix(col, vec3(0.95)*(light*1.05 + uSunColor*0.25*max(uSunDir.y, 0.)), foam);
      float alpha = mix(0.4, 1., smoothstep(0., murky > 0.5 ? 2.5 : 8., depth)) * mix(1., 0.85, (1. - fres)*(1. - murky)*(1. - smoothstep(4., 16., depth)));
      alpha = mix(alpha, 1.0, smoothstep(0.12, 0.6, fres));   // grazing views see the reflection, not the sand below
      float f = 1. - exp(-uFogDensity*uFogDensity*dist*dist);
      col = mix(col, uFogColor, f);
      gl_FragColor = vec4(col, max(alpha, f));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
}
export function buildWaters(scene, hTex, fallsTop) {
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(90000, 90000, 1, 1).rotateX(-Math.PI / 2), waterMaterial(0, hTex));
  sea.renderOrder = 1; scene.add(sea);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(M.PLAT.lr + 34, 64).rotateX(-Math.PI / 2), waterMaterial(M.PLAT.water, hTex));
  lake.position.set(M.PLAT.lx, M.PLAT.water, M.PLAT.lz); lake.renderOrder = 1; scene.add(lake);
  const chLen = M.PLAT.lx - (fallsTop + 2);
  const ch = new THREE.Mesh(new THREE.PlaneGeometry(chLen, 40).rotateX(-Math.PI / 2), lake.material);
  ch.position.set(M.PLAT.lx - chLen / 2, M.PLAT.water, M.PLAT.z); ch.renderOrder = 1; scene.add(ch);
  T.sea = sea; T.lake = lake;
}

// ---------- grass + crops (camera-following, GPU placed) ----------
export function buildGrass(scene, hTex, occTex, splat, q) {
  if (q.grassR <= 0) return;
  const R1 = Math.round(q.grassR * 0.42);
  const inner = grassRing(scene, hTex, occTex, splat, q, R1, q.grassSp, 0);
  const outer = grassRing(scene, hTex, occTex, splat, q, q.grassR, q.grassSp * 2, R1);
  T.grass = { meshes: [inner.mesh, outer.mesh], unis: [inner.uni, outer.uni] };
}
function grassRing(scene, hTex, occTex, splat, q, R, sp, R0) {
  const n = Math.floor((2 * R) / sp), count = n * n;
  // one tuft = 5 curved, tapering leaves leaning outwards (built at unit height; the shader scales it)
  const P = [], C = [], NB = q.desktop ? 5 : 4, SEG = q.desktop ? 4 : 3;
  for (let b = 0; b < NB; b++) {
    const a = b * 2.399 + 0.4, lean = 0.18 + (b % 3) * 0.1, ox = Math.cos(a) * 0.05, oz = Math.sin(a) * 0.05, w = 0.035 + (b % 2) * 0.012;
    const lx = Math.cos(a), lz = Math.sin(a), px = -lz, pz = lx; // lean direction and leaf width direction
    const hScale = 0.75 + (b % 4) * 0.1;
    const pt = (t, side) => { const ww = w * (1 - t * 0.92), bend = lean * t * t; return [ox + lx * bend + px * ww * side, t * hScale * (1 - 0.25 * lean * t), oz + lz * bend + pz * ww * side, t]; };
    for (let sg = 0; sg < SEG; sg++) {
      const t0 = sg / SEG, t1 = (sg + 1) / SEG;
      const q = [pt(t0, -1), pt(t0, 1), pt(t1, -1), pt(t1, 1)];
      for (const id of [0, 2, 1, 1, 2, 3]) { const v = q[id]; P.push(v[0], v[1], v[2]); C.push(v[3]); }
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(C, 1));
  const nrm = new Float32Array(P.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const off = new Float32Array(count * 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = i + j * n; off[k * 2] = (i + Math.random() * 0.9) * sp; off[k * 2 + 1] = (j + Math.random() * 0.9) * sp; }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 2)); g.instanceCount = count;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide });
  const uni = { uHeight: { value: hTex }, uHN: { value: M.N }, uHalf: { value: M.HALF }, uOcc: { value: occTex }, uSplat: { value: splat }, uCam: { value: new THREE.Vector3() }, uR: { value: R }, uR0: { value: R0 }, uTime: U.uTime, uSeason: U.uSeason, uSunColor: U.uSunColor, uSunDir: U.uSunDir };
  patch(mat, (s) => {
    Object.assign(s.uniforms, uni);
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
      attribute float aT; attribute vec2 aOff; uniform sampler2D uOcc, uSplat; uniform vec3 uCam; uniform float uR, uR0, uTime; uniform vec4 uSeason; varying float vT; varying vec3 vGc; varying float vDist;
      ${HEIGHT_GLSL}
      float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }`)
      .replace('#include <begin_vertex>', `
      float span = 2.0*uR;
      vec2 wp = aOff + span*floor((uCam.xz - aOff)/span + 0.5);
      vec2 suv0 = (wp + uHalf)/(2.*uHalf);
      float field = texture2D(uSplat, suv0).b;
      vec2 fc = floor((wp + vec2(13.,7.)) / vec2(70., 48.)); float fh = fract(sin(dot(mod(fc,289.), vec2(12.9898,78.233)))*43758.5453);
      // crops grow in straight rows 0.9 m apart
      if (field > 0.5) { if (fh > 0.5) wp.y = (floor(wp.y/0.9) + 0.5)*0.9; else wp.x = (floor(wp.x/0.9) + 0.5)*0.9; }
      float r1 = hh(floor(wp*3.1)), r2 = hh(floor(wp*1.7)+3.);
      vec2 suv = (wp + uHalf)/(2.*uHalf);
      vec4 spl = texture2D(uSplat, suv);
      float occ = texture2D(uOcc, suv).r;
      float y = hAt(wp);
      float dist = length(wp - uCam.xz); vDist = dist;
      float dens = (1. - spl.r)*(1. - smoothstep(0.2,0.6,spl.a))*(1.-spl.g*0.35)*step(occ, 0.02);
      dens *= step(0.8, y) * step(r1, 0.92) * (1. - smoothstep(uR*0.7, uR, dist)) * step(uR0, dist);
      float slopeOk = 1.0 - smoothstep(0.6, 1.4, abs(hAt(wp+vec2(2.,0.)) - y) + abs(hAt(wp+vec2(0.,2.)) - y));
      dens *= slopeOk;
      float bund = 1. - step(0.05, min(min(fract((wp.x+13.)/70.), 1.-fract((wp.x+13.)/70.)), min(fract((wp.y+7.)/48.), 1.-fract((wp.y+7.)/48.))));
      float cropH = fh < 0.25 ? 1.45 : fh < 0.45 ? 0.62 : fh < 0.62 ? 0.0 : fh < 0.8 ? 0.95 : 0.7;
      float ht = mix(0.2 + r2*0.22, cropH*(0.85 + r2*0.3), field) * (1. - bund*field);
      ht *= mix(1.0, 1.25, uSeason.x) * mix(1.0, 0.75, uSeason.y);
      vec3 base = mix(vec3(0.09,0.16,0.04), vec3(0.16,0.17,0.06), uSeason.y);
      vec3 tip = mix(mix(vec3(0.3,0.48,0.12), vec3(0.55,0.52,0.24), uSeason.y), vec3(0.28,0.52,0.11), uSeason.x);
      tip *= 0.85 + 0.3*r2;
      if (field > 0.5) {
        if (fh < 0.25) { base = vec3(0.1,0.2,0.05); tip = vec3(0.32,0.5,0.16); }
        else if (fh < 0.45) { base = vec3(0.12,0.26,0.06); tip = vec3(0.38,0.66,0.18); }
        else if (fh < 0.8 && fh >= 0.62) { base = vec3(0.2,0.26,0.07); tip = mix(vec3(0.45,0.55,0.15), vec3(0.85,0.7,0.16), 0.35 + uSeason.w*0.6); }
        else { tip = vec3(0.7,0.6,0.28); base = vec3(0.35,0.3,0.14); }
      }
      vGc = mix(base, tip, smoothstep(0.0, 1.0, aT)); vT = aT;
      float s = ht * dens;
      float wsc = mix(1.0, 1.6, field);
      vec3 transformed = position * vec3(wsc*max(s, 0.25)/0.5, s, wsc*max(s, 0.25)/0.5);
      transformed.xz *= step(0.001, s);
      float ang = r1*6.283; transformed.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * transformed.xz;
      float wind = sin(uTime*1.7 + wp.x*0.15 + wp.y*0.11)*0.5 + sin(uTime*3.1 + wp.x*0.5)*0.2;
      transformed.x += wind*aT*aT*0.25*s; transformed.z += wind*aT*aT*0.12*s;
      transformed *= mix(1.0, 1.25, step(0.5, uR0)); // outer ring tufts are a little larger to keep coverage
      transformed += vec3(wp.x, y - 0.04, wp.y);`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vT; varying vec3 vGc; varying float vDist; uniform vec3 uSunColor; uniform vec3 uSunDir;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vGc*(0.55 + 0.45*vT);')
      // blades are lit like the ground they grow from: an up-facing normal on both sides (no black back faces)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz); nonPerturbedNormal = normal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGc*uSunColor*0.18*vT*vT*max(uSunDir.y, 0.);');
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.userData.noAO = true; scene.add(mesh);
  return { mesh, uni };
}
export function updateGrass(cam) { if (T.grass) for (const u of T.grass.unis) u.uCam.value.copy(cam); }
export function occTexture() {
  // occupancy (5 m) downsampled to 2 x 2 max
  const S = 2000, src = M.occ, SN = 4000, d = new Uint8Array(S * S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const a = src[i * 2 + j * 2 * SN], b = src[i * 2 + 1 + j * 2 * SN], c = src[i * 2 + (j * 2 + 1) * SN], e = src[i * 2 + 1 + (j * 2 + 1) * SN];
    d[i + j * S] = (a === 1 || a === 2 || b === 1 || b === 2 || c === 1 || c === 2 || e === 1 || e === 2) ? 255 : 0;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RedFormat); t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
}
