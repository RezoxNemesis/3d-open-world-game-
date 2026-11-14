// Animals: procedural quadrupeds + peacocks + bird flocks, wildlife AI, rideable horses.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from './mapdata.js';
import { U, patch } from './shaders.js';
import { clamp, lerp, damp, dampAngle, angDiff, mulberry32 } from './util.js';
import { sfx } from './audio.js';
import { burst } from './fx.js';

const lin = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255].map((c) => Math.pow(c, 2.2));
function vc(g, fn) {
  if (g.index) g = g.toNonIndexed(); const p = g.attributes.position, a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const c = fn(p.getX(i), p.getY(i), p.getZ(i)); a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const solid = (h) => { const c = lin(h); return () => c; };
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
const SKIN = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
// add the back faces of a flat part (ears, tail fan) so one material can stay single-sided
function twoSided(g) {
  if (g.index) g = g.toNonIndexed(); const b = g.clone(), p = b.attributes.position.array, n = b.attributes.normal.array, c = b.attributes.color && b.attributes.color.array;
  for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; const tn = n[i + 3 + k]; n[i + 3 + k] = n[i + 6 + k]; n[i + 6 + k] = tn; if (c) { const tc = c[i + 3 + k]; c[i + 3 + k] = c[i + 6 + k]; c[i + 6 + k] = tc; } }
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return mergeGeometries([g, b]);
}
// Merge every part of an animal into ONE skinned mesh (rigid skinning: each part follows its joint bone).
// The joints stay Bones, so all the existing leg/neck/tail/trunk animation code keeps working, but the animal is a single draw call.
function skinify(root) {
  root.updateMatrixWorld(true);
  const bones = []; root.traverse((o) => { if (o.isBone) bones.push(o); });
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), geos = [], meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.keep) meshes.push(o); });
  for (const m of meshes) {
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.color) { const c = m.material.color || new THREE.Color(1, 1, 1), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    let b = m.parent; while (b && !b.isBone) b = b.parent; const bi = Math.max(0, bones.indexOf(b));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    geos.push(g); m.parent.remove(m);
  }
  const sm = new THREE.SkinnedMesh(mergeGeometries(geos), SKIN); sm.castShadow = true; sm.receiveShadow = true;
  root.add(sm); root.updateMatrixWorld(true); sm.bind(new THREE.Skeleton(bones));
  return sm;
}
const SPECIES = {
  horse: { len: 1.0, bodyR: [0.36, 0.42, 0.95], back: 1.5, leg: [0.42, 0.5], legR: 0.075, neck: [0.75, 0.8], head: [0.13, 0.17, 0.33], tail: 0.75, ears: 1, colors: [0x5d3a1a, 0x2b1b10, 0xe8e0d0, 0x8b5a2b, 0x111111], speed: [1.8, 5, 9.5, 16], mane: true },
  cow: { len: 1.0, bodyR: [0.42, 0.45, 0.9], back: 1.35, leg: [0.36, 0.42], legR: 0.07, neck: [0.4, 0.35], head: [0.14, 0.17, 0.3], tail: 0.7, horns: 1, hump: 1, colors: [0xeeeae0, 0xd8d2c4, 0x9e9a92, 0x7a5a3a], speed: [0.9, 2, 4, 6] },
  dog: { len: 0.45, bodyR: [0.13, 0.15, 0.36], back: 0.58, leg: [0.17, 0.2], legR: 0.032, neck: [0.18, 0.4], head: [0.07, 0.08, 0.17], tail: 0.28, ears: 1, colors: [0xc8a070, 0x5d4037, 0xf5f0e6, 0x2b2b2b], speed: [1.2, 3, 6, 9] },
  goat: { len: 0.6, bodyR: [0.2, 0.23, 0.48], back: 0.8, leg: [0.22, 0.25], legR: 0.035, neck: [0.25, 0.6], head: [0.08, 0.1, 0.2], tail: 0.12, horns: 1, colors: [0x2b2b2b, 0xf5f5f5, 0x8d6e63], speed: [0.8, 2, 4.5, 7] },
  deer: { len: 0.75, bodyR: [0.22, 0.27, 0.6], back: 1.0, leg: [0.3, 0.38], legR: 0.04, neck: [0.4, 0.75], head: [0.08, 0.11, 0.23], tail: 0.15, antlers: 1, spots: 1, colors: [0xa0602a], speed: [1, 3, 9, 14] },
  elephant: { len: 2.2, bodyR: [1.05, 1.15, 1.7], back: 2.9, leg: [0.85, 0.85], legR: 0.28, neck: [0.4, 0.3], head: [0.6, 0.65, 0.6], tail: 0.9, trunk: 1, bigEars: 1, tusks: 1, colors: [0x6e6a66], speed: [1.0, 2.2, 4, 6] },
  tiger: { len: 0.95, bodyR: [0.3, 0.33, 0.85], back: 0.95, leg: [0.32, 0.36], legR: 0.07, neck: [0.25, 0.3], head: [0.17, 0.17, 0.24], tail: 0.95, ears: 1, stripes: 1, colors: [0xd9822b], speed: [1.2, 3, 9, 16] },
  langur: { len: 0.4, bodyR: [0.15, 0.18, 0.3], back: 0.55, leg: [0.22, 0.24], legR: 0.035, neck: [0.15, 0.7], head: [0.09, 0.1, 0.1], tail: 0.9, colors: [0xb0aaa0], face: 1, speed: [1, 2.5, 5, 8] },
};
function buildQuad(type, color) {
  const S = SPECIES[type], root = new THREE.Group(), parts = {};
  const col = color, c = lin(col), dark = lin(0x1a1410);
  const L = S.bodyR, back = S.back, legTop = back - L[1] * 0.6;
  const bodyG = vc(new THREE.SphereGeometry(1, 16, 12).scale(L[0], L[1], L[2]), (x, y, z) => {
    if (S.spots && Math.sin(x * 40) * Math.sin(z * 35 + y * 20) > 0.6 && y > 0) return lin(0xf5ead5);
    if (S.stripes && Math.sin(z * 22 + Math.sin(y * 8) * 2) > 0.55) return dark;
    if (S.stripes && y < -L[1] * 0.5) return lin(0xf5ead5);
    return y < -L[1] * 0.6 && type !== 'elephant' ? c.map((v) => v * 0.8) : c;
  });
  const body = new THREE.Bone(); body.position.y = back - L[1] * 0.2; root.add(body);
  const bm = new THREE.Mesh(bodyG, MAT); bm.castShadow = true; body.add(bm);
  if (S.hump) { const h = new THREE.Mesh(vc(new THREE.SphereGeometry(0.22, 10, 8).scale(1, 1.1, 1.2), solid(col)), MAT); h.position.set(0, L[1] * 0.85, L[2] * 0.45); body.add(h); }
  // legs
  parts.legs = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const hip = new THREE.Bone(); hip.position.set(sx * L[0] * 0.62, legTop - body.position.y, sz * L[2] * 0.68); body.add(hip);
    const ug = vc(new THREE.CylinderGeometry(S.legR * 1.35, S.legR, S.leg[0], 8).translate(0, -S.leg[0] / 2, 0), solid(col));
    hip.add(new THREE.Mesh(ug, MAT)); hip.children[0].castShadow = true;
    const knee = new THREE.Bone(); knee.position.y = -S.leg[0]; hip.add(knee);
    const lg = vc(new THREE.CylinderGeometry(S.legR, S.legR * 0.85, S.leg[1], 8).translate(0, -S.leg[1] / 2, 0), solid(type === 'horse' && Math.random() < 0.3 ? 0xf5f0e6 : col));
    knee.add(new THREE.Mesh(lg, MAT));
    const hoof = new THREE.Mesh(vc(new THREE.CylinderGeometry(S.legR * 1.1, S.legR * 1.2, S.legR * 1.4, 8).translate(0, -S.leg[1] - S.legR * 0.5, 0.0), solid(type === 'elephant' ? 0x5e5a56 : 0x1a1410)), MAT); knee.add(hoof);
    parts.legs.push({ hip, knee, front: sz > 0, side: sx });
  }
  // neck + head
  const neck = new THREE.Bone(); neck.position.set(0, L[1] * 0.35, L[2] * 0.82); neck.rotation.x = -S.neck[1]; body.add(neck);
  neck.add(new THREE.Mesh(vc(new THREE.CylinderGeometry(S.head[0] * 0.9, L[0] * 0.55, S.neck[0], 10).translate(0, S.neck[0] / 2, 0), solid(col)), MAT));
  if (S.mane) neck.add(new THREE.Mesh(vc(new THREE.BoxGeometry(0.06, S.neck[0] * 1.05, 0.14).translate(0, S.neck[0] / 2, -L[0] * 0.35), solid(0x1a1008)), MAT));
  const head = new THREE.Bone(); head.position.y = S.neck[0]; head.rotation.x = S.neck[1] + 0.35; neck.add(head);
  const hg = vc(new THREE.SphereGeometry(1, 12, 10).scale(S.head[0], S.head[1], S.head[2]).translate(0, 0, S.head[2] * 0.5), (x, y, z) => (S.face && z > S.head[2] * 0.6 ? lin(0x1a1410) : c));
  head.add(new THREE.Mesh(hg, MAT));
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(vc(new THREE.SphereGeometry(S.head[0] * 0.14, 6, 4), solid(0x050505)), MAT); e.position.set(sx * S.head[0] * 0.8, S.head[1] * 0.35, S.head[2] * 0.8); head.add(e); }
  if (S.ears) for (const sx of [-1, 1]) { const e = new THREE.Mesh(vc(new THREE.ConeGeometry(S.head[0] * 0.3, S.head[1] * 0.9, 5).translate(0, S.head[1] * 0.45, 0), solid(col)), MAT); e.position.set(sx * S.head[0] * 0.55, S.head[1] * 0.75, S.head[2] * 0.15); e.rotation.z = -sx * 0.3; head.add(e); }
  if (S.bigEars) for (const sx of [-1, 1]) { const eb = new THREE.Bone(); eb.position.set(sx * 0.6, 0.05, 0.1); eb.rotation.y = sx * 1.2; head.add(eb); const e = new THREE.Mesh(twoSided(vc(new THREE.CircleGeometry(0.75, 12).scale(0.8, 1.1, 1), solid(0x5e5a56))), MAT); eb.add(e); parts.ears = parts.ears || []; parts.ears.push(eb); }
  if (S.horns) for (const sx of [-1, 1]) { const h = new THREE.Mesh(vc(new THREE.ConeGeometry(0.035, 0.3, 6).translate(0, 0.15, 0), solid(0x3e2f22)), MAT); h.position.set(sx * S.head[0] * 0.6, S.head[1] * 0.85, S.head[2] * 0.2); h.rotation.set(-0.4, 0, -sx * 0.55); head.add(h); }
  if (S.antlers) for (const sx of [-1, 1]) { const a = new THREE.Group(); a.position.set(sx * 0.05, S.head[1] * 0.8, 0.05); a.rotation.z = -sx * 0.4; head.add(a); a.add(new THREE.Mesh(vc(new THREE.CylinderGeometry(0.012, 0.018, 0.45, 5).translate(0, 0.22, 0), solid(0x6d5a40)), MAT)); const b = new THREE.Mesh(vc(new THREE.CylinderGeometry(0.01, 0.013, 0.2, 5).translate(0, 0.1, 0), solid(0x6d5a40)), MAT); b.position.y = 0.25; b.rotation.x = 0.7; a.add(b); }
  if (S.trunk) { parts.trunk = []; let p = head; for (let k = 0; k < 6; k++) { const seg = new THREE.Bone(); seg.position.set(0, k === 0 ? -0.2 : -0.28, k === 0 ? S.head[2] * 1.0 : 0); p.add(seg); seg.add(new THREE.Mesh(vc(new THREE.CylinderGeometry(0.17 - k * 0.022, 0.19 - k * 0.022, 0.3, 8).translate(0, -0.14, 0), solid(col)), MAT)); parts.trunk.push(seg); p = seg; } }
  if (S.tusks) for (const sx of [-1, 1]) { const t = new THREE.Mesh(vc(new THREE.ConeGeometry(0.06, 0.8, 6).rotateX(Math.PI * 0.65), solid(0xf2ead8)), MAT); t.position.set(sx * 0.25, -0.35, S.head[2] * 0.9); head.add(t); }
  // tail
  const tail = new THREE.Bone(); tail.position.set(0, L[1] * 0.4, -L[2] * 0.95); tail.rotation.x = type === 'dog' ? -0.8 : type === 'langur' ? -1.2 : 0.35; body.add(tail);
  tail.add(new THREE.Mesh(vc(new THREE.CylinderGeometry(S.legR * 0.5, S.legR * 0.25, S.tail, 6).translate(0, -S.tail / 2, 0), solid(type === 'horse' ? 0x1a1008 : col)), MAT));
  parts.neck = neck; parts.head = head; parts.tail = tail; parts.body = body;
  if (type === 'horse') { const saddle = new THREE.Mesh(new THREE.BoxGeometry(L[0] * 1.6, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: 0x5d2f12, roughness: 0.6 })); saddle.position.set(0, L[1] * 0.93, 0.05); body.add(saddle); saddle.visible = false; saddle.userData.keep = true; saddle.castShadow = true; parts.saddle = saddle; }
  skinify(root);
  return { root, parts };
}
// lofted tube along a path of rings {c:[x,y,z], ax:[x,y,z], a, b} -> smooth BufferGeometry (used by the horse)
function loftG(rings, seg = 12, caps = true) {
  const P = [], I = [];
  for (const r of rings) {
    // a = half width (horizontal, sideways), b = half height (or depth for near-vertical tubes)
    const ax = new THREE.Vector3(...r.ax).normalize();
    let side = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(0, 1, 0));
    side = side.lengthSq() < 0.04 ? new THREE.Vector3(1, 0, 0) : side.normalize();
    const up2 = new THREE.Vector3().crossVectors(side, ax).normalize();
    for (let k = 0; k < seg; k++) { const t = (k / seg) * Math.PI * 2; const o = side.clone().multiplyScalar(Math.cos(t) * r.a).addScaledVector(up2, Math.sin(t) * r.b); P.push(r.c[0] + o.x, r.c[1] + o.y, r.c[2] + o.z); }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < seg; k++) { const a = i * seg + k, b = i * seg + (k + 1) % seg; I.push(a, a + seg, b, b, a + seg, b + seg); }
  if (caps) for (const [ri, dir] of [[0, -1], [rings.length - 1, 1]]) { const ci = P.length / 3; P.push(...rings[ri].c); for (let k = 0; k < seg; k++) { const a = ri * seg + k, b = ri * seg + (k + 1) % seg; if (dir > 0) I.push(ci, a, b); else I.push(ci, b, a); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); return g;
}
function horseModel(color) {
  const S = SPECIES.horse, root = new THREE.Group(), parts = {}, c = lin(color), dark = lin(0x15100c), mane = lin(Math.random() < 0.5 ? 0x15100c : color === 0xe8e0d0 ? 0xd8d0c0 : 0x2a1a10);
  const sock = Math.random() < 0.35 ? lin(0xf2ece0) : c;
  const body = new THREE.Bone(); body.position.y = S.back - S.bodyR[1] * 0.2; root.add(body);
  const by = 1.12 - body.position.y; // geometry centre of the barrel relative to the body bone
  // barrel: rump -> flank -> girth -> chest (ax along +z)
  const BR = [[-0.95, 0.07, 0.11, 0.1], [-0.86, 0.22, 0.28, 0.08], [-0.66, 0.31, 0.36, 0.04], [-0.38, 0.33, 0.38, 0.0], [-0.05, 0.33, 0.4, -0.02], [0.3, 0.33, 0.41, -0.01], [0.58, 0.3, 0.41, 0.03], [0.78, 0.23, 0.36, 0.09], [0.9, 0.12, 0.22, 0.17]];
  body.add(new THREE.Mesh(vc(loftG(BR.map(([z, a, b, cy]) => ({ c: [0, by + cy, z], ax: [0, 0, 1], a, b })), 16), (x, y) => (y < by - 0.28 ? c.map((v) => v * 0.82) : c)), MAT));
  // legs: hip at the top of the leg, knee bone half way; geometry reaches the ground
  parts.legs = [];
  const legTop = S.back - S.bodyR[1] * 0.6, upper = 0.48, lower = legTop - upper - 0.07;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const front = sz > 0;
    const hip = new THREE.Bone(); hip.position.set(sx * 0.2, legTop - body.position.y, sz * (front ? 0.6 : 0.62)); body.add(hip);
    // upper leg: muscular forearm (front) / gaskin (rear)
    hip.add(new THREE.Mesh(vc(loftG([{ c: [0, 0.12, front ? 0 : -0.06], ax: [0, -1, 0], a: 0.1, b: front ? 0.12 : 0.17 }, { c: [0, -0.14, front ? 0.01 : -0.07], ax: [0, -1, 0], a: 0.08, b: front ? 0.1 : 0.12 }, { c: [0, -upper + 0.04, 0], ax: [0, -1, 0], a: 0.055, b: 0.06 }], 10), solid(color)), MAT));
    const knee = new THREE.Bone(); knee.position.y = -upper; hip.add(knee);
    knee.add(new THREE.Mesh(vc(loftG([{ c: [0, 0.03, 0], ax: [0, -1, 0], a: 0.055, b: 0.06 }, { c: [0, -0.12, 0], ax: [0, -1, 0], a: 0.04, b: 0.045 }, { c: [0, -lower + 0.12, 0.005], ax: [0, -1, 0], a: 0.04, b: 0.045 }, { c: [0, -lower + 0.06, 0.015], ax: [0, -1, 0.15], a: 0.05, b: 0.055 }], 10), (x, y) => (y < -lower * 0.55 ? sock : c)), MAT));
    knee.add(new THREE.Mesh(vc(loftG([{ c: [0, -lower + 0.03, 0.02], ax: [0, -1, 0.1], a: 0.055, b: 0.06 }, { c: [0, -lower - 0.05, 0.035], ax: [0, -1, 0], a: 0.065, b: 0.072 }], 10), solid(0x1a1410)), MAT));
    parts.legs.push({ hip, knee, front, side: sx });
  }
  // neck: arched, from the chest up and forward
  const neck = new THREE.Bone(); neck.position.set(0, by + 0.18, 0.72); neck.rotation.x = -S.neck[1]; body.add(neck);
  neck.add(new THREE.Mesh(vc(loftG([{ c: [0, -0.1, 0.0], ax: [0, 1, 0.1], a: 0.15, b: 0.27 }, { c: [0, 0.25, 0.05], ax: [0, 1, 0.15], a: 0.12, b: 0.21 }, { c: [0, 0.55, 0.08], ax: [0, 1, 0.2], a: 0.1, b: 0.16 }, { c: [0, 0.78, 0.06], ax: [0, 1, 0.1], a: 0.09, b: 0.13 }], 12), solid(color)), MAT));
  // mane: a crest of strands along the top of the neck
  const maneG = []; for (let k = 0; k < 9; k++) { const t = k / 8; maneG.push(vc(loftG([{ c: [0, -0.02 + t * 0.8, -0.2 + t * 0.12], ax: [0.6, 0.2, -1], a: 0.03, b: 0.012 }, { c: [0.1 - (k % 2) * 0.2, -0.12 + t * 0.8, -0.27 + t * 0.12], ax: [0.6, -1, -0.3], a: 0.022, b: 0.01 }], 5), () => mane)); }
  neck.add(new THREE.Mesh(mergeGeometries(maneG), MAT));
  const head = new THREE.Bone(); head.position.y = 0.8; head.rotation.x = S.neck[1] + 0.35; neck.add(head);
  // head: poll -> cheeks -> long face -> muzzle
  head.add(new THREE.Mesh(vc(loftG([{ c: [0, 0.03, -0.04], ax: [0, 0.1, 1], a: 0.085, b: 0.1 }, { c: [0, 0.0, 0.1], ax: [0, -0.1, 1], a: 0.1, b: 0.12 }, { c: [0, -0.05, 0.3], ax: [0, -0.15, 1], a: 0.075, b: 0.085 }, { c: [0, -0.08, 0.48], ax: [0, -0.1, 1], a: 0.07, b: 0.075 }, { c: [0, -0.1, 0.56], ax: [0, -0.2, 1], a: 0.065, b: 0.07 }], 12), (x, y, z) => (z > 0.5 ? c.map((v) => v * 0.6) : (Math.random() < 0 ? c : c))), MAT));
  for (const sx of [-1, 1]) {
    head.add(new THREE.Mesh(vc(new THREE.SphereGeometry(0.018, 8, 6).translate(sx * 0.085, 0.03, 0.12), solid(0x050505)), MAT));
    head.add(new THREE.Mesh(vc(new THREE.ConeGeometry(0.032, 0.13, 6).translate(0, 0.065, 0).rotateZ(-sx * 0.25).translate(sx * 0.05, 0.11, -0.02), solid(color)), MAT));
    head.add(new THREE.Mesh(vc(new THREE.SphereGeometry(0.014, 6, 4).translate(sx * 0.035, -0.07, 0.58), solid(0x080605)), MAT));
  }
  head.add(new THREE.Mesh(vc(loftG([{ c: [0, 0.14, -0.06], ax: [0, -0.3, 1], a: 0.05, b: 0.02 }, { c: [0, 0.1, 0.12], ax: [0, -0.5, 1], a: 0.045, b: 0.015 }], 5), () => mane), MAT));
  // tail: flowing strands from the dock
  const tail = new THREE.Bone(); tail.position.set(0, by + 0.12, -0.95); tail.rotation.x = 0.35; body.add(tail);
  const tg = []; for (let k = 0; k < 5; k++) { const sx = (k - 2) * 0.025; tg.push(loftG([{ c: [sx * 0.4, 0, 0], ax: [0, -1, -0.3], a: 0.04, b: 0.04 }, { c: [sx, -0.3, -0.12], ax: [0, -1, -0.1], a: 0.035, b: 0.03 }, { c: [sx * 1.4, -0.65, -0.13], ax: [0, -1, 0.05], a: 0.03, b: 0.025 }, { c: [sx * 1.6, -0.85, -0.1], ax: [0, -1, 0], a: 0.012, b: 0.012 }], 6)); }
  tail.add(new THREE.Mesh(vc(mergeGeometries(tg), () => mane), MAT));
  parts.neck = neck; parts.head = head; parts.tail = tail; parts.body = body;
  // saddle with blanket, cantle and stirrups (hidden until the horse is tacked up)
  const sg = mergeGeometries([vc(loftG([{ c: [0, 0, -0.32], ax: [0, 0, 1], a: 0.36, b: 0.06 }, { c: [0, 0.01, 0.0], ax: [0, 0, 1], a: 0.38, b: 0.06 }, { c: [0, 0, 0.3], ax: [0, 0, 1], a: 0.35, b: 0.06 }], 12), solid(0x8a1c1c)),
    vc(loftG([{ c: [0, 0.05, -0.26], ax: [0, 0, 1], a: 0.2, b: 0.07 }, { c: [0, 0.03, 0.0], ax: [0, 0, 1], a: 0.22, b: 0.05 }, { c: [0, 0.08, 0.22], ax: [0, 0, 1], a: 0.16, b: 0.08 }], 12), solid(0x4a2a12)),
    ...[-1, 1].flatMap((sx) => [vc(new THREE.BoxGeometry(0.015, 0.4, 0.03).translate(sx * 0.3, -0.2, 0.05), solid(0x2a1a0e)), vc(new THREE.TorusGeometry(0.05, 0.01, 4, 10).rotateY(Math.PI / 2).translate(sx * 0.3, -0.42, 0.05), solid(0x9e9e9e))])]);
  const saddle = new THREE.Mesh(sg, MAT); saddle.position.set(0, by + 0.39, 0.12); body.add(saddle); saddle.visible = false; saddle.userData.keep = true; saddle.castShadow = true; parts.saddle = saddle;
  skinify(root);
  return { root, parts };
}

function peacock() {
  const top = new THREE.Group(), root = new THREE.Bone(), blue = 0x0d47a1, parts = {}; top.add(root);
  const body = new THREE.Mesh(vc(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 1, 1.6), solid(blue)), MAT); body.position.y = 0.55; root.add(body);
  const neck = new THREE.Mesh(vc(new THREE.CylinderGeometry(0.04, 0.07, 0.4, 6), solid(0x1565c0)), MAT); neck.position.set(0, 0.85, 0.22); neck.rotation.x = 0.3; root.add(neck);
  const head = new THREE.Mesh(vc(new THREE.SphereGeometry(0.06, 8, 6), solid(0x1565c0)), MAT); head.position.set(0, 1.06, 0.3); root.add(head);
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 4), MAT); l.position.set(sx * 0.07, 0.22, 0); root.add(l); }
  const fanG = vc(new THREE.CircleGeometry(1.1, 24, 0, Math.PI), (x, y) => { const r = Math.hypot(x, y), ring = Math.sin(r * 22) > 0.7; return ring ? lin(0x1e88e5) : r > 0.9 ? lin(0x2e7d32) : lin(0x558b2f); });
  const fan = new THREE.Mesh(twoSided(fanG), MAT);
  const fanB = new THREE.Bone(); fanB.position.set(0, 0.6, -0.25); root.add(fanB); fanB.add(fan); parts.fan = fanB;
  const trainG = vc(new THREE.ConeGeometry(0.22, 1.2, 8).rotateX(-Math.PI / 2 - 0.1), solid(0x2e7d32)); const train = new THREE.Mesh(trainG, MAT); const trainB = new THREE.Bone(); trainB.position.set(0, 0.45, -0.75); root.add(trainB); trainB.add(train); parts.train = trainB;
  skinify(top);
  return { root: top, parts };
}

export class Animal {
  constructor(game, type, x, z, color) {
    this.game = game; this.type = type; this.S = SPECIES[type] || { speed: [0.6, 1.5, 4, 6], len: 0.3 };
    const col = color ?? (SPECIES[type] ? SPECIES[type].colors[Math.floor(Math.random() * SPECIES[type].colors.length)] : 0);
    const m = type === 'peacock' ? peacock() : type === 'horse' ? horseModel(col) : buildQuad(type, col);
    this.obj = m.root; this.parts = m.parts; game.scene.add(this.obj);
    this.pos = new THREE.Vector3(x, M.groundAt(x, z), z); this.home = this.pos.clone(); this.yaw = Math.random() * 6.28; this.speed = 0; this.want = 0; this.ph = Math.random() * 10;
    this.state = 'graze'; this.t = Math.random() * 5; this.target = null; this.rider = null; this.hp = type === 'elephant' ? 600 : type === 'tiger' ? 220 : type === 'horse' ? 150 : 60; this.vy = 0; this.air = false;
    this.radius = type === 'elephant' ? 1.6 : type === 'horse' || type === 'cow' ? 0.8 : 0.4;
    this.gait = 0;
  }
  update(dt, P) {
    const d = P ? Math.hypot(P.x - this.pos.x, P.z - this.pos.z) : 1e9;
    const far = this.game.q.animalFar || 300, big = this.type === 'elephant' || this.type === 'horse' || this.type === 'cow';
    this.obj.visible = d < (big ? far * 1.4 : far) || !!this.rider;
    // far animals: update rarely (cheap AI LOD); their time step is accumulated so they keep moving consistently
    if (!this.obj.visible) { this.skip = (this.skip || 0) + dt; if (this.skip < 1) return; dt = this.skip; } this.skip = 0;
    if (this.dead) { this.parts.body && (this.parts.body.rotation.z = damp(this.parts.body.rotation.z, 1.5, 3, dt)); return; }
    this.t -= dt;
    if (this.rider) this.ridden(dt);
    else this.think(dt, P, d);
    // move
    if (!this.rider || true) {
      const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.speed = damp(this.speed, this.want, this.rider ? 2.5 : 3, dt);
      const nx = this.pos.x + f.x * this.speed * dt, nz = this.pos.z + f.z * this.speed * dt;
      const ny = M.groundAt(nx, nz, this.pos.y + 1.0, 1.0), wl = M.waterLevelAt(nx, nz);
      if (ny < wl - 1.4 && !this.rider) { this.yaw += Math.PI * 0.7; this.want = 0; }
      else if (ny - this.pos.y > 1.2 && !this.air) { this.want *= 0.3; this.speed *= 0.3; if (!this.rider) this.yaw += 1.4; }
      else { this.pos.x = nx; this.pos.z = nz; }
      // collide with buildings
      for (const ci of M.collidersNear(this.pos.x, this.pos.z)) {
        const c = M.colliders[ci]; if (this.pos.y > c.y1 - 0.4 || c.tree) continue;
        const px = clamp(this.pos.x, c.x0, c.x1), pz = clamp(this.pos.z, c.z0, c.z1), dx = this.pos.x - px, dz = this.pos.z - pz, dd = Math.hypot(dx, dz);
        if (dd < this.radius && dd > 1e-4) { this.pos.x += dx / dd * (this.radius - dd); this.pos.z += dz / dd * (this.radius - dd); if (!this.rider) this.yaw += 0.8; else this.speed *= 0.6; }
      }
      const g = M.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.8, 0.9);
      if (this.air) { this.vy -= 22 * dt; this.pos.y += this.vy * dt; if (this.pos.y <= g) { this.pos.y = g; this.air = false; sfx('hoof', 1); } }
      else if (g < this.pos.y - 0.8) { this.air = true; this.vy = 0; } else this.pos.y = Math.max(g, Math.min(this.pos.y + 6 * dt, g)) ;
      if (!this.air) this.pos.y = g;
      if (this.pos.y < wl - 0.9) this.pos.y = wl - 0.9; // wading
    }
    this.animate(dt);
    this.obj.position.copy(this.pos); this.obj.rotation.y = this.yaw;
  }
  think(dt, P, d) {
    const S = this.S, game = this.game;
    const threat = game.threatAt(this.pos);
    if (threat && this.type !== 'elephant' && this.type !== 'tiger') { this.state = 'flee'; this.t = 5 + Math.random() * 3; this.fleeFrom = threat; if (Math.random() < 0.02) this.call(); }
    if (this.type === 'tiger' && P && d < 30 && game.player.alive && !game.player.vehicle) { this.state = 'hunt'; }
    if (this.type === 'elephant' && this.angry > 0) { this.angry -= dt; this.state = 'charge'; }
    switch (this.state) {
      case 'graze': this.want = 0; if (this.t < 0) { this.state = 'walk'; this.t = 4 + Math.random() * 8; const a = Math.random() * 6.28, r = Math.random() * 40; this.target = new THREE.Vector3(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r); } break;
      case 'walk': {
        if (!this.target) { this.state = 'graze'; break; }
        const ta = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z); this.yaw = dampAngle(this.yaw, ta, 2, dt); this.want = S.speed[0];
        if (Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 2 || this.t < 0) { this.state = 'graze'; this.t = 3 + Math.random() * 7; if (Math.random() < 0.15) this.call(); }
        break;
      }
      case 'flee': { const f = this.fleeFrom; const ta = Math.atan2(this.pos.x - f.x, this.pos.z - f.z); this.yaw = dampAngle(this.yaw, ta, 4, dt); this.want = S.speed[3]; if (this.t < 0) { this.state = 'graze'; this.t = 3; this.home.copy(this.pos); } break; }
      case 'hunt': {
        const Pp = game.player.pos, dd = Math.hypot(Pp.x - this.pos.x, Pp.z - this.pos.z);
        this.yaw = dampAngle(this.yaw, Math.atan2(Pp.x - this.pos.x, Pp.z - this.pos.z), 4, dt); this.want = dd > 12 ? S.speed[1] : S.speed[3];
        if (dd < 2.2 && this.t < 0) { this.t = 1.2; game.player.damage(22, { pos: this.pos }, 6, Math.random() < 0.4); sfx('roar', 0.7); }
        if (dd > 45 || !game.player.alive || game.player.vehicle) { this.state = 'walk'; this.target = this.home.clone(); this.t = 10; }
        break;
      }
      case 'charge': { const Pp = game.player.pos; this.yaw = dampAngle(this.yaw, Math.atan2(Pp.x - this.pos.x, Pp.z - this.pos.z), 2, dt); this.want = S.speed[3]; if (Math.hypot(Pp.x - this.pos.x, Pp.z - this.pos.z) < 3 && this.t < 0) { this.t = 1.5; game.player.damage(35, { pos: this.pos }, 12, true); sfx('trumpet', 1); } if (this.angry <= 0) this.state = 'graze'; break; }
    }
  }
  call() { const s = { horse: 'neigh', cow: 'moo', dog: 'bark', goat: 'bark', elephant: 'trumpet', tiger: 'roar' }[this.type]; if (s) sfx(s, 0.6, this.game.camDist(this.pos)); }
  ridden(dt) {
    const c = this.rideCtl || {}; const S = this.S;
    const mag = c.move ? Math.min(1, c.move.length()) : 0;
    if (mag > 0.1) this.yaw = dampAngle(this.yaw, Math.atan2(c.move.x, c.move.z), 2.4, dt);
    if (c.sprintPress) this.gait = Math.min(3, this.gait + 1);
    if (mag < 0.1) this.gait = 0; else if (this.gait === 0) this.gait = 1;
    if (!c.sprint && this.gait === 3 && Math.random() < dt * 0.15) this.gait = 2;
    this.want = mag > 0.1 ? S.speed[this.gait] * Math.max(mag, 0.6) : 0;
    if (c.jump && !this.air && this.speed > 3) { this.air = true; this.vy = 6.2; sfx('neigh', 0.5); }
  }
  animate(dt) {
    const P = this.parts, sp = this.speed;
    if (this.type === 'peacock') { const show = this.state === 'graze' && Math.sin(this.ph * 0.3) > 0.4; this.ph += dt; P.fan.scale.setScalar(show ? 1 : 0.001); P.train.scale.setScalar(show ? 0.001 : 1); return; }
    const gallop = sp > this.S.speed[2] * 0.8, rate = sp < 0.2 ? 0 : (gallop ? 2.6 : 1.8) * Math.sqrt(sp) / Math.sqrt(this.S.len + 0.3);
    this.ph += dt * rate * 2;
    const A = clamp(sp / (this.S.speed[1] + 0.1), 0, 1) * (gallop ? 0.75 : 0.5);
    P.legs.forEach((l, i) => {
      const off = gallop ? (l.front ? 0 : Math.PI * 0.85) + (l.side > 0 ? 0 : 0.5) : (i === 0 || i === 3 ? 0 : Math.PI);
      const s = Math.sin(this.ph + off);
      l.hip.rotation.x = -s * A; l.knee.rotation.x = (l.front ? -1 : 1) * Math.max(0, Math.cos(this.ph + off)) * A * 1.2;
    });
    const grazing = this.state === 'graze' && !this.rider;
    P.neck.rotation.x = damp(P.neck.rotation.x, grazing && this.type !== 'dog' && this.type !== 'tiger' ? 0.5 : -this.S.neck[1] + Math.sin(this.ph) * 0.06 * A, 3, dt);
    P.tail.rotation.z = Math.sin(performance.now() * 0.003 + this.home.x) * 0.3;
    P.body.position.y = this.S.back - this.S.bodyR[1] * 0.2 + Math.abs(Math.sin(this.ph)) * 0.05 * A * (this.S.len);
    P.body.rotation.x = this.air ? clamp(-this.vy * 0.04, -0.3, 0.3) : gallop ? Math.sin(this.ph) * 0.06 : 0;
    if (P.trunk) P.trunk.forEach((sgm, k) => { sgm.rotation.x = 0.15 + Math.sin(performance.now() * 0.0015 + k * 0.6) * 0.12 + (grazing ? 0.1 : 0); });
    if (P.ears) P.ears.forEach((e, k) => { e.rotation.y = (k ? -1 : 1) * (1.2 + Math.sin(performance.now() * 0.002 + k) * 0.25); });
  }
  hurt(n, from) { this.hp -= n; burst('hit', this.pos.x, this.pos.y + 1, this.pos.z, 3); if (this.type === 'elephant') this.angry = 15; else if (this.type === 'tiger') this.state = 'hunt'; else { this.state = 'flee'; this.t = 6; this.fleeFrom = from ? from.pos || from : this.pos; } if (this.hp <= 0) { this.dead = true; if (this.rider) this.game.dismountHorse(); } }
  seatPos(out) { const h = this.S.back + 0.05; out.set(this.pos.x, this.pos.y + h - 0.35 + (this.parts.body.position.y - (this.S.back - this.S.bodyR[1] * 0.2)), this.pos.z); return out; }
  remove() { this.game.scene.remove(this.obj); }
}

// ---------------- bird flocks (GPU instanced) ----------------
export function buildBirds(scene, n = 14) {
  const g = new THREE.BufferGeometry();
  const v = [0, 0, 0.18, -0.55, 0.05, -0.1, 0, 0, -0.18, 0, 0, 0.18, 0.55, 0.05, -0.1, 0, 0, -0.18];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
  const ig = new THREE.InstancedBufferGeometry(); ig.index = null; ig.setAttribute('position', g.attributes.position); ig.setAttribute('normal', g.attributes.normal);
  const per = 24, total = n * per, data = new Float32Array(total * 4), cen = new Float32Array(total * 4);
  const spots = [[-3000, -3800], [-2900, 3300], [-2600, -900], [-1350, -1700], [5600, 1500], [6700, 0], [7400, -3000], [-3200, 0], [1500, -5000], [-1000, 6500], [4800, 5200], [-6400, 1800], [2200, -2000], [-2300, -7800]];
  for (let i = 0; i < total; i++) { const f = Math.floor(i / per) % spots.length, s = spots[f]; cen.set([s[0], s[1], 40 + Math.random() * 60 + (f === 5 || f === 6 ? 300 : 0), 60 + Math.random() * 90], i * 4); data.set([Math.random() * 6.28, 0.12 + Math.random() * 0.06, (Math.random() - 0.5) * 30, Math.random()], i * 4); }
  ig.setAttribute('aC', new THREE.InstancedBufferAttribute(cen, 4)); ig.setAttribute('aD', new THREE.InstancedBufferAttribute(data, 4)); ig.instanceCount = total;
  const mat = new THREE.MeshStandardMaterial({ color: 0x222222, side: THREE.DoubleSide, roughness: 0.9 });
  patch(mat, (s) => {
    s.uniforms.uTime = U.uTime;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aC; attribute vec4 aD; uniform float uTime;').replace('#include <begin_vertex>', `
      float a = aD.x + uTime*aD.y; float r = aC.w + sin(uTime*0.2 + aD.w*6.)*12.;
      vec3 c = vec3(aC.x + cos(a)*r, aC.z + aD.z + sin(uTime*0.5 + aD.w*9.)*4., aC.y + sin(a)*r);
      float flap = sin(uTime*12. + aD.w*20.)*0.6;
      vec3 p = position*2.2; p.y += abs(p.x)*flap;
      float yaw = -a; float cy = cos(yaw), sy = sin(yaw);
      vec3 transformed = vec3(p.x*cy + p.z*sy, p.y, -p.x*sy + p.z*cy) + c;`);
  }, 'birds');
  const m = new THREE.Mesh(ig, mat); m.frustumCulled = false; scene.add(m);
  return m;
}

export function spawnAnimals(game, q) {
  const list = [], rng = mulberry32(4242), add = (t, x, z, c) => { if (M.terrainH(x, z) < 0.6 || M.waterLevelAt(x, z) > M.terrainH(x, z)) return null; const a = new Animal(game, t, x, z, c); list.push(a); return a; };
  for (const s of M.spawns.horses) { const h = add('horse', s.x, s.z); if (h) { h.parts.saddle.visible = true; h.rideable = true; } }
  const mult = q.desktop ? 1 : 0.6;
  for (let k = 0; k < 90 * mult; k++) { const e = M.edges[Math.floor(rng() * M.edges.length)]; if (e.zone === 'rural' && rng() < 0.5) continue; const A = M.nodes[e.a]; add('cow', A.x + (rng() - 0.5) * 12, A.z + (rng() - 0.5) * 12); }
  for (const v of M.villages) { for (let k = 0; k < 3; k++) add('cow', v.x + (rng() - 0.5) * 120, v.z + (rng() - 0.5) * 120); for (let k = 0; k < 3; k++) add('goat', v.x + (rng() - 0.5) * 100, v.z + (rng() - 0.5) * 100); if (rng() < 0.6) add('peacock', v.x + (rng() - 0.5) * 140, v.z + (rng() - 0.5) * 140); }
  for (let k = 0; k < 60 * mult; k++) { const e = M.edges[Math.floor(rng() * M.edges.length)]; if (e.zone === 'rural') continue; const A = M.nodes[e.a]; add('dog', A.x + (rng() - 0.5) * 10, A.z + (rng() - 0.5) * 10); }
  const jungle = (n, t) => { for (let k = 0; k < n * mult; k++) { const x = 4300 + rng() * 3200, z = -7000 + rng() * 14500; if (M.isJungle(x, z) && M.terrainH(x, z) < 600) add(t, x, z); } };
  jungle(70, 'deer'); jungle(14, 'elephant'); jungle(7, 'tiger'); jungle(40, 'langur'); jungle(18, 'peacock');
  for (let k = 0; k < 12; k++) add('langur', M.L.temple.x + (rng() - 0.5) * 60, M.L.temple.z + (rng() - 0.5) * 60);
  for (const [dx, dz] of [[20, 10], [-25, 15], [10, -30]]) add('elephant', M.L.jungleCamp.x + dx * 3, M.L.jungleCamp.z + dz * 3);
  for (let k = 0; k < 8; k++) { const h = add('horse', M.L.jungleCamp.x + 40 + rng() * 60, M.L.jungleCamp.z + (rng() - 0.5) * 60); if (h) { h.rideable = true; if (k < 3) h.parts.saddle.visible = true; } }
  return list;
}
