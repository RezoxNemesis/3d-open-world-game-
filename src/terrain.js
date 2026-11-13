// Terrain: biome splat map, procedural detail textures, chunked LOD tiles, water, grass/crops.
import * as THREE from 'three';
import * as M from './mapdata.js';
import { U, NOISE, patch } from './shaders.js';
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
export function terrainMaterial(det, splat, q) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  mat.defines = { HIGHQ: q.desktop ? 1 : 0 };
  patch(mat, (s) => {
    Object.assign(s.uniforms, { uSplat: { value: splat }, uGrassT: { value: det.grass }, uRockT: { value: det.rock }, uSandT: { value: det.sand }, uDirtT: { value: det.dirt }, uSeason: U.uSeason, uWet: U.uWet, uTime: U.uTime });
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix*vec4(transformed,1.)).xyz; vWN = normalize(mat3(modelMatrix)*objectNormal);');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP; varying vec3 vWN;
      uniform sampler2D uSplat, uGrassT, uRockT, uSandT, uDirtT; uniform vec4 uSeason; uniform float uWet, uTime;
      ${NOISE}
      vec4 tri(sampler2D t, vec3 p, vec3 n){ vec3 w = pow(abs(n), vec3(4.)); w /= (w.x+w.y+w.z);
        return texture2D(t, p.zy)*w.x + texture2D(t, p.xz)*w.y + texture2D(t, p.xy)*w.z; }
      vec4 twoScale(sampler2D t, vec2 p, float s){ return mix(texture2D(t, p*s), texture2D(t, p*s*0.173+0.37), 0.35); }
      float gHeight; float gWet;
      vec3 bumpN(vec3 sp, vec3 sn, float dhx, float dhy){ vec3 sx = dFdx(sp), sy = dFdy(sp); vec3 r1 = cross(sy, sn), r2 = cross(sn, sx); float det = dot(sx, r1); vec3 g = sign(det)*(dhx*r1 + dhy*r2); return normalize(abs(det)*sn - g); }`)
      .replace('#include <map_fragment>', `
      vec2 suv = (vWP.xz + ${M.HALF.toFixed(1)}) / ${(2 * M.HALF).toFixed(1)};
      vec4 sp = texture2D(uSplat, suv);
      float slope = 1.0 - clamp(vWN.y, 0., 1.);
      vec2 p = vWP.xz;
      float camD = length(vViewPosition);
      vec4 gt = twoScale(uGrassT, p, 0.16);
      vec4 st = twoScale(uSandT, p, 0.13);
      vec4 dt = twoScale(uDirtT, p, 0.11);
      #if HIGHQ == 1
      vec4 rt = tri(uRockT, vWP*0.045, vWN) * 0.6 + tri(uRockT, vWP*0.011, vWN) * 0.4;
      #else
      vec4 rt = texture2D(uRockT, p*0.045 + vec2(vWP.y*0.03, 0.));
      #endif
      float nn = vn(p*0.02), nm = vn(p*0.0035);
      float lush = uSeason.x, dry = uSeason.y;
      vec3 grassC = gt.rgb * mix(vec3(1.05,1.12,0.85), vec3(1.5,1.25,0.7), dry*0.8) * mix(1., 1.18, lush) * (0.82 + 0.3*nm);
      vec3 forestC = gt.rgb * vec3(0.62,0.72,0.52) * (0.8+0.3*nn) + dt.rgb*0.12;
      vec2 fc = floor((p + vec2(13.,7.)) / vec2(70., 48.)); float fh = h21(mod(fc, 289.));
      vec2 ff = fract((p + vec2(13.,7.)) / vec2(70., 48.));
      float bund = 1. - step(0.035, min(min(ff.x, 1.-ff.x), min(ff.y, 1.-ff.y)));
      float rows = 0.5 + 0.5*sin((fh > 0.5 ? p.x : p.y) * 3.4);
      vec3 crop = fh < 0.25 ? vec3(0.25,0.45,0.12) : fh < 0.45 ? vec3(0.42,0.56,0.18) : fh < 0.62 ? vec3(0.45,0.34,0.22) : fh < 0.8 ? mix(vec3(0.45,0.55,0.15), vec3(0.85,0.75,0.2), dry*0.5 + uSeason.w) : vec3(0.68,0.6,0.32);
      crop = mix(crop, crop*mix(1.0,0.75,rows), step(fh,0.62)) * (0.85 + 0.25*dt.a);
      crop = mix(crop, dt.rgb*0.9, bund);
      vec3 col = mix(grassC, forestC, sp.g);
      col = mix(col, crop, sp.b);
      vec3 urb = mix(dt.rgb, vec3(dot(dt.rgb, vec3(0.33))), 0.25) * vec3(1.3,1.24,1.14);
      col = mix(col, urb, smoothstep(0.1, 0.6, sp.a + (nn-0.5)*0.4));
      col = mix(col, st.rgb, smoothstep(0.35, 0.65, sp.r + (gt.a-0.5)*0.3));
      float rk = smoothstep(0.17, 0.34, slope + (nn-0.5)*0.12) + smoothstep(420., 900., vWP.y + nn*120.)*0.55*(1.-sp.g);
      rk = max(rk, smoothstep(950., 1150., vWP.y)*0.7);
      col = mix(col, rt.rgb, rk);
      float snow = smoothstep(880., 1020., vWP.y + nn*60.) * uSeason.w * (1. - smoothstep(0.45, 0.65, slope));
      col = mix(col, vec3(0.92,0.94,0.98), snow);
      gHeight = mix(mix(mix(gt.a, dt.a, sp.a), st.a, sp.r), rt.a, rk);
      float lowArea = 1. - smoothstep(0., 40., vWP.y);
      gWet = uWet * (1. - rk*0.5);
      col *= mix(1.0, 0.62, gWet * (1. - sp.r*0.4));
      float fade = smoothstep(1800., 6000., camD);
      diffuseColor.rgb = mix(col, col*0.97, fade);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.95, 0.35, gWet*0.8);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float bumpS = 0.3 * (1. - smoothstep(20., 140., length(vViewPosition)));
        normal = bumpN(-vViewPosition, normal, dFdx(gHeight)*bumpS, dFdy(gHeight)*bumpS);`);
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
    transparent: true, uniforms: { ...U, uHeight: { value: hTex }, uHN: { value: M.N }, uHalf: { value: M.HALF }, uLevel: { value: level } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform float uTime,uNight,uFogDensity,uLevel,uRain; uniform vec3 uSunDir,uSunColor,uZenith,uHorizon,uFogColor,uAmbient; varying vec3 vW;
    ${NOISE}
    ${HEIGHT_GLSL}
    vec2 wv(vec2 p, vec2 d, float f, float a, float s){ float ph = dot(p,d)*f + uTime*s; return d*(cos(ph)*a*f); }
    void main(){
      vec2 p = vW.xz;
      float depth = (abs(p.x) < uHalf && abs(p.y) < uHalf) ? uLevel - hAt(p) : 40.;
      float dist = length(cameraPosition - vW);
      vec2 g = wv(p, normalize(vec2(0.9,0.3)), 0.06, 0.4, 1.2) + wv(p, normalize(vec2(0.7,-0.6)), 0.13, 0.17, 1.9) + wv(p, normalize(vec2(-0.2,1.)), 0.23, 0.08, 2.6) + wv(p, normalize(vec2(1.,0.9)), 0.51, 0.035, 3.6);
      g += (vec2(vn(p*0.9 + uTime*0.4), vn(p*0.9 - uTime*0.35+7.)) - 0.5)*0.12;
      float rn = vn(p*6. + uTime*7.); g += (vec2(rn, vn(p*6.-uTime*6.)) - 0.5)*0.35*uRain;
      g *= mix(1.0, 0.25, smoothstep(150., 3000., dist)) * mix(0.35, 1.0, smoothstep(0., 6., depth));
      vec3 n = normalize(vec3(-g.x, 1., -g.y));
      vec3 V = normalize(cameraPosition - vW);
      float fres = 0.02 + 0.98*pow(1. - max(dot(n,V),0.), 5.);
      vec3 Rf = reflect(-V, n);
      vec3 sky = mix(uHorizon, uZenith, clamp(Rf.y*1.6, 0., 1.));
      float murky = (uLevel > 1. || (p.x > -2900. && p.x < 6100.)) ? 1. : 0.;
      vec3 deep = mix(vec3(0.01,0.08,0.12), vec3(0.05,0.1,0.07), murky), shal = mix(vec3(0.05,0.32,0.31), vec3(0.2,0.24,0.14), murky);
      vec3 light = uAmbient + uSunColor*max(uSunDir.y,0.)*0.6;
      vec3 col = mix(mix(shal, deep, smoothstep(0., 9., depth))*light, sky, fres*0.85);
      float sd = max(dot(Rf, uSunDir), 0.);
      col += uSunColor*(pow(sd, 700.)*25. + pow(sd, 50.)*0.25)*step(0.,uSunDir.y)*(1.-uRain*0.8);
      float band = sin(depth*6. - uTime*1.6 + vn(p*0.3)*6.)*0.5+0.5;
      float foam = (1. - smoothstep(0., 1.5, depth))*smoothstep(0.6, 0.95, band*0.75 + vn(p*0.35+uTime*0.2)*0.35)*0.7;
      foam = max(foam, smoothstep(0.35, 0.0, depth)*0.6);
      col = mix(col, vec3(0.92)*light*1.1, foam);
      float alpha = mix(0.45, 1., smoothstep(0., 2.5, depth));
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
  const R = q.grassR, sp = q.grassSp;
  if (R <= 0) return;
  const n = Math.floor((2 * R) / sp), count = n * n;
  // clump of 3 blades
  const P = [], C = [];
  for (let b = 0; b < 3; b++) {
    const a = b * 2.1 + 0.3, ox = Math.cos(a * 1.7) * 0.12, oz = Math.sin(a * 1.3) * 0.12, w = 0.045;
    const dx = Math.cos(a) * w, dz = Math.sin(a) * w, seg = 3;
    for (let s = 0; s < seg; s++) {
      const t0 = s / seg, t1 = (s + 1) / seg, w0 = 1 - t0, w1 = 1 - t1;
      const quad = [[-dx * w0, t0, -dz * w0, t0], [dx * w0, t0, dz * w0, t0], [-dx * w1, t1, -dz * w1, t1], [dx * w1, t1, dz * w1, t1]];
      for (const id of [0, 2, 1, 1, 2, 3]) { const qv = quad[id]; P.push(qv[0] + ox, qv[1], qv[2] + oz); C.push(qv[3]); }
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(C, 1));
  const nrm = new Float32Array(P.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const off = new Float32Array(count * 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = i + j * n; off[k * 2] = (i + Math.random() * 0.9) * sp; off[k * 2 + 1] = (j + Math.random() * 0.9) * sp; }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 2)); g.instanceCount = count;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
  const uni = { uHeight: { value: hTex }, uHN: { value: M.N }, uHalf: { value: M.HALF }, uOcc: { value: occTex }, uSplat: { value: splat }, uCam: { value: new THREE.Vector3() }, uR: { value: R }, uTime: U.uTime, uSeason: U.uSeason };
  patch(mat, (s) => {
    Object.assign(s.uniforms, uni);
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
      attribute float aT; attribute vec2 aOff; uniform sampler2D uOcc, uSplat; uniform vec3 uCam; uniform float uR, uTime; uniform vec4 uSeason; varying float vT; varying vec3 vGc;
      ${HEIGHT_GLSL}
      float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }`)
      .replace('#include <begin_vertex>', `
      float span = 2.0*uR;
      vec2 wp = aOff + span*floor((uCam.xz - aOff)/span + 0.5);
      float r1 = hh(floor(wp*3.1)), r2 = hh(floor(wp*1.7)+3.);
      vec2 suv = (wp + uHalf)/(2.*uHalf);
      vec4 spl = texture2D(uSplat, suv);
      float occ = texture2D(uOcc, suv).r;
      float y = hAt(wp);
      float dist = length(wp - uCam.xz);
      float field = spl.b;
      float dens = (1. - spl.r)*(1. - smoothstep(0.2,0.6,spl.a))*(1.-spl.g*0.35)*step(occ, 0.02);
      dens *= step(0.8, y) * step(r1, 0.92) * (1. - smoothstep(uR*0.75, uR, dist));
      float slopeOk = 1.0 - smoothstep(0.6, 1.4, abs(hAt(wp+vec2(2.,0.)) - y) + abs(hAt(wp+vec2(0.,2.)) - y));
      dens *= slopeOk;
      vec2 fc = floor((wp + vec2(13.,7.)) / vec2(70., 48.)); float fh = fract(sin(dot(mod(fc,289.), vec2(12.9898,78.233)))*43758.5453);
      float ht = mix(0.22 + r2*0.3, fh < 0.25 ? 2.3 : fh < 0.45 ? 0.55 : fh < 0.62 ? 0.0 : fh < 0.8 ? 1.1 : 0.85, field);
      ht *= mix(1.0, 1.35, uSeason.x) * mix(1.0, 0.7, uSeason.y);
      vec3 base = mix(vec3(0.11,0.2,0.05), vec3(0.18,0.24,0.06), uSeason.y);
      vec3 tip = mix(mix(vec3(0.38,0.58,0.16), vec3(0.62,0.6,0.28), uSeason.y), vec3(0.32,0.62,0.14), uSeason.x);
      if (field > 0.5) { if (fh < 0.25) { base = vec3(0.12,0.24,0.06); tip = vec3(0.35,0.55,0.18); } else if (fh < 0.45) { tip = vec3(0.4,0.75,0.2); } else if (fh < 0.8 && fh >= 0.62) { tip = mix(vec3(0.5,0.6,0.15), vec3(0.98,0.82,0.12), 0.4 + uSeason.w*0.6); } else { tip = vec3(0.8,0.68,0.3); base = vec3(0.4,0.33,0.15); } }
      vGc = mix(base, tip, aT); vT = aT;
      float s = ht * dens;
      vec3 transformed = position * vec3(1.0 + field*0.8, s, 1.0 + field*0.8);
      float ang = r1*6.283; transformed.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * transformed.xz;
      float wind = sin(uTime*1.7 + wp.x*0.15 + wp.y*0.11)*0.5 + sin(uTime*3.1 + wp.x*0.5)*0.2;
      transformed.x += wind*aT*aT*0.35*s; transformed.z += wind*aT*aT*0.15*s;
      transformed += vec3(wp.x, y - 0.05, wp.y);`)
      .replace('#include <color_vertex>', '#include <color_vertex>');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vT; varying vec3 vGc;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vGc;');
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.receiveShadow = true; scene.add(mesh);
  T.grass = { mesh, uni };
}
export function updateGrass(cam) { if (T.grass) T.grass.uni.uCam.value.copy(cam); }
export function occTexture() {
  // occupancy (5 m) downsampled to 2 x 2 max
  const S = 2000, src = M.occ, SN = 4000, d = new Uint8Array(S * S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const a = src[i * 2 + j * 2 * SN], b = src[i * 2 + 1 + j * 2 * SN], c = src[i * 2 + (j * 2 + 1) * SN], e = src[i * 2 + 1 + (j * 2 + 1) * SN];
    d[i + j * S] = (a === 1 || a === 2 || b === 1 || b === 2 || c === 1 || c === 2 || e === 1 || e === 2) ? 255 : 0;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RedFormat); t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
}
