import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from './mapdata.js';
import { U, NOISE, patch } from './shaders.js';
import { R, rr, ri, pick, lerp, clamp, fbm, smooth, hexRGB } from './util.js';
import * as TR from './terrain.js';

export const world = { colliders: [], animated: [], beams: [], lightsMat: null, labels: [] };

// ---------------- helpers ----------------
function prep(g, color = 0xffffff) {
  if (g.index) g = g.toNonIndexed();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) {
    const c = new THREE.Color(color), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
  }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function T(g, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); g.applyMatrix4(_m); return g;
}
function boxUV(w, h, d, tile = 4) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  return g;
}
class Kit {
  constructor() { this.g = {}; }
  add(key, g, color) { (this.g[key] ||= []).push(prep(g, color)); return g; }
  box(key, w, h, d, x, y, z, color, ry = 0) { return this.add(key, T(boxUV(w, h, d), x, y + h / 2, z, ry), color); }
  build(mats, parent, shadows = true) {
    for (const k in this.g) {
      const geo = mergeGeometries(this.g[k]); if (!geo) continue;
      const m = new THREE.Mesh(geo, mats[k]); m.castShadow = shadows && k !== 'glow' && k !== 'glass'; m.receiveShadow = true; parent.add(m);
    }
    this.g = {};
  }
}
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function addCol(x0, z0, x1, z1, y0, y1, extra = {}) { world.colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1, ...extra }); }

// ---------------- textures ----------------
function stoneTex() {
  return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#5b3a2c'; c.fillRect(0, 0, w, h);
    const rows = 16;
    for (let r = 0; r < rows; r++) {
      const bh = h / rows; let x = (r % 2) * -40;
      while (x < w) {
        const bw = 50 + Math.random() * 50, l = 0.75 + Math.random() * 0.4;
        const base = [150 * l, 92 * l, 66 * l];
        c.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`; c.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
        for (let k = 0; k < 30; k++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '40,20,10' : '200,150,110'},${Math.random() * 0.25})`; c.fillRect(x + Math.random() * bw, r * bh + Math.random() * bh, 3 + Math.random() * 6, 2 + Math.random() * 4); }
        x += bw;
      }
    }
  });
}
function plasterTex() {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#e8e2d6'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 3000; k++) { const v = 200 + Math.random() * 55; c.fillStyle = `rgba(${v},${v - 5},${v - 15},0.15)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    for (let k = 0; k < 30; k++) { c.fillStyle = 'rgba(90,80,60,0.05)'; c.fillRect(Math.random() * w, 0, 3 + Math.random() * 10, h); }
  });
}

// ---------------- roads ----------------
function buildRoads(scene, stoneMat) {
  const P = [], UV = [], A = [], I = [];
  let vi = 0;
  const kit = new Kit();
  const typeCode = { major: 0, coast: 0, street: 1, link: 1, village: 2, fort: 3, runway: 4 };
  function ribbon(pts, w, lanes, t, len, lit, cw) {
    // pts: [{x,z,y,s}] centreline with s = distance
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], q = pts[Math.min(k + 1, pts.length - 1)], o = pts[Math.max(k - 1, 0)];
      let dx = q.x - o.x, dz = q.z - o.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const nx = dz * w / 2, nz = -dx * w / 2;
      P.push(p.x - nx, p.y, p.z - nz, p.x + nx, p.y, p.z + nz);
      UV.push(0, p.s, 1, p.s);
      A.push(cw ?? w, lanes, len, t + lit * 10, cw ?? w, lanes, len, t + lit * 10);
      if (k < pts.length - 1) { I.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3); }
      vi += 2;
    }
  }
  for (const e of M.edges) {
    const Aa = M.nodes[e.a], B = M.nodes[e.b];
    const ext = e.type === 'coast' ? 1.5 : 0;
    const dx = (B.x - Aa.x) / e.len, dz = (B.z - Aa.z) / e.len;
    const n = Math.max(1, Math.ceil(e.len / 8)), pts = [];
    for (let k = 0; k <= n; k++) {
      const s = -ext + (e.len + 2 * ext) * k / n, x = Aa.x + dx * s, z = Aa.z + dz * s;
      const y = e.elev ? lerp(Aa.y, B.y, clamp(s / e.len, 0, 1)) : M.terrainH(x, z) + 0.17;
      pts.push({ x, z, y, s });
    }
    const lit = e.type === 'major' || e.type === 'coast' || e.type === 'fort' ? 1 : 0;
    const sw = !e.elev && ['nani', 'moti', 'devka', 'jampore'].includes(e.zone) && (e.type === 'street' || e.type === 'major' || e.type === 'link') ? 1 : 0;
    ribbon(pts, e.w + sw * 5.2, e.type === 'village' ? 0 : e.lanes, (typeCode[e.type] ?? 1) + sw * 100, e.len, lit, e.w);
    if (e.elev) {
      // bridge structure
      const ya = Aa.y, yb = B.y, ang = Math.atan2(dx, dz), mid = e.len / 2;
      const g = T(boxUV(e.w + 1.2, 1.3, e.len + 0.5), (Aa.x + B.x) / 2, (ya + yb) / 2 - 0.75, (Aa.z + B.z) / 2, ang, Math.atan2(-(yb - ya), e.len));
      kit.add('concrete', g, 0xb9b4aa);
      for (const sd of [-1, 1]) kit.add('concrete', T(boxUV(0.35, 1.0, e.len + 0.5), (Aa.x + B.x) / 2 + dz * sd * (e.w / 2 + 0.4), (ya + yb) / 2 + 0.45, (Aa.z + B.z) / 2 - dx * sd * (e.w / 2 + 0.4), ang, Math.atan2(-(yb - ya), e.len)), 0xd8d2c4);
      for (let s = 8; s < e.len; s += 32) {
        const x = Aa.x + dx * s, z = Aa.z + dz * s, y = lerp(ya, yb, s / e.len), gb = Math.min(M.terrainH(x, z), 0);
        if (y - gb > 2.5) kit.add('concrete', T(new THREE.CylinderGeometry(1.1, 1.3, y - gb, 10), x, (y + gb) / 2 - 0.8, z), 0xa8a296);
      }
    }
  }
  // junction pads
  for (const nd of M.nodes) {
    if (nd.e.length < 3 || nd.elev) continue;
    let w = 0, side = 0; for (const ei of nd.e) { const E = M.edges[ei]; w = Math.max(w, E.w); if (['nani', 'moti', 'devka', 'jampore'].includes(E.zone) && E.type !== 'fort' && E.type !== 'village') side = 1; }
    w += side * 5.2;
    const pts = [{ x: nd.x, z: nd.z - w / 2 - 1, y: M.terrainH(nd.x, nd.z) + 0.2, s: 0 }, { x: nd.x, z: nd.z + w / 2 + 1, y: M.terrainH(nd.x, nd.z) + 0.2, s: w + 2 }];
    ribbon(pts, w + 2, -1, 9, w + 2, 0);
  }
  // runway + taxiway
  const ap = M.L.airport, rl = ap.runX1 - ap.runX0;
  const rp = []; for (let k = 0; k <= 60; k++) { const s = rl * k / 60; rp.push({ x: ap.runX0 + s, z: ap.runZ, y: M.terrainH(ap.runX0 + s, ap.runZ) + 0.13, s }); }
  ribbon(rp, 46, 3, 4, rl, 0);
  const tp = []; for (let k = 0; k <= 30; k++) { const s = rl * 0.8 * k / 30; tp.push({ x: ap.runX0 + 100 + s, z: ap.runZ + 120, y: M.terrainH(ap.runX0 + 100 + s, ap.runZ + 120) + 0.13, s }); }
  ribbon(tp, 22, 0, 5, rl * 0.8, 0);
  const ap2 = []; for (let k = 0; k <= 10; k++) { const s = 400 * k / 10; ap2.push({ x: -500 + s * 0 + 0, z: 0, y: 0, s }); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  geo.setAttribute('aRoad', new THREE.Float32BufferAttribute(A, 4));
  const norm = new Float32Array(P.length); for (let i = 1; i < norm.length; i += 3) norm[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  geo.setIndex(I); geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -12 });
  patch(mat, (s) => {
    s.uniforms.uNight = U.uNight;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aRoad; varying vec4 vRoad; varying vec2 vRUV; varying vec3 vWP;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRoad = aRoad; vRUV = uv;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying vec4 vRoad; varying vec2 vRUV; varying vec3 vWP;\n' + NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float w = vRoad.x, lanes = vRoad.y, len = vRoad.z, side = step(99., vRoad.w), code = mod(vRoad.w, 100.), tcode = mod(code, 10.), lit = floor(code/10.);
        float totalW = w + side*5.2;
        float across = (vRUV.x-0.5)*totalW, a = abs(across), v = vRUV.y;
        float grain = vn(vWP.xz*2.5)*0.5 + vn(vWP.xz*0.4)*0.5;
        vec3 asph = vec3(0.13,0.13,0.14)*(0.8+0.4*grain);
        if (tcode > 1.5 && tcode < 2.5) asph = vec3(0.42,0.36,0.28)*(0.8+0.4*grain);
        if (tcode > 2.5 && tcode < 3.5) { vec2 c = fract(vWP.xz*0.7); asph = vec3(0.45,0.42,0.38)*(0.75+0.3*grain)*(0.85+0.15*step(0.08,min(c.x,c.y))); }
        float edgeDirt = smoothstep(w*0.5-1.2, w*0.5, a);
        asph = mix(asph, vec3(0.38,0.33,0.26), edgeDirt*0.7*step(tcode,2.5));
        float fade = smoothstep(0., 2.5, v - w*0.6) * smoothstep(0., 2.5, len - v - w*0.6);
        float wear = smoothstep(0.25, 0.6, vn(vWP.xz*0.8 + 7.));
        float dash = step(0.45, fract(v/7.));
        float mk = 0.; vec3 mc = vec3(0.9);
        if (tcode < 1.5 && lanes > 0.5) {
          mk += smoothstep(0.09, 0.04, abs(a - (w*0.5 - 0.5)));
          if (lanes < 1.5) mk += smoothstep(0.08, 0.04, a)*dash;
          else { float dbl = smoothstep(0.07,0.03,abs(a-0.16)); mk += dbl; if (dbl>0.1) mc = vec3(0.95,0.75,0.15); mk += smoothstep(0.07,0.03,abs(a-w*0.25))*dash; }
        }
        if (tcode > 3.5 && tcode < 4.5) {
          mk += smoothstep(0.25, 0.1, abs(a - (w*0.5-1.)));
          mk += smoothstep(0.3, 0.12, a)*step(0.5, fract(v/60.));
          float th = step(v, 60.) + step(len-60., v);
          mk += th*step(0.5, fract(across/3.4))*step(a, w*0.5-3.);
        }
        if (tcode > 4.5 && tcode < 5.5) { mk += smoothstep(0.15,0.05,a); mc = vec3(0.95,0.8,0.1); }
        mk *= fade*(0.55+0.45*wear)*step(tcode, 8.);
        diffuseColor.rgb = mix(asph, mc, clamp(mk,0.,1.)*0.85);
        if (a > w*0.5 && side > 0.5) {
          vec2 tl = fract(vWP.xz/0.6); float joint = step(0.06, min(tl.x, tl.y));
          vec3 pave = mix(vec3(0.5,0.48,0.45), vec3(0.62,0.58,0.52), vn(floor(vWP.xz/0.6)*1.7))*(0.82 + 0.18*joint)*(0.85+0.2*grain);
          float curb = 1. - step(w*0.5 + 0.28, a);
          pave = mix(pave, vec3(0.72,0.72,0.68), curb);
          if (curb > 0.5 && fract(v/2.0) < 0.5) pave = vec3(0.85,0.82,0.15)*0.8;
          pave = mix(pave, vec3(0.42,0.37,0.3), smoothstep(w*0.5+2.0, w*0.5+2.6, a)*0.6);
          diffuseColor.rgb = pave;
        }
        float pool = 0.;
        if (lit > 0.5) { float dv = mod(v - 15., 38.) - 19.; pool = exp(-dv*dv/70.)*exp(-a*a/(w*w*0.4)); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.,0.7,0.4)*pool*uNight*0.35;');
  });
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m);
  kit.build({ concrete: stoneMat.concrete }, scene);
  world.roadMesh = m;
}

// ---------------- buildings ----------------
function buildBuildings(scene) {
  const B = M.buildings, n = B.length;
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0); box.deleteAttribute('uv');
  const info = new Float32Array(n * 2);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.0 });
  const mesh = new THREE.InstancedMesh(box, mat, n);
  const roofs = [], tanks = [];
  for (let i = 0; i < n; i++) {
    const b = B[i], w = b.x1 - b.x0, d = b.z1 - b.z0, top = b.y + b.h + 0.4;
    _m.compose(_p.set((b.x0 + b.x1) / 2, b.y, (b.z0 + b.z1) / 2), _q.identity(), _s.set(w, b.h + 0.4, d));
    mesh.setMatrixAt(i, _m); mesh.setColorAt(i, new THREE.Color(b.color));
    info[i * 2] = b.seed; info[i * 2 + 1] = b.style;
    let rh = 0;
    if (b.roof) { rh = Math.min(w, d) * 0.32; roofs.push({ b, rh, top }); }
    else if ((b.style === 0 || b.style === 1) && R() < 0.55) tanks.push({ x: b.x0 + 1.6 + R() * (w - 3.2), z: b.z0 + 1.6 + R() * (d - 3.2), y: top });
    addCol(b.x0, b.z0, b.x1, b.z1, b.y, top + rh * 0.55, { bld: i });
  }
  box.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 2));
  patch(mat, (s) => {
    s.uniforms.uNight = U.uNight; s.uniforms.uTime = U.uTime;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aInfo; varying vec3 vFac; varying vec2 vInfo; varying float vHt;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        if (abs(normal.x) > 0.5) vFac = vec3((position.z+0.5)*sc.z, position.y*sc.y, 0.);
        else if (abs(normal.z) > 0.5) vFac = vec3((position.x+0.5)*sc.x, position.y*sc.y, 0.);
        else vFac = vec3(position.x*sc.x, position.z*sc.z, 1.);
        vInfo = aInfo; vHt = sc.y;`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; uniform float uTime; varying vec3 vFac; varying vec2 vInfo; varying float vHt;\n' + NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bEm = vec3(0.); float bWin = 0.;
        float seed = vInfo.x*97.3, style = vInfo.y;
        if (vFac.z < 0.5) {
          float fh = 3.3;
          float cw = style > 1.5 && style < 2.5 ? 2.6 : 3.4;
          float y = vFac.y - 0.4;
          float fl = floor(y/fh), cl = floor(vFac.x/cw);
          vec2 f = vec2(fract(vFac.x/cw), fract(y/fh));
          float hh = h31(vec3(seed, fl, cl));
          if (style > 2.5 && style < 3.5) {
            diffuseColor.rgb *= 0.82 + 0.18*sin(vFac.x*9.4);
            float strip = step(vHt-3.6, vFac.y)*step(vFac.y, vHt-2.2)*step(0.1,fract(vFac.x/6.))*step(fract(vFac.x/6.),0.9);
            bWin = strip; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15,0.18,0.2), strip);
            bEm += vec3(0.9,0.95,1.)*strip*uNight*step(0.4,hh)*0.8;
            float door = step(vFac.y, 5.5)*step(0.35, fract(vFac.x/22.))*step(fract(vFac.x/22.), 0.65);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3,0.32,0.34)*(0.8+0.2*step(0.5,fract(vFac.y*2.))), door);
          } else if (y > 0. && vFac.y < vHt - 0.9) {
            float isW;
            if (fl < 0.5 && style > 0.5 && style < 1.5) {
              isW = step(0.05,f.x)*step(f.x,0.95)*step(0.03,f.y)*step(f.y,0.7);
              float shut = step(0.5, h31(vec3(seed, 7., cl)));
              vec3 shopc = shut > 0.5 ? vec3(0.45,0.47,0.5)*(0.85+0.15*step(0.5,fract(y*6.))) : vec3(0.25,0.2,0.15);
              diffuseColor.rgb = mix(diffuseColor.rgb, shopc, isW);
              bEm += vec3(1.,0.85,0.6)*isW*(1.-shut)*uNight*1.6;
              float sign = step(0.74,f.y)*step(f.y,0.97)*step(0.02,f.x)*step(f.x,0.98);
              vec3 sc = 0.5+0.5*cos(6.2831*(h31(vec3(seed,3.,cl))+vec3(0.,0.33,0.67)));
              diffuseColor.rgb = mix(diffuseColor.rgb, sc, sign);
              bEm += sc*sign*uNight*0.9;
              isW = 0.;
            } else if (style > 1.5 && style < 2.5) {
              isW = step(0.04,f.x)*step(f.x,0.96)*step(0.12,f.y)*step(f.y,0.92);
            } else if (style > 3.5) {
              isW = step(0.3,f.x)*step(f.x,0.7)*step(0.18,f.y)*step(f.y,0.86);
              float arch = step(length(vec2((f.x-0.5)*2.5, (f.y-0.86)*3.)), 0.5);
              isW = max(isW, arch*step(0.86,f.y));
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*0.75, (1.-isW)*step(abs(f.x-0.5),0.28)*step(abs(f.y-0.5),0.42));
            } else {
              isW = step(0.28,f.x)*step(f.x,0.72)*step(0.32,f.y)*step(f.y,0.76);
              float frame = step(0.25,f.x)*step(f.x,0.75)*step(0.29,f.y)*step(f.y,0.79)*(1.-isW);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92,0.9,0.85), frame);
              float chajja = step(0.2,f.x)*step(f.x,0.8)*step(0.8,f.y)*step(f.y,0.87);
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*0.45, chajja);
              float grill = isW*step(0.82, fract((vFac.x)*4.))*step(0.55, h31(vec3(seed,1.,1.)));
              float balc = step(0.55, h31(vec3(seed,fl,2.)))*step(0.5,fl)*step(f.y,0.3)*step(0.06,f.x)*step(f.x,0.94);
              float rail = balc*step(0.5, fract(vFac.x*3.));
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*0.55, balc*0.6);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2), rail*0.7 + grill*0.8);
              float door = step(fl, 0.5)*step(0.35,f.x)*step(f.x,0.65)*step(f.y,0.8)*step(0.65, h31(vec3(seed,cl,4.)));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35,0.22,0.12), door);
            }
            bWin = isW;
            float h2 = h31(vec3(seed*1.7, fl+3., cl));
            vec3 glass = mix(vec3(0.16,0.22,0.27), vec3(0.3,0.36,0.4), hh);
            if (h2 < 0.35) glass = mix(vec3(0.62,0.45,0.32), vec3(0.45,0.55,0.62), h31(vec3(cl,fl,seed)))*0.7;
            diffuseColor.rgb = mix(diffuseColor.rgb, glass, isW);
            float on = step(0.48, hh)*isW*uNight;
            vec3 wc = mix(vec3(1.,0.72,0.42), vec3(0.85,0.92,1.), step(0.8, h31(vec3(seed, cl, 9.))));
            bEm += wc*on*(0.55 + 0.9*h31(vec3(cl, fl, seed)));
            diffuseColor.rgb *= 1. - 0.25*smoothstep(0.05,0.,f.y)*(1.-isW);
          }
          float streak = vn(vec2(vFac.x*0.7, vFac.y*0.06 + seed));
          diffuseColor.rgb *= (0.82 + 0.18*streak)*(0.78 + 0.22*smoothstep(0., 2.5, vFac.y));
          diffuseColor.rgb *= 1. - 0.15*step(vHt-0.9, vFac.y);
        } else {
          diffuseColor.rgb = vec3(0.5,0.49,0.46)*(0.8+0.2*vn(vFac.xy*0.6));
          if (style > 2.5 && style < 3.5) diffuseColor.rgb = vec3(0.55,0.57,0.6)*(0.85+0.15*sin(vFac.x*6.));
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.1, bWin);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.85, bWin);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += bEm;');
  });
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh);
  world.buildingMesh = mesh;
  // pitched tile roofs
  if (roofs.length) {
    const pr = new THREE.BufferGeometry();
    const v = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5];
    pr.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    pr.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3]);
    const pg = pr.toNonIndexed(); pg.computeVertexNormals();
    const rmat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
    patch(rmat, (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRP = (modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRP;\n' + NOISE).replace('#include <color_fragment>', `#include <color_fragment>
        float rows = step(0.25, fract(vRP.y*3.3)); float tl = step(0.12, fract((vRP.x+vRP.z)*2.2 + floor(vRP.y*3.3)*0.5));
        diffuseColor.rgb *= (0.72 + 0.28*rows*tl)*(0.8+0.3*vn(vRP.xz*0.5));`);
    });
    const rm = new THREE.InstancedMesh(pg, rmat, roofs.length);
    roofs.forEach((r, i) => {
      const b = r.b, w = b.x1 - b.x0, d = b.z1 - b.z0, alongX = w > d;
      _q.setFromEuler(_e.set(0, alongX ? Math.PI / 2 : 0, 0));
      _m.compose(_p.set((b.x0 + b.x1) / 2, r.top, (b.z0 + b.z1) / 2), _q, _s.set((alongX ? d : w) + 0.8, r.rh, (alongX ? w : d) + 0.8));
      rm.setMatrixAt(i, _m); rm.setColorAt(i, new THREE.Color().setHSL(0.02 + R() * 0.03, 0.55, 0.32 + R() * 0.1));
    });
    rm.castShadow = rm.receiveShadow = true; rm.computeBoundingSphere(); scene.add(rm);
  }
  if (tanks.length) {
    const tg = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 12); tg.translate(0, 0.75, 0);
    const tm = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }), tanks.length);
    tanks.forEach((t, i) => { _m.compose(_p.set(t.x, t.y, t.z), _q.identity(), _s.set(1, 1, 1)); tm.setMatrixAt(i, _m); });
    tm.castShadow = true; tm.computeBoundingSphere(); scene.add(tm);
  }
}

// ---------------- trees ----------------
function frondAtlas() {
  return canvasTex(512, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const fw = w * 0.75;
    c.strokeStyle = '#5d6b2a'; c.lineWidth = 6; c.beginPath(); c.moveTo(0, h / 2); c.lineTo(fw, h / 2); c.stroke();
    for (let x = 8; x < fw - 4; x += 5) {
      const t = x / fw, L = (1 - t * 0.85) * h * 0.48;
      for (const s of [-1, 1]) {
        const g = 60 + Math.random() * 50;
        c.strokeStyle = `rgb(${40 + Math.random() * 30},${g + 50},${25 + Math.random() * 20})`; c.lineWidth = 3.2;
        c.beginPath(); c.moveTo(x, h / 2); c.quadraticCurveTo(x + 10, h / 2 + s * L * 0.5, x + 22, h / 2 + s * L); c.stroke();
      }
    }
    const bx = fw + 2, bw = w - bx;
    c.fillStyle = '#76695a'; c.fillRect(bx, 0, bw, h);
    for (let y = 0; y < h; y += 7) { c.fillStyle = `rgba(40,30,20,${0.3 + Math.random() * 0.3})`; c.fillRect(bx, y, bw, 2); c.fillStyle = 'rgba(160,150,130,0.25)'; c.fillRect(bx, y + 3, bw, 2); }
  });
}
function palmGeo(lod) {
  const parts = [];
  const H = 9, segs = lod ? 1 : 6;
  const trunk = new THREE.CylinderGeometry(0.17, 0.27, H, lod ? 4 : 7, segs, true); trunk.translate(0, H / 2, 0);
  const p = trunk.attributes.position, uv = trunk.attributes.uv;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.pow(y / H, 2) * 1.3); uv.setXY(i, 0.765 + uv.getX(i) * 0.22, y / H); }
  trunk.computeVertexNormals(); parts.push(trunk);
  const nf = lod ? 6 : 11;
  for (let f = 0; f < nf; f++) {
    const len = 4.2 + R() * 1.2, segN = lod ? 2 : 6, g = new THREE.PlaneGeometry(len, 1.9, segN, 1);
    const pp = g.attributes.position, uu = g.attributes.uv;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i) + len / 2, t = x / len;
      uu.setXY(i, t * 0.74, uu.getY(i));
      pp.setXYZ(i, x, -t * t * 2.6 + t * 0.9, pp.getY(i) * (1 - t * 0.3));
    }
    g.rotateX(0.35 * (f % 2 ? 1 : -1)); g.rotateZ(f < nf / 2 ? 0.25 : -0.1); g.rotateY((f / nf) * Math.PI * 2 + R() * 0.3);
    g.translate(1.3, H, 0); g.computeVertexNormals(); parts.push(g);
  }
  if (!lod) for (let k = 0; k < 5; k++) { const c = new THREE.SphereGeometry(0.17, 5, 4); c.translate(1.3 + Math.cos(k * 1.3) * 0.3, H - 0.3, Math.sin(k * 1.3) * 0.3); const uv2 = c.attributes.uv; for (let i = 0; i < uv2.count; i++) uv2.setXY(i, 0.8, 0.5); parts.push(c); }
  const m = mergeGeometries(parts.map((g) => { if (g.index) g = g.toNonIndexed(); return g; }));
  return m;
}
function vcolor(g, fn) { const p = g.attributes.position, a = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const c = fn(p.getX(i), p.getY(i), p.getZ(i)); a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function roundTreeGeo(lod) {
  const parts = [];
  const tr = new THREE.CylinderGeometry(0.25, 0.4, 3.2, lod ? 4 : 7); tr.translate(0, 1.6, 0); parts.push(vcolor(tr.toNonIndexed(), () => [0.3, 0.22, 0.15]));
  const blobs = lod ? [[0, 5, 0, 3.4]] : [[0, 5, 0, 2.8], [1.6, 4.4, 0.6, 2.1], [-1.4, 4.6, -0.8, 2.2], [0.3, 6.3, -0.4, 2.0], [-0.5, 4.3, 1.5, 1.9]];
  const base = [0.2 + R() * 0.06, 0.34 + R() * 0.08, 0.12];
  for (const [x, y, z, r] of blobs) {
    const s = new THREE.IcosahedronGeometry(r, lod ? 0 : 2).toNonIndexed();
    const p = s.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + (Math.sin(p.getX(i) * 3.1 + p.getY(i) * 2.3) * 0.12); p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k * 0.85 + y, p.getZ(i) * k + z); }
    s.computeVertexNormals();
    parts.push(vcolor(s, (px, py) => { const l = 0.75 + 0.35 * ((py - y) / r + 1) / 2; return [base[0] * l, base[1] * l, base[2] * l]; }));
  }
  return mergeGeometries(parts);
}
function casGeo(lod) {
  const parts = [];
  const tr = new THREE.CylinderGeometry(0.12, 0.22, 11, 5); tr.translate(0, 5.5, 0); parts.push(vcolor(tr.toNonIndexed(), () => [0.32, 0.25, 0.2]));
  const layers = lod ? 2 : 5;
  for (let k = 0; k < layers; k++) {
    const r = 2.2 - k * 0.35, c = new THREE.ConeGeometry(r, 3.4, lod ? 5 : 9, 1, true).toNonIndexed();
    c.translate(0, 4.5 + k * 1.7, 0);
    const p = c.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.sin(i * 1.7) * 0.25);
    c.computeVertexNormals(); parts.push(vcolor(c, () => [0.14, 0.26 + k * 0.02, 0.12]));
  }
  return mergeGeometries(parts);
}
function teakGeo(lod) {
  const parts = [];
  const tr = new THREE.CylinderGeometry(0.22, 0.42, 9, lod ? 4 : 7); tr.translate(0, 4.5, 0); parts.push(vcolor(tr.toNonIndexed(), () => [0.36, 0.3, 0.24]));
  const base = [0.17 + R() * 0.05, 0.3 + R() * 0.06, 0.1];
  const blobs = lod ? [[0, 10.5, 0, 3.6]] : [[0, 10, 0, 3.0], [1.9, 9.2, 0.6, 2.3], [-1.7, 9.6, -0.9, 2.4], [0.4, 12, -0.3, 2.2], [-0.6, 8.8, 1.8, 2.1], [1.2, 11, 1.6, 1.8]];
  for (const [x, y, z, r] of blobs) {
    const sg = new THREE.IcosahedronGeometry(r, lod ? 0 : 1).toNonIndexed(), p = sg.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + Math.sin(p.getX(i) * 2.7 + p.getZ(i) * 3.3) * 0.18; p.setXYZ(i, p.getX(i) * k * 1.1 + x, p.getY(i) * k * 0.7 + y, p.getZ(i) * k * 1.1 + z); }
    sg.computeVertexNormals();
    parts.push(vcolor(sg, (px, py) => { const l = 0.7 + 0.4 * ((py - y) / r + 1) / 2; return [base[0] * l, base[1] * l, base[2] * l]; }));
  }
  return mergeGeometries(parts);
}
function bambooGeo(lod) {
  const parts = [], n = lod ? 4 : 11;
  for (let k = 0; k < n; k++) {
    const a = k * 2.4, r = 0.3 + (k % 3) * 0.35, h = 7 + (k % 4) * 1.6, lean = 0.08 + (k % 3) * 0.05;
    const c = new THREE.CylinderGeometry(0.05, 0.08, h, 4, lod ? 1 : 4, true).toNonIndexed(); c.translate(0, h / 2, 0);
    const p = c.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.cos(a) * (r + y * y * lean * 0.03)); p.setZ(i, p.getZ(i) + Math.sin(a) * (r + y * y * lean * 0.03)); }
    c.computeVertexNormals(); parts.push(vcolor(c, (x, y) => [0.45 + (y % 1.2 < 0.08 ? -0.15 : 0), 0.55, 0.22]));
    const tuft = new THREE.ConeGeometry(0.9, 2.6, lod ? 4 : 6, 1, true).toNonIndexed(); tuft.rotateX(Math.PI); tuft.translate(Math.cos(a) * (r + h * h * lean * 0.03), h - 0.3, Math.sin(a) * (r + h * h * lean * 0.03));
    parts.push(vcolor(tuft, () => [0.25, 0.42, 0.12]));
  }
  return mergeGeometries(parts);
}
function bushGeo(lod) {
  const parts = [], base = [0.2, 0.33, 0.12];
  const bl = lod ? [[0, 0.7, 0, 1.0]] : [[0, 0.7, 0, 0.9], [0.7, 0.55, 0.3, 0.7], [-0.6, 0.6, -0.3, 0.75], [0.1, 0.5, 0.8, 0.6]];
  for (const [x, y, z, r] of bl) { const sg = new THREE.IcosahedronGeometry(r, lod ? 0 : 1).toNonIndexed(); sg.translate(x, y, z); parts.push(vcolor(sg, (px, py) => { const l = 0.75 + 0.3 * (py - y + r) / (2 * r); return [base[0] * l, base[1] * l, base[2] * l]; })); }
  return mergeGeometries(parts);
}
function buildTrees(scene, q) {
  const atlas = frondAtlas();
  const swayPatch = (s) => {
    s.uniforms.uTime = U.uTime;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = instanceMatrix[3].x*0.13 + instanceMatrix[3].z*0.11;
      float hgt = max(position.y - 3.0, 0.);
      transformed.x += sin(uTime*1.3 + ph)*0.045*hgt + sin(uTime*3.1+ph*2.)*0.015*hgt;
      transformed.z += cos(uTime*1.1 + ph)*0.03*hgt;`);
  };
  const palmMat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }); patch(palmMat, swayPatch);
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }); patch(leafMat, swayPatch);
  const depthMat = new THREE.MeshDepthMaterial({ map: atlas, alphaTest: 0.45, depthPacking: THREE.RGBADepthPacking });
  const geos = { palm: [palmGeo(false), palmGeo(true)], round: [roundTreeGeo(false), roundTreeGeo(true)], cas: [casGeo(false), casGeo(true)], teak: [teakGeo(false), teakGeo(true)], bamboo: [bambooGeo(false), bambooGeo(true)], bush: [bushGeo(false), bushGeo(true)] };
  const TS = 500; world.treeTiles = [];
  const keep = q.treeDensity;
  for (const sp of Object.keys(geos)) {
    const tiles = new Map();
    for (const t of M.trees[sp]) {
      if (keep < 1 && ((t.x * 7.13 + t.z * 3.71) % 1 + 1) % 1 > keep) continue;
      const k = Math.floor((t.x + M.HALF) / TS) + Math.floor((t.z + M.HALF) / TS) * 1000; if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(t);
    }
    for (const [k, list] of tiles) {
      const mesh = new THREE.InstancedMesh(geos[sp][0], sp === 'palm' ? palmMat : leafMat, list.length);
      list.forEach((t, i) => { _e.set(t.lean * 0.3, t.r, t.lean * 0.2); _q.setFromEuler(_e); _m.compose(_p.set(t.x, t.y - 0.2, t.z), _q, _s.set(t.s, t.s, t.s)); mesh.setMatrixAt(i, _m); });
      mesh.castShadow = q.treeShadows; mesh.receiveShadow = false; mesh.computeBoundingSphere();
      if (sp === 'palm') mesh.customDepthMaterial = depthMat;
      const cx = (k % 1000) * TS - M.HALF + TS / 2, cz = Math.floor(k / 1000) * TS - M.HALF + TS / 2;
      world.treeTiles.push({ mesh, cx, cz, geos: geos[sp], lod: 0, small: sp === 'bush' });
      scene.add(mesh);
      if (sp !== 'bush') for (const t of list) addCol(t.x - 0.35, t.z - 0.35, t.x + 0.35, t.z + 0.35, t.y, t.y + 6 * t.s, { tree: true, noTop: true });
    }
  }
}
export function updateTrees(cam, q) {
  for (const t of world.treeTiles) {
    const d = Math.hypot(cam.x - t.cx, cam.z - t.cz);
    t.mesh.visible = d < (t.small ? q.treeFar * 0.4 : q.treeFar);
    const lod = d > q.treeLod ? 1 : 0;
    if (lod !== t.lod) { t.lod = lod; t.mesh.geometry = t.geos[lod]; }
  }
}

// ---------------- street lights ----------------
function buildStreetLights(scene) {
  const Ls = M.lights, n = Ls.length;
  const pole = mergeGeometries([T(new THREE.CylinderGeometry(0.09, 0.14, 8, 6), 0, 4, 0), T(new THREE.BoxGeometry(0.1, 0.1, 2.4), 0, 7.9, 1.1)].map((g) => g.toNonIndexed()));
  const head = T(new THREE.BoxGeometry(0.45, 0.16, 0.8), 0, 7.82, 2.2);
  const pm = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0x6f7377, metalness: 0.6, roughness: 0.4 }), n);
  const hmat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffc070, emissiveIntensity: 0 });
  const hm = new THREE.InstancedMesh(head, hmat, n);
  Ls.forEach((l, i) => { _q.setFromEuler(_e.set(0, l.ang, 0)); _m.compose(_p.set(l.x, l.y, l.z), _q, _s.set(1, 1, 1)); pm.setMatrixAt(i, _m); hm.setMatrixAt(i, _m); });
  pm.castShadow = true; pm.computeBoundingSphere(); hm.computeBoundingSphere();
  scene.add(pm, hm); world.lampMat = hmat;
}

// ---------------- landmarks ----------------
function buildLandmarks(scene, mats) {
  const K = new Kit();
  const ty = (x, z) => M.terrainH(x, z);
  // ---- Moti Daman fort walls ----
  function fortWalls(F, wallH, thick, bast, gateList) {
    const y0 = Math.min(ty(F.x0, F.z0), ty(F.x1, F.z1), ty(F.x0, F.z1), ty(F.x1, F.z0)) - 1;
    const segs = [[F.x0, F.z0, F.x1, F.z0], [F.x1, F.z0, F.x1, F.z1], [F.x1, F.z1, F.x0, F.z1], [F.x0, F.z1, F.x0, F.z0]];
    for (const [ax, az, bx, bz] of segs) {
      const horiz = az === bz, L = Math.hypot(bx - ax, bz - az);
      // split around gates
      const cuts = [];
      for (const g of gateList) {
        const onSeg = horiz ? Math.abs(g.z - az) < 40 && g.x > Math.min(ax, bx) && g.x < Math.max(ax, bx) : Math.abs(g.x - ax) < 40 && g.z > Math.min(az, bz) && g.z < Math.max(az, bz);
        if (onSeg) cuts.push(horiz ? Math.abs(g.x - ax) : Math.abs(g.z - az));
      }
      cuts.sort((a, b) => a - b);
      let s0 = 0; const pieces = [];
      for (const c of cuts) { pieces.push([s0, c - 7]); s0 = c + 7; }
      pieces.push([s0, L]);
      const dx = (bx - ax) / L, dz = (bz - az) / L;
      for (const [s, e] of pieces) {
        if (e - s < 1) continue;
        const cx = ax + dx * (s + e) / 2, cz = az + dz * (s + e) / 2, len = e - s;
        const w = horiz ? len : thick, d = horiz ? thick : len, hh = wallH - y0 + ty(cx, cz);
        K.box('stone', w, hh, d, cx, y0, cz, 0xffffff);
        addCol(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y0, y0 + hh);
        // merlons
        for (let m = s + 1.5; m < e - 1; m += 3.2) {
          const mx = ax + dx * m, mz = az + dz * m, ox = horiz ? 0 : (ax === F.x0 ? -1 : 1) * (thick / 2 - 0.4), oz = horiz ? (az === F.z0 ? -1 : 1) * (thick / 2 - 0.4) : 0;
          K.box('stone', horiz ? 1.6 : 0.8, 1.3, horiz ? 0.8 : 1.6, mx + ox, y0 + hh, mz + oz, 0xffffff);
        }
      }
      for (const c of cuts) {
        const gx = ax + dx * c, gz = az + dz * c, hh = wallH + 3 - y0 + ty(gx, gz);
        for (const sd of [-1, 1]) { const px = gx + (horiz ? sd * 9 : 0), pz = gz + (horiz ? 0 : sd * 9); K.box('stone', horiz ? 4 : thick + 2, hh, horiz ? thick + 2 : 4, px, y0, pz, 0xe8d8c8); addCol(px - (horiz ? 2 : thick / 2 + 1), pz - (horiz ? thick / 2 + 1 : 2), px + (horiz ? 2 : thick / 2 + 1), pz + (horiz ? thick / 2 + 1 : 2), y0, y0 + hh); }
        K.box('stone', horiz ? 22 : thick + 2, 3, horiz ? thick + 2 : 22, gx, y0 + hh - 3, gz, 0xe8d8c8);
        addCol(gx - (horiz ? 11 : thick / 2 + 1), gz - (horiz ? thick / 2 + 1 : 11), gx + (horiz ? 11 : thick / 2 + 1), gz + (horiz ? thick / 2 + 1 : 11), y0 + hh - 3, y0 + hh);
        K.box('white', horiz ? 3 : 0.4, 2.2, horiz ? 0.4 : 3, gx, y0 + hh, gz, 0xf4f0e6);
      }
    }
    const corners = [[F.x0, F.z0], [F.x1, F.z0], [F.x1, F.z1], [F.x0, F.z1], [(F.x0 + F.x1) / 2, F.z0], [(F.x0 + F.x1) / 2, F.z1], [F.x0, (F.z0 + F.z1) / 2 + 60], [F.x1, (F.z0 + F.z1) / 2 + 60]];
    for (const [x, z] of corners) {
      if (gateList.some((g) => Math.hypot(g.x - x, g.z - z) < 25)) continue;
      const hh = wallH + 1.5 - y0 + ty(x, z);
      K.add('stone', T(boxUV(bast, hh, bast), x, y0 + hh / 2, z, Math.PI / 4), 0xffffff);
      addCol(x - bast * 0.6, z - bast * 0.6, x + bast * 0.6, z + bast * 0.6, y0, y0 + hh);
      K.add('white', T(new THREE.CylinderGeometry(1.4, 1.4, 3, 8), x + bast * 0.55, y0 + hh + 1.5, z), 0xece4d4);
      K.add('white', T(new THREE.ConeGeometry(1.8, 1.6, 8), x + bast * 0.55, y0 + hh + 3.8, z), 0xece4d4);
    }
  }
  const gates = M.gates;
  fortWalls(M.L.motiFort, 10, 5, 20, gates.filter((g) => Math.abs(g.x - M.L.motiFort.x0) < 40 || Math.abs(g.x - M.L.motiFort.x1) < 40));
  fortWalls(M.L.naniFort, 9, 4.5, 16, gates.filter((g) => g.z < M.L.naniFort.z1 + 40 && g.z > M.L.naniFort.z0 - 40));
  // ---- churches ----
  function church(x, z, ang, len, wid, ht, twin, name) {
    const y = ty(x, z) - 0.3, c = Math.cos(ang), s = Math.sin(ang);
    const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    let [px, pz] = P(0, 0);
    K.add('plaster', T(boxUV(wid, ht, len), px, y + ht / 2, pz, ang), 0xfffbf0);
    const roof = new THREE.CylinderGeometry(0.01, wid * 0.62, len, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1, 1, 0.55); roof.rotateX(Math.PI / 2); roof.rotateZ(0);
    K.add('tile', T(new THREE.ConeGeometry(wid * 0.72, 5, 4, 1).rotateY(Math.PI / 4).scale(1, 1, len / wid), px, y + ht + 2.5, pz, ang), 0xa0452c);
    [px, pz] = P(0, len / 2 + 1);
    const fh = ht + 6;
    K.add('plaster', T(boxUV(wid + 4, fh, 2.2), px, y + fh / 2, pz, ang), 0xfffcf4);
    K.add('plaster', T(new THREE.CylinderGeometry(0.01, (wid + 4) * 0.6, 6, 3).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 1, 0.2), px, y + fh + 2, pz, ang), 0xfffcf4);
    for (let k = -1; k <= 1; k++) { const [qx, qz] = P(k * (wid + 4) * 0.33, len / 2 + 2.2); K.add('plaster', T(boxUV(0.9, fh, 0.5), qx, y + fh / 2, qz, ang), 0xf0e6d2); }
    [px, pz] = P(0, len / 2 + 2.3);
    K.add('dark', T(boxUV(3.4, 6, 0.3), px, y + 3, pz, ang), 0x3a2416);
    const [rx, rz] = P(0, len / 2 + 2.2); K.add('glass', T(new THREE.CircleGeometry(1.4, 16), rx, y + ht + 1, rz + 0.01, ang), 0x223355);
    [px, pz] = P(0, len / 2 + 1);
    K.add('dark', T(boxUV(0.35, 3.4, 0.35), px, y + fh + 5.2, pz, ang), 0xe6dfcf); K.add('dark', T(boxUV(2, 0.35, 0.35), px, y + fh + 6, pz, ang), 0xe6dfcf);
    if (twin) for (const sd of [-1, 1]) {
      const [tx, tz] = P(sd * (wid / 2 + 2.5), len / 2 - 2), th = fh + 6;
      K.add('plaster', T(boxUV(6, th, 6), tx, y + th / 2, tz, ang), 0xfffbf0);
      K.add('tile', T(new THREE.ConeGeometry(4.3, 5, 4).rotateY(Math.PI / 4), tx, y + th + 2.5, tz, ang), 0x8d3b24);
    }
    const r = Math.max(wid, len) / 2 + 3;
    addCol(x - (Math.abs(c) * wid + Math.abs(s) * len) / 2 - 1, z - (Math.abs(s) * wid + Math.abs(c) * len) / 2 - 1, x + (Math.abs(c) * wid + Math.abs(s) * len) / 2 + 1, z + (Math.abs(s) * wid + Math.abs(c) * len) / 2 + 3, y, y + ht);
    world.labels.push({ name, x, z });
  }
  church(M.L.bomJesus.x, M.L.bomJesus.z, Math.PI, 40, 18, 13, false, 'Bom Jesus Church');
  church(M.L.ladySea.x, M.L.ladySea.z, Math.PI, 34, 15, 11, true, 'Our Lady of the Sea');
  // ---- lighthouse ----
  {
    const { x, z } = M.L.lighthouse, y = ty(x, z) - 0.3;
    K.add('plaster', T(new THREE.CylinderGeometry(3, 4.2, 26, 20), x, y + 13, z), 0xffffff);
    for (const hh of [6, 14, 21]) K.add('red', T(new THREE.CylinderGeometry(3.9 - hh * 0.045, 3.9 - hh * 0.045 + 0.1, 2.2, 20), x, y + hh, z), 0xc0392b);
    K.add('dark', T(new THREE.CylinderGeometry(4.6, 4.6, 0.4, 20), x, y + 26.2, z), 0x333333);
    K.add('glass', T(new THREE.CylinderGeometry(2.4, 2.4, 3.4, 12), x, y + 28.1, z), 0x88aacc);
    K.add('red', T(new THREE.SphereGeometry(2.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), x, y + 29.8, z), 0xb03020);
    addCol(x - 4, z - 4, x + 4, z + 4, y, y + 26.4);
    const beam = new THREE.Group(); beam.position.set(x, y + 28, z);
    const bmat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (const sd of [0, Math.PI]) { const cg = new THREE.ConeGeometry(14, 260, 20, 1, true); cg.translate(0, -130, 0); cg.rotateZ(Math.PI / 2); const cm = new THREE.Mesh(cg, bmat); cm.rotation.y = sd; beam.add(cm); }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffeeaa })); beam.add(lamp);
    scene.add(beam); world.beams.push({ g: beam, mat: bmat });
    world.labels.push({ name: 'Lighthouse', x, z });
  }
  // ---- Sky Tower ----
  {
    const { x, z } = M.L.skyTower, y = ty(x, z) - 0.5;
    K.add('concrete', T(new THREE.CylinderGeometry(5, 7.5, 212, 16), x, y + 106, z), 0xd6d2ca);
    for (let k = 1; k < 12; k++) K.add('dark', T(new THREE.CylinderGeometry(5.6 + (12 - k) * 0.2, 5.6 + (12 - k) * 0.2, 0.6, 16), x, y + k * 17, z), 0x9aa4ad);
    K.add('concrete', T(new THREE.CylinderGeometry(17, 11, 6, 24), x, y + 213, z), 0xe8e4dc);
    K.add('glass', T(new THREE.CylinderGeometry(17.2, 17.2, 7, 24, 1, true), x, y + 219.5, z), 0x7fa6c8);
    K.add('concrete', T(new THREE.CylinderGeometry(18.5, 17.5, 1.4, 24), x, y + 223.6, z), 0xeeeeee);
    for (let a = 0; a < 24; a++) K.add('dark', T(new THREE.BoxGeometry(0.15, 1.2, 4.6), x + Math.cos(a / 24 * Math.PI * 2) * 18.2, y + 224.9, z + Math.sin(a / 24 * Math.PI * 2) * 18.2, -a / 24 * Math.PI * 2), 0x777777);
    K.add('dark', T(new THREE.CylinderGeometry(0.4, 1.2, 36, 6), x, y + 242, z), 0xcc3333);
    K.add('glow', T(new THREE.SphereGeometry(0.9, 8, 6), x, y + 260.5, z), 0xff2222);
    K.add('concrete', T(new THREE.CylinderGeometry(14, 14, 1, 20), x, y + 0.5, z), 0xcfc8bb);
    K.add('dark', T(boxUV(4, 4, 0.4), x, y + 2, z + 7.4), 0x223344);
    addCol(x - 7, z - 7, x + 7, z + 7, y, y + 210);
    addCol(x - 18, z - 18, x + 18, z + 18, y + 210, y + 224.3);
    world.skyTop = { x, z, y: y + 224.3 }; world.skyBase = { x, z: z + 10, y: ty(x, z + 10) };
    world.labels.push({ name: 'Daman Sky Tower', x, z });
  }
  // ---- Ferris wheel ----
  {
    const { x, z } = M.L.ferris, y = ty(x, z);
    for (const sd of [-1, 1]) for (const lg of [-1, 1]) K.add('metal', T(new THREE.CylinderGeometry(0.35, 0.5, 30, 6), x + lg * 7, y + 14, z + sd * 3, 0, 0, -lg * 0.24), 0xdddddd);
    K.add('metal', T(new THREE.CylinderGeometry(0.6, 0.6, 7, 8), x, y + 28, z, 0, Math.PI / 2), 0xbbbbbb);
    const wheel = new THREE.Group(); wheel.position.set(x, y + 28, z);
    const wk = new Kit();
    for (const sd of [-2.6, 2.6]) wk.add('metal', T(new THREE.TorusGeometry(22, 0.35, 6, 64), 0, 0, sd), 0xffffff);
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; for (const sd of [-2.6, 2.6]) wk.add('metal', T(new THREE.CylinderGeometry(0.12, 0.12, 22, 4), Math.cos(a) * 11, Math.sin(a) * 11, sd, 0, 0, a + Math.PI / 2), 0xeeeeee); }
    const bulbs = []; for (let k = 0; k < 64; k++) { const a = k / 64 * Math.PI * 2; bulbs.push(T(new THREE.SphereGeometry(0.28, 5, 4), Math.cos(a) * 22.4, Math.sin(a) * 22.4, 2.9)); bulbs.push(T(new THREE.SphereGeometry(0.28, 5, 4), Math.cos(a) * 22.4, Math.sin(a) * 22.4, -2.9)); }
    bulbs.forEach((g, i) => wk.add('bulbs', g, [0xff4466, 0x44ddff, 0xffdd33, 0x77ff66][i % 4]));
    wk.build({ metal: mats.metal, bulbs: mats.bulbs }, wheel, false);
    scene.add(wheel);
    const gond = [];
    for (let k = 0; k < 16; k++) {
      const gm = new THREE.Mesh(T(new THREE.BoxGeometry(2.6, 2.4, 3.2), 0, -1.6, 0), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(k / 16, 0.7, 0.5), roughness: 0.5 }));
      scene.add(gm); gond.push(gm);
    }
    world.animated.push((t) => { const r = t * 0.06; wheel.rotation.z = r; gond.forEach((g, k) => { const a = r + k / 16 * Math.PI * 2; g.position.set(x + Math.cos(a) * 22, y + 28 + Math.sin(a) * 22, z); }); });
    addCol(x - 9, z - 4, x + 9, z + 4, y, y + 4, { noTop: true });
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, sx = x + Math.cos(a) * 40, sz = z + Math.sin(a) * 40; K.box('plain', 4, 3, 3, sx, ty(sx, sz), sz, [0xff7043, 0xffca28, 0x26c6da, 0xab47bc][k % 4]); K.box('red', 4.6, 0.3, 3.6, sx, ty(sx, sz) + 3, sz, [0xffffff, 0xd32f2f][k % 2]); }
    world.labels.push({ name: 'Devka Amusement Park', x, z });
  }
  // ---- Stadium ----
  {
    const { x, z } = M.L.stadium, y = ty(x, z);
    const field = new THREE.CircleGeometry(1, 48); field.rotateX(-Math.PI / 2); field.scale(70, 1, 55);
    K.add('grass', T(field, x, y + 0.2, z), 0x4f8f3a);
    const prof = []; for (let k = 0; k <= 10; k++) { prof.push(new THREE.Vector2(1 + k * 0.022, k * 1.3)); prof.push(new THREE.Vector2(1 + (k + 1) * 0.022, k * 1.3)); }
    prof.push(new THREE.Vector2(1.26, 14), new THREE.Vector2(1.27, 0));
    const st = new THREE.LatheGeometry(prof, 48); st.scale(74, 1, 59);
    K.add('concrete', T(st, x, y, z), 0xc9c3b8);
    for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const lx = x + ax * 82, lz = z + az * 66; K.add('metal', T(new THREE.CylinderGeometry(0.5, 0.8, 34, 6), lx, y + 17, lz), 0x999999); K.add('glow', T(new THREE.BoxGeometry(5, 3, 1), lx, y + 34, lz, Math.atan2(-ax, -az)), 0xffffff); }
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, cx = x + Math.cos(a) * 82, cz = z + Math.sin(a) * 66; addCol(cx - 9, cz - 9, cx + 9, cz + 9, y, y + 14); }
    world.labels.push({ name: 'Daman Stadium', x, z });
  }
  // ---- Airport ----
  {
    const ap = M.L.airport, y = ty(200, 2450);
    for (let k = 0; k < 4; k++) {
      const hx = 700 + k * 85, hz = 2480;
      const hg = new THREE.CylinderGeometry(22, 22, 60, 24, 1, false, 0, Math.PI); hg.rotateZ(Math.PI / 2); hg.rotateY(Math.PI / 2);
      K.add('metal', T(hg, hx, y, hz), 0xc8ccd0); addCol(hx - 22, hz - 30, hx + 22, hz + 30, y, y + 21);
    }
    K.add('concrete', T(new THREE.CylinderGeometry(3, 3.5, 30, 12), 420, y + 15, 2520), 0xdedad2);
    K.add('glass', T(new THREE.CylinderGeometry(6, 4.5, 5, 12), 420, y + 32.5, 2520), 0x4f7896);
    K.add('concrete', T(new THREE.CylinderGeometry(6.5, 6.5, 0.8, 12), 420, y + 35.4, 2520), 0xf0f0f0);
    addCol(416, 2516, 424, 2524, y, y + 35.8);
    world.labels.push({ name: 'Daman Airport (Coast Guard Air Station)', x: 400, z: 2300 });
    const hp = M.L.helipad, hy = ty(hp.x, hp.z) + 0.25;
    const hc = new THREE.CircleGeometry(14, 32); hc.rotateX(-Math.PI / 2);
    K.add('concrete', T(hc, hp.x, hy, hp.z), 0x555a5f);
    K.add('white', T(new THREE.RingGeometry(11, 12, 32).rotateX(-Math.PI / 2), hp.x, hy + 0.03, hp.z), 0xffffff);
    K.add('white', T(new THREE.BoxGeometry(1.2, 0.05, 9), hp.x - 2.8, hy + 0.03, hp.z), 0xffffff); K.add('white', T(new THREE.BoxGeometry(1.2, 0.05, 9), hp.x + 2.8, hy + 0.03, hp.z), 0xffffff); K.add('white', T(new THREE.BoxGeometry(4.5, 0.05, 1.2), hp.x, hy + 0.03, hp.z), 0xffffff);
    const apron = new THREE.PlaneGeometry(1200, 140); apron.rotateX(-Math.PI / 2);
    K.add('concrete', T(apron, 500, ty(500, 2600) + 0.1, 2600), 0x5b5f63);
    // terminal as building
    M.addBuilding(80, 2470, 300, 2530, 14, 2, 0xf0f4f8, 0);
  }
  // ---- Hospital ----
  { const { x, z } = M.L.hospital; M.addBuilding(x - 28, z - 22, x + 28, z + 22, 13, 2, 0xffffff, 0); const y = ty(x, z) + 9; K.box('red', 5, 1.4, 0.3, x, y, z + 22.3, 0xd02020); K.box('red', 1.4, 5, 0.3, x, y - 1.8, z + 22.3, 0xd02020); world.labels.push({ name: 'Govt. Hospital Marwad', x, z }); }
  // ---- Hideout containers ----
  {
    const { x, z } = M.L.hideout;
    const cc = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad, 0x16a085, 0xd35400, 0x7f8c8d];
    for (let k = 0; k < 70; k++) {
      const gx = x - 80 + (k % 10) * 16, gz = z - 55 + Math.floor(k / 10) * 15, rot = R() < 0.3, stack = R() < 0.4 ? 2 : 1;
      if (R() < 0.18) continue;
      for (let s = 0; s < stack; s++) {
        const y = ty(gx, gz) + s * 2.6, w = rot ? 2.5 : 12, d = rot ? 12 : 2.5;
        const g = boxUV(w, 2.6, d, 1.2); K.add('container', T(g, gx, y + 1.3, gz), pick(cc));
        addCol(gx - w / 2, gz - d / 2, gx + w / 2, gz + d / 2, y, y + 2.6);
      }
    }
    M.addBuilding(x + 20, z + 25, x + 75, z + 65, 11, 3, 0x7f8c8d, 0); M.addBuilding(x - 85, z + 30, x - 30, z + 68, 10, 3, 0x95a5a6, 0);
    world.labels.push({ name: 'Kachigam Docks (Kaala Naag gang)', x, z });
  }
  // ---- Jetty + boats ----
  {
    const jx = M.L.jetty.x, jz = M.L.jetty.z;
    K.add('wood', T(boxUV(6, 0.6, 70), jx, 1.2, jz + 35), 0x7a5a3a);
    for (let k = 0; k < 10; k++) for (const sd of [-1, 1]) K.add('wood', T(new THREE.CylinderGeometry(0.25, 0.25, 6, 6), jx + sd * 2.6, -1.5, jz + 4 + k * 7), 0x5a3f28);
    addCol(jx - 3, jz, jx + 3, jz + 70, -3, 1.5);
    world.labels.push({ name: 'Nani Daman Jetty', x: jx, z: jz });
  }
  // ---- beach umbrellas & stalls ----
  for (const [z0, z1, dens] of [[-4700, -3100, 0.5], [2600, 4200, 0.35], [-2900, -600, 0.08], [900, 2400, 0.08]]) {
    for (let z = z0; z < z1; z += 6) {
      if (R() > dens) continue;
      const x = M.coastX(z) + rr(25, 80), y = ty(x, z);
      if (y < 0.3 || M.occAt(x, z) || M.rampHeight(x, z) > -1e8) continue;
      K.add('wood', T(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 4), x, y + 1.3, z), 0xdddddd);
      K.add('plain', T(new THREE.ConeGeometry(1.6, 0.7, 8, 1, true), x, y + 2.5, z), pick([0xff5252, 0x40c4ff, 0xffeb3b, 0x69f0ae, 0xff9100, 0xffffff]));
    }
    for (let z = z0; z < z1; z += 45) {
      if (R() > dens + 0.2) continue;
      const x = M.coastX(z) + rr(110, 150), y = ty(x, z);
      if (M.occAt(x, z) === 1) continue;
      K.box('plain', 3, 2.3, 2, x, y, z, pick([0xffcc80, 0xa5d6a7, 0x90caf9, 0xef9a9a]));
      (world.stalls ||= []).push({ x, z: z + 2.2, top: new THREE.Vector3(x, y + 1.3, z) });
      K.add('red', T(new THREE.BoxGeometry(3.6, 0.15, 2.8), x, y + 2.5, z + 0.3, 0, 0.15), pick([0xd32f2f, 0x1976d2, 0x388e3c, 0xfbc02d]));
      addCol(x - 1.5, z - 1, x + 1.5, z + 1, y, y + 2.4);
    }
  }
  // ---- chai tapris in town ----
  for (const [x, z] of [[M.L.jetty.x + 25, M.L.jetty.z - 30], [-2236, -1170], [-2236, 880], [-2580, -3590], [-2240, 3380], [M.L.jungleCamp.x + 12, M.L.jungleCamp.z - 18], [M.L.temple.x + 20, M.L.temple.z + 40]]) {
    const y = ty(x, z);
    K.box('wood', 2.6, 1.0, 1.2, x, y, z, 0x8d6e63); K.box('red', 3.2, 0.12, 2.2, x, y + 2.4, z + 0.3, 0xffb300);
    for (const sx of [-1.4, 1.4]) K.box('wood', 0.1, 2.4, 0.1, x + sx, y, z + 1.2, 0x5d4037);
    K.add('metal', T(new THREE.CylinderGeometry(0.22, 0.22, 0.32, 12), x - 0.6, y + 1.16, z), 0xb0bec5);
    addCol(x - 1.3, z - 0.6, x + 1.3, z + 0.6, y, y + 1.0);
    (world.stalls ||= []).push({ x, z: z + 1.6, top: new THREE.Vector3(x - 0.6, y + 1.35, z) });
    world.labels.push({ name: 'Chai Tapri', x, z, small: true });
  }
  // ---- ramps ----
  for (const r of M.ramps) {
    const g = new THREE.BufferGeometry(), hw = r.w / 2, hl = r.len / 2;
    const v = [-hw, 0, -hl, hw, 0, -hl, hw, r.h, hl, -hw, r.h, hl, -hw, 0, hl, hw, 0, hl];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex([0, 3, 2, 0, 2, 1, 4, 5, 2, 4, 2, 3, 0, 4, 3, 1, 2, 5, 0, 1, 5, 0, 5, 4]);
    const ng = g.toNonIndexed(); ng.computeVertexNormals();
    vcolor(ng, (x, y, z) => (Math.floor((x + z + 50) / 1.5) % 2 ? [0.95, 0.75, 0.1] : [0.15, 0.15, 0.15]));
    K.add('plain', T(ng, r.x, r.y + 0.02, r.z, r.ang));
  }
  K.build(mats, scene);
  // Moti fort label etc
  world.labels.push({ name: 'Moti Daman Fort', x: (M.L.motiFort.x0 + M.L.motiFort.x1) / 2, z: M.L.motiFort.z0 + 40 });
  world.labels.push({ name: 'Nani Daman Fort (St. Jerome)', x: (M.L.naniFort.x0 + M.L.naniFort.x1) / 2, z: M.L.naniFort.z0 - 10 });
  world.labels.push({ name: 'Devka Beach', x: M.L.devkaBeach.x, z: M.L.devkaBeach.z });
  world.labels.push({ name: 'Jampore Beach', x: M.L.jamporeBeach.x, z: M.L.jamporeBeach.z });
  world.labels.push({ name: 'Mirasol Lake Garden', x: M.LAKE.x, z: M.LAKE.z });
  world.labels.push({ name: 'Daman Ganga River', x: 0, z: M.rivZ(0) });
}

// fishing boats (animated bobbing)
function buildBoats(scene) {
  const shape = new THREE.Shape(); shape.moveTo(-5, 1.2); shape.lineTo(5.2, 1.6); shape.quadraticCurveTo(4.6, 0, 3, -0.6); shape.lineTo(-4, -0.6); shape.quadraticCurveTo(-5.2, 0, -5, 1.2);
  const hull = new THREE.ExtrudeGeometry(shape, { depth: 2.8, bevelEnabled: false }); hull.translate(0, 0, -1.4); hull.rotateY(Math.PI / 2);
  const parts = [prep(hull, 0xffffff), prep(T(new THREE.BoxGeometry(2, 1.6, 2.4), 0, 2.2, -1.5), 0xf5f5f5), prep(T(new THREE.CylinderGeometry(0.08, 0.08, 5, 4), 0, 4, 1), 0x6d4c41), prep(T(new THREE.PlaneGeometry(1.2, 0.8), 0.6, 6, 1), 0xff3d00)];
  const geo = mergeGeometries(parts);
  // stripe colours via vertex y
  const col = geo.attributes.color, pos = geo.attributes.position;
  const n = 70, mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), n);
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < 1.7 && y > 0.6) col.setXYZ(i, 0.1, 0.35, 0.7); else if (y <= 0.6) col.setXYZ(i, 0.75, 0.12, 0.1); }
  const boats = [];
  for (let i = 0; i < n; i++) {
    const x = rr(-3050, -1700), side = R() < 0.5 ? -1 : 1, z = M.rivZ(x) + side * (M.rivHalfW(x) - rr(15, 60));
    if (M.terrainH(x, z) > -1) { boats.push({ x: -3300 - R() * 600, z: rr(-800, 800), a: R() * 6, p: R() * 6 }); continue; }
    boats.push({ x, z, a: rr(-0.3, 0.3) + (side > 0 ? 0 : Math.PI), p: R() * 6 });
    mesh.setColorAt(i, new THREE.Color().setHSL(R(), 0.6, 0.6));
  }
  mesh.castShadow = true; mesh.frustumCulled = false; scene.add(mesh);
  world.boats = { mesh, boats };
  world.animated.push((t) => {
    boats.forEach((b, i) => { _q.setFromEuler(_e.set(Math.sin(t * 1.1 + b.p) * 0.05, b.a, Math.cos(t * 0.9 + b.p) * 0.07)); _m.compose(_p.set(b.x, Math.sin(t * 1.3 + b.p) * 0.15 - 0.2, b.z), _q, _s.set(1, 1, 1)); mesh.setMatrixAt(i, _m); });
    mesh.instanceMatrix.needsUpdate = true;
  });
  for (const b of boats) addCol(b.x - 3, b.z - 3, b.x + 3, b.z + 3, -1, 1.3, { boat: true });
}

// ---------------- nature landmarks (outside the city) ----------------
function computeFalls() {
  const z = M.PLAT.z; let top = M.PLAT.x, bot = M.RIVER_END - 80;
  for (let x = M.RIVER_END - 120; x < M.PLAT.x; x += 1) if (M.terrainH(x, z) > M.PLAT.water - 3) { top = x; break; }
  for (let x = top; x > M.RIVER_END - 200; x -= 1) if (M.terrainH(x, z) < 0.5) { bot = x; break; }
  M.L.falls.x = top; M.L.falls.bot = bot;
  world.falls = { top, bot, z };
}
function buildNature(scene, mats) {
  const K = new Kit();
  const ty = (x, z) => M.terrainH(x, z);
  // ---- waterfall ----
  {
    const { top, z } = world.falls, H0 = M.PLAT.water, W = 34, segs = 40;
    const P = [], UVs = [], I = [];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs, y = H0 - t * (H0 + 0.5);
      let cx = top; for (let x = top + 5; x > top - 160; x -= 0.5) { if (M.terrainH(x, z) < y - 0.5) { cx = x; break; } }
      const x = cx - 3 - Math.sin(t * Math.PI) * 4 - t * 4;
      P.push(x, y, z - W / 2, x, y, z + W / 2); UVs.push(0, t * 8, 1, t * 8);
      if (k < segs) I.push(k * 2, k * 2 + 2, k * 2 + 1, k * 2 + 1, k * 2 + 2, k * 2 + 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UVs, 2)); g.setIndex(I); g.computeVertexNormals();
    const wm = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, uniforms: { uTime: U.uTime, uAmbient: U.uAmbient, uSunColor: U.uSunColor },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform float uTime; uniform vec3 uAmbient, uSunColor; varying vec2 vUv; ${NOISE}
        void main(){ float s = vn(vec2(vUv.x*22., vUv.y*3. - uTime*6.)) * 0.6 + vn(vec2(vUv.x*60., vUv.y*8. - uTime*9.))*0.4;
          float edge = smoothstep(0., 0.12, vUv.x)*smoothstep(1., 0.88, vUv.x);
          vec3 c = mix(vec3(0.55,0.65,0.68), vec3(1.), s) * (uAmbient*1.2 + uSunColor*0.5);
          gl_FragColor = vec4(c, (0.55 + 0.45*s)*edge*0.92);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const wf = new THREE.Mesh(g, wm); wf.renderOrder = 3; scene.add(wf);
    // mist puffs
    const mist = new THREE.Group(); const mm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false });
    const puffs = [];
    for (let k = 0; k < 26; k++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(6 + Math.random() * 8, 10, 8), mm); sp.position.set(world.falls.bot - Math.random() * 30, 2 + Math.random() * 10, z + (Math.random() - 0.5) * 50); mist.add(sp); puffs.push({ m: sp, p: Math.random() * 6, y0: sp.position.y }); }
    scene.add(mist);
    world.animated.push((t) => { for (const f of puffs) { f.m.position.y = f.y0 + Math.sin(t * 0.7 + f.p) * 3; f.m.scale.setScalar(1 + 0.25 * Math.sin(t * 0.9 + f.p * 2)); } });
    world.labels.push({ name: 'Ganga Dhara Falls', x: top, z });
    world.fallsSound = { x: world.falls.bot, y: 20, z };
  }
  // ---- cave mouths (entrances to underground caves) ----
  world.caves = [];
  const caveMouth = (x, z, ang, name, id) => {
    const y = ty(x, z);
    const arch = new THREE.TorusGeometry(7, 3.2, 8, 16, Math.PI); const ag = T(arch, x, y, z, ang);
    K.add('rock', ag, 0x5a524a);
    K.add('dark', T(new THREE.CircleGeometry(6.6, 16, 0, Math.PI), x, y + 0.1, z, ang), 0x020202);
    for (let k = 0; k < 9; k++) { const a = ang + Math.PI / 2 + (k - 4) * 0.35; K.add('rock', T(new THREE.DodecahedronGeometry(2.5 + Math.random() * 2.5), x + Math.sin(a) * 9, y + Math.random() * 4, z + Math.cos(a) * 9), 0x5d554c); }
    world.caves.push({ x: x + Math.sin(ang + Math.PI) * -2, z: z + Math.cos(ang + Math.PI) * -2, y, ang, name, id });
    world.labels.push({ name, x, z });
  };
  { const zc = M.PLAT.z + 48; let xc = world.falls.bot; for (let x = world.falls.bot - 40; x < world.falls.top; x += 1) if (ty(x, zc) > 3) { xc = x - 2; break; } caveMouth(xc, zc, -Math.PI / 2, 'Cave behind the Falls', 'falls'); }
  { const c = M.L.caveNaag, gx = ty(c.x + 5, c.z) - ty(c.x - 5, c.z), gz = ty(c.x, c.z + 5) - ty(c.x, c.z - 5); caveMouth(c.x, c.z, Math.atan2(-gx, -gz), 'Naag Gufa (Serpent Cave)', 'naag'); }
  // ---- Pani Kotha island fort ----
  {
    const { x, z } = M.L.pani, y = 2.2;
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, a2 = (k + 1) / 12 * Math.PI * 2, r = 28; const mx = x + Math.cos((a + a2) / 2) * r, mz = z + Math.sin((a + a2) / 2) * r; K.add('stone', T(boxUV(2 * r * Math.sin(Math.PI / 12) + 0.6, 7, 3), mx, y + 3.5 - 1, mz, -((a + a2) / 2) + Math.PI / 2), 0xffffff); addCol(mx - 3, mz - 3, mx + 3, mz + 3, y - 1, y + 6); }
    K.add('stone', T(new THREE.CylinderGeometry(6, 7, 12, 10), x, y + 5, z), 0xffffff); addCol(x - 6, z - 6, x + 6, z + 6, y - 1, y + 11);
    K.add('white', T(new THREE.ConeGeometry(4, 4, 10), x, y + 13, z), 0xece4d4);
    world.labels.push({ name: 'Pani Kotha (island fort)', x, z });
  }
  // ---- Kalpa Island resort + lighthouse ----
  {
    const I = M.ISLAND;
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 1.4 + 0.6, r = 230, bx = I.x + Math.cos(a) * r, bz = I.z + Math.sin(a) * r; M.addBuilding(bx - 12, bz - 9, bx + 12, bz + 9, 6.9 + (k % 3) * 3.3, 2, 0xffffff, k % 2); }
    const lx = I.x - 300, lz = I.z + 260, ly = ty(lx, lz);
    K.add('plaster', T(new THREE.CylinderGeometry(2.6, 3.6, 30, 16), lx, ly + 15, lz), 0xffffff);
    K.add('red', T(new THREE.CylinderGeometry(2.7, 2.8, 4, 16), lx, ly + 22, lz), 0xc62828);
    K.add('glow', T(new THREE.SphereGeometry(1.8, 10, 8), lx, ly + 31.5, lz), 0xfff3c0);
    addCol(lx - 3.6, lz - 3.6, lx + 3.6, lz + 3.6, ly, ly + 30);
    world.labels.push({ name: 'Kalpa Island Resort', x: I.x, z: I.z });
  }
  // ---- Naag temple on the plateau ----
  {
    const { x, z } = M.L.temple, y = ty(x, z) - 0.3, sc = 0xe8cfa0;
    K.add('stone', T(boxUV(30, 2.2, 40), x, y + 1.1, z), 0xffffff); addCol(x - 15, z - 20, x + 15, z + 20, y, y + 2.2);
    for (let i = 0; i < 4; i++) K.add('stone', T(boxUV(10, 0.55, 2), x, y + 0.27 + i * 0.55, z + 20 + 7 - i * 2), 0xffffff);
    for (let i = -2; i <= 2; i++) for (const sd of [-1, 1]) K.add('plaster', T(new THREE.CylinderGeometry(0.45, 0.5, 5, 8), x + sd * 6, y + 4.7, z + 10 + i * 3), sc);
    K.add('plaster', T(boxUV(14, 0.8, 16), x, y + 7.6, z + 10), sc);
    K.add('plaster', T(boxUV(12, 8, 12), x, y + 6.2, z - 6), sc); addCol(x - 6, z - 12, x + 6, z, y, y + 10);
    const prof = []; for (let k = 0; k <= 12; k++) { const t = k / 12; prof.push(new THREE.Vector2(7 * (1 - t * 0.85) * (1 + 0.12 * Math.sin(t * Math.PI)), t * 18)); }
    const shik = new THREE.LatheGeometry(prof, 8); K.add('plaster', T(shik, x, y + 10, z - 6), sc);
    K.add('plaster', T(new THREE.CylinderGeometry(1.7, 1.7, 0.6, 16), x, y + 28.3, z - 6), sc);
    K.add('red', T(new THREE.SphereGeometry(0.7, 10, 8), x, y + 29.2, z - 6), 0xd4a017);
    K.add('dark', T(new THREE.CylinderGeometry(0.06, 0.06, 6, 4), x, y + 32, z - 6), 0x6d4c41);
    K.add('plain', T(new THREE.PlaneGeometry(2.4, 1.3), x + 1.2, y + 34.2, z - 6), 0xff8f00);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; K.add('stone', T(new THREE.CylinderGeometry(0.8, 1.1, 2.2, 8), x + Math.cos(a) * 22, ty(x + Math.cos(a) * 22, z + Math.sin(a) * 22) + 1, z + Math.sin(a) * 22), 0xffffff); }
    world.labels.push({ name: 'Naag Sarovar Temple', x, z });
    world.temple = { x, z: z + 25, y };
  }
  // ---- salt pans ----
  {
    const S = M.L.saltPans;
    for (let x = S.x0 + 10; x < S.x1 - 30; x += 46) for (let z = S.z0 + 10; z < S.z1 - 30; z += 36) {
      const y = ty(x + 20, z + 15); if (y < 0.4) continue;
      const pg = new THREE.PlaneGeometry(42, 32).rotateX(-Math.PI / 2);
      K.add('salt', T(pg, x + 21, y + 0.18, z + 16), Math.random() < 0.3 ? 0xf3c6d0 : Math.random() < 0.5 ? 0xf5f7fa : 0xcfe3ea);
      if (Math.random() < 0.25) K.add('white', T(new THREE.ConeGeometry(2.2, 2, 10), x + 4, y + 1, z + 4), 0xfafafa);
    }
    world.labels.push({ name: 'Salt Pans', x: (S.x0 + S.x1) / 2, z: (S.z0 + S.z1) / 2 });
  }
  // ---- wind turbines (south coast) ----
  {
    const blades = [];
    const bg = mergeGeometries([0, 1, 2].map((k) => { const b = new THREE.BoxGeometry(1.4, 34, 0.35); b.translate(0, 17, 0); b.rotateZ(k * Math.PI * 2 / 3); return b.toNonIndexed(); }));
    const bm = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
    for (let z = M.L.wind.z0; z < M.L.wind.z1; z += 330) {
      const x = M.coastX(z) + 150, y = ty(x, z);
      if (y < 1) continue;
      K.add('white', T(new THREE.CylinderGeometry(1.4, 2.6, 80, 12), x, y + 40, z), 0xf4f4f4);
      K.add('white', T(boxUV(3, 3, 7), x, y + 80, z - 1), 0xf4f4f4);
      addCol(x - 2.6, z - 2.6, x + 2.6, z + 2.6, y, y + 80, { noTop: true });
      const rotor = new THREE.Mesh(bg, bm); rotor.position.set(x, y + 81.5, z + 2.8); rotor.castShadow = true; scene.add(rotor); blades.push(rotor);
    }
    world.animated.push((t) => { blades.forEach((b, i) => { b.rotation.z = t * 1.1 + i; }); });
    world.labels.push({ name: 'Umbergaon Wind Farm', x: M.coastX(7600) + 150, z: 7600 });
  }
  // ---- jungle camp + peak viewpoint ----
  {
    const { x, z } = M.L.jungleCamp, y = ty(x, z);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2, tx = x + Math.cos(a) * 14, tz = z + Math.sin(a) * 14; K.add('plain', T(new THREE.ConeGeometry(3, 3.2, 4), tx, ty(tx, tz) + 1.6, tz, a), [0x6d8b3a, 0xb5651d, 0x546e7a][k % 3]); addCol(tx - 2.2, tz - 2.2, tx + 2.2, tz + 2.2, y, y + 3); }
    K.add('wood', T(new THREE.CylinderGeometry(1.2, 1.4, 0.4, 10), x, y + 0.2, z), 0x3e2723);
    K.add('glow', T(new THREE.ConeGeometry(0.8, 1.6, 8), x, y + 1.1, z), 0xff8a00);
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) K.add('wood', T(new THREE.CylinderGeometry(0.18, 0.2, 9, 6), x + 25 + dx, y + 4.5, z + dz), 0x5d4037);
    K.add('wood', T(boxUV(5.4, 0.4, 5.4), x + 25, y + 8.2, z), 0x6d4c41); addCol(x + 22.3, z - 2.7, x + 27.7, z + 2.7, y + 8, y + 8.4);
    K.add('tile', T(new THREE.ConeGeometry(4.2, 2.2, 4).rotateY(Math.PI / 4), x + 25, y + 11.3, z), 0x8d6e63);
    world.labels.push({ name: 'Jungle Camp', x, z });
    world.campfire = { x, y: y + 1, z };
    const p = M.L.peak; let best = -1e9; for (let dx = -400; dx <= 400; dx += 20) for (let dz = -400; dz <= 400; dz += 20) { const h = ty(p.x + dx, p.z + dz); if (h > best) { best = h; p.bx = p.x + dx; p.bz = p.z + dz; } }
    p.x = p.bx; p.z = p.bz; const py = ty(p.x, p.z);
    K.add('dark', T(new THREE.CylinderGeometry(0.08, 0.08, 7, 6), p.x, py + 3.5, p.z), 0x9e9e9e);
    K.add('plain', T(new THREE.PlaneGeometry(2.6, 1.6), p.x + 1.3, py + 6, p.z), 0xff6f00);
    world.labels.push({ name: 'Ghats Summit (' + Math.round(py) + ' m)', x: p.x, z: p.z });
  }
  K.build({ ...world.mats }, scene);
}

// ---------------- map canvas ----------------
export function buildMapCanvas() {
  const S = 2048, c = document.createElement('canvas'); c.width = c.height = S; const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.drawImage(TR.T.splatCanvas, 0, 0, S, S);
  const k = S / (2 * M.HALF), X = (x) => (x + M.HALF) * k, Z = (z) => (z + M.HALF) * k;
  ctx.lineCap = 'round';
  for (const e of M.edges) {
    const A = M.nodes[e.a], B = M.nodes[e.b];
    ctx.strokeStyle = e.type === 'major' || e.type === 'coast' ? '#f8e9b8' : '#ddd6c8'; ctx.lineWidth = Math.max(1.2, e.w * k * 1.5);
    ctx.beginPath(); ctx.moveTo(X(A.x), Z(A.z)); ctx.lineTo(X(B.x), Z(B.z)); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(110,100,92,0.9)';
  for (const b of M.buildings) ctx.fillRect(X(b.x0), Z(b.z0), Math.max(1, (b.x1 - b.x0) * k), Math.max(1, (b.z1 - b.z0) * k));
  const ap = M.L.airport; ctx.fillStyle = '#4a4a4a'; ctx.fillRect(X(ap.runX0), Z(ap.runZ - 23), (ap.runX1 - ap.runX0) * k, 46 * k);
  ctx.strokeStyle = '#8a4b30'; ctx.lineWidth = 3; for (const F of [M.L.motiFort, M.L.naniFort]) ctx.strokeRect(X(F.x0), Z(F.z0), (F.x1 - F.x0) * k, (F.z1 - F.z0) * k);
  return c;
}

// ---------------- main build ----------------
export async function buildWorld(scene, q, progress) {
  M.setRes(q.terrainN);
  await M.buildMap(progress);
  await progress('Painting the land', 0.8);
  const splat = TR.buildSplat(q.splatSize);
  await progress('Generating ground textures', 0.83);
  const det = TR.makeDetailTextures(q.detailTex);
  const hTex = TR.heightTexture();
  computeFalls();
  TR.buildTerrainTiles(scene, TR.terrainMaterial(det, splat, q), q);
  TR.buildWaters(scene, hTex, world.falls.top);
  const stone = stoneTex(), plaster = plasterTex();
  const mats = {
    stone: new THREE.MeshStandardMaterial({ map: stone, vertexColors: true, roughness: 0.92 }),
    plaster: new THREE.MeshStandardMaterial({ map: plaster, vertexColors: true, roughness: 0.85 }),
    white: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }),
    red: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
    tile: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    dark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.7 }),
    concrete: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    grass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    container: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }),
    rock: new THREE.MeshStandardMaterial({ map: det.rock, vertexColors: true, roughness: 0.95, flatShading: true }),
    salt: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.1 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    bulbs: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  world.mats = mats; world.det = det;
  buildRoads(scene, mats);
  await progress('Building forts and landmarks', 0.88);
  buildLandmarks(scene, mats);
  buildNature(scene, mats);
  buildBuildings(scene);
  buildBoats(scene);
  await progress('Growing the jungle', 0.93);
  buildTrees(scene, q);
  buildStreetLights(scene);
  M.setColliders(world.colliders);
  if (q.grassR > 0) TR.buildGrass(scene, hTex, TR.occTexture(), splat, q);
  world.mapCanvas = buildMapCanvas();
  world.hTex = hTex; world.splat = splat;
  world.stats = { buildings: M.buildings.length, roads: M.edges.length, trees: Object.values(M.trees).reduce((a, l) => a + l.length, 0), lights: M.lights.length, colliders: world.colliders.length };
}
export function updateWorld(t, night) {
  for (const f of world.animated) f(t);
  for (const b of world.beams) { b.g.rotation.y = t * 0.8; b.g.visible = night > 0.2; b.mat.opacity = 0.22 * night; }
  if (world.lampMat) world.lampMat.emissiveIntensity = night * 4;
  if (world.mats) world.mats.bulbs.color.setScalar(0.3 + night * 1.2), world.mats.glow.color.setScalar(0.4 + night * 1.6);
}
