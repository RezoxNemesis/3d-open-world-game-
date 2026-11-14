// Kaala Naag — the 500 m serpent boss of Naag Sarovar.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from './mapdata.js';
import { U, NOISE, patch } from './shaders.js';
import { clamp, lerp, damp, dampAngle, smooth } from './util.js';
import { burst, explosion, fx } from './fx.js';
import { sfx, say } from './audio.js';

// ---- sculpted serpent head: horned dragon-cobra skull, hinged jaw, rows of teeth, slit-pupil eyes, frills ----
export function tube(rings, seg = 14, caps = true) {
  const P = [], UV = [], I = [];
  rings.forEach((r, ri) => {
    const ax = new THREE.Vector3(...r.ax).normalize();
    let side = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(0, 1, 0)); side = side.lengthSq() < 0.04 ? new THREE.Vector3(1, 0, 0) : side.normalize();
    const up = new THREE.Vector3().crossVectors(side, ax).normalize();
    for (let k = 0; k < seg; k++) { const t = (k / seg) * Math.PI * 2, cs = Math.cos(t), sn = Math.sin(t), flat = sn < 0 ? (r.flat ?? 1) : 1; const o = side.clone().multiplyScalar(cs * r.a).addScaledVector(up, sn * r.b * flat); P.push(r.c[0] + o.x, r.c[1] + o.y, r.c[2] + o.z); UV.push(k / seg, ri * 0.6); }
  });
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < seg; k++) { const a = i * seg + k, b = i * seg + (k + 1) % seg; I.push(a, a + seg, b, b, a + seg, b + seg); }
  if (caps) for (const [ri, dir] of [[0, -1], [rings.length - 1, 1]]) { const ci = P.length / 3; P.push(...rings[ri].c); UV.push(0.5, ri * 0.6); for (let k = 0; k < seg; k++) { const a = ri * seg + k, b = ri * seg + (k + 1) % seg; if (dir > 0) I.push(ci, a, b); else I.push(ci, b, a); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals(); return g;
}
// curved horn from base along a direction, bending upward/backward
export function horn(base, dir, len, r0, bend, seg = 10) {
  const rings = [], d = new THREE.Vector3(...dir).normalize(), p = new THREE.Vector3(...base);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8; const dd = d.clone().add(new THREE.Vector3(0, bend * t, -bend * 0.6 * t)).normalize();
    rings.push({ c: [p.x, p.y, p.z], ax: [dd.x, dd.y, dd.z], a: r0 * (1 - t * 0.92), b: r0 * (1 - t * 0.92) });
    p.addScaledVector(dd, len / 8);
  }
  return tube(rings, seg);
}
function serpentHead(skinMat) {
  const g = new THREE.Group();
  const bone = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.45, metalness: 0.05 });
  const hornM = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.5, metalness: 0.2 });
  const mouth = new THREE.MeshStandardMaterial({ color: 0x5a0f12, roughness: 0.7 });
  // upper skull: wide hinge, heavy brow, long tapering snout, flat palate
  const skullR = [[-5, 6.6, 5.6, 1.2], [0, 8.4, 6.0, 1.6], [5, 8.0, 5.6, 2.2], [10, 6.6, 4.4, 1.9], [15, 5.2, 3.4, 1.4], [20, 3.9, 2.5, 1.0], [24, 2.6, 1.8, 0.7], [26.6, 1.2, 1.0, 0.4]];
  const skull = new THREE.Mesh(tube(skullR.map(([z, a, b, y]) => ({ c: [0, y, z], ax: [0, 0, 1], a, b, flat: 0.35 })), 28), skinMat);
  g.add(skull);
  // brow ridges + nasal ridge
  for (const sx of [-1, 1]) g.add(new THREE.Mesh(tube([{ c: [sx * 4.6, 4.6, 2], ax: [sx * 0.15, -0.1, 1], a: 1.6, b: 1.0 }, { c: [sx * 4.9, 4.9, 7], ax: [sx * 0.1, -0.15, 1], a: 1.8, b: 1.2 }, { c: [sx * 4.2, 4.1, 12], ax: [-sx * 0.2, -0.2, 1], a: 0.9, b: 0.6 }], 10), skinMat));
  g.add(new THREE.Mesh(tube([{ c: [0, 4.4, 10], ax: [0, -0.2, 1], a: 0.9, b: 0.6 }, { c: [0, 3.0, 20], ax: [0, -0.2, 1], a: 0.6, b: 0.45 }, { c: [0, 1.7, 26], ax: [0, -0.3, 1], a: 0.2, b: 0.2 }], 8), skinMat));
  // eyes: glowing amber with slit pupils
  const eyeM = new THREE.MeshStandardMaterial({ color: 0xffb300, emissive: 0xff8f00, emissiveIntensity: 3.2, roughness: 0.1 });
  const slit = new THREE.MeshBasicMaterial({ color: 0x050200 });
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10).scale(1.1, 1.0, 1.7), eyeM); e.position.set(sx * 6.0, 3.6, 8.5); e.rotation.y = sx * 0.5; g.add(e);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.4), slit); s.position.set(sx * 6.95, 3.6, 8.9); s.rotation.y = sx * 0.5; g.add(s);
  }
  // nostrils
  for (const sx of [-1, 1]) { const n = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6).scale(1, 0.6, 1.4), mouth); n.position.set(sx * 1.1, 1.2, 25.6); g.add(n); }
  // horns: two great swept horns, two smaller jaw horns, a crest of spines
  g.add(new THREE.Mesh(horn([4.5, 5.4, 1], [0.35, 0.45, -1], 17, 1.9, 0.9), hornM), new THREE.Mesh(horn([-4.5, 5.4, 1], [-0.35, 0.45, -1], 17, 1.9, 0.9), hornM));
  g.add(new THREE.Mesh(horn([7.2, 1.0, -1], [0.7, -0.1, -1], 8, 1.0, 0.5), hornM), new THREE.Mesh(horn([-7.2, 1.0, -1], [-0.7, -0.1, -1], 8, 1.0, 0.5), hornM));
  for (let k = 0; k < 6; k++) g.add(new THREE.Mesh(horn([0, 5.9 - k * 0.1, 5 - k * 2.2], [0, 1, -0.5], 3.2 - k * 0.25, 0.6, 0.4, 6), hornM));
  // frills behind the jaw: fanned spines with a membrane
  const memM = new THREE.MeshStandardMaterial({ color: 0x3b1450, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x2a0040, emissiveIntensity: 0.4 });
  for (const sx of [-1, 1]) {
    const P = [], I = [], n = 6, root = new THREE.Vector3(sx * 7, 0, -2);
    P.push(root.x, root.y, root.z);
    for (let k = 0; k <= n; k++) { const a = -0.9 + (k / n) * 1.8; const tip = new THREE.Vector3(sx * (7 + 8 * Math.cos(a * 0.6)), 7 * Math.sin(a), -6 - 6 * Math.cos(a)); P.push(tip.x, tip.y, tip.z); if (k > 0) I.push(0, k, k + 1); g.add(new THREE.Mesh(horn([root.x, root.y, root.z], [tip.x - root.x, tip.y - root.y, tip.z - root.z], root.distanceTo(tip) * 1.05, 0.35, 0, 5), hornM)); }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); mg.setIndex(I); mg.computeVertexNormals(); g.add(new THREE.Mesh(mg, memM));
  }
  // lower jaw on a hinge (rotates open), mouth interior, teeth and fangs
  const jaw = new THREE.Group(); jaw.position.set(0, -0.6, -1); g.add(jaw);
  jaw.add(new THREE.Mesh(tube([[0, 7.6, 2.2, -1.8], [6, 6.8, 1.9, -1.9], [12, 5.2, 1.6, -1.7], [18, 3.6, 1.2, -1.4], [23, 2.2, 0.9, -1.1], [25.5, 1.0, 0.6, -0.9]].map(([z, a, b, y]) => ({ c: [0, y, z], ax: [0, 0, 1], a, b })), 22), skinMat));
  jaw.add(new THREE.Mesh(tube([{ c: [0, -0.9, 2], ax: [0, 0, 1], a: 6.2, b: 0.4 }, { c: [0, -0.9, 22], ax: [0, 0, 1], a: 1.6, b: 0.3 }], 14), mouth));
  const tooth = new THREE.ConeGeometry(0.32, 1.4, 6);
  const teethU = [], teethL = [];
  for (const sx of [-1, 1]) for (let k = 0; k < 11; k++) {
    const z = 4 + k * 2.0, w = 7.2 - k * 0.52;
    teethU.push(tooth.clone().rotateX(Math.PI).translate(sx * w * 0.86, 0.4, z)); teethL.push(tooth.clone().translate(sx * w * 0.8, -0.2, z));
  }
  g.add(new THREE.Mesh(mergeGeometries(teethU), bone)); jaw.add(new THREE.Mesh(mergeGeometries(teethL), bone));
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.75, 5.5, 8).rotateX(Math.PI).translate(sx * 3.4, -1.6, 21.5), bone); g.add(f); }
  // forked tongue
  const tongue = new THREE.Group(); tongue.position.set(0, -1.2, 18);
  for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 4).translate(sx * 0.35, 0, 7).rotateY(sx * 0.12), new THREE.MeshStandardMaterial({ color: 0xb0174f })); tongue.add(t); }
  tongue.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 6).translate(0, 0, 3), new THREE.MeshStandardMaterial({ color: 0xb0174f })));
  g.add(tongue);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, jaw, tongue };
}

const NSEG = 112, SPACING = 4.5, RING = 28;
export class Serpent {
  constructor(game) {
    this.game = game; this.len = NSEG * SPACING; this.hpMax = 7000; this.hp = this.hpMax; this.state = 'sleep'; this.t = 0; this.active = false; this.defeated = false;
    this.spine = []; for (let i = 0; i < NSEG; i++) this.spine.push(new THREE.Vector3());
    this.trail = []; this.head = new THREE.Vector3(M.PLAT.lx, M.PLAT.water - 30, M.PLAT.lz); this.yaw = 0; this.headY = 0; this.hood = 0; this.wig = 0;
    // initial coiled trail spiral in the lake (hidden underwater)
    for (let k = 0; k < 900; k++) { const a = k * 0.025, r = 40 + k * 0.17; this.trail.push(new THREE.Vector3(M.PLAT.lx + Math.cos(a) * r, M.PLAT.water - 25, M.PLAT.lz + Math.sin(a) * r)); }
    this.head.copy(this.trail[0]);
    this.radius = []; for (let i = 0; i < NSEG; i++) { const s = i / (NSEG - 1); this.radius.push(lerp(5.8, 10.5, smooth(0, 0.08, s)) * (1 - smooth(0.45, 1.0, s) * 0.92)); }
    // body mesh
    const g = new THREE.BufferGeometry(), nv = NSEG * RING;
    this.P = new Float32Array(nv * 3); this.N = new Float32Array(nv * 3); const uv = new Float32Array(nv * 2), idx = [];
    for (let i = 0; i < NSEG; i++) for (let k = 0; k < RING; k++) { uv[(i * RING + k) * 2] = k / RING; uv[(i * RING + k) * 2 + 1] = i * SPACING / 6; }
    for (let i = 0; i < NSEG - 1; i++) for (let k = 0; k < RING; k++) { const a = i * RING + k, b = i * RING + ((k + 1) % RING), c = a + RING, d = b + RING; idx.push(a, b, c, b, d, c); }
    g.setAttribute('position', new THREE.BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(this.N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.25 });
    this.uRage = { value: 0 };
    patch(mat, (s) => {
      s.uniforms.uTime = U.uTime; s.uniforms.uRage = this.uRage;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSUv = uv;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSUv; uniform float uTime, uRage; vec3 sN; float sDome;\n' + NOISE).replace('#include <color_fragment>', `#include <color_fragment>
        float a = vSUv.x; float belly = smoothstep(0.17, 0.06, abs(a - 0.75));
        // overlapping domed scales
        vec2 sc = vec2(vSUv.x*34., vSUv.y*2.6); vec2 id = floor(sc + vec2(0.5*floor(mod(sc.y,2.)),0.)); vec2 cell = fract(sc + vec2(0.5*floor(mod(sc.y,2.)),0.)) - 0.5;
        float d = abs(cell.x)*1.15 + abs(cell.y + 0.15); sDome = 1. - smoothstep(0.2, 0.5, d);
        float hv = fract(sin(dot(id, vec2(12.9898,78.233)))*43758.5453);
        sN = normalize(vec3(-cell.x*1.6*sDome, -(cell.y+0.15)*1.6*sDome, 1.0));
        vec3 top = mix(vec3(0.015,0.045,0.03), vec3(0.06,0.2,0.1)*(0.75 + 0.5*hv), sDome);
        float band = smoothstep(0.86, 0.96, sin(vSUv.y*0.9)*0.5+0.5);
        top = mix(top, vec3(0.5,0.36,0.06)*(0.8+0.4*hv), band*0.75*sDome);
        float plate = step(0.5, fract(vSUv.y*1.6));
        vec3 bel = vec3(0.55,0.47,0.27)*(0.72 + 0.28*plate)*(0.9 + 0.2*hv);
        vec3 col = mix(top, bel, belly);
        diffuseColor.rgb = col;
        float rune = smoothstep(0.03, 0.0, abs(a - 0.25))*step(0.5, fract(vSUv.y*0.35 - uTime*0.4));`)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + (sN.x*normalize(cross(normal, vec3(0.,1.,0.)) + vec3(1e-4)) + sN.y*vec3(0.,1.,0.))*0.55*(1.-belly*0.6));')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.55, 0.22, sDome);')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // oil-slick iridescence on the scales + glowing runes that brighten with rage
        vec3 Vv = normalize(vViewPosition); float fr = pow(1.0 - abs(dot(normal, Vv)), 3.0);
        totalEmissiveRadiance += (0.5 + 0.5*cos(6.2831*(fr*1.5 + vec3(0.0,0.33,0.67) + vSUv.y*0.02)))*fr*sDome*0.12*(1.-belly);
        totalEmissiveRadiance += vec3(0.6,0.1,1.0)*rune*(1.2 + uRage*3.0);`);
    }, 'serpent');
    this.body = new THREE.Mesh(g, mat); this.body.castShadow = true; this.body.receiveShadow = true; this.body.frustumCulled = false; game.scene.add(this.body);
    // head
    const H = serpentHead(mat); this.headObj = new THREE.Group(); this.headObj.add(H.group); this.jaw = H.jaw; this.tongue = H.tongue;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(2.0), new THREE.MeshStandardMaterial({ color: 0x9c27ff, emissive: 0x7c1fff, emissiveIntensity: 2.8, metalness: 0.5, roughness: 0.2 })); gem.position.set(0, 7.6, 6); gem.scale.set(1, 1.3, 1); this.headObj.add(gem); this.gem = gem;
    // dorsal spikes along the spine (instanced, follow the body)
    const spikeG = new THREE.ConeGeometry(0.5, 2.4, 5); spikeG.translate(0, 1.2, 0);
    this.spikes = new THREE.InstancedMesh(spikeG, new THREE.MeshStandardMaterial({ color: 0x1c1610, roughness: 0.5, metalness: 0.2 }), Math.floor(NSEG / 2)); this.spikes.frustumCulled = false; this.spikes.castShadow = true; game.scene.add(this.spikes);
    // a pillar of light over Naag Sarovar so the boss is easy to find
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 1400, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xb04dff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.beacon.position.set(M.PLAT.lx, M.PLAT.water + 700, M.PLAT.lz); game.scene.add(this.beacon);
    // hood (flares open)
    const hg = new THREE.SphereGeometry(1, 24, 12, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.12, Math.PI * 0.76);
    hg.scale(32, 26, 6);
    const hcol = []; const hp = hg.attributes.position; for (let i = 0; i < hp.count; i++) { const x = hp.getX(i), y = hp.getY(i); const spot = Math.hypot(Math.abs(x) - 10, y - 4) < 5 ? 1 : 0; hcol.push(...(spot ? [0.9, 0.75, 0.2] : [0.02, 0.05, 0.03])); }
    hg.setAttribute('color', new THREE.Float32BufferAttribute(hcol, 3));
    this.hoodM = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.4 })); this.hoodM.rotation.x = -0.15; this.hoodM.position.set(0, 0, -6); this.headObj.add(this.hoodM);
    this.headObj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    game.scene.add(this.headObj);
    this.spits = []; this.updateSpine(); this.updateMesh(); this.setVisible(false);
  }
  setVisible(v) { this.body.visible = v; this.headObj.visible = v; if (this.spikes) this.spikes.visible = v; if (this.beacon) this.beacon.visible = !v && !this.defeated; }
  awaken() {
    if (this.active) return; this.active = true; this.defeated = false; this.hp = this.hpMax; this.state = 'emerge'; this.t = 0; this.phase = 0; this.setVisible(true);
    this.game.startCinematic && this.game.startCinematic(() => this.head, 'KAALA NAAG', 'The World Serpent of Naag Sarovar', 5.5);
    sfx('roar', 1); this.game.shake(1.2); say('Naag', 'Who dares to wake Kaala Naag?');
    this.game.hud.boss('KAALA NAAG — THE 500 M SERPENT', 1);
  }
  updateSpine() {
    // walk the trail to place spine points
    let acc = 0, ti = 0; const tr = this.trail;
    this.spine[0].copy(this.head);
    let prev = this.head;
    for (let i = 1; i < NSEG; i++) {
      const need = i * SPACING;
      while (ti < tr.length) { const seg = prev.distanceTo(tr[ti]); if (acc + seg >= need) { const t = (need - acc) / Math.max(seg, 1e-4); this.spine[i].lerpVectors(prev, tr[ti], t); break; } acc += seg; prev = tr[ti]; ti++; }
      if (ti >= tr.length) this.spine[i].copy(tr[tr.length - 1]);
    }
  }
  updateMesh() {
    const P = this.P, N = this.N, sp = this.spine, t = U.uTime.value;
    const up = new THREE.Vector3(0, 1, 0), tan = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3(), o = new THREE.Vector3();
    for (let i = 0; i < NSEG; i++) {
      tan.subVectors(sp[Math.max(0, i - 1)], sp[Math.min(NSEG - 1, i + 1)]).normalize();
      bin.crossVectors(up, tan); if (bin.lengthSq() < 1e-4) bin.set(1, 0, 0); bin.normalize(); nrm.crossVectors(tan, bin).normalize();
      const r = this.radius[i], breathe = 1 + Math.sin(t * 1.5 - i * 0.2) * 0.02;
      const hoodK = i < 8 ? this.hood * smooth(0, 3, i) * (1 - smooth(4, 8, i)) : 0;
      for (let k = 0; k < RING; k++) {
        const a = (k / RING) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const rx = r * breathe * (1 + hoodK * 1.8), ry = r * breathe * (sa < 0 ? 0.75 : 1);
        o.copy(sp[i]).addScaledVector(bin, ca * rx).addScaledVector(nrm, sa * ry);
        const j = (i * RING + k) * 3; P[j] = o.x; P[j + 1] = o.y; P[j + 2] = o.z;
        const nx = bin.x * ca + nrm.x * sa, ny = bin.y * ca + nrm.y * sa, nz = bin.z * ca + nrm.z * sa; N[j] = nx; N[j + 1] = ny; N[j + 2] = nz;
      }
    }
    this.body.geometry.attributes.position.needsUpdate = true; this.body.geometry.attributes.normal.needsUpdate = true;
    if (this.spikes && this.spikes.visible) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), basis = new THREE.Matrix4();
      for (let n = 0; n < this.spikes.count; n++) {
        const i = Math.min(NSEG - 2, 3 + n * 2), r = this.radius[i];
        tan.subVectors(sp[Math.max(0, i - 1)], sp[i + 1]).normalize(); bin.crossVectors(up, tan); if (bin.lengthSq() < 1e-4) bin.set(1, 0, 0); bin.normalize(); nrm.crossVectors(tan, bin).normalize();
        const back = tan.clone().negate(), upn = nrm.clone().addScaledVector(back, 0.55).normalize(), side = new THREE.Vector3().crossVectors(upn, back).normalize(), fw = new THREE.Vector3().crossVectors(side, upn);
        basis.makeBasis(side, upn, fw); q.setFromRotationMatrix(basis); const k = Math.max(0.3, r / 6); sc.set(k, k * (1.2 + (n % 3) * 0.2), k);
        m.compose(sp[i].clone().addScaledVector(nrm, r * 0.95), q, sc); this.spikes.setMatrixAt(n, m);
      }
      this.spikes.instanceMatrix.needsUpdate = true;
    }
    this.body.geometry.computeBoundingSphere();
    // head orientation
    const d = new THREE.Vector3().subVectors(sp[0], sp[2]).normalize();
    this.headObj.position.copy(sp[0]);
    this.headObj.lookAt(sp[0].clone().add(d));
    this.headObj.rotateX(this.biting ? -0.25 : this.state === 'roar' ? -0.35 : 0);
  }
  moveHead(target, speed, dt, rise) {
    const to = new THREE.Vector3().subVectors(target, this.head); to.y = 0;
    const want = Math.atan2(to.x, to.z) + Math.sin(this.wig) * 0.35;
    this.wig += dt * 1.6;
    this.yaw = dampAngle(this.yaw, want, 1.2, dt);
    this.head.x += Math.sin(this.yaw) * speed * dt; this.head.z += Math.cos(this.yaw) * speed * dt;
    const g = Math.max(M.groundAt(this.head.x, this.head.z), M.waterLevelAt(this.head.x, this.head.z) - 4);
    this.headY = damp(this.headY, rise, 1.6, dt);
    this.head.y = damp(this.head.y, g + 6 + this.headY, 3, dt);
    if (this.head.distanceTo(this.trail[0]) > 1.5) { this.trail.unshift(this.head.clone()); if (this.trail.length > 1100) this.trail.pop(); }
    // keep body on the ground
    for (let k = 0; k < this.trail.length; k += 1) { const p = this.trail[k]; if (k < 20) continue; const gy = Math.max(M.groundAt(p.x, p.z), M.waterLevelAt(p.x, p.z) - 3); p.y = damp(p.y, gy + this.radius[Math.min(NSEG - 1, Math.floor(k * 1.5 / SPACING))] * 0.7, 2, dt); }
  }
  update(dt) {
    if (!this.active) return;
    this.t += dt; const pl = this.game.player, P = this.game.playerPos();
    const toP = new THREE.Vector3().subVectors(P, this.head); const dP = Math.hypot(toP.x, toP.z);
    this.tongue.visible = Math.sin(this.t * 6) > 0.6; this.tongue.scale.z = 0.6 + Math.sin(this.t * 25) * 0.4;
    this.uRage.value = 1 - this.hp / this.hpMax;
    const ph = this.hp / this.hpMax < 0.33 ? 3 : this.hp / this.hpMax < 0.66 ? 2 : 1;
    if (ph !== this.phase) { if (this.phase) { this.state = 'roar'; this.t = 0; sfx('roar', 1); this.game.shake(1.2); this.game.hud.toast(ph === 3 ? 'KAALA NAAG IS ENRAGED!' : 'The serpent thrashes its coils — jump to dodge!', 3, '#e040fb'); } this.phase = ph; }
    this.gem.rotation.y += dt * 2;
    switch (this.state) {
      case 'emerge': {
        this.moveHead(new THREE.Vector3(M.PLAT.lx - 200, 0, M.PLAT.lz), 10, dt, 70); this.hood = damp(this.hood, 1, 1, dt);
        const wl = M.waterLevelAt(this.head.x, this.head.z);
        if (Math.random() < 0.8) burst('splash', this.head.x + (Math.random() - 0.5) * 20, wl, this.head.z + (Math.random() - 0.5) * 20, 18, 7);
        if (this.t > 5) { this.state = 'roar'; this.t = 0; sfx('roar', 1); this.game.shake(1.4); }
        break;
      }
      case 'roar': {
        this.moveHead(P, 1, dt, 80); this.hood = damp(this.hood, 1, 4, dt); this.jaw.rotation.x = damp(this.jaw.rotation.x, 0.85, 5, dt);
        if (Math.random() < 0.5) burst('venom', this.head.x, this.head.y + 2, this.head.z, 2, 3);
        if (this.t > 2.6) { this.state = 'roam'; this.t = 0; this.jaw.rotation.x = 0; }
        break;
      }
      case 'sweep': {
        // the body thrashes: dust warns where it will hit, then a shockwave along the coils near the player (jump to dodge)
        this.moveHead(P, 6, dt, 30);
        const i = this.nearestSeg(P), sp = this.spine[i];
        if (this.t < 1.3) { if (Math.random() < 0.6) burst('dust', sp.x + (Math.random() - 0.5) * 30, M.groundAt(sp.x, sp.z) + 0.5, sp.z + (Math.random() - 0.5) * 30, 6, 3); }
        else if (!this.swept) { this.swept = true; sfx('boom', 1); this.game.shake(1.0); burst('dust', sp.x, M.groundAt(sp.x, sp.z) + 1, sp.z, 70, 10);
          const air = P.y - M.groundAt(P.x, P.z) > 2.5; if (!air && Math.hypot(P.x - sp.x, P.z - sp.z) < 26 && pl.alive && !pl.vehicle) pl.damage(38, { pos: sp }, 16, true); }
        if (this.t > 2.4) { this.state = 'roam'; this.t = 0; this.swept = false; }
        break;
      }
      case 'rain': {
        // venom rains from the sky around the player
        this.moveHead(P, 2, dt, 70); this.hood = damp(this.hood, 1, 3, dt); this.jaw.rotation.x = damp(this.jaw.rotation.x, 0.7, 6, dt);
        if (Math.floor(this.t * 5) !== this.lastRain && this.t < 3.5) { this.lastRain = Math.floor(this.t * 5); const from = new THREE.Vector3(P.x + (Math.random() - 0.5) * 50, P.y + 70, P.z + (Math.random() - 0.5) * 50); this.spits.push({ p: from, v: new THREE.Vector3((Math.random() - 0.5) * 4, -10, (Math.random() - 0.5) * 4), t: 0 }); }
        if (this.t > 4.2) { this.state = 'roam'; this.t = 0; this.jaw.rotation.x = 0; }
        break;
      }
      case 'roam': {
        // circle the player at 80-120 m, then attack
        const ang = Math.atan2(this.head.x - P.x, this.head.z - P.z) + 0.6;
        const tgt = new THREE.Vector3(P.x + Math.sin(ang) * 95, 0, P.z + Math.cos(ang) * 95);
        this.moveHead(tgt, 22 + this.uRage.value * 10, dt, 8); this.hood = damp(this.hood, 0.2, 1, dt);
        if (this.t > 7 - this.uRage.value * 3.5) { const r = Math.random(), ph = this.phase; this.state = ph >= 3 && r < 0.25 ? 'rain' : ph >= 2 && r < 0.5 ? 'sweep' : r < 0.75 ? 'rear' : 'spit'; this.t = 0; }
        break;
      }
      case 'rear': {
        this.moveHead(P, dP > 40 ? 30 : 4, dt, 75); this.hood = damp(this.hood, 1, 3, dt);
        if (this.t > 2.6) { this.state = 'strike'; this.t = 0; this.strikeAt = P.clone(); sfx('hiss', 1); }
        break;
      }
      case 'strike': {
        this.biting = true; this.jaw.rotation.x = damp(this.jaw.rotation.x, 0.6, 8, dt);
        const tgt = this.strikeAt; this.head.lerp(new THREE.Vector3(tgt.x, M.groundAt(tgt.x, tgt.z) + 6, tgt.z), 1 - Math.exp(-5 * dt));
        if (!this.trail.length || this.head.distanceTo(this.trail[0]) > 1.5) this.trail.unshift(this.head.clone());
        if (this.t > 0.55 && !this.struck) { this.struck = true; fx.shake = 1.2; sfx('boom', 0.8); burst('dust', this.head.x, this.head.y - 5, this.head.z, 40, 4); if (P.distanceTo(this.head) < 22 && pl.alive) pl.damage(45, { pos: this.head }, 14, true); this.game.onExplosion(this.head, 25); }
        if (this.t > 1.4) { this.state = 'roam'; this.t = 0; this.struck = false; this.biting = false; this.jaw.rotation.x = 0; }
        break;
      }
      case 'spit': {
        this.moveHead(P, 3, dt, 40); this.hood = damp(this.hood, 0.8, 3, dt);
        if (Math.floor(this.t * 2.5) !== this.lastSpit && this.t < 3) { this.lastSpit = Math.floor(this.t * 2.5); const from = this.head.clone().add(new THREE.Vector3(0, 0, 0)); const v = new THREE.Vector3().subVectors(P.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 1, (Math.random() - 0.5) * 8)), from); const T = v.length() / 45; v.divideScalar(T); v.y += 0.5 * 20 * T; this.spits.push({ p: from, v, t: 0 }); sfx('hiss', 0.7); }
        if (this.t > 4) { this.state = 'roam'; this.t = 0; }
        break;
      }
      case 'stunned': { this.moveHead(this.head.clone().add(new THREE.Vector3(1, 0, 0)), 0.5, dt, -4); this.hood = damp(this.hood, 0, 2, dt); if (this.t > 5) { this.state = 'roam'; this.t = 0; } break; }
      case 'dying': {
        this.moveHead(this.head.clone().add(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(10)), 6, dt, -12); this.hood = damp(this.hood, 0, 1, dt);
        for (const p of this.trail) p.y -= dt * 2.5; this.head.y -= dt * 3;
        if (Math.random() < 0.3) burst('venom', this.head.x, this.head.y + 5, this.head.z, 2, 2);
        if (this.t > 9) { this.active = false; this.setVisible(false); this.defeated = true; this.game.onSerpentDefeated(); }
        break;
      }
    }
    // venom projectiles
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const s = this.spits[i]; s.t += dt; s.v.y -= 20 * dt; s.p.addScaledVector(s.v, dt); burst('venom', s.p.x, s.p.y, s.p.z, 1, 0.8);
      const g = M.groundAt(s.p.x, s.p.z);
      if (s.p.y < g || s.t > 6) { burst('venom', s.p.x, g + 1, s.p.z, 18, 2.5); if (P.distanceTo(s.p) < 9 && pl.alive) pl.damage(16, { pos: s.p }, 4, false); sfx('splash', 0.6, this.game.camDist(s.p)); this.spits.splice(i, 1); }
    }
    // body crush
    if (pl.alive && !pl.vehicle) for (let i = 4; i < NSEG; i += 2) { const sp = this.spine[i]; const r = this.radius[i]; const dx = P.x - sp.x, dz = P.z - sp.z, dy = P.y - sp.y; if (dx * dx + dz * dz < (r + 1) * (r + 1) && Math.abs(dy) < r + 1.5) { if (P.y > sp.y + r * 0.5) break; pl.damage(14 * dt * 4, { pos: sp }, 9, false); break; } }
    this.updateSpine(); this.updateMesh();
    this.game.hud.boss(null, this.hp / this.hpMax);
  }
  // ray hit test (guns, missiles)
  ray(origin, dir, maxT) {
    if (!this.active || this.state === 'dying') return null;
    let best = null;
    const test = (c, r, part) => { const vx = c.x - origin.x, vy = c.y - origin.y, vz = c.z - origin.z, t = vx * dir.x + vy * dir.y + vz * dir.z; if (t < 0 || t > maxT) return; const dx = origin.x + dir.x * t - c.x, dy = origin.y + dir.y * t - c.y, dz = origin.z + dir.z * t - c.z; if (dx * dx + dy * dy + dz * dz < r * r && (!best || t < best.t)) best = { t, part }; };
    test(this.gem.getWorldPosition(new THREE.Vector3()), 3.5, 'gem');
    test(this.headObj.position.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 6, 0, Math.cos(this.yaw) * 6)), 10, 'head');
    for (let i = 2; i < NSEG; i += 2) test(this.spine[i], this.radius[i] + 0.5, 'body');
    return best;
  }
  hurt(n, part) {
    if (!this.active || this.state === 'dying') return;
    const mul = part === 'gem' ? 4 : part === 'head' ? 2 : 1;
    this.hp -= n * mul;
    if (part === 'gem' && Math.random() < 0.08 && this.state !== 'stunned') { this.state = 'stunned'; this.t = 0; sfx('roar', 0.8); }
    if (this.hp <= 0) { this.hp = 0; this.state = 'dying'; this.t = 0; sfx('roar', 1); say('Naag', 'Impossible... the waters will remember you, duo of Daman.'); }
  }
  nearPlayer() { if (!this.active) return 1e9; return this.head.distanceTo(this.game.playerPos()); }
  nearestSeg(P) { let bi = 0, bd = 1e9; for (let i = 0; i < NSEG; i += 2) { const d = Math.hypot(P.x - this.spine[i].x, P.z - this.spine[i].z); if (d < bd) { bd = d; bi = i; } } return bi; }
  // ---- shared boss interface (melee, slam, missiles, map) ----
  get name() { return 'Kaala Naag'; }
  target() { return this.head.clone().add(new THREE.Vector3(0, 4, 0)); }
  distTo(P) { if (!this.active) return 1e9; const i = this.nearestSeg(P); return Math.max(0, this.spine[i].distanceTo(P) - this.radius[i]); }
  meleeTest(pos, range) { if (!this.active || this.state === 'dying') return null; if (this.head.distanceTo(pos) < 14 + range) return 'head'; for (let i = 0; i < NSEG; i += 2) { const s = this.spine[i]; if (Math.hypot(s.x - pos.x, s.z - pos.z) < this.radius[i] + range && Math.abs(s.y - pos.y) < this.radius[i] + 2) return 'body'; } return null; }
  slamHit(P, r) { if (this.distTo(P) < r) this.hurt(140, this.head.distanceTo(P) < 20 ? 'head' : 'body'); }
  home() { return { x: M.PLAT.lx - 330, z: M.PLAT.lz - 140 }; }
}
