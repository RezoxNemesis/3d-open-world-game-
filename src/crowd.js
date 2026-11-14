// GPU crowd: lakhs of pedestrians animated entirely in the vertex shader, but still interactive
// (positions are analytic so the CPU can hit-test / panic / knock down any of them).
import * as THREE from 'three';
import * as M from './mapdata.js';
import { crowdGeometry, randomLook, SKINS } from './human.js';
import { U, patch } from './shaders.js';
import { mulberry32, clamp, lerp, packRGB, hexRGB } from './util.js';

const CS = 200, CN = (2 * M.HALF) / CS;
export const crowd = { n: 0, cells: new Map(), panic: new THREE.Vector4(0, 0, -999, 0), count: 0, renderer: null, pool: null };
let A_PATH, A_MOVE, A_LOOK, A_FLAG; // big typed arrays
const PANIC = crowd.panic;
const BASE_GLSL = /* glsl */`
attribute vec4 aPath; attribute vec4 aMove; attribute vec4 aLook; attribute vec2 aFlag;
uniform float uTime; uniform vec4 uPanic; uniform vec3 uSelCam; uniform float uNearR;
vec3 unpackC(float v){ return vec3(floor(v/65536.), mod(floor(v/256.),256.), mod(v,256.))/255.; }
// analytic walker: base xz, ground y, facing yaw, gait phase, moving 0/1, running 0..1
void crowdBase(out vec2 base, out float y, out float yaw, out float ph, out float moving, out float runK){
  float spd = aMove.x, L = max(aPath.w, 0.01);
  float d = spd*uTime + aMove.y*L*2.0;
  float m = mod(d, 2.0*L);
  float fw = step(m, L);
  float along = mix(2.0*L - m, m, fw);
  vec2 dir = vec2(sin(aPath.z), cos(aPath.z));
  base = aPath.xy + dir*along*step(0.001, spd);
  yaw = aPath.z + (1.0-fw)*3.14159*step(0.001, spd);
  y = mix(aMove.w, aLook.w, along/L);
  runK = 0.0;
  vec2 tp = base - uPanic.xy; float pd = length(tp); float pt = uTime - uPanic.z;
  if (pt > 0.0 && pt < 45.0 && pd < uPanic.w) {
    float k = 1.0 - pd/uPanic.w; float F = 10.0 + 30.0*k; float t1 = F/6.0;
    float f = pt < t1 ? pt*6.0 : (pt < 30.0 ? F : F*max(0.0, 1.0-(pt-30.0)/15.0));
    vec2 away = tp/max(pd, 0.01);
    base += away*f;
    if (pt < t1) { yaw = atan(away.x, away.y); runK = 1.0; } else if (pt > 30.0 && pt < 45.0) { yaw = atan(-away.x, -away.y); runK = 0.3; }
  }
  moving = min(1.0, step(0.01, spd) + runK);
  ph = uTime*(spd*2.7 + runK*9.0) + aMove.y*31.0;
}
`;
// limb animation shared by the 3D crowd and the impostor baker
const LIMB_GLSL = /* glsl */`
void crowdPose(inout vec3 p, inout vec3 n, float aPart, vec3 aPivot, float sw, float amp, float idle, float style){
  float ang = 0.0;
  if (aPart > 0.5 && aPart < 1.5) ang = sw*0.45*amp + idle*0.08;
  else if (aPart > 1.5 && aPart < 2.5) ang = -sw*0.45*amp - idle*(style > 0.5 ? 0.0 : 0.25);
  else if (aPart > 2.5 && aPart < 3.5) ang = -sw*0.5*amp*(style > 1.5 ? 0.4 : 1.0);
  else if (aPart > 3.5) ang = sw*0.5*amp*(style > 1.5 ? 0.4 : 1.0);
  if (aPart > 0.5) { vec3 q = p - aPivot; float c = cos(ang), s = sin(ang); p = aPivot + vec3(q.x, q.y*c - q.z*s, q.y*s + q.z*c); n = vec3(n.x, n.y*c - n.z*s, n.y*s + n.z*c); }
  if (style > 1.5 && aPart > 2.5) { p.x *= 1.6; p.z *= 1.4; }
  if (style > 0.5 && aPart < 0.5 && p.y < 1.45 && p.y > 0.9) p.x *= 0.92;
}
`;
const CROWD_GLSL = BASE_GLSL + LIMB_GLSL + /* glsl */`
attribute float aPart; attribute vec3 aPivot; attribute float aMat;
void crowdX(out vec3 P, out vec3 N, out vec3 C){
  vec2 base; float y, yaw, ph, moving, runK; crowdBase(base, y, yaw, ph, moving, runK);
  float sw = sin(ph);
  vec3 p = position; vec3 n = normal;
  float amp = moving*(1.0+runK*0.7);
  float idle = (1.0-moving)*sin(uTime*1.1 + aMove.y*40.0);
  crowdPose(p, n, aPart, aPivot, sw, amp, idle, aFlag.y);
  // near pool only: people outside the near radius are drawn as impostors instead
  float sc = aMove.z * aFlag.x * step(distance(base, uSelCam.xz), uNearR);
  p *= sc;
  float cy = cos(yaw), sy = sin(yaw);
  P = vec3(p.x*cy + p.z*sy, p.y, -p.x*sy + p.z*cy) + vec3(base.x, y + abs(sw)*0.035*moving, base.y);
  N = vec3(n.x*cy + n.z*sy, n.y, -n.x*sy + n.z*cy);
  vec3 top = unpackC(aLook.x), bot = unpackC(aLook.y), skin = unpackC(aLook.z);
  C = aMat < 0.5 ? skin : aMat < 1.5 ? top : aMat < 2.5 ? (aFlag.y > 1.5 ? top*0.9 : bot) : aMat < 3.5 ? vec3(0.05,0.035,0.025) : vec3(0.08,0.06,0.05);
  C = pow(C, vec3(2.2));
}`;
const NEAR = { uSelCam: { value: new THREE.Vector3(0, -1e5, 0) }, uNearR: { value: 0 } };
function crowdMaterials() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  patch(mat, (s) => {
    s.uniforms.uTime = U.uTime; s.uniforms.uPanic = { value: PANIC }; s.uniforms.uSelCam = NEAR.uSelCam; s.uniforms.uNearR = NEAR.uNearR;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + CROWD_GLSL)
      .replace('#include <color_vertex>', 'vec3 cP, cN, cC; crowdX(cP, cN, cC); vColor = cC;')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = cN;')
      .replace('#include <begin_vertex>', 'vec3 transformed = cP;');
  }, 'crowd2');
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  patch(depth, (s) => {
    s.uniforms.uTime = U.uTime; s.uniforms.uPanic = { value: PANIC }; s.uniforms.uSelCam = NEAR.uSelCam; s.uniforms.uNearR = NEAR.uNearR;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + CROWD_GLSL).replace('#include <begin_vertex>', 'vec3 cP, cN, cC; crowdX(cP, cN, cC); vec3 transformed = cP;');
  }, 'crowdDepth2');
  return { mat, depth };
}

// ---------------- impostors ----------------
// 3 body styles x 8 view directions x 5 frames (4 walk phases + idle), baked from the real 3D crowd model at load.
const GRID = [16, 8], DIRS = 8, FRAMES = 5;
function bakeImpostorAtlas(renderer, hi, size) {
  const cells = 3 * DIRS * FRAMES, cellInfo = new Float32Array(cells * 4);
  for (let ty = 0; ty < 3; ty++) for (let d = 0; d < DIRS; d++) for (let f = 0; f < FRAMES; f++) {
    const ci = ty * DIRS * FRAMES + d * FRAMES + f;
    cellInfo.set([ci, (d / DIRS) * Math.PI * 2, f < 4 ? Math.sin(f * Math.PI / 2) : 0, ty], ci * 4);
  }
  const g = new THREE.InstancedBufferGeometry(); g.index = hi.index;
  for (const k of ['position', 'normal', 'aPart', 'aPivot', 'aMat']) g.setAttribute(k, hi.attributes[k]);
  g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cellInfo, 4)); g.instanceCount = cells;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uGrid: { value: new THREE.Vector2(...GRID) } },
    vertexShader: LIMB_GLSL + /* glsl */`
      attribute float aPart; attribute vec3 aPivot; attribute float aMat; attribute vec4 aCell; uniform vec2 uGrid;
      varying float vMat; varying float vShade;
      void main(){
        vec3 p = position, n = normal; float sw = aCell.z, moving = step(0.001, abs(sw));
        crowdPose(p, n, aPart, aPivot, sw, 1.0, 0.0, aCell.w);
        float c = cos(aCell.y), s = sin(aCell.y);
        p = vec3(p.x*c + p.z*s, p.y, -p.x*s + p.z*c); n = vec3(n.x*c + n.z*s, n.y, -n.x*s + n.z*c);
        vec2 cell = vec2(mod(aCell.x, uGrid.x), floor(aCell.x/uGrid.x));
        vec2 uv = (cell + vec2(p.x/1.2 + 0.5, p.y/2.3 + 0.02))/uGrid;
        gl_Position = vec4(uv*2.0 - 1.0, -p.z*0.4, 1.0);
        vMat = aMat; vShade = 0.42 + 0.58*max(dot(normalize(n), normalize(vec3(0.35, 0.75, 0.6))), 0.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vMat; varying float vShade;
      void main(){
        vec3 m = vMat < 0.5 ? vec3(0., 0., 1.) : vMat < 1.5 ? vec3(1., 0., 0.) : vMat < 2.5 ? vec3(0., 1., 0.) : vec3(0.);
        gl_FragColor = vec4(m*vShade, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(mesh);
  const rt = new THREE.WebGLRenderTarget(size * GRID[0] / 8, size, { depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  rt.texture.generateMipmaps = true;
  const prevT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevTM = renderer.toneMapping;
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.toneMapping = THREE.NoToneMapping;
  renderer.render(sc, new THREE.Camera());
  renderer.setRenderTarget(prevT); renderer.setClearColor(prevC, prevA); renderer.toneMapping = prevTM;
  g.dispose(); mat.dispose();
  return rt.texture;
}
function impostorMaterial(atlas) {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uAtlas: { value: null }, uGrid: { value: new THREE.Vector2(...GRID) }, uLight: { value: null }, uTime: { value: 0 }, uPanic: { value: null }, uSelCam: { value: null }, uNearR: { value: 0 } }]),
    vertexShader: BASE_GLSL + /* glsl */`
      uniform vec2 uGrid; varying vec2 vUv; varying vec3 vTop; varying vec3 vBot; varying vec3 vSkin;
      #include <fog_pars_vertex>
      void main(){
        vec2 base; float y, yaw, ph, moving, runK; crowdBase(base, y, yaw, ph, moving, runK);
        float sc = aMove.z * aFlag.x * step(uNearR, distance(base, uSelCam.xz));
        vec3 wp = vec3(base.x, y + abs(sin(ph))*0.035*moving, base.y);
        vec2 tc = normalize(cameraPosition.xz - wp.xz + vec2(1e-4));
        vec2 right = vec2(tc.y, -tc.x);
        vec3 p = wp + vec3(right.x*position.x*1.2*sc, position.y*2.3*sc, right.y*position.x*1.2*sc);
        float va = atan(tc.x, tc.y) - yaw;
        float di = mod(floor(va/(6.2831853/8.0) + 0.5), 8.0);
        float fr = moving > 0.5 ? floor(mod(ph + 0.785398, 6.2831853)/6.2831853*4.0) : 4.0;
        float cell = floor(aFlag.y + 0.5)*40.0 + di*5.0 + fr;
        vUv = (vec2(mod(cell, uGrid.x), floor(cell/uGrid.x)) + vec2(position.x + 0.5, position.y))/uGrid;
        vTop = pow(unpackC(aLook.x), vec3(2.2)); vBot = aFlag.y > 1.5 ? vTop*0.9 : pow(unpackC(aLook.y), vec3(2.2)); vSkin = pow(unpackC(aLook.z), vec3(2.2));
        vec4 mvPosition = viewMatrix*vec4(p, 1.0);
        gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uAtlas; uniform vec3 uLight; varying vec2 vUv; varying vec3 vTop; varying vec3 vBot; varying vec3 vSkin;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        vec4 t = texture2D(uAtlas, vUv);
        if (t.a < 0.5) discard;
        vec3 c = (vTop*t.r + vBot*t.g + vSkin*t.b)/t.a + vec3(0.025);
        gl_FragColor = vec4(c*uLight, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}
function linkImpostor(mat, atlas) {
  const u = mat.uniforms; u.uAtlas.value = atlas; u.uLight = U.uCrowdLight; u.uTime = U.uTime; u.uPanic = { value: PANIC }; u.uSelCam = NEAR.uSelCam; u.uNearR = NEAR.uNearR;
}

// ---------------- generation ----------------
export function buildCrowd(scene, q) {
  const target = q.crowd, rng = mulberry32(777);
  const segs = []; let total = 0;
  const dens = { nani: 1.25, moti: 0.9, devka: 1.0, jampore: 0.6, industry: 0.12, dabhel: 0.35, fort: 0.9, rural: 0.06 };
  for (const e of M.edges) {
    if (e.elev) continue;
    let w = e.type === 'village' ? 0.55 : dens[e.zone] ?? 0.1;
    if (e.type === 'link') w *= 0.5;
    if (w <= 0) continue;
    const A = M.nodes[e.a], B = M.nodes[e.b];
    for (const side of [-1, 1]) { segs.push({ kind: 'walk', A, B, side, off: e.w / 2 + 1.7, len: e.len, w }); total += e.len * w; }
  }
  // beaches: z ranges with densities
  for (const [z0, z1, d] of [[-4700, -3050, 7], [2550, 4250, 5], [-8800, -4700, 0.5], [-3000, -400, 0.8], [600, 2500, 0.8], [4250, 8800, 0.6]]) { segs.push({ kind: 'beach', z0, z1, w: d, len: z1 - z0 }); total += (z1 - z0) * d; }
  // farm workers, temple pilgrims, camp, island, airport
  const spots = [{ x: M.L.temple.x, z: M.L.temple.z, r: 45, n: 160 }, { x: M.L.jungleCamp.x, z: M.L.jungleCamp.z, r: 25, n: 25 }, { x: M.ISLAND.x, z: M.ISLAND.z, r: 260, n: 400 }, { x: 190, z: 2560, r: 60, n: 220 }, { x: M.L.stadium.x, z: M.L.stadium.z, r: 70, n: 600 }, { x: M.L.ferris.x, z: M.L.ferris.z, r: 50, n: 700 }, { x: M.L.saltPans.x0 + 300, z: M.L.saltPans.z0 + 450, r: 300, n: 220 }, { x: M.L.pani.x, z: M.L.pani.z, r: 22, n: 30 }];
  for (const v of M.villages) spots.push({ x: v.x, z: v.z, r: 120, n: 160 });
  let fixed = 0; for (const s of spots) fixed += s.n;
  const scale = Math.max(0, (target - fixed - 3000) / total);
  A_PATH = new Float32Array(target * 4); A_MOVE = new Float32Array(target * 4); A_LOOK = new Float32Array(target * 4); A_FLAG = new Float32Array(target * 2);
  const cellOf = new Int32Array(target);
  let n = 0;
  const add = (x, z, ang, L, spd, standing = false) => {
    if (n >= target) return;
    const h0 = M.terrainH(x, z); if (h0 < 0.25) return;
    const x1 = x + Math.sin(ang) * L, z1 = z + Math.cos(ang) * L; const h1 = spd > 0 ? M.terrainH(x1, z1) : h0;
    if (h1 < 0.25 && spd > 0) return;
    const r = rng(), kid = r < 0.07, look = randomLook(rng), top = hexRGB(look.top), bot = hexRGB(look.bottom), sk = hexRGB(look.skin);
    A_PATH.set([x, z, ang, Math.max(0.5, L)], n * 4);
    A_MOVE.set([spd, rng(), kid ? 0.62 + rng() * 0.12 : 0.9 + rng() * 0.16, h0], n * 4);
    A_LOOK.set([packRGB(...top), packRGB(...bot), packRGB(...sk), h1], n * 4);
    A_FLAG.set([1, look.female ? (look.saree ? 2 : 1) : 0], n * 2);
    const mx = x + Math.sin(ang) * L * 0.5, mz = z + Math.cos(ang) * L * 0.5;
    cellOf[n] = clamp(Math.floor((mx + M.HALF) / CS), 0, CN - 1) + clamp(Math.floor((mz + M.HALF) / CS), 0, CN - 1) * CN;
    n++;
  };
  for (const s of segs) {
    const cnt = Math.round(s.len * s.w * scale + (rng() < (s.len * s.w * scale) % 1 ? 1 : 0));
    for (let k = 0; k < cnt; k++) {
      if (s.kind === 'walk') {
        const dx = (s.B.x - s.A.x) / s.len, dz = (s.B.z - s.A.z) / s.len, L = Math.min(s.len - 4, 8 + rng() * 40), st = 2 + rng() * Math.max(0, s.len - L - 4);
        const off = s.off + (rng() - 0.5) * 1.1, px = s.A.x + dx * st + dz * s.side * off, pz = s.A.z + dz * st - dx * s.side * off;
        const fwd = rng() < 0.5, ang = Math.atan2(dx, dz) + (fwd ? 0 : Math.PI);
        const standing = rng() < 0.2;
        if (fwd) add(px, pz, ang, L, standing ? 0 : 0.9 + rng() * 0.6); else add(px + dx * L, pz + dz * L, ang, L, standing ? 0 : 0.9 + rng() * 0.6);
      } else {
        const z = s.z0 + rng() * (s.z1 - s.z0), x = M.coastX(z) + 12 + rng() * 85;
        const standing = rng() < 0.35;
        add(x, z, (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.7, 6 + rng() * 30, standing ? 0 : 0.7 + rng() * 0.6);
      }
    }
  }
  for (const s of spots) for (let k = 0; k < s.n; k++) { const a = rng() * 6.283, r = Math.sqrt(rng()) * s.r; add(s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, rng() * 6.283, 4 + rng() * 14, rng() < 0.4 ? 0 : 0.8 + rng() * 0.5); }
  for (let k = 0; k < 3000 && n < target; k++) { const x = -2500 + rng() * 6500, z = -9000 + rng() * 18000; const sp = M.terrainH(x, z); if (M.zoneAt(x, z) === 'rural' && sp > 1 && sp < 80 && !M.occAt(x, z)) add(x, z, rng() * 6.28, 3 + rng() * 6, rng() < 0.6 ? 0 : 0.5); }
  crowd.n = n;
  // bucket into cells
  const order = new Int32Array(n); for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => cellOf[a] - cellOf[b]);
  const P2 = new Float32Array(n * 4), M2 = new Float32Array(n * 4), L2 = new Float32Array(n * 4), F2 = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { const o = order[i]; P2.set(A_PATH.subarray(o * 4, o * 4 + 4), i * 4); M2.set(A_MOVE.subarray(o * 4, o * 4 + 4), i * 4); L2.set(A_LOOK.subarray(o * 4, o * 4 + 4), i * 4); F2.set(A_FLAG.subarray(o * 2, o * 2 + 2), i * 2); }
  A_PATH = P2; A_MOVE = M2; A_LOOK = L2; A_FLAG = F2;
  const hi = crowdGeometry(q.desktop);
  const { mat, depth } = crowdMaterials();
  const atlas = bakeImpostorAtlas(crowd.renderer, crowdGeometry(true), q.desktop ? 2048 : 1024);
  const imat = impostorMaterial(); linkImpostor(imat, atlas);
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3)); quad.setIndex([0, 1, 2, 0, 2, 3]);
  let i0 = 0;
  while (i0 < n) {
    const c = cellOf[order[i0]]; let i1 = i0; while (i1 < n && cellOf[order[i1]] === c) i1++;
    const cnt = i1 - i0, attrs = {
      aPath: new THREE.InstancedBufferAttribute(A_PATH.subarray(i0 * 4, i1 * 4), 4), aMove: new THREE.InstancedBufferAttribute(A_MOVE.subarray(i0 * 4, i1 * 4), 4),
      aLook: new THREE.InstancedBufferAttribute(A_LOOK.subarray(i0 * 4, i1 * 4), 4), aFlag: new THREE.InstancedBufferAttribute(A_FLAG.subarray(i0 * 2, i1 * 2), 2),
    };
    const cx = (c % CN) * CS - M.HALF + CS / 2, cz = Math.floor(c / CN) * CS - M.HALF + CS / 2;
    const g = new THREE.InstancedBufferGeometry(); g.index = quad.index; g.setAttribute('position', quad.attributes.position);
    for (const k in attrs) g.setAttribute(k, attrs[k]); g.instanceCount = cnt;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, M.terrainH(cx, cz), cz), CS * 0.95);
    const mesh = new THREE.Mesh(g, imat); mesh.visible = false; mesh.matrixAutoUpdate = false; scene.add(mesh);
    crowd.cells.set(c, { mesh, i0, i1, cx, cz, attrs });
    i0 = i1;
  }
  // near pool: the closest people, drawn with the full 3D body (and casting shadows)
  const K = q.crowdHiK;
  const pg = new THREE.InstancedBufferGeometry(); pg.index = hi.index;
  for (const k of ['position', 'normal', 'aPart', 'aPivot', 'aMat']) pg.setAttribute(k, hi.attributes[k]);
  crowd.pool = { K, n: 0, path: new Float32Array(K * 4), move: new Float32Array(K * 4), look: new Float32Array(K * 4), flag: new Float32Array(K * 2), idx: new Int32Array(K), t: 0, at: new THREE.Vector3(0, -1e5, 0) };
  const P = crowd.pool;
  pg.setAttribute('aPath', new THREE.InstancedBufferAttribute(P.path, 4)); pg.setAttribute('aMove', new THREE.InstancedBufferAttribute(P.move, 4));
  pg.setAttribute('aLook', new THREE.InstancedBufferAttribute(P.look, 4)); pg.setAttribute('aFlag', new THREE.InstancedBufferAttribute(P.flag, 2));
  for (const k of ['aPath', 'aMove', 'aLook', 'aFlag']) pg.attributes[k].setUsage(THREE.DynamicDrawUsage);
  pg.instanceCount = 0;
  P.mesh = new THREE.Mesh(pg, mat); P.mesh.customDepthMaterial = depth; P.mesh.frustumCulled = false; P.mesh.castShadow = true; P.mesh.receiveShadow = true; scene.add(P.mesh);
  crowd.count = n;
  return n;
}
const _cand = [];
function selectNear(cam, q) {
  const P = crowd.pool, R = q.crowdHiR, o = {}, t = U.uTime.value;
  _cand.length = 0;
  const c0x = Math.floor((cam.x - R - 60 + M.HALF) / CS), c1x = Math.floor((cam.x + R + 60 + M.HALF) / CS), c0z = Math.floor((cam.z - R - 60 + M.HALF) / CS), c1z = Math.floor((cam.z + R + 60 + M.HALF) / CS);
  for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
    const cell = crowd.cells.get(cx + cz * CN); if (!cell) continue;
    for (let i = cell.i0; i < cell.i1; i++) {
      if (A_FLAG[i * 2] < 0.5) continue;
      personPos(i, t, o); const d = Math.hypot(o.x - cam.x, o.z - cam.z);
      if (d < R + 4) _cand.push(d, i);
    }
  }
  const m = _cand.length / 2, ord = new Array(m); for (let k = 0; k < m; k++) ord[k] = k;
  if (m > P.K) ord.sort((a, b) => _cand[a * 2] - _cand[b * 2]);
  const take = Math.min(m, P.K);
  for (let k = 0; k < take; k++) {
    const i = _cand[ord[k] * 2 + 1];
    P.path.set(A_PATH.subarray(i * 4, i * 4 + 4), k * 4); P.move.set(A_MOVE.subarray(i * 4, i * 4 + 4), k * 4);
    P.look.set(A_LOOK.subarray(i * 4, i * 4 + 4), k * 4); P.flag.set(A_FLAG.subarray(i * 2, i * 2 + 2), k * 2); P.idx[k] = i;
  }
  // everyone inside the radius must be in the pool; shrink the radius when the pool is full
  NEAR.uNearR.value = m > P.K ? Math.max(0, _cand[ord[P.K - 1] * 2] - 4) : R;
  NEAR.uSelCam.value.set(cam.x, cam.y, cam.z);
  const g = P.mesh.geometry; g.instanceCount = take; P.n = take;
  for (const k of ['aPath', 'aMove', 'aLook', 'aFlag']) { const a = g.attributes[k]; a.clearUpdateRanges(); a.addUpdateRange(0, take * a.itemSize); a.needsUpdate = true; }
  P.at.copy(cam); P.t = t;
}
export function updateCrowd(cam, q, inside) {
  const vis0 = !inside && cam.y < 1500;
  for (const cell of crowd.cells.values()) {
    const d = Math.hypot(cam.x - cell.cx, cam.z - cell.cz) - CS * 0.7;
    cell.mesh.visible = vis0 && d < q.crowdFar;
  }
  const P = crowd.pool; if (!P) return;
  P.mesh.visible = vis0;
  if (vis0 && (Math.abs(U.uTime.value - P.t) > 0.18 || P.at.distanceToSquared(cam) > 9)) selectNear(cam, q);
}
export function refreshNearPool() { const P = crowd.pool; if (P) P.t = -1e9; }
export function setPanic(x, z, r) {
  const t = U.uTime.value;
  if (t - PANIC.z < 8 && Math.hypot(x - PANIC.x, z - PANIC.y) < PANIC.w * 0.6) return; // already panicking here
  PANIC.set(x, z, t, r);
}
// analytic position (mirrors the shader)
export function personPos(i, t, out = {}) {
  const spd = A_MOVE[i * 4], L = Math.max(A_PATH[i * 4 + 3], 0.01), d = spd * t + A_MOVE[i * 4 + 1] * L * 2;
  const m = ((d % (2 * L)) + 2 * L) % (2 * L), fw = m <= L ? 1 : 0, along = fw ? m : 2 * L - m;
  const ang = A_PATH[i * 4 + 2], mv = spd > 0.001 ? 1 : 0;
  let x = A_PATH[i * 4] + Math.sin(ang) * along * mv, z = A_PATH[i * 4 + 1] + Math.cos(ang) * along * mv;
  const pt = t - PANIC.z, pd = Math.hypot(x - PANIC.x, z - PANIC.y);
  if (pt > 0 && pt < 45 && pd < PANIC.w) { const k = 1 - pd / PANIC.w, F = 10 + 30 * k, t1 = F / 6, f = pt < t1 ? pt * 6 : pt < 30 ? F : F * Math.max(0, 1 - (pt - 30) / 15); x += ((x - PANIC.x) / Math.max(pd, 0.01)) * f; z += ((z - PANIC.y) / Math.max(pd, 0.01)) * f; }
  out.x = x; out.z = z; out.y = lerp(A_MOVE[i * 4 + 3], A_LOOK[i * 4 + 3], along / L); out.yaw = ang + (fw ? 0 : Math.PI) * mv; out.alive = A_FLAG[i * 2] > 0.5;
  return out;
}
// returns [{i, x, y, z}] for alive people within r of (x, z)
export function crowdNear(x, z, r, t = U.uTime.value, max = 50) {
  const out = [], o = {};
  const c0x = Math.floor((x - r - 60 + M.HALF) / CS), c1x = Math.floor((x + r + 60 + M.HALF) / CS), c0z = Math.floor((z - r - 60 + M.HALF) / CS), c1z = Math.floor((z + r + 60 + M.HALF) / CS);
  for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
    const cell = crowd.cells.get(cx + cz * CN); if (!cell) continue;
    for (let i = cell.i0; i < cell.i1; i++) {
      if (A_FLAG[i * 2] < 0.5) continue;
      personPos(i, t, o);
      const d = Math.hypot(o.x - x, o.z - z); if (d < r) { out.push({ i, x: o.x, y: o.y, z: o.z, yaw: o.yaw, d }); if (out.length >= max) return out; }
    }
  }
  return out;
}
// ray test (for guns): returns nearest {i, t}
export function crowdRay(origin, dir, maxT) {
  let best = null; const t = U.uTime.value, o = {};
  for (let s = 0; s < maxT; s += 30) {
    const px = origin.x + dir.x * (s + 15), pz = origin.z + dir.z * (s + 15);
    for (const p of crowdNear(px, pz, 22, t, 400)) {
      const vx = p.x - origin.x, vy = p.y + 1.0 - origin.y, vz = p.z - origin.z, tt = vx * dir.x + vy * dir.y + vz * dir.z;
      if (tt < 0 || tt > maxT) continue;
      const dx = origin.x + dir.x * tt - p.x, dy = origin.y + dir.y * tt - (p.y + 1.0), dz = origin.z + dir.z * tt - p.z;
      if (dx * dx + dz * dz < 0.16 && Math.abs(dy) < 0.9 && (!best || tt < best.t)) best = { i: p.i, t: tt, x: p.x, y: p.y, z: p.z, yaw: p.yaw };
    }
    if (best) return best;
  }
  return best;
}
export function setAlive(i, alive) {
  A_FLAG[i * 2] = alive ? 1 : 0;
  for (const cell of crowd.cells.values()) if (i >= cell.i0 && i < cell.i1) { const a = cell.attrs.aFlag; a.array[(i - cell.i0) * 2] = alive ? 1 : 0; a.needsUpdate = true; break; }
  refreshNearPool();
}
export function lookOf(i) {
  const un = (v) => ((Math.floor(v / 65536) & 255) << 16) | ((Math.floor(v / 256) & 255) << 8) | (Math.floor(v) & 255);
  const st = A_FLAG[i * 2 + 1];
  return { female: st > 0.5, saree: st > 1.5, top: un(A_LOOK[i * 4]), top2: un(A_LOOK[i * 4]), bottom: un(A_LOOK[i * 4 + 1]), skin: un(A_LOOK[i * 4 + 2]), hair: 0x120c08, hairStyle: st > 0.5 ? 'bun' : 'short', shoes: 0x2b2b2b, scale: A_MOVE[i * 4 + 2] };
}
export function densityAt(x, z) { const c = crowd.cells.get(clamp(Math.floor((x + M.HALF) / CS), 0, CN - 1) + clamp(Math.floor((z + M.HALF) / CS), 0, CN - 1) * CN); return c ? (c.i1 - c.i0) / 400 : 0; }
