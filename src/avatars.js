// Realistic hero bodies: scanned-quality avatars from the Microsoft Rocketbox library (MIT licence,
// assets/avatars/LICENSE-Rocketbox.md). The game keeps animating its own procedural skeleton (every pose,
// fight move, vehicle seat and swim stroke still works); each frame that pose is retargeted onto the
// avatar's 3ds Max biped skeleton through world-space rest-pose alignment.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const BASE = 'assets/avatars/';
// our bone -> biped bone (FBXLoader turns spaces into underscores)
const MAP = {
  hips: 'Bip01_Pelvis', spine: 'Bip01_Spine', chest: 'Bip01_Spine2', neck: 'Bip01_Neck', head: 'Bip01_Head',
  shL: 'Bip01_L_Clavicle', armL: 'Bip01_L_UpperArm', foreL: 'Bip01_L_Forearm', handL: 'Bip01_L_Hand',
  shR: 'Bip01_R_Clavicle', armR: 'Bip01_R_UpperArm', foreR: 'Bip01_R_Forearm', handR: 'Bip01_R_Hand',
  thighL: 'Bip01_L_Thigh', shinL: 'Bip01_L_Calf', footL: 'Bip01_L_Foot', thighR: 'Bip01_R_Thigh', shinR: 'Bip01_R_Calf', footR: 'Bip01_R_Foot',
};
// child used to measure each bone's direction (ours / biped)
const CHILD = { hips: 'spine', spine: 'chest', chest: 'neck', neck: 'head', shL: 'armL', armL: 'foreL', foreL: 'handL', shR: 'armR', armR: 'foreR', foreR: 'handR', thighL: 'shinL', shinL: 'footL', thighR: 'shinR', shinR: 'footR' };
const ORDER = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'armL', 'foreL', 'handL', 'shR', 'armR', 'foreR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];

const cache = new Map();
const texL = new THREE.TextureLoader();
function tex(url, srgb) { const t = texL.load(url); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

export function loadAvatar(name) {
  if (cache.has(name)) return cache.get(name);
  const p = new Promise((res, rej) => {
    new FBXLoader().load(BASE + name + '/model.fbx', (fbx) => res(fbx), undefined, (e) => rej(e));
  });
  cache.set(name, p); return p;
}
export function describe(fbx) {
  const out = { meshes: [], bones: [] };
  fbx.traverse((o) => { if (o.isSkinnedMesh || o.isMesh) out.meshes.push({ name: o.name, mats: (Array.isArray(o.material) ? o.material : [o.material]).map((m) => m.name), tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 }); if (o.isBone) out.bones.push(o.name); });
  const b = new THREE.Box3().setFromObject(fbx); out.size = b.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)); out.scale = fbx.scale.toArray();
  return out;
}

// materials: skin/clothes with real scanned colour + normal maps; hair/eyelashes with alpha
function makeMaterials(name, fbx) {
  const dir = BASE + name + '/', has = (f) => true;
  const body = new THREE.MeshStandardMaterial({ map: tex(dir + 'body_c.jpg', true), normalMap: tex(dir + 'body_n.jpg'), roughnessMap: null, roughness: 0.78, metalness: 0 });
  const head = new THREE.MeshStandardMaterial({ map: tex(dir + 'head_c.jpg', true), normalMap: tex(dir + 'head_n.jpg'), roughness: 0.6, metalness: 0 });
  const hair = new THREE.MeshStandardMaterial({ map: tex(dir + 'hair.png', true), alphaTest: 0.45, transparent: false, side: THREE.DoubleSide, roughness: 0.65 });
  // a touch of subsurface warmth on skin (the scanned maps already carry the detail)
  for (const m of [head, body]) m.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(0.05, 0.018, 0.012);'); };
  const pick = (mname) => { const n = (mname || '').toLowerCase(); return n.includes('opacity') || n.includes('hair') || n.includes('lash') ? hair : n.includes('head') || n.includes('face') ? head : body; };
  return { pick, body, head, hair };
}

// one avatar instance driven by a procedural Human
export class Avatar {
  constructor(name, fbxSrc, human, height = 1.78) {
    const fbx = cloneSkinned(fbxSrc); this.obj = fbx; this.h = human; this.name = name;
    const mats = makeMaterials(name, fbx);
    fbx.traverse((o) => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map((m) => mats.pick(m.name)) : mats.pick(o.material.name); o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    // scale to the hero's height, feet on the ground
    fbx.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(fbx), sz = box.getSize(new THREE.Vector3());
    const k = height / sz.y; fbx.scale.multiplyScalar(k); fbx.position.y -= box.min.y * k;
    this.bones = {}; fbx.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    this.ok = ORDER.every((b) => this.bones[MAP[b]]);
  }
  // capture rest alignment: put the avatar into the procedural rest pose (A-pose) direction by direction
  calibrate() {
    if (!this.ok) return;
    const H = this.h, src = H.bones, root = H.root, prevVis = root.visible;
    // procedural skeleton at rest
    const saved = {}; for (const n in src) saved[n] = src[n].quaternion.clone();
    for (const n in src) src[n].quaternion.identity();
    const savedHipsPos = src.hips.position.clone();
    root.updateMatrixWorld(true);
    // parent the avatar under the human root (same frame), then align each target bone to the source direction
    root.add(this.obj); this.obj.updateMatrixWorld(true);
    // face the avatar the same way as the procedural body (+Z forward): use the foot -> toe direction
    { const f = this.bones.Bip01_L_Foot, t = this.bones.Bip01_L_Toe0; if (f && t) { const d = t.getWorldPosition(new THREE.Vector3()).sub(f.getWorldPosition(new THREE.Vector3())).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert()); const yaw = Math.atan2(d.x, d.z); this.obj.rotation.y -= yaw; this.obj.updateMatrixWorld(true); } }
    const v = new THREE.Vector3(), w = new THREE.Vector3(), q = new THREE.Quaternion(), pq = new THREE.Quaternion();
    for (const b of ORDER) {
      const c = CHILD[b]; if (!c) continue;
      const tb = this.bones[MAP[b]], tc = this.bones[MAP[c]];
      const sd = src[c].getWorldPosition(v).sub(src[b].getWorldPosition(w)).normalize();
      const td = tc.getWorldPosition(new THREE.Vector3()).sub(tb.getWorldPosition(new THREE.Vector3())).normalize();
      if (b === 'hips' || b === 'spine' || b === 'chest' || b === 'neck') continue;   // torso keeps the scanned posture; only limbs are aligned
      const rot = q.setFromUnitVectors(td, sd);                       // world rotation taking target dir onto source dir
      const wq = tb.getWorldQuaternion(new THREE.Quaternion()); const nw = rot.clone().multiply(wq);
      tb.parent.getWorldQuaternion(pq); tb.quaternion.copy(pq.invert().multiply(nw)); tb.updateMatrixWorld(true);
    }
    // store rest world rotations of both skeletons (in the root's frame)
    const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.s0 = {}; this.t0 = {};
    for (const b of ORDER) { this.s0[b] = rootInv.clone().multiply(src[b].getWorldQuaternion(new THREE.Quaternion())); this.t0[b] = rootInv.clone().multiply(this.bones[MAP[b]].getWorldQuaternion(new THREE.Quaternion())); }
    // pelvis height ratio for hip translation (crouch, sit, swim)
    const pelvis = this.bones[MAP.hips];
    this.pelvisRest = pelvis.position.clone(); this.hipsRestY = src.hips.getWorldPosition(new THREE.Vector3()).y - root.getWorldPosition(new THREE.Vector3()).y;
    this.pelvisRestW = pelvis.getWorldPosition(new THREE.Vector3()).y - root.getWorldPosition(new THREE.Vector3()).y;
    this.hipsRestLocal = savedHipsPos.clone();
    for (const n in src) src[n].quaternion.copy(saved[n]);
    root.visible = prevVis;
    // hide the procedural body mesh but keep its skeleton (and held props) alive
    H.mesh.material = new THREE.MeshBasicMaterial({ visible: false }); H.mesh.castShadow = false;
    this.cal = true;
  }
  // per frame: copy the procedural pose onto the avatar
  update() {
    if (!this.cal) return;
    const H = this.h, src = H.bones, root = H.root;
    root.updateMatrixWorld(true);
    const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert(), q = new THREE.Quaternion(), pq = new THREE.Quaternion();
    for (const b of ORDER) {
      const tb = this.bones[MAP[b]];
      // delta from rest in the root frame, applied to the target's aligned rest
      const sNow = rootInv.clone().multiply(src[b].getWorldQuaternion(q));
      const d = sNow.multiply(this.s0[b].clone().invert());
      const tNow = d.multiply(this.t0[b]);
      // to local: parent world (root frame)^-1 * tNow
      tb.parent.getWorldQuaternion(pq); const parentRoot = rootInv.clone().multiply(pq);
      tb.quaternion.copy(parentRoot.invert().multiply(tNow)); tb.updateMatrixWorld(true);
    }
    // hip translation (crouch/sit/swim height + forward shift), scaled to the avatar's proportions
    const dy = src.hips.position.y - this.hipsRestLocal.y, dz = src.hips.position.z - this.hipsRestLocal.z, pel = this.bones[MAP.hips];
    const s = this.pelvisRestW / Math.max(0.1, this.hipsRestY);
    const wp = root.localToWorld(new THREE.Vector3(0, this.pelvisRestW + dy * s, dz * s));
    pel.parent.worldToLocal(wp); pel.position.copy(wp);
  }
  setVisible(v) { this.obj.visible = v; }
}

// SkeletonUtils.clone equivalent (keeps skinning working per instance)
function cloneSkinned(src) {
  const clone = src.clone(true), srcB = new Map(), cloneB = new Map();
  const walk = (a, b) => { srcB.set(a, b); for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]); };
  walk(src, clone);
  clone.traverse((o) => { if (!o.isSkinnedMesh) return; });
  src.traverse((a) => { if (!a.isSkinnedMesh) return; const b = srcB.get(a); const sk = a.skeleton; const bones = sk.bones.map((x) => srcB.get(x)); b.bind(new THREE.Skeleton(bones, sk.boneInverses), a.bindMatrix); });
  return clone;
}
