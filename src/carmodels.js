// Blender-built hero cars (tools/blender/cars.py + carbody.py): a lofted body with exact window cuts, recessed glass,
// panel gaps, lamps, trims and interior, with ambient occlusion baked into the vertex colours. Each car ships as
//   <key>.glb / <key>_wheel.glb                 full detail (the car you drive)
//   <key>_lod1.glb / <key>_wheel_lod1.glb       traffic near
//   <key>_lod2.glb / <key>_wheel_lod2.glb       traffic far
// Vertex data: COLOR_0 = albedo x AO (linear), TEXCOORD_0 = (paint flag, emit code) for vehicleMaterial.
// If anything fails to load the procedural cars in vehicle_models.js are used instead.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assetURL } from './textures.js';

export const CAR_MODELS = {};
export const STATIC_MODELS = {};   // other Blender vehicles: rajhans (business jet)
const KEYS = ['bison', 'shera', 'gajraj'];

// glTF -> the attribute set vehicleMaterial expects (position, normal, color, aPaint, aEmit)
function convert(src) {
  const g = new THREE.BufferGeometry(), n = src.attributes.position.count, col = src.attributes.color, uv = src.attributes.uv;
  const C = new Float32Array(n * 3), P = new Float32Array(n), E = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (col) { C[i * 3] = col.getX(i); C[i * 3 + 1] = col.getY(i); C[i * 3 + 2] = col.getZ(i); } else C.fill(0.5, i * 3, i * 3 + 3);
    // the Blender exporter stores V as 1 - v
    if (uv) { P[i] = Math.round(uv.getX(i)); E[i] = Math.round(1 - uv.getY(i)); }
  }
  g.setAttribute('position', src.attributes.position); g.setAttribute('normal', src.attributes.normal);
  g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setAttribute('aPaint', new THREE.BufferAttribute(P, 1)); g.setAttribute('aEmit', new THREE.BufferAttribute(E, 1));
  if (src.index) g.setIndex(src.index);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
// left-hand wheels: mirror across X and flip the winding so the rim faces outwards
export function mirrorX(geo) {
  const g = geo.clone(); g.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.index.needsUpdate = true; }
  return g;
}
function loadGLB(loader, url) {
  return new Promise((ok) => loader.load(url, (gltf) => {
    const geos = []; gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => { if (o.isMesh) { const gg = convert(o.geometry); gg.applyMatrix4(o.matrixWorld); geos.push(gg); } });
    ok(geos.length > 1 ? mergeGeometries(geos) : geos[0] || null);
  }, undefined, () => ok(null)));
}
function assemble(body, wheel, wheels) {
  const parts = [body];
  for (const [x, y, z] of wheels) { const w = x < 0 ? mirrorX(wheel) : wheel.clone(); w.translate(x, y, z); parts.push(w); }
  return mergeGeometries(parts);
}
export async function loadCarModels(q) {
  let meta = null;
  try { meta = await (await fetch(assetURL('assets/models/cars/cars.json'))).json(); } catch (e) { console.warn('car models: no cars.json', e); return CAR_MODELS; }
  const loader = new GLTFLoader(), seen = new Map();
  // one parse per file: on phones the driven car and the near traffic share the lod1 files
  const get = (n) => { if (!seen.has(n)) seen.set(n, loadGLB(loader, assetURL(`assets/models/cars/${n}.glb`))); return seen.get(n); };
  await Promise.all(KEYS.filter((k) => meta[k]).map(async (key) => {
    const f = get;
    // phones drive the lod1 body (a third of the triangles) and skip the full-detail wheel
    const phone = !q.desktop;
    const [body, wheel, b1, w1, b2, w2] = await Promise.all([f(phone ? key + '_lod1' : key), f(phone ? key + '_wheel_lod1' : key + '_wheel'), f(key + '_lod1'), f(key + '_wheel_lod1'), f(key + '_lod2'), f(key + '_wheel_lod2')]);
    if (!body || !wheel || !b1 || !w1) { console.warn('car models: incomplete', key); return; }
    const m = meta[key], wheels = m.wheels.map(([x, y, z]) => [x, y, z]);
    CAR_MODELS[key] = { body, wheel, wheels, r: m.r, len: m.L, wid: m.W, all: assemble(b1, w1, wheels), low: b2 && w2 ? assemble(b2, w2, wheels) : null };
  }));
  const [jet, jet1] = await Promise.all([get(q.desktop ? 'rajhans' : 'rajhans_lod1'), get('rajhans_lod1')]);
  if (jet) STATIC_MODELS.rajhans = { geo: jet, lod: jet1 || jet };
  return CAR_MODELS;
}
