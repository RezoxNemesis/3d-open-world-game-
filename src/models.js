// Blender-processed GLB models (assets/models/<1k|2k>/<name>.glb): photo-scanned CC0 assets baked to game budgets.
// Each model is flattened to one geometry + one material so it can be instanced in thousands.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const MODELS = {};
export async function loadModels(q, names) {
  const res = q.desktop ? '2k' : '1k', loader = new GLTFLoader();
  await Promise.all(names.map((n) => new Promise((ok) => {
    loader.load(`assets/models/${res}/${n}.glb`, (gltf) => {
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
  return MODELS;
}
