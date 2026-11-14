// Blender-processed GLB models (assets/models/<1k|2k>/<name>.glb): photo-scanned CC0 assets baked to game budgets.
// Each model is flattened to one geometry + one material so it can be instanced in thousands.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assetURL, EMBEDDED } from './textures.js';

export const MODELS = {};
export async function loadModels(q, names) {
  const res = q.desktop && !EMBEDDED() ? '2k' : '1k', loader = new GLTFLoader();
  await Promise.all(names.map((n) => new Promise((ok) => {
    loader.load(assetURL(`assets/models/${res}/${n}.glb`), (gltf) => {
      const geos = []; let mat = null;
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); geos.push(g); mat ||= o.material; } });
      const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0];
      geo.computeBoundingBox(); geo.computeBoundingSphere();
      if (mat.map) mat.map.anisotropy = q.desktop ? 8 : 4;
      MODELS[n] = { geo, mat, size: geo.boundingBox.getSize(new THREE.Vector3()) };
      ok();
    }, undefined, (e) => { console.warn('model missing', n, e); ok(); });
  })));
  // light versions of the heavy props (tools/blender/prop_lods.py): geometry only, drawn with the full model's material
  await Promise.all(names.filter((n) => LODS.includes(n) && MODELS[n]).map((n) => new Promise((ok) => {
    loader.load(assetURL(`assets/models/lod/${n}.glb`), (gltf) => {
      const geos = []; gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); geos.push(g); } });
      const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0];
      if (geo) { for (const k of Object.keys(geo.attributes)) if (!MODELS[n].geo.attributes[k]) geo.deleteAttribute(k); geo.computeBoundingBox(); geo.computeBoundingSphere(); MODELS[n].lod = geo; }
      ok();
    }, undefined, () => ok());
  })));
  return MODELS;
}
const LODS = ['boulder_01', 'coast_land_rocks_03', 'coast_rocks_01', 'coast_rocks_02', 'tractor', 'bullockcart', 'farmhouse', 'farmhouse_b'];
