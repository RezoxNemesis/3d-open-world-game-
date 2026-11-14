// Mythological bosses beyond Kaala Naag: the Makara (sea monster of Devka) and the Rakshasa (giant of the Ghats).
// Every boss shares one interface with the serpent: awaken, update, ray, hurt, meleeTest, slamHit, distTo, target, home.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from './mapdata.js';
import { U, NOISE, patch } from './shaders.js';
import { clamp, lerp, damp, dampAngle } from './util.js';
import { burst, explosion } from './fx.js';
import { sfx, say } from './audio.js';
import { tube, horn } from './serpent.js';
import { Human, Pose, blendPose } from './human.js';

// scaled skin with domed scales (shared look with the serpent, own palette)
function scaleSkin(top, top2, belly, glow) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.15 });
  patch(m, (s) => {
    s.uniforms.uTime = U.uTime;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSUv; varying float vY;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSUv = uv; vY = position.y;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSUv; varying float vY; uniform float uTime; float dome;\n' + NOISE).replace('#include <color_fragment>', `#include <color_fragment>
      vec2 sc = vec2(vSUv.x*30., vSUv.y*4.); vec2 cell = fract(sc + vec2(0.5*floor(mod(sc.y,2.)),0.)) - 0.5; vec2 id = floor(sc);
      dome = 1. - smoothstep(0.2, 0.5, abs(cell.x)*1.15 + abs(cell.y + 0.15));
      float hv = fract(sin(dot(id, vec2(12.9898,78.233)))*43758.5453);
      float bel = smoothstep(0.62, 0.88, sin(vSUv.x*6.2831 - 1.5708)*-0.5 + 0.5);
      vec3 c = mix(${top}, ${top2}*(0.8 + 0.4*hv), dome);
      diffuseColor.rgb = mix(c, ${belly}*(0.85 + 0.15*step(0.5, fract(vSUv.y*3.))), bel);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.6, 0.25, dome);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += ${glow}*smoothstep(0.03, 0., abs(vSUv.x - 0.25))*step(0.6, fract(vSUv.y*0.5 - uTime*0.5))*0.8;`);
  }, 'scaleskin' + top);
  return m;
}
const beaconMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
function sphereHit(origin, dir, maxT, c, r) {
  const vx = c.x - origin.x, vy = c.y - origin.y, vz = c.z - origin.z, t = vx * dir.x + vy * dir.y + vz * dir.z;
  if (t < 0 || t > maxT) return -1;
  const dx = origin.x + dir.x * t - c.x, dy = origin.y + dir.y * t - c.y, dz = origin.z + dir.z * t - c.z;
  return dx * dx + dy * dy + dz * dz < r * r ? t : -1;
}

class BossBase {
  constructor(game, cfg) {
    Object.assign(this, { game, active: false, defeated: false, state: 'sleep', t: 0, phase: 0, shots: [] }, cfg);
    this.hp = this.hpMax; this.head = new THREE.Vector3();
  }
  awaken() {
    if (this.active) return;
    this.active = true; this.hp = this.hpMax; this.state = 'emerge'; this.t = 0; this.phase = 0; this.setVisible(true);
    sfx('roar', 1); this.game.shake(1.1); say(this.voice, this.wakeLine);
    this.game.hud.boss(this.title, 1);
    this.game.startCinematic && this.game.startCinematic(() => this.head, this.name.toUpperCase(), this.subtitle, 5);
  }
  sleep() { this.active = false; this.state = 'sleep'; this.setVisible(this.showAsleep || false); this.shots.length = 0; this.game.hud.boss(null, 0); }
  hurt(n, part) {
    if (!this.active || this.state === 'dying') return;
    this.hp -= n * (this.mul[part] || 1); burst(part === this.weak ? 'venom' : 'hit', this.head.x, this.head.y, this.head.z, 3, 1);
    if (part === this.weak && Math.random() < 0.06 && this.state !== 'stunned') { this.state = 'stunned'; this.t = 0; sfx('roar', 0.7); }
    if (this.hp <= 0) { this.hp = 0; this.state = 'dying'; this.t = 0; sfx('roar', 1); say(this.voice, this.deathLine); }
  }
  checkPhase() {
    const f = this.hp / this.hpMax, ph = f < 0.33 ? 3 : f < 0.66 ? 2 : 1;
    if (ph !== this.phase) { if (this.phase) { this.state = 'roar'; this.t = 0; sfx('roar', 1); this.game.shake(1.1); this.game.hud.toast(ph === 3 ? `${this.name.toUpperCase()} IS ENRAGED!` : this.phase2Hint, 3, this.color); } this.phase = ph; }
  }
  finish() {
    this.active = false; this.defeated = true; this.setVisible(false); this.game.hud.boss(null, 0);
    this.game.onBossDefeated(this);
  }
  // projectiles: { p, v, t, dmg, r, fx }
  updateShots(dt) {
    const pl = this.game.player, P = this.game.playerPos();
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]; s.t += dt; s.v.y -= (s.g ?? 20) * dt; s.p.addScaledVector(s.v, dt);
      if (s.mesh) s.mesh.position.copy(s.p); else burst(s.fx, s.p.x, s.p.y, s.p.z, 1, 0.8);
      const g = Math.max(M.groundAt(s.p.x, s.p.z), s.water ? -50 : M.waterLevelAt(s.p.x, s.p.z));
      if (s.p.y < g || s.t > 7 || s.p.distanceTo(P) < 2.5) {
        if (s.boom) { explosion(s.p.x, Math.max(g, s.p.y), s.p.z, 1.3); this.game.onExplosion(s.p, 6); } else burst(s.fx, s.p.x, Math.max(g, s.p.y) + 0.5, s.p.z, 22, 3);
        sfx(s.boom ? 'boom' : 'splash', 0.8, this.game.camDist(s.p));
        if (P.distanceTo(s.p) < s.r && pl.alive) pl.damage(s.dmg, { pos: s.p }, 8, s.down);
        if (s.mesh) this.game.scene.remove(s.mesh);
        this.shots.splice(i, 1);
      }
    }
  }
  shockwave(c, r, dmg) {
    const pl = this.game.player, P = this.game.playerPos();
    burst('dust', c.x, M.groundAt(c.x, c.z) + 0.5, c.z, 80, r * 0.4); this.game.shake(1.0); sfx('boom', 1, this.game.camDist(c));
    const air = P.y - M.groundAt(P.x, P.z) > 2.5;
    if (!air && !pl.vehicle && pl.alive && Math.hypot(P.x - c.x, P.z - c.z) < r) pl.damage(dmg, { pos: c }, 16, true);
    for (const e of this.game.npcs.enemies) if (e.alive && e.pos.distanceTo(c) < r) e.damage(dmg, null, 10, true);
  }
  distTo(P) { return this.active ? this.head.distanceTo(P) : 1e9; }
  target() { return this.head.clone(); }
}

// ================= MAKARA: sea monster of Devka (crocodile head, curled trunk, armoured back, fish tail) =================
export class Makara extends BossBase {
  constructor(game) {
    const cz = -3600, cx = M.coastX(cz) - 170;
    super(game, { name: 'Makara', title: 'MAKARA — GUARDIAN OF THE ARABIAN SEA', subtitle: 'The sea monster of Devka', hpMax: 4800, color: '#26c6da', voice: 'Makara',
      wakeLine: 'You stand on my shore, little ones. The sea takes everything back.', deathLine: 'The tide... turns...', reward: 'slam',
      phase2Hint: 'The Makara dives — watch for the bubbles!', mul: { pearl: 3.5, head: 1.8, body: 1 }, weak: 'pearl', center: new THREE.Vector3(cx, 0, cz) });
    this.pos = this.center.clone(); this.pos.y = -14; this.yaw = 0; this.speed = 0; this.ang = 0; this.pitch = 0;
    const g = this.obj = new THREE.Group(); const skin = scaleSkin('vec3(0.02,0.12,0.07)', 'vec3(0.1,0.45,0.28)', 'vec3(0.86,0.7,0.36)', 'vec3(0.1,0.9,1.0)');
    const bone = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.45 }), plateM = new THREE.MeshStandardMaterial({ color: 0xb8913a, roughness: 0.3, metalness: 0.85 });
    // body + crocodile head + hinged jaw
    g.add(new THREE.Mesh(tube([[-14, 3.2, 2.6, 0.4], [-8, 5.2, 3.9, 0.6], [-2, 6.2, 4.5, 0.6], [4, 5.8, 4.3, 0.7], [10, 4.4, 3.5, 0.9], [14, 3.7, 2.8, 1.2], [18, 2.6, 1.7, 0.9], [23, 1.8, 1.1, 0.7], [26.5, 1.3, 0.85, 0.6]].map(([z, a, b, y]) => ({ c: [0, y, z], ax: [0, 0, 1], a, b, flat: 0.6 })), 24), skin));
    this.jaw = new THREE.Group(); this.jaw.position.set(0, -0.2, 11); g.add(this.jaw);
    this.jaw.add(new THREE.Mesh(tube([[0, 3.6, 1.2, -0.8], [6, 2.6, 0.9, -0.7], [12, 1.6, 0.7, -0.5], [15, 1.2, 0.5, -0.4]].map(([z, a, b, y]) => ({ c: [0, y, z], ax: [0, 0, 1], a, b })), 16), skin));
    const tooth = new THREE.ConeGeometry(0.22, 0.9, 5), tu = [], tl = [];
    for (const sx of [-1, 1]) for (let k = 0; k < 9; k++) { const z = 12 + k * 1.6, w = 3.2 - k * 0.22; tu.push(tooth.clone().rotateX(Math.PI).translate(sx * w * 0.85, 0.15, z)); tl.push(tooth.clone().translate(sx * (w - 0.3) * 0.8, -0.3, z - 11)); }
    g.add(new THREE.Mesh(mergeGeometries(tu), bone)); this.jaw.add(new THREE.Mesh(mergeGeometries(tl), bone));
    // the Makara's curled trunk-snout
    const curl = []; for (let k = 0; k <= 10; k++) { const a = k / 10 * Math.PI * 1.3; curl.push({ c: [0, 1.3 + Math.sin(a) * 3.2, 26 + Math.sin(a * 0.5) * 2.5 - (1 - Math.cos(a)) * 1.2], ax: [0, Math.cos(a), -Math.sin(a) * 0.6 + 0.4], a: 1.0 * (1 - k / 13), b: 1.0 * (1 - k / 13) }); }
    g.add(new THREE.Mesh(tube(curl, 10), skin));
    // eyes, pearl (weak point), brow horns, armoured plates, flippers
    const eyeM = new THREE.MeshStandardMaterial({ color: 0x18ffff, emissive: 0x00e5ff, emissiveIntensity: 3 });
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8).scale(1, 0.8, 1.3), eyeM); e.position.set(sx * 2.9, 3.4, 14.5); g.add(e); g.add(new THREE.Mesh(horn([sx * 2.6, 3.8, 12], [sx * 0.4, 0.6, -1], 6, 0.7, 0.6, 8), plateM)); }
    this.pearl = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x80deea, emissiveIntensity: 2.5, roughness: 0.05, metalness: 0.3 }));
    this.pearl.position.set(0, 4.2, 11.5); g.add(this.pearl);
    const plates = []; for (let k = 0; k < 11; k++) { const z = -12 + k * 2.2, h = 1.4 + Math.sin(k / 10 * Math.PI) * 1.4; plates.push(new THREE.ConeGeometry(1.0, h, 4).scale(0.4, 1, 1.2).translate(0, 4.2 + Math.sin(k / 10 * Math.PI) * 0.6 + h / 2, z)); for (const sx of [-1, 1]) plates.push(new THREE.ConeGeometry(0.6, h * 0.6, 4).scale(0.4, 1, 1.2).rotateZ(-sx * 0.5).translate(sx * 3.2, 3.4 + h * 0.25, z)); }
    g.add(new THREE.Mesh(mergeGeometries(plates), plateM));
    this.flips = [];
    for (const [sx, z] of [[1, 5], [-1, 5], [1, -7], [-1, -7]]) {
      const f = new THREE.Group(); f.position.set(sx * 5.4, -0.6, z); g.add(f);
      f.add(new THREE.Mesh(tube([{ c: [0, 0, 0], ax: [sx, -0.2, -0.3], a: 1.6, b: 0.4 }, { c: [sx * 4, -1.2, -1.6], ax: [sx, -0.2, -0.5], a: 2.2, b: 0.3 }, { c: [sx * 7, -1.8, -3.4], ax: [sx, -0.1, -0.6], a: 1.2, b: 0.2 }], 10), skin));
      this.flips.push({ f, sx });
    }
    // tail with a great fish fin
    this.tail = new THREE.Group(); this.tail.position.set(0, 0.4, -14); g.add(this.tail);
    this.tail.add(new THREE.Mesh(tube([[0, 3.2, 2.6], [-6, 2.4, 2.0], [-12, 1.5, 1.3], [-16, 0.8, 0.7]].map(([z, a, b]) => ({ c: [0, 0, z], ax: [0, 0, -1], a, b })), 16), skin));
    const fin = new THREE.BufferGeometry(); fin.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -15, 0, 7, -24, 0, 1.5, -19, 0, 0, -15, 0, -1.5, -19, 0, -7, -24, 0, 1.5, -19, 0, -1.5, -19, 0, 0, -21], 3)); fin.computeVertexNormals();
    this.tail.add(new THREE.Mesh(fin, new THREE.MeshStandardMaterial({ color: 0x0f5e63, side: THREE.DoubleSide, roughness: 0.4, emissive: 0x00363a, emissiveIntensity: 0.6 })));
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    game.scene.add(g);
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 1400, 20, 1, true), beaconMat(0x26c6da)); this.beacon.position.set(this.center.x, 700, this.center.z); game.scene.add(this.beacon);
    this.setVisible(false);
  }
  setVisible(v) { this.obj.visible = v; this.beacon.visible = !v && !this.defeated; }
  home() { return { x: M.coastX(this.center.z) + 25, z: this.center.z }; }
  local(v) { return v.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).add(this.pos); }
  update(dt) {
    if (!this.active) return;
    this.t += dt; const P = this.game.playerPos(), pl = this.game.player;
    this.checkPhase();
    const toP = Math.atan2(P.x - this.pos.x, P.z - this.pos.z), dP = Math.hypot(P.x - this.pos.x, P.z - this.pos.z);
    const shoreX = M.coastX(this.pos.z), wantY = (x, z) => Math.max(M.groundAt(x, z) + 1.0, 0.5);
    let goal = null, sp = 10, ty = wantY(this.pos.x, this.pos.z), jaw = 0.1;
    switch (this.state) {
      case 'emerge': ty = 0.8; if (Math.random() < 0.8) burst('splash', this.pos.x + (Math.random() - 0.5) * 30, 0, this.pos.z + (Math.random() - 0.5) * 30, 20, 8); sp = 4; this.yaw = dampAngle(this.yaw, toP, 1, dt); if (this.t > 4.5) { this.state = 'roar'; this.t = 0; } break;
      case 'roar': jaw = 0.9; sp = 0; ty = 3.2; this.yaw = dampAngle(this.yaw, toP, 2, dt); if (Math.random() < 0.4) burst('splash', this.local(new THREE.Vector3(0, 2, 22)).x, 1, this.local(new THREE.Vector3(0, 2, 22)).z, 4, 3); if (this.t > 2.4) { this.state = 'swim'; this.t = 0; } break;
      case 'swim': {
        this.ang += dt * (0.12 + this.phase * 0.03); goal = this.center.clone().add(new THREE.Vector3(Math.sin(this.ang) * 130, 0, Math.cos(this.ang) * 200)); sp = 16 + this.phase * 4;
        if (this.t > 6.5 - this.phase) { const r = Math.random(); this.state = this.phase >= 2 && r < 0.35 ? 'dive' : r < 0.7 ? 'lunge' : 'spout'; this.t = 0; this.struck = false; }
        break;
      }
      case 'lunge': {
        // charge the player; beaches itself up to ~35 m onto the sand, bites, then slides back
        goal = new THREE.Vector3(Math.min(P.x, shoreX + 35), 0, P.z); sp = this.t < 0.8 ? 6 : 34; jaw = this.t > 0.8 ? 0.8 : 0.2;
        if ((dP < 16 || this.t > 4) && !this.struck) { this.struck = true; this.jawSnap = 0.25; sfx('boom', 0.8); burst('splash', this.pos.x, ty, this.pos.z, 40, 6); if (dP < 20 && pl.alive) pl.damage(42, { pos: this.pos }, 15, true); this.game.onExplosion(this.local(new THREE.Vector3(0, 0, 18)), 12); }
        if (this.struck && this.t > 5) { this.state = 'swim'; this.t = 0; }
        break;
      }
      case 'spout': {
        sp = 2; this.yaw = dampAngle(this.yaw, toP, 2, dt); jaw = 0.6;
        if (Math.floor(this.t * 2) !== this.lastShot && this.t < 3.5) { this.lastShot = Math.floor(this.t * 2); const from = this.local(new THREE.Vector3(0, 3, 27)); const tgt = P.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10)); const v = tgt.sub(from), T = Math.max(0.8, v.length() / 50); v.divideScalar(T); v.y += 0.5 * 20 * T; this.shots.push({ p: from, v, t: 0, dmg: 20, r: 8, fx: 'splash', down: false }); sfx('splash', 0.8); }
        if (this.t > 4.2) { this.state = 'swim'; this.t = 0; }
        break;
      }
      case 'dive': {
        // submerge, chase the player's position under water, then erupt beneath them
        if (this.t < 1.5) { ty = -14; sp = 6; } else if (this.t < 4.5) { ty = -14; goal = new THREE.Vector3(Math.min(P.x, shoreX + 10), 0, P.z); sp = 26; if (Math.random() < 0.6) burst('splash', this.pos.x + (Math.random() - 0.5) * 6, 0.2, this.pos.z + (Math.random() - 0.5) * 6, 3, 1.5); }
        else { ty = wantY(this.pos.x, this.pos.z) + 6; jaw = 0.9; if (!this.struck) { this.struck = true; burst('splash', this.pos.x, 0.5, this.pos.z, 90, 14); sfx('boom', 1); this.game.shake(1.2); if (dP < 18 && pl.alive) pl.damage(48, { pos: this.pos }, 18, true); } }
        if (this.t > 6) { this.state = 'swim'; this.t = 0; }
        break;
      }
      case 'stunned': ty = -0.4; sp = 0; jaw = 0.5; if (Math.random() < 0.2) burst('spark', this.pearl.getWorldPosition(new THREE.Vector3()).x, this.head.y + 3, this.head.z, 3, 1); if (this.t > 4.5) { this.state = 'swim'; this.t = 0; } break;
      case 'dying': ty = -20; sp = 3; jaw = 0.7; if (Math.random() < 0.6) burst('splash', this.pos.x + (Math.random() - 0.5) * 30, 0, this.pos.z + (Math.random() - 0.5) * 30, 10, 5); if (this.t > 7) this.finish(); break;
    }
    if (goal) { const ga = Math.atan2(goal.x - this.pos.x, goal.z - this.pos.z); this.yaw = dampAngle(this.yaw, ga, this.state === 'lunge' ? 3 : 1.4, dt); }
    this.speed = damp(this.speed, sp, 2, dt);
    const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt, nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
    if (this.state === 'lunge' || this.state === 'dive' || nx < M.coastX(nz) - 25) { this.pos.x = nx; this.pos.z = nz; }
    this.pos.x = Math.min(this.pos.x, M.coastX(this.pos.z) + 38);
    this.pos.y = damp(this.pos.y, ty, 2.2, dt);
    // animation: swimming undulation, paddling flippers, swishing tail, jaw
    const sw = Math.sin(this.t * (2 + this.speed * 0.08));
    this.obj.position.copy(this.pos); this.rear = damp(this.rear || 0, this.state === 'roar' ? -0.4 : this.state === 'lunge' && this.t > 0.8 ? -0.12 : 0, 3, dt); this.obj.rotation.set(this.rear, this.yaw + sw * 0.05, 0, 'YXZ');
    this.tail.rotation.y = sw * 0.45; for (const { f, sx } of this.flips) f.rotation.x = Math.sin(this.t * 3 + sx) * 0.5;
    this.jawSnap = Math.max(0, (this.jawSnap || 0) - dt); this.jaw.rotation.x = damp(this.jaw.rotation.x, this.jawSnap > 0 ? 0 : jaw, 7, dt);
    this.head.copy(this.local(new THREE.Vector3(0, 2, 16)));
    if (this.pos.y > -2 && this.speed > 5 && Math.random() < 0.5) burst('splash', this.pos.x, 0.2, this.pos.z, 4, 3);
    this.updateShots(dt);
    this.game.hud.boss(null, this.hp / this.hpMax);
  }
  ray(o, d, maxT) {
    if (!this.active || this.state === 'dying') return null;
    let best = null; const test = (c, r, part) => { const t = sphereHit(o, d, maxT, c, r); if (t >= 0 && (!best || t < best.t)) best = { t, part }; };
    test(this.pearl.getWorldPosition(new THREE.Vector3()), 2.2, 'pearl');
    test(this.local(new THREE.Vector3(0, 1.5, 18)), 4.5, 'head');
    for (let z = -12; z <= 10; z += 5) test(this.local(new THREE.Vector3(0, 0.8, z)), 5.5, 'body');
    return best;
  }
  meleeTest(pos, range) {
    if (!this.active || this.state === 'dying') return null;
    if (this.local(new THREE.Vector3(0, 1.5, 18)).distanceTo(pos) < 5 + range) return 'head';
    for (let z = -12; z <= 10; z += 5) if (this.local(new THREE.Vector3(0, 0.8, z)).distanceTo(pos) < 6 + range) return 'body';
    return null;
  }
  slamHit(P, r) { const part = this.meleeTest(P, r); if (part) { this.hurt(150, part); if (this.state !== 'dying') { this.state = 'stunned'; this.t = 0; } } }
}

// ================= RAKSHASA: the 25 m giant of the Ghats (horns, tusks, burning eyes, gold armour, mace) =================
export class Rakshasa extends BossBase {
  constructor(game) {
    const cx = 8420, cz = -3180;
    super(game, { name: 'Rakshasa', title: 'MAHA RAKSHASA — GIANT OF THE GHATS', subtitle: 'The demon king of the mountains', hpMax: 6500, color: '#ff7043', voice: 'Rakshasa',
      wakeLine: 'Two little humans climb my mountain? I will grind you into the stone!', deathLine: 'The mountain... falls... with me...', reward: 'flight',
      phase2Hint: 'The Rakshasa stomps — jump when the ground shakes!', mul: { gem: 3.5, head: 2, body: 1 }, weak: 'gem', showAsleep: true, center: new THREE.Vector3(cx, 0, cz) });
    this.S = 14; this.pos = new THREE.Vector3(cx, M.groundAt(cx, cz), cz); this.yaw = -Math.PI / 2; this.speed = 0;
    this.h = new Human({ skin: 0x34405e, top: 0x34405e, bottom: 0x6a0f12, shoes: 0x2a2018, sole: 0x1a1410, hair: 0x0a0806, hairStyle: 'long', beard: true, jacket: null, sleeves: 'short', denim: false, build: 1.18, eyes: 0xff3d00 }, 1);
    const R = this.obj = this.h.root; R.scale.setScalar(this.S); game.scene.add(R);
    const hb = this.h.bones.head, cb = this.h.bones.chest;
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.9, roughness: 0.3 }), horn2 = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.5 }), ivory = new THREE.MeshStandardMaterial({ color: 0xece0c4, roughness: 0.5 });
    // horns, tusks, crown, burning eyes (head bone space, human units)
    for (const sx of [-1, 1]) {
      const hm = new THREE.Mesh(horn([sx * 0.07, 0.17, 0.0], [sx * 0.7, 0.8, -0.2], 0.32, 0.035, 0.7, 8), horn2); hb.add(hm);
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.06, 6).translate(0, 0.03, 0), ivory); t.position.set(sx * 0.022, 0.03, 0.095); t.rotation.set(-0.3, 0, -sx * 0.25); hb.add(t);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff5722, emissive: 0xff3d00, emissiveIntensity: 6 })); e.position.set(sx * 0.034, 0.108, 0.098); hb.add(e);
    }
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.105, 0.06, 12, 1, true), gold); crown.position.set(0, 0.17, -0.005); hb.add(crown);
    for (let k = 0; k < 7; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.07, 4), gold); const a = (k / 7) * Math.PI * 2; sp.position.set(Math.sin(a) * 0.1, 0.23, Math.cos(a) * 0.1 - 0.005); hb.add(sp); }
    // gold jewellery: torque necklace with the heart gem (weak point), skull garland, belt, armbands, cuffs, spiked pauldrons
    const bn = this.h.bones, add = (bone, geo, mat, p, r) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (r) m.rotation.set(...r); bn[bone].add(m); return m; };
    add('chest', new THREE.TorusGeometry(0.095, 0.014, 8, 28), gold, [0, 0.19, 0.012], [Math.PI / 2 - 0.5, 0, 0]);
    add('chest', new THREE.TorusGeometry(0.115, 0.007, 6, 28, Math.PI), gold, [0, 0.17, 0.03], [0.35, 0, Math.PI]);
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.045).scale(0.8, 1.15, 0.6), new THREE.MeshStandardMaterial({ color: 0xff1744, emissive: 0xff1744, emissiveIntensity: 3, roughness: 0.1 })); this.gem.position.set(0, 0.07, 0.135); cb.add(this.gem);
    add('chest', new THREE.TorusGeometry(0.05, 0.01, 6, 20), gold, [0, 0.07, 0.125]);
    const skullG = new THREE.SphereGeometry(0.02, 8, 6).scale(0.9, 1, 0.85);
    for (let k = 0; k < 11; k++) { const a = -1.15 + (k / 10) * 2.3; add('chest', skullG, ivory, [Math.sin(a) * 0.15, 0.1 - Math.cos(a) * 0.09 + 0.04, 0.09 + Math.cos(a) * 0.03]); }
    add('hips', new THREE.TorusGeometry(0.165, 0.022, 8, 28).scale(1, 0.72, 1), gold, [0, 0.03, 0], [Math.PI / 2, 0, 0]);
    add('hips', new THREE.CylinderGeometry(0.045, 0.045, 0.014, 16), gold, [0, 0.03, 0.12], [Math.PI / 2, 0, 0]);
    add('hips', new THREE.OctahedronGeometry(0.02), this.gem.material, [0, 0.03, 0.13]);
    for (const sd of ['L', 'R']) {
      add('arm' + sd, new THREE.TorusGeometry(0.048, 0.011, 6, 18), gold, [0, -0.08, 0], [Math.PI / 2, 0, 0]);
      add('fore' + sd, new THREE.CylinderGeometry(0.042, 0.038, 0.07, 14, 1, true), gold, [0, -0.2, 0]);
    }
    for (const sx of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), gold); g.position.set(sx * 0.2, 0.16, 0); g.rotation.z = -sx * 0.35; cb.add(g);
      for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.08, 5), horn2); sp.position.set(sx * (0.2 + 0.03), 0.23, -0.04 + k * 0.04); sp.rotation.z = -sx * 0.6; cb.add(sp); }
    }
    // the mace (gada)
    const mace = new THREE.Group();
    mace.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.3, 8).translate(0, 0.45, 0), gold));
    const headG = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12).scale(1, 1.25, 1).translate(0, 1.15, 0), gold); mace.add(headG);
    for (let k = 0; k < 10; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5), gold); const a = (k / 10) * Math.PI * 2, b = (k % 2 ? 0.4 : -0.4); sp.position.set(Math.sin(a) * 0.16, 1.15 + b * 0.25, Math.cos(a) * 0.16); sp.lookAt(new THREE.Vector3(Math.sin(a), 1.15 + b, Math.cos(a))); sp.rotateX(Math.PI / 2); mace.add(sp); }
    mace.rotation.set(Math.PI / 2, 0, 0); mace.position.set(0, -0.08, 0.02);
    this.h.hold(mace); this.mace = mace;
    R.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1400, 20, 1, true), beaconMat(0xff7043)); this.beacon.position.set(cx, this.pos.y + 700, cz); game.scene.add(this.beacon);
    this.place(); this.h.snap(Pose.sit(false)); this.setVisible(true);
  }
  setVisible(v) { this.obj.visible = v || !this.defeated; this.beacon.visible = !this.active && !this.defeated; }
  home() { return { x: this.center.x - 120, z: this.center.z }; }
  place() { this.pos.y = M.groundAt(this.pos.x, this.pos.z); this.obj.position.copy(this.pos); this.obj.rotation.set(0, this.yaw, 0); }
  boneW(n) { return this.h.bones[n].getWorldPosition(new THREE.Vector3()); }
  update(dt) {
    // asleep: kneeling statue that wakes when the duo walks up to it
    if (!this.active) { if (!this.defeated && this.game.playerPos().distanceTo(this.pos) < 70) this.awaken(); return; }
    this.t += dt; const P = this.game.playerPos(), pl = this.game.player, S = this.S;
    this.checkPhase();
    const toP = Math.atan2(P.x - this.pos.x, P.z - this.pos.z), dP = Math.hypot(P.x - this.pos.x, P.z - this.pos.z);
    let pose = null, sp = 0, k = 6;
    switch (this.state) {
      case 'emerge': pose = blendPose(Pose.sit(false), Pose.idle(this.t), Math.min(1, this.t / 3)); this.yaw = dampAngle(this.yaw, toP, 0.8, dt); if (this.t > 1 && Math.random() < 0.3) burst('dust', this.pos.x + (Math.random() - 0.5) * 20, this.pos.y + 0.5, this.pos.z + (Math.random() - 0.5) * 20, 6, 4); if (this.t > 3.5) { this.state = 'roar'; this.t = 0; } break;
      case 'roar': pose = { ...Pose.idle(this.t), armL: [-2.4, 0, 0.6], armR: [-2.2, 0, -0.6], neck: [-0.5, 0, 0], head: [-0.4, 0, 0], spine: [-0.2, 0, 0] }; this.yaw = dampAngle(this.yaw, toP, 2, dt); if (this.t > 0.5 && this.t < 0.6) { sfx('roar', 1); this.game.shake(1.3); } if (this.t > 2.5) { this.state = 'walk'; this.t = 0; } break;
      case 'walk': {
        this.yaw = dampAngle(this.yaw, toP, 1.2, dt); sp = dP > 40 ? 9 + this.phase * 2 : 0;
        this.ph = (this.ph || 0) + dt * (sp > 0 ? 1.4 : 0); pose = sp > 0 ? Pose.locomotion(this.ph, 0.25) : Pose.idle(this.t);
        if (sp > 0 && Math.abs(Math.sin(this.ph)) < 0.06 && this.t - (this.lastStep || 0) > 0.4) { this.lastStep = this.t; this.game.shake(0.35); sfx('boom', 0.35, this.game.camDist(this.pos)); burst('dust', this.pos.x, this.pos.y + 0.3, this.pos.z, 12, 4); }
        if (this.t > 5 - this.phase * 0.8) { const r = Math.random(); this.state = dP > 110 ? (r < 0.6 ? 'throw' : 'charge') : r < 0.4 ? 'smash' : r < 0.75 ? 'stomp' : 'throw'; this.t = 0; this.done = false; if (this.state === 'smash') { this.smashAt = P.clone(); } }
        break;
      }
      case 'charge': { this.yaw = dampAngle(this.yaw, toP, 2.5, dt); sp = 26; this.ph = (this.ph || 0) + dt * 2.4; pose = Pose.locomotion(this.ph, 1.2); if (dP < 25 || this.t > 4) { this.state = 'smash'; this.t = 0; this.done = false; this.smashAt = P.clone(); } break; }
      case 'stomp': {
        // raise a foot, then stamp: ring shockwave (jump to dodge)
        pose = this.t < 1.1 ? { ...Pose.idle(this.t), thighR: [-1.5, 0, -0.1], shinR: [1.2, 0, 0], armL: [-0.8, 0, 0.6], armR: [-0.8, 0, -0.6] } : Pose.land(); k = this.t < 1.1 ? 4 : 14;
        if (this.t > 1.25 && !this.done) { this.done = true; this.shockwave(this.boneW('footR'), 30, 45); }
        if (this.t > 2.4) { this.state = 'walk'; this.t = 0; }
        break;
      }
      case 'smash': {
        // mace overhead, a warning ring on the ground, then the smash
        this.yaw = dampAngle(this.yaw, Math.atan2(this.smashAt.x - this.pos.x, this.smashAt.z - this.pos.z), 3, dt);
        pose = this.t < 1.3 ? { ...Pose.idle(this.t), armR: [-3.0, 0, -0.2], foreR: [-0.6, 0, 0], spine: [-0.25, 0, 0] } : { ...Pose.idle(this.t), armR: [-0.9, 0, -0.1], foreR: [0, 0, 0], spine: [0.55, 0, 0], chest: [0.3, 0, 0] }; k = this.t < 1.3 ? 3 : 18;
        if (this.t < 1.3 && Math.random() < 0.5) burst('spark', this.smashAt.x + (Math.random() - 0.5) * 24, M.groundAt(this.smashAt.x, this.smashAt.z) + 0.3, this.smashAt.z + (Math.random() - 0.5) * 24, 2, 0.5);
        if (this.t > 1.45 && !this.done) { this.done = true; const c = this.mace.localToWorld(new THREE.Vector3(0, 1.15, 0)); c.y = M.groundAt(c.x, c.z); this.shockwave(c, 16, 55); explosion(c.x, c.y + 1, c.z, 1.2); }
        if (this.t > 2.6) { this.state = 'walk'; this.t = 0; }
        break;
      }
      case 'throw': {
        // tears a boulder from the mountain and hurls it
        this.yaw = dampAngle(this.yaw, toP, 2, dt);
        pose = this.t < 1.2 ? { ...Pose.idle(this.t), armL: [-0.6, 0, 1.0], foreL: [-1.2, 0, 0], spine: [0.5, 0, 0] } : this.t < 1.8 ? { ...Pose.idle(this.t), armL: [-2.9, 0, 0.3], foreL: [-0.5, 0, 0], spine: [-0.3, 0, 0] } : { ...Pose.idle(this.t), armL: [-1.2, 0, 0.2], spine: [0.3, 0, 0] };
        if (this.t > 1.85 && !this.done) {
          this.done = true; const from = this.boneW('handL'); from.y += 4;
          const v = P.clone().sub(from), T = Math.max(1.2, v.length() / 55); v.divideScalar(T); v.y += 0.5 * 20 * T;
          const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(3.5, 1), new THREE.MeshStandardMaterial({ color: 0x6d5a48, roughness: 0.95, flatShading: true })); rock.castShadow = true; this.game.scene.add(rock);
          this.shots.push({ p: from, v, t: 0, dmg: 40, r: 10, fx: 'debris', boom: true, down: true, mesh: rock }); sfx('whoosh', 1);
        }
        if (this.t > 2.8) { this.state = 'walk'; this.t = 0; }
        break;
      }
      case 'stunned': pose = { ...Pose.idle(this.t), spine: [0.6, 0, 0], neck: [0.4, 0, 0], thighL: [-0.6, 0, 0], shinL: [1.2, 0, 0], hipY: -0.25 }; if (Math.random() < 0.2) burst('spark', this.head.x, this.head.y, this.head.z, 3, 2); if (this.t > 4) { this.state = 'walk'; this.t = 0; } break;
      case 'dying': pose = Pose.down(Math.min(1, this.t / 2)); k = 3; if (this.t > 1.6 && this.t < 1.7) { this.game.shake(1.5); sfx('boom', 1); burst('dust', this.pos.x, this.pos.y + 1, this.pos.z, 120, 12); } if (this.t > 6) this.finish(); break;
    }
    this.speed = damp(this.speed, sp, 2, dt);
    this.pos.x += Math.sin(this.yaw) * this.speed * dt; this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    this.place();
    this.h.apply(pose || Pose.idle(this.t), dt, k);
    this.head.copy(this.boneW('head')).add(new THREE.Vector3(0, 0.1 * S, 0));
    // body contact: being under its feet hurts
    if (this.speed > 3 && dP < 0.3 * S && pl.alive && !pl.vehicle && this.t - (this.lastTrample || 0) > 1) { this.lastTrample = this.t; pl.damage(25, { pos: this.pos }, 10, true); }
    this.updateShots(dt);
    this.game.hud.boss(null, this.hp / this.hpMax);
  }
  ray(o, d, maxT) {
    if (!this.active || this.state === 'dying') return null;
    const S = this.S; let best = null; const test = (c, r, part) => { const t = sphereHit(o, d, maxT, c, r); if (t >= 0 && (!best || t < best.t)) best = { t, part }; };
    test(this.gem.getWorldPosition(new THREE.Vector3()), 0.09 * S, 'gem');
    test(this.boneW('head').add(new THREE.Vector3(0, 0.1 * S, 0)), 0.15 * S, 'head');
    for (const [b, r] of [['chest', 0.24], ['spine', 0.2], ['hips', 0.2], ['thighL', 0.12], ['thighR', 0.12], ['shinL', 0.09], ['shinR', 0.09], ['armL', 0.08], ['armR', 0.08]]) test(this.boneW(b), r * S, 'body');
    return best;
  }
  meleeTest(pos, range) {
    if (!this.active || this.state === 'dying') return null;
    for (const b of ['shinL', 'shinR', 'footL', 'footR', 'thighL', 'thighR']) { const c = this.boneW(b); if (Math.hypot(c.x - pos.x, c.z - pos.z) < 0.12 * this.S + range && Math.abs(c.y - pos.y) < 0.35 * this.S) return 'body'; }
    if (this.head.distanceTo(pos) < 0.2 * this.S + range) return 'head';
    if (this.gem.getWorldPosition(new THREE.Vector3()).distanceTo(pos) < 0.12 * this.S + range) return 'gem';
    return null;
  }
  slamHit(P, r) { const part = this.meleeTest(P, r); if (part) { this.hurt(160, part); if (this.state !== 'dying' && Math.random() < 0.5) { this.state = 'stunned'; this.t = 0; } } }
  distTo(P) { return this.active ? Math.hypot(P.x - this.pos.x, P.z - this.pos.z) : 1e9; }
  target() { return this.boneW('chest'); }
}
