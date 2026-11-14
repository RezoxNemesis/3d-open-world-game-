// Near-LOD buildings from the Blender facade kit (tools/blender/kit_facades.py -> assets/models/kit_facades.glb).
// Within a few hundred metres every town, colonial and hotel building is dressed with real 3D bays: moulded arched
// windows with louvred shutters, iron balconies, arched doors, grilled windows under concrete chajjas, shops with
// rolling shutters and sign bands, hotel glazing with balconies, plinths, string courses, cornices and parapets.
// The far city stays the instanced facade-shader boxes; near the camera those boxes shrink into a roof-and-core.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as M from './mapdata.js';
import { U, NOISE, patch } from './shaders.js';
import { TEX, TEX_GLSL, assetURL } from './textures.js';
import { mulberry32 } from './util.js';

export const KIT = { T: 250, R: 0, uCam: { value: new THREE.Vector3(0, -1e5, 0) }, uR: { value: 0 } };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const BW = 3.3, FH = 3.3;

async function loadKit(file) {
  return new Promise((ok) => new GLTFLoader().load(assetURL(`assets/models/${file}.glb`), (g) => {
    const mods = {};
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld);
      geo.setAttribute('aMet', geo.attributes.uv); geo.setAttribute('aKit', geo.attributes.uv1);
      geo.deleteAttribute('uv1'); geo.computeBoundingSphere();
      mods[o.name] = geo;
    });
    ok(mods);
  }, undefined, () => ok(null)));
}

function kitMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
  patch(mat, (s) => {
    Object.assign(s.uniforms, { uNight: U.uNight, uWet: U.uWet, uTime: U.uTime, uPlD: { value: TEX.plaster.d }, uPlN: { value: TEX.plaster.n }, uStD: { value: TEX.stained.d }, uWoD: { value: TEX.wood.d } });
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aMet; attribute vec2 aKit; attribute float aSeed; varying vec2 vMet; varying vec2 vKit; varying float vSeed; varying vec3 vKW; varying float vKY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMet = aMet; vKit = aKit; vSeed = aSeed; vKY = position.y;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvKW = (modelMatrix*instanceMatrix*vec4(transformed, 1.)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight, uWet, uTime; uniform sampler2D uPlD, uPlN, uStD, uWoD; varying vec2 vMet; varying vec2 vKit; varying float vSeed; varying vec3 vKW; varying float vKY; float kRough, kMetal; vec3 kEmis;\n' + NOISE + TEX_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float id = floor(vKit.x), depth = vKit.y;
        vec2 mt = vMet;
        vec3 wallC = vColor.rgb;
        float n1 = vn(vKW.xz*0.35 + vKW.y*0.2), grime = smoothstep(0.35, 0.8, vn(vec2(vKW.x + vKW.z, vKW.y*0.25)*0.6));
        vec3 pl = tex2s(uPlD, mt, 0.45).rgb; float pll = dot(pl, vec3(0.33));
        vec3 st = texture2D(uStD, vec2(vKW.x + vKW.z, vKW.y)*0.18).rgb; float stl = dot(st, vec3(0.33));
        vec3 col; kRough = 0.88; kMetal = 0.0; kEmis = vec3(0.);
        float bSeed = floor(vSeed)/997., mSeed = fract(vSeed);
        float paint = fract(bSeed*7.31), lit = step(0.5, fract(mSeed*13.7 + floor(vKW.y/3.3)*0.37 + floor((vKW.x + vKW.z)/3.3)*0.21));
        vec3 woodC = paint < 0.25 ? vec3(0.13,0.36,0.33) : paint < 0.45 ? vec3(0.16,0.3,0.15) : paint < 0.65 ? vec3(0.15,0.25,0.42) : paint < 0.85 ? vec3(0.36,0.2,0.12) : vec3(0.45,0.12,0.1);
        if (id < 0.5) {                                  // painted lime plaster with streaks and grime
          col = wallC*(0.62 + 0.55*pll)*mix(1.0, 0.72 + 0.4*stl, 0.55);
          col *= 1.0 - grime*0.18 - smoothstep(2.5, 0.0, vKY)*0.1;
        } else if (id < 1.5) { col = vec3(0.93,0.91,0.86)*(0.7 + 0.45*pll)*mix(1.0, 0.8 + 0.3*stl, 0.4); kRough = 0.8; }
        else if (id < 2.5) {                             // louvred / panelled painted wood
          float lv = fract(mt.y*11.0); vec3 wd = texture2D(uWoD, mt*vec2(0.6, 2.0)).rgb;
          col = woodC*(0.55 + 0.6*dot(wd, vec3(0.33)))*(0.65 + 0.45*smoothstep(0.1, 0.5, lv));
          kRough = 0.55;
        } else if (id < 3.5) {                           // glass: reflective, warm rooms at night
          col = vec3(0.03,0.04,0.05); kRough = 0.05;
          kEmis = vec3(1.0,0.74,0.45)*lit*uNight*(0.6 + 0.4*vn(mt*3.0));
        } else if (id < 4.5) {                           // cast-iron railing: balusters, rails, scrolls
          float u = mt.x, v = mt.y;
          float bar = step(abs(fract(u/0.11) - 0.5), 0.09), rail = step(0.93, v) + step(v, 0.06) + step(abs(v - 0.55), 0.025);
          vec2 sc = vec2(fract(u/0.22) - 0.5, (v - 0.74)/0.32); float ring = step(abs(length(sc) - 0.3), 0.06)*step(abs(v - 0.74), 0.16);
          if (bar + rail + ring < 0.5) discard;
          col = vec3(0.045,0.047,0.05); kRough = 0.42; kMetal = 0.6;
        } else if (id < 5.5) {                           // corrugated rolling shutter
          col = vec3(0.5,0.52,0.53)*(0.7 + 0.4*smoothstep(0.2, 0.8, fract(mt.y*14.0)))*mix(1.0, 0.75, grime);
          kRough = 0.5; kMetal = 0.5;
        } else if (id < 6.5) {                           // shop sign band
          float hue = fract(mSeed*3.17 + bSeed*5.3);
          col = hue < 0.3 ? vec3(0.6,0.06,0.05) : hue < 0.55 ? vec3(0.06,0.18,0.5) : hue < 0.8 ? vec3(0.85,0.62,0.05) : vec3(0.08,0.35,0.15);
          float txt = step(0.55, vn(vec2(floor(mt.x*6.0), 1.0)*3.1))*step(abs(fract(mt.y*2.0 - 0.0) - 0.5), 0.22)*step(0.08, fract(mt.x*6.0));
          col = mix(col, vec3(0.95), txt*0.9); kRough = 0.45;
          kEmis = col*uNight*0.9;
        } else if (id < 7.5) { col = vec3(0.42,0.38,0.34)*(0.6 + 0.6*pll); kRough = 0.92; }
        else if (id < 8.5) { col = vec3(0.68,0.66,0.62)*(0.6 + 0.5*pll)*mix(1.0, 0.75 + 0.3*stl, 0.6); kRough = 0.9; }
        else if (id < 9.5) { col = vec3(0.22,0.3,0.32); kRough = 0.08; }
        else {                                           // window grill
          float g = step(abs(fract(mt.x/0.12) - 0.5), 0.1) + step(abs(fract(mt.y*4.0) - 0.5), 0.05);
          if (g < 0.5) discard;
          col = vec3(0.12,0.12,0.12); kRough = 0.5; kMetal = 0.5;
        }
        // recesses (window reveals, door depth) catch less light
        col *= mix(1.0, 0.55, smoothstep(0.02, 0.28, depth)*step(id, 1.5));
        col *= mix(1.0, 0.6, uWet*step(id, 1.5));
        diffuseColor.rgb = col;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(kRough, kRough*0.4, uWet);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = kMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += kEmis;');
  }, 'kitfacade');
  mat.vertexColors = false;
  return mat;
}

// another building stands at (x, z)? (facades that face a neighbour 0-2 m away are never seen: plain walls there)
let GRID = null;
function blocked(self, x, z) {
  if (!GRID) { GRID = new Map(); for (const b of M.buildings) { if (b.hidden) continue; for (let gx = Math.floor(b.x0 / 20); gx <= Math.floor(b.x1 / 20); gx++) for (let gz = Math.floor(b.z0 / 20); gz <= Math.floor(b.z1 / 20); gz++) { const k = gx * 100000 + gz; if (!GRID.has(k)) GRID.set(k, []); GRID.get(k).push(b); } } }
  for (const b of GRID.get(Math.floor(x / 20) * 100000 + Math.floor(z / 20)) || []) if (b !== self && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.h > 3) return true;
  return false;
}
// choose the modules for one building; returns [{mod, x, y, z, yaw, sx}]
function dress(b, rnd) {
  const out = [], w = b.x1 - b.x0, d = b.z1 - b.z0, floors = Math.max(1, Math.round((b.h - 0.6) / FH)), s = b.style;
  const faces = [
    { cx: (b.x0 + b.x1) / 2, cz: b.z0, len: w, nx: 0, nz: -1 }, { cx: (b.x0 + b.x1) / 2, cz: b.z1, len: w, nx: 0, nz: 1 },
    { cx: b.x0, cz: (b.z0 + b.z1) / 2, len: d, nx: -1, nz: 0 }, { cx: b.x1, cz: (b.z0 + b.z1) / 2, len: d, nx: 1, nz: 0 },
  ];
  // the front is the side that faces a road
  let front = 0, best = -1;
  faces.forEach((f, i) => { const o = M.occAt(f.cx + f.nx * 7, f.cz + f.nz * 7) === 2 ? 2 : 0; const sc = o + f.len / 100; if (sc > best) { best = sc; front = i; } });
  const colonial = s === 4, hotel = s === 2;
  faces.forEach((f, fi) => {
    const nb = Math.max(1, Math.round(f.len / BW)), bw = f.len / nb, sx = bw / BW, yaw = Math.atan2(f.nx, f.nz);
    const tx = -f.nz, tz = f.nx;                                   // along the facade
    const isFront = fi === front;
    const occluded = blocked(b, f.cx + f.nx * 2.2, f.cz + f.nz * 2.2) && blocked(b, f.cx + f.nx * 2.2 + tx * f.len * 0.3, f.cz + f.nz * 2.2 + tz * f.len * 0.3) && blocked(b, f.cx + f.nx * 2.2 - tx * f.len * 0.3, f.cz + f.nz * 2.2 - tz * f.len * 0.3);
    for (let j = 0; j < nb; j++) {
      const off = (j + 0.5) * bw - f.len / 2, x = f.cx + tx * off, z = f.cz + tz * off;
      const mid = Math.abs(j - (nb - 1) / 2) < 0.6, edge = j === 0 || j === nb - 1;
      if (occluded) { for (let k = 0; k < floors; k++) out.push({ mod: 'wall', x, y: b.y + 0.6 + k * FH, z, yaw, sx }); out.push({ mod: 'plinth', x, y: b.y, z, yaw, sx, trim: 1 }); out.push({ mod: colonial ? 'cornice' : 'parapet', x, y: b.y + 0.6 + floors * FH, z, yaw, sx }); continue; }
      out.push({ mod: 'plinth', x, y: b.y, z, yaw, sx, trim: 1 });
      for (let k = 0; k < floors; k++) {
        const y = b.y + 0.6 + k * FH; let m;
        if (colonial) m = k === 0 ? (isFront && mid ? 'col_door' : 'col_win') : (mid || (isFront && !edge && rnd() < 0.35) ? 'col_bal' : 'col_win');
        else if (hotel) m = k === 0 ? (isFront ? 'hotel_lobby' : 'wall') : (f.len > 10 || nb > 2 ? 'hotel_bay' : 'town_win');
        else m = k === 0 ? (isFront ? 'town_shop' : (rnd() < 0.5 ? 'town_win' : 'wall')) : (rnd() < 0.22 ? 'town_bal' : rnd() < 0.2 ? 'town_win_ac' : 'town_win');
        out.push({ mod: m, x, y, z, yaw, sx });
        if (k > 0) out.push({ mod: 'band', x, y, z, yaw, sx, trim: 1 });
      }
      out.push({ mod: colonial ? 'cornice' : 'parapet', x, y: b.y + 0.6 + floors * FH, z, yaw, sx });
    }
    // corner pilasters (also hide the panel ends where two facades meet)
    if (!occluded) for (const e of [-1, 1]) for (let k = 0; k < floors; k++) out.push({ mod: 'pilaster', x: f.cx + tx * e * (f.len / 2 - 0.2), y: b.y + 0.6 + k * FH, z: f.cz + tz * e * (f.len / 2 - 0.2), yaw, sx: 1, trim: 1 });
  });
  return out;
}

export async function buildKitCity(scene, q, H) {
  if (!q.desktop) return null;                           // phones keep the facade-shader boxes
  const [hi, lo] = await Promise.all([loadKit('kit_facades'), loadKit('kit_facades_lod')]); if (!hi) return null;
  // full-detail bays on the tiles around the camera, the bevel-free kit further out, facade-shader boxes beyond
  const mat = kitMaterial(), T = KIT.T, R1 = q.treeDensity >= 1 ? 240 : 170, R = q.treeDensity >= 1 ? 480 : 330;
  KIT.R = R; KIT.uR.value = R;
  const tiles = new Map();
  M.buildings.forEach((b, i) => {
    if (b.hidden || b.style === 3 || b.style === 5) return;
    const w = b.x1 - b.x0, d = b.z1 - b.z0; if (w < 4 || d < 4 || b.h < 3.5) return;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, k = Math.floor((cx + M.HALF) / T) + Math.floor((cz + M.HALF) / T) * 1000;
    if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push({ b, i });
  });
  let count = 0;
  for (const [k, list] of tiles) {
    const per = {};
    for (const { b, i } of list) {
      const rnd = mulberry32(Math.floor(b.seed * 1e9) + i), seed = b.seed, col = _c.set(b.color).clone();
      for (const it of dress(b, rnd)) (per[it.mod] ||= []).push({ ...it, seed, col });
    }
    for (const [mods, near, far] of [[hi, 0, R1], [lo || hi, R1, R]]) {
      const grp = new THREE.Group();
      for (const name in per) {
        const trim = ['band', 'plinth', 'pilaster', 'parapet'].includes(name);
        if (near > 0 && trim && name !== 'parapet') continue;          // the mid ring skips the small trims
        const geo = (trim && lo ? lo : mods)[name]; if (!geo) continue;
        const L = per[name], g = new THREE.BufferGeometry(); for (const a in geo.attributes) g.setAttribute(a, geo.attributes[a]); if (geo.index) g.setIndex(geo.index);
        const seeds = new Float32Array(L.length);
        const m = new THREE.InstancedMesh(g, mat, L.length);
        L.forEach((it, j) => { _m.compose(_p.set(it.x, it.y, it.z), _q.setFromEuler(_e.set(0, it.yaw, 0)), _s.set(it.sx, 1, 1)); m.setMatrixAt(j, _m); m.setColorAt(j, it.col); seeds[j] = Math.floor(it.seed * 997) + ((j * 0.1373) % 1) * 0.98; });   // integer part: the building (shutter paint), fraction: this bay
        g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
        m.castShadow = near === 0 && ['col_bal', 'town_bal', 'hotel_bay', 'cornice', 'town_shop', 'hotel_lobby', 'col_door'].includes(name); m.receiveShadow = true; m.computeBoundingSphere(); grp.add(m); if (near === 0) count += L.length;
      }
      grp.matrixAutoUpdate = false; scene.add(grp);
      H.regLod(grp, (k % 1000) * T - M.HALF + T / 2, Math.floor(k / 1000) * T - M.HALF + T / 2, far, near);
    }
  }
  return { tiles: tiles.size, modules: count };
}
