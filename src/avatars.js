// Realistic hero bodies: scanned-quality avatars from the Microsoft Rocketbox library (MIT licence,
// assets/avatars/LICENSE-Rocketbox.md). The game keeps animating its own procedural skeleton (every pose,
// fight move, vehicle seat and swim stroke still works); each frame that pose is retargeted onto the
// avatar's 3ds Max biped skeleton through world-space rest-pose alignment.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { assetURL } from './textures.js';

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

// FBX meshes arrive with many index groups per material; each group is a draw call. Sort the indices by material so every
// material is drawn once (the hero avatars went from 17 draw calls to 8, and the same again in the shadow pass).
function oneGroupPerMaterial(geo) {
  const G = geo.groups; if (!G || G.length < 2) return;
  const mats = [...new Set(G.map((g) => g.materialIndex))]; if (mats.length === G.length) return;
  if (!geo.index) { const n = geo.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; geo.setIndex(new THREE.BufferAttribute(ix, 1)); }
  const src = geo.index.array, out = new src.constructor(src.length); let o = 0; const ng = [];
  for (const m of mats) { const start = o; for (const g of G) if (g.materialIndex === m) { out.set(src.subarray(g.start, g.start + g.count), o); o += g.count; } ng.push({ start, count: o - start, materialIndex: m }); }
  if (o !== src.length) return;                          // groups did not cover the whole index: leave it alone
  geo.setIndex(new THREE.BufferAttribute(out, 1)); geo.clearGroups(); for (const g of ng) geo.addGroup(g.start, g.count, g.materialIndex);
}
const cache = new Map();
const texL = new THREE.TextureLoader();
function tex(url, srgb) { const t = texL.load(url); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// dropped parts (a helmet over a hairdo, a cap): stop drawing their groups and fold their vertices into the head so they
// no longer count towards the avatar's height (the body is scaled to the hero's height from its bounding box)
function stripHidden(mesh) {
  const g = mesh.geometry, mats = mesh.material;
  if (!g.index || g.userData.stripped) { if (g.userData.stripped) g.groups = g.userData.groups; return; }
  const keep = g.groups.filter((gr) => !mats[gr.materialIndex].userData.hidden);
  if (keep.length === g.groups.length) return;
  const idx = g.index.array, used = new Uint8Array(g.attributes.position.count);
  for (const gr of keep) for (let i = gr.start; i < gr.start + gr.count; i++) used[idx[i]] = 1;
  let anchor = -1; for (const gr of keep) if (/head/.test((mats[gr.materialIndex].name || '') + '') || anchor < 0) anchor = idx[gr.start];
  const pos = g.attributes.position;
  for (const gr of g.groups) if (!keep.includes(gr)) for (let i = gr.start; i < gr.start + gr.count; i++) { const v = idx[i]; if (!used[v]) pos.setXYZ(v, pos.getX(anchor), pos.getY(anchor), pos.getZ(anchor)); }
  pos.needsUpdate = true; g.groups = keep; g.userData.groups = keep; g.userData.stripped = true; g.computeBoundingBox(); g.computeBoundingSphere();
}
// ---- motion capture (Rocketbox animation library, MIT): in-place locomotion clips for the same biped skeleton ----
const LOCO = ['idle', 'walk', 'walk_fast', 'run_slow', 'run', 'run_fast'];
const clipCache = new Map();
export function loadClips(g) {
  if (clipCache.has(g)) return clipCache.get(g);
  const p = (async () => {
    const meta = await (await fetch(assetURL('assets/anim/clips.json'))).json(), out = {};
    await Promise.all(LOCO.map(async (n) => { const j = await (await fetch(assetURL(`assets/anim/${g}_${n}.json`))).json(); const clip = THREE.AnimationClip.parse(j); clip.tracks = clip.tracks.filter((t) => !t.name.startsWith('MotionExtractionHelper')); out[n] = { clip, ...meta[`${g}_${n}`] }; }));
    return out;
  })().catch((e) => { console.warn('mocap clips unavailable', e); return null; });
  clipCache.set(g, p); return p;
}
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
  let hair = null; const mkHair = () => hair ||= new THREE.MeshStandardMaterial({ map: tex(dir + 'hair.png', true), alphaTest: 0.45, transparent: false, side: THREE.DoubleSide, roughness: 0.65 });   // only avatars with hair cards load it
  // a touch of subsurface warmth on skin (the scanned maps already carry the detail)
  for (const m of [head, body]) m.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(0.05, 0.018, 0.012);'); };
  // tactical kit (plate carrier, pouches, radio) has its own maps; helmets, caps and props of the source avatar are dropped
  let equip = null;
  const hidden = new THREE.MeshBasicMaterial({ visible: false }); hidden.userData.hidden = true;
  const pick = (mname) => {
    const n = (mname || '').toLowerCase();
    if (n.includes('helmet') || n.includes('_hat') || n.includes('pistol')) return hidden;
    if (n.includes('equipment')) return equip ||= new THREE.MeshStandardMaterial({ map: tex(dir + 'equip_c.jpg', true), normalMap: tex(dir + 'equip_n.jpg'), roughness: 0.7, metalness: 0 });
    return n.includes('opacity') || n.includes('hair') || n.includes('lash') ? mkHair() : n.includes('head') || n.includes('face') ? head : body;
  };
  return { pick, body, head, get hair() { return hair; } };
}

// one avatar instance driven by a procedural Human
export class Avatar {
  constructor(name, fbxSrc, human, height = 1.78) {
    const fbx = cloneSkinned(fbxSrc); this.obj = fbx; this.h = human; this.name = name;
    const mats = makeMaterials(name, fbx);
    fbx.traverse((o) => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map((m) => mats.pick(m.name)) : mats.pick(o.material.name); o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    fbx.traverse((o) => { if (o.isMesh && Array.isArray(o.material)) { if (!o.geometry.userData.stripped) oneGroupPerMaterial(o.geometry); stripHidden(o); } });
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
    // weapons follow the avatar's right hand: an anchor inside Bip01_R_Hand reproducing the procedural hand's rest frame
    { const ah = this.bones.Bip01_R_Hand, ph = src.handR; root.updateMatrixWorld(true);
      const anchor = new THREE.Object3D(); anchor.name = 'propAnchor';
      const m = new THREE.Matrix4().copy(ah.matrixWorld).invert().multiply(ph.matrixWorld); m.decompose(anchor.position, anchor.quaternion, anchor.scale);
      ah.add(anchor); const held = H.held; if (held) H.hold(null); H.handAnchor = anchor; if (held) H.hold(held); }
    for (const n in src) src[n].quaternion.copy(saved[n]);
    root.visible = prevVis;
    // hide the procedural body mesh but keep its skeleton (and held props) alive
    H.mesh.material = new THREE.MeshBasicMaterial({ visible: false }); H.mesh.castShadow = false;
    this.cal = true;
  }
  // per frame: copy the procedural pose onto the avatar
  // mocap layer: one mixer per avatar, clips phase-locked and blended by ground speed; the procedural pose still
  // drives everything else (jumps, fights, climbing, swimming, seats) and can take over the upper body (aim, shoot)
  // the arm chains and fingers for the weapon rig (aimrig.js)
  rigBones() {
    if (this._rig) return this._rig;
    const B = this.bones, f = (side) => { const out = []; const h = B[`Bip01_${side}_Hand`]; if (h) h.traverse((o) => { if (o.isBone && /Finger/.test(o.name)) out.push(o); }); return out; };
    if (!B.Bip01_R_UpperArm || !B.Bip01_L_UpperArm) return null;
    return (this._rig = { upR: B.Bip01_R_UpperArm, loR: B.Bip01_R_Forearm, handR: B.Bip01_R_Hand, upL: B.Bip01_L_UpperArm, loL: B.Bip01_L_Forearm, handL: B.Bip01_L_Hand,
      convL: this.s0.handL.clone().invert().multiply(this.t0.handL), fingersR: f('R'), fingersL: f('L') });
  }
  attachMocap(clips) {
    if (!clips || !this.cal) return;
    const mixer = new THREE.AnimationMixer(this.obj), acts = {};
    for (const n of LOCO) { if (!clips[n]) return; const a = mixer.clipAction(clips[n].clip); a.play(); a.setEffectiveWeight(0); a.setEffectiveTimeScale(0); acts[n] = a; }
    this.mo = { mixer, acts, clips, w: 0, upper: 0, ph: 0, idleT: 0, lean: 0 };
    this.allBones = []; this.obj.traverse((o) => { if (o.isBone) this.allBones.push(o); });
    this.restQ = new Map(this.allBones.map((b) => [b, b.quaternion.clone()])); this.restP = new Map(this.allBones.map((b) => [b, b.position.clone()]));
    // per-clip foot plant height vs the rest pose, so the feet land on the ground whatever the actor's proportions
    const root = this.h.root, fL = this.bones.Bip01_L_Foot, fR = this.bones.Bip01_R_Foot, v = new THREE.Vector3();
    root.updateMatrixWorld(true); this.obj.updateMatrixWorld(true);
    const lowFoot = () => Math.min(root.worldToLocal(fL.getWorldPosition(v)).y, root.worldToLocal(fR.getWorldPosition(v)).y);
    const rest = lowFoot(); this.mo.off = {};
    for (const n of LOCO) {
      for (const m of LOCO) acts[m].setEffectiveWeight(m === n ? 1 : 0);
      let lo = 1e9; for (let i = 0; i < 12; i++) { acts[n].time = clips[n].dur * i / 12; mixer.update(0); this.obj.updateMatrixWorld(true); lo = Math.min(lo, lowFoot()); }
      this.mo.off[n] = lo - rest;
      acts[n].setEffectiveWeight(0);
    }
    for (const b of this.allBones) { b.quaternion.copy(this.restQ.get(b)); b.position.copy(this.restP.get(b)); }
    this.mixUpper = new Set(['Bip01_Spine', 'Bip01_Spine1', 'Bip01_Spine2', 'Bip01_Spine3', 'Bip01_Neck', 'Bip01_Head']);
    this.armBones = new Set(); for (const b of this.allBones) if (/_(L|R)_(Clavicle|UpperArm|Forearm|Hand|Finger)/.test(b.name)) this.armBones.add(b);
  }
  // drive: { loco: 0..1 target mocap weight, speed m/s, upper: 0..1 procedural upper body (aim / shoot / punch), turn: yaw rate, dt }
  update(drive) {
    if (!this.cal) return;
    const mo = this.mo, dt = drive ? drive.dt || 1 / 60 : 1 / 60;
    if (mo) { mo.w = damp1(mo.w, drive && drive.loco ? 1 : 0, 9, dt); mo.upper = damp1(mo.upper, drive && drive.upper ? 1 : 0, 12, dt); }
    const useMo = mo && mo.w > 0.002, snapQ = useMo ? this.snapQ || (this.snapQ = new Map()) : null, snapP = this.snapP || (this.snapP = new Map());
    if (useMo) {
      // speed -> two neighbouring clips, phase-locked on the left-foot plant
      const C = mo.clips, sp = Math.max(0, drive.speed || 0), A = mo.acts;
      const ladder = ['walk', 'walk_fast', 'run_slow', 'run', 'run_fast'];
      let lo = 'idle', hi = 'idle', t = 0;
      if (sp < 0.35) { lo = hi = 'idle'; }
      else if (sp < C.walk.speed) { lo = 'idle'; hi = 'walk'; t = (sp - 0.35) / (C.walk.speed - 0.35); }
      else { lo = hi = 'run_fast'; for (let i = 0; i < ladder.length - 1; i++) { const a = C[ladder[i]], b = C[ladder[i + 1]]; if (sp < b.speed) { lo = ladder[i]; hi = ladder[i + 1]; t = (sp - a.speed) / (b.speed - a.speed); break; } } }
      t = Math.min(1, Math.max(0, t));
      const moving = hi !== 'idle', cl = lo === 'idle' ? C[hi] : C[lo], ch = C[hi];
      if (moving) {
        // stride: metres per cycle of the blend; the phase advances with the real ground speed, so feet don't skate
        const stride = lo === 'idle' ? ch.speed * ch.dur : (cl.speed * cl.dur) * (1 - t) + (ch.speed * ch.dur) * t;
        mo.ph = (mo.ph + dt * Math.max(sp, 0.6) / Math.max(0.3, stride)) % 1;
      }
      mo.idleT = (mo.idleT + dt) % C.idle.dur;
      for (const n of LOCO) A[n].setEffectiveWeight(0);
      const setA = (n, w) => { if (w <= 0) return; const c = C[n]; A[n].time = n === 'idle' ? mo.idleT : ((mo.ph + c.plant) % 1) * c.dur; A[n].setEffectiveWeight(A[n].getEffectiveWeight() + w); };
      if (lo === hi) setA(lo, 1); else { setA(lo, 1 - t); setA(hi, t); }
      mo.mixer.update(0);
      // plant the feet: undo the actor's leg-length difference, blended like the clips
      const off = lo === hi ? mo.off[lo] : mo.off[lo] * (1 - t) + mo.off[hi] * t, rb = this.bones.Bip01;
      if (rb && rb.parent) { const wp = rb.getWorldPosition(new THREE.Vector3()), r = this.h.root; const lp = r.worldToLocal(wp.clone()); lp.y -= off; rb.position.copy(rb.parent.worldToLocal(r.localToWorld(lp))); }
      // lean into turns
      mo.lean = damp1(mo.lean, Math.max(-0.25, Math.min(0.25, -(drive.turn || 0) * Math.min(1, sp / 6) * 0.08)), 6, dt);
      for (const b of this.allBones) { snapQ.set(b, b.quaternion.clone()); snapP.set(b, b.position.clone()); }
    }
    // procedural retarget (as before): mapped bones follow the game's own skeleton
    const H = this.h, src = H.bones, root = H.root;
    if (useMo && mo.w < 0.999 || !useMo || mo.upper > 0.001) {
      if (useMo) for (const b of this.allBones) { b.quaternion.copy(this.restQ.get(b)); b.position.copy(this.restP.get(b)); }
      root.updateMatrixWorld(true);
      const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert(), q = new THREE.Quaternion(), pq = new THREE.Quaternion();
      for (const b of ORDER) {
        const tb = this.bones[MAP[b]];
        const sNow = rootInv.clone().multiply(src[b].getWorldQuaternion(q));
        const d = sNow.multiply(this.s0[b].clone().invert());
        const tNow = d.multiply(this.t0[b]);
        tb.parent.getWorldQuaternion(pq); const parentRoot = rootInv.clone().multiply(pq);
        tb.quaternion.copy(parentRoot.invert().multiply(tNow)); tb.updateMatrixWorld(true);
      }
      const dy = src.hips.position.y - this.hipsRestLocal.y, dz = src.hips.position.z - this.hipsRestLocal.z, pel = this.bones[MAP.hips];
      const sc = this.pelvisRestW / Math.max(0.1, this.hipsRestY);
      const wp = root.localToWorld(new THREE.Vector3(0, this.pelvisRestW + dy * sc, dz * sc));
      pel.parent.worldToLocal(wp); pel.position.copy(wp);
    }
    if (useMo) {
      // blend: legs and hips from mocap; spine, head and arms from the procedural pose while aiming / shooting / punching
      for (const b of this.allBones) {
        const mq = snapQ.get(b); if (!mq) continue;
        let w = mo.w;
        if (this.armBones.has(b) || this.mixUpper.has(b.name)) w *= 1 - mo.upper * (this.mixUpper.has(b.name) ? 0.75 : 1);
        if (w >= 0.999) b.quaternion.copy(mq); else if (w > 0.001) b.quaternion.slerp(mq, w);
        const mp = snapP.get(b); if (w > 0.001 && (b === this.bones.Bip01 || b === this.bones.Bip01_Pelvis)) b.position.lerp(mp, w);
      }
      const rb = this.bones.Bip01;
      if (rb && Math.abs(mo.lean) > 1e-4) { const pq = rb.parent.getWorldQuaternion(new THREE.Quaternion()).invert(), ax = new THREE.Vector3(0, 0, 1).applyQuaternion(H.root.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(pq).normalize(); rb.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, mo.lean * mo.w)); }
    }
  }
  setVisible(v) { this.obj.visible = v; }
}

const damp1 = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
// SkeletonUtils.clone equivalent (keeps skinning working per instance)
function cloneSkinned(src) {
  const clone = src.clone(true), srcB = new Map(), cloneB = new Map();
  const walk = (a, b) => { srcB.set(a, b); for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]); };
  walk(src, clone);
  clone.traverse((o) => { if (!o.isSkinnedMesh) return; });
  src.traverse((a) => { if (!a.isSkinnedMesh) return; const b = srcB.get(a); const sk = a.skeleton; const bones = sk.bones.map((x) => srcB.get(x)); b.bind(new THREE.Skeleton(bones, sk.boneInverses), a.bindMatrix); });
  return clone;
}
