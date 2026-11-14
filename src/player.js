// Characters (heroes, companions, enemies share this), parkour, web-swing, combat, camera rig.
import * as THREE from 'three';
import * as M from './mapdata.js';
import { Human, Pose, blendPose, overlay, UPPER } from './human.js';
import { clamp, lerp, damp, angDiff, dampAngle } from './util.js';
import { burst, setWeb, fx } from './fx.js';
import { sfx } from './audio.js';

export const ATK = {
  jab: { dur: 0.3, hit: 0.45, dmg: 9, range: 1.75, kb: 2, next: 'cross' }, cross: { dur: 0.34, hit: 0.45, dmg: 13, range: 1.85, kb: 3, next: 'hook' },
  hook: { dur: 0.4, hit: 0.5, dmg: 16, range: 1.75, kb: 4, next: 'upper' }, upper: { dur: 0.5, hit: 0.5, dmg: 24, range: 1.7, kb: 6, down: true, next: 'jab' },
  kick: { dur: 0.48, hit: 0.5, dmg: 19, range: 2.15, kb: 6, next: 'round' }, round: { dur: 0.6, hit: 0.55, dmg: 28, range: 2.4, kb: 9, down: true, next: 'kick' },
  flykick: { dur: 0.55, hit: 0.4, dmg: 32, range: 2.5, kb: 11, down: true },
};
export const WEAPONS = [
  { id: 'fists', name: 'Fists' },
  { id: 'pistol', name: 'Pistol', dmg: 26, rate: 0.22, mag: 14, spread: 0.012, range: 160, sound: 'pistol' },
  { id: 'rifle', name: 'Assault Rifle', dmg: 19, rate: 0.085, mag: 32, spread: 0.02, range: 260, sound: 'rifle' },
];
function gunMesh(kind) {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, metalness: 0.7, roughness: 0.35 });
  if (kind === 'pistol') { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.2).translate(0, 0.02, 0.06), m)); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.045).translate(0, -0.04, -0.01), m)); }
  else { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.62).translate(0, 0.02, 0.18), m)); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.05).translate(0, -0.06, 0.08), m)); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.22).translate(0, 0.0, -0.18), new THREE.MeshStandardMaterial({ color: 0x5d4037 }))); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.04).translate(0, -0.06, 0.26).rotateX(0.3), m)); }
  g.rotation.set(-Math.PI / 2, 0, 0); g.position.set(0, -0.08, 0.03); return g;
}
function chuteMesh() {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(5, 16, 6, 0, Math.PI * 2, 0, 0.9); geo.scale(1.25, 0.5, 0.75);
  const col = []; const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const s = Math.floor((a + Math.PI) / (Math.PI / 5)) % 2; col.push(...(s ? [1, 0.45, 0.05] : [0.98, 0.95, 0.9])); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const c = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 })); c.position.y = 6.5; c.castShadow = true; g.add(c);
  const lp = []; for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; lp.push(0, 1.45, 0, Math.cos(a) * 5.5, 6.6, Math.sin(a) * 3.4); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xdddddd })));
  return g;
}

export class Character {
  constructor(game, look, opts = {}) {
    this.game = game; this.look = look; this.name = opts.name || 'NPC'; this.team = opts.team || 'civ';
    this.h = new Human(look, opts.detail ?? 1); this.obj = this.h.root; game.scene.add(this.obj);
    this.pos = new THREE.Vector3(opts.x || 0, 0, opts.z || 0); this.pos.y = M.groundAt(this.pos.x, this.pos.z) ;
    this.vel = new THREE.Vector3(); this.yaw = opts.yaw || 0; this.state = 'ground'; this.t = 0; this.ph = 0; this.spd = 0;
    this.maxHp = opts.hp || 100; this.hp = this.maxHp; this.armor = 0;
    this.runSpeed = opts.runSpeed || 5.4; this.sprintSpeed = opts.sprintSpeed || 8.6; this.jumpV = opts.jumpV || 7; this.climbSpeed = opts.climbSpeed || 3.4;
    this.powers = opts.powers ?? false; this.weapon = 0; this.ammo = { pistol: 60, rifle: 180 }; this.clip = { pistol: 14, rifle: 32 };
    this.atk = null; this.combo = null; this.comboT = 0; this.stun = 0; this.inv = 0; this.flipT = -1; this.usedFlip = false; this.landT = 0;
    this.vehicle = null; this.mount = null; this.anchor = null; this.ropeL = 0; this.webCd = 0; this.wall = null; this.busy = null;
    this.guns = { pistol: gunMesh('pistol'), rifle: gunMesh('rifle') };
    this.chute = chuteMesh(); this.chute.visible = false; this.obj.add(this.chute);
    this.lastStep = 0; this.dmgMul = opts.dmgMul || 1; this.radius = 0.35;
    this.sync();
  }
  get alive() { return this.state !== 'dead'; }
  forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  sync() {
    this.obj.position.copy(this.pos); this.obj.rotation.set(0, this.yaw, 0);
    const want = this.weapon === 1 ? this.guns.pistol : this.weapon === 2 ? this.guns.rifle : null;
    if (this.h.held !== want) this.h.hold(want);
  }
  setVisible(v) { this.obj.visible = v; }
  // ---------------- collision ----------------
  collide() {
    let wall = null; const r = this.radius;
    for (const ci of M.collidersNear(this.pos.x, this.pos.z)) {
      const c = M.colliders[ci];
      if (this.pos.y > c.y1 - 0.45 || this.pos.y + 1.75 < c.y0) continue;
      const px = clamp(this.pos.x, c.x0, c.x1), pz = clamp(this.pos.z, c.z0, c.z1);
      let dx = this.pos.x - px, dz = this.pos.z - pz, d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-5) { const l = this.pos.x - c.x0, rr = c.x1 - this.pos.x, b = this.pos.z - c.z0, f = c.z1 - this.pos.z, m = Math.min(l, rr, b, f); dx = m === l ? -1 : m === rr ? 1 : 0; dz = m === b ? -1 : m === f ? 1 : 0; this.pos.x += dx * (m + r); this.pos.z += dz * (m + r); }
      else { dx /= d; dz /= d; this.pos.x += dx * (r - d); this.pos.z += dz * (r - d); }
      const vn = this.vel.x * dx + this.vel.z * dz; if (vn < 0) { this.vel.x -= dx * vn; this.vel.z -= dz * vn; }
      if (!c.tree || this.powers) wall = { nx: dx, nz: dz, c };
    }
    if (this.game.interior && this.game.interior.active) this.game.interior.collide(this);
    this.pos.x = clamp(this.pos.x, -M.HALF + 2, M.HALF - 2); this.pos.z = clamp(this.pos.z, -M.HALF + 2, M.HALF - 2);
    return wall;
  }
  groundY() { return this.game.interior && this.game.interior.active ? this.game.interior.floorY : M.groundAt(this.pos.x, this.pos.z, this.pos.y, 0.7); }
  waterY() { return this.game.interior && this.game.interior.active ? -1e9 : M.waterLevelAt(this.pos.x, this.pos.z); }
  // ---------------- damage ----------------
  damage(n, from, kb = 0, down = false) {
    if (!this.alive || this.inv > 0 || this.state === 'seated') return;
    if (this.blocking && from && this.forward().dot(new THREE.Vector3().subVectors(from.pos, this.pos).normalize()) > 0.2) { n *= 0.2; kb *= 0.3; down = false; sfx('hit', 0.5); }
    if (this.armor > 0) { const a = Math.min(this.armor, n * 0.7); this.armor -= a; n -= a; }
    this.hp -= n; this.lastHit = this.game.time; this.atk = null;
    if (from) { const d = new THREE.Vector3().subVectors(this.pos, from.pos); d.y = 0; d.normalize(); this.vel.addScaledVector(d, kb); if (this.state === 'ground' && (down || kb > 5)) { this.vel.y = 2.5; } }
    burst('hit', this.pos.x, this.pos.y + 1.3, this.pos.z, 4);
    if (this.hp <= 0) { this.hp = 0; this.die(); return; }
    if (down) { this.state = 'down'; this.t = 0; this.downT = 1.6; } else this.stun = 0.35;
    this.game.onCharacterHurt(this, from);
  }
  die() {
    this.state = 'dead'; this.t = 0; this.atk = null; this.anchor = null; this.chute.visible = false;
    if (this.vehicle) this.game.ejectFrom(this.vehicle, true);
    this.game.onCharacterDied(this);
  }
  revive(x, z) { this.hp = this.maxHp; this.state = 'ground'; this.pos.set(x, M.groundAt(x, z), z); this.vel.set(0, 0, 0); this.stun = 0; this.inv = 2; this.setVisible(true); }
  // ---------------- main update ----------------
  update(dt, c) {
    this.t += dt; this.inv = Math.max(0, this.inv - dt); this.stun = Math.max(0, this.stun - dt); this.webCd = Math.max(0, this.webCd - dt); this.comboT = Math.max(0, this.comboT - dt);
    if (this.state === 'seated') { this.chute.visible = false; this.animate(dt, c); return; }
    const g = this.groundY(), wl = this.waterY();
    if (this.state === 'dead') { this.vel.multiplyScalar(Math.exp(-4 * dt)); this.pos.addScaledVector(this.vel, dt); this.pos.y = Math.max(g, this.pos.y + this.vel.y * dt); this.animate(dt, c); this.sync(); return; }
    if (this.busy) { this.busy.t += dt; if (this.busy.t > this.busy.dur) { const b = this.busy; this.busy = null; b.done && b.done(); } this.vel.set(0, 0, 0); this.animate(dt, c); this.sync(); return; }
    const canAct = this.stun <= 0 && this.state !== 'down';
    // --- desired horizontal velocity ---
    const mv = c.move || new THREE.Vector3(), mag = Math.min(1, mv.length());
    let want = 0;
    if (canAct && mag > 0.05) want = (c.sprint ? this.sprintSpeed : mag > 0.6 ? this.runSpeed : 2.0 + mag * 3) * (this.atk ? 0.15 : 1) * (c.aim ? 0.55 : 1);
    // Flash Speed power: lightning-fast running with an afterimage trail
    if (this.flash > 0) { this.flash -= dt; want *= 4.2; if (want > 1 && Math.random() < 0.8) burst('spark', this.pos.x, this.pos.y + 0.6 + Math.random() * 1.0, this.pos.z, 2, 0.6); if (this.flash <= 0) this.game.onPowerEnd && this.game.onPowerEnd(this, 'flash'); }
    const dir = mag > 0.05 ? mv.clone().normalize() : this.forward();
    switch (this.state) {
      case 'ground': {
        const k = this.atk ? 3 : 12;
        this.vel.x = damp(this.vel.x, dir.x * want, k, dt); this.vel.z = damp(this.vel.z, dir.z * want, k, dt);
        if (c.aim || c.face) this.yaw = dampAngle(this.yaw, c.faceYaw ?? c.camYaw, 16, dt);
        else if (mag > 0.05 && !this.atk) this.yaw = dampAngle(this.yaw, Math.atan2(dir.x, dir.z), 11, dt);
        this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
        const wall = this.collide(); this.wall = wall;
        const ng = this.groundY();
        if (ng < this.pos.y - 0.75) { this.state = 'air'; this.vel.y = 0; this.usedFlip = false; }
        else this.pos.y = ng;
        if (this.pos.y < wl - 1.25) { this.toSwim(wl); break; }
        if (canAct && c.jump) {
          if (wall && this.tryMantle(wall)) break;
          if (wall && this.powers && this.wallTop(wall) - this.pos.y > 2.0) { this.startClimb(wall); break; }
          this.vel.y = this.jumpV * (c.sprint && this.powers ? 1.45 : 1); this.state = 'air'; this.usedFlip = false; this.airT = 0; sfx('whoosh', 0.4);
          if (mag > 0.3) { this.vel.x += dir.x * 1.5; this.vel.z += dir.z * 1.5; }
        }
        if (canAct && c.sprint && wall && mag > 0.5 && this.powers && this.wallTop(wall) - this.pos.y > 2.0 && dir.x * -wall.nx + dir.z * -wall.nz > 0.6) this.startClimb(wall);
        if (canAct && c.webPress && this.powers && this.webCd <= 0) { this.vel.y = this.jumpV * 1.35; this.state = 'air'; this.usedFlip = false; this.airT = 0; this.webAuto = 0.22; sfx('whoosh', 0.5); break; }
        if (canAct && c.roll && this.landT <= 0) { this.state = 'roll'; this.t = 0; this.inv = 0.5; this.vel.x = dir.x * 9; this.vel.z = dir.z * 9; this.yaw = Math.atan2(dir.x, dir.z); }
        this.landT = Math.max(0, this.landT - dt);
        const sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp > 1 && this.t - this.lastStep > 2.2 / Math.max(sp, 1)) { this.lastStep = this.t; if (this === this.game.player) sfx('step', clamp(sp / 8, 0.3, 1)); if (sp > 7 && Math.random() < 0.3) burst('dust', this.pos.x, this.pos.y + 0.05, this.pos.z, 1, 0.5); }
        break;
      }
      case 'air': {
        this.airT = (this.airT || 0) + dt;
        const ac = this.powers ? 9 : 4;
        this.vel.x += (dir.x * want - this.vel.x) * Math.min(1, ac * dt * 0.3); this.vel.z += (dir.z * want - this.vel.z) * Math.min(1, ac * dt * 0.3);
        this.vel.y -= 21 * dt;
        if (mag > 0.05) this.yaw = dampAngle(this.yaw, Math.atan2(dir.x, dir.z), 5, dt);
        this.pos.addScaledVector(this.vel, dt);
        const wall = this.collide();
        if (this.flipT >= 0) { this.flipT += dt / 0.6; if (this.flipT >= 1) this.flipT = -1; }
        if (canAct && c.jump && !this.usedFlip && this.powers && !wall) { this.usedFlip = true; this.vel.y = Math.max(this.vel.y, 6.5); this.flipT = 0; sfx('whoosh', 0.6); }
        else if (canAct && wall && (c.jump || (c.sprint && mag > 0.5)) && this.powers && this.wallTop(wall) - this.pos.y > 1.2 && this.airT > 0.1) { if (!this.tryMantle(wall)) this.startClimb(wall); break; }
        else if (canAct && wall && c.jump && this.tryMantle(wall)) break;
        if (canAct && c.attack && !this.atk && this.vel.y < 3) this.startAttack('flykick');
        if (this.webAuto > 0) { this.webAuto -= dt; if (this.webAuto <= 0 && this.powers && this.startWeb({ ...c, web: true, webPress: true })) break; }
        if (canAct && (c.web || c.webPress) && this.powers && this.webCd <= 0 && this.startWeb(c)) break;
        const ng = this.groundY();
        if (canAct && c.chute && this.pos.y - ng > 18) { this.state = 'glide'; this.t = 0; sfx('whoosh', 0.8); break; }
        if (this.pos.y < wl - 0.4 && wl > ng + 1.3) { this.toSwim(wl); burst('splash', this.pos.x, wl, this.pos.z, 20, 1.2); sfx('splash'); break; }
        if (this.pos.y <= ng) this.land(ng);
        break;
      }
      case 'climb': this.updClimb(dt, c, dir, mag); break;
      case 'mantle': case 'vault': {
        this.t += 0; this.mt += dt / this.mdur; const k = Math.min(1, this.mt);
        this.pos.lerpVectors(this.mFrom, this.mTo, k); this.pos.y = lerp(this.mFrom.y, this.mTo.y, Math.min(1, k * 1.6)) + Math.sin(k * Math.PI) * 0.3;
        if (k >= 1) { this.state = 'ground'; this.vel.set(0, 0, 0); this.pos.copy(this.mTo); }
        break;
      }
      case 'roll': {
        this.t2 = (this.t2 || 0) + dt; this.vel.multiplyScalar(Math.exp(-1.5 * dt)); this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.collide(); this.pos.y = this.groundY();
        if (this.t2 > 0.62) { this.t2 = 0; this.state = 'ground'; }
        break;
      }
      case 'swim': {
        this.vel.x = damp(this.vel.x, dir.x * (want ? (c.sprint ? 3.8 : 2.4) : 0), 3, dt); this.vel.z = damp(this.vel.z, dir.z * (want ? (c.sprint ? 3.8 : 2.4) : 0), 3, dt);
        if (mag > 0.05) this.yaw = dampAngle(this.yaw, Math.atan2(dir.x, dir.z), 4, dt);
        this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.collide();
        const wl2 = this.waterY(), ng = this.groundY();
        this.pos.y = damp(this.pos.y, wl2 - 1.25 + Math.sin(this.t * 2) * 0.05, 6, dt);
        if (ng > wl2 - 1.1 || ng > this.pos.y + 0.2) { this.state = 'ground'; this.pos.y = Math.max(ng, this.pos.y); }
        if (canAct && c.jump && ng > wl2 - 2.0) { this.state = 'air'; this.vel.y = 6; }
        if (Math.random() < dt * 3 * Math.min(1, Math.hypot(this.vel.x, this.vel.z))) burst('splash', this.pos.x, wl2, this.pos.z, 1, 0.4);
        break;
      }
      case 'glide': {
        // wing-suit dive: fast forward, steady descent
        const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        this.yaw -= (c.turn ?? 0) * 1.4 * dt; if (mag > 0.05) this.yaw = dampAngle(this.yaw, Math.atan2(dir.x, dir.z), 1.6, dt);
        const pitchIn = c.dive || 0;
        this.vel.x = damp(this.vel.x, f.x * (30 + pitchIn * 12), 1.5, dt); this.vel.z = damp(this.vel.z, f.z * (30 + pitchIn * 12), 1.5, dt); this.vel.y = damp(this.vel.y, -11 - pitchIn * 10, 2, dt);
        this.pos.addScaledVector(this.vel, dt); this.collide();
        const ng = this.groundY();
        if (c.chute && this.t > 0.4) { this.state = 'chute'; this.t = 0; this.chute.visible = true; sfx('whoosh', 1); this.vel.y = -2; }
        if (canAct && (c.web || c.webPress) && this.powers && this.webCd <= 0 && this.startWeb(c)) break;
        if (this.pos.y <= ng + 0.2) this.land(ng);
        if (this.pos.y < wl - 0.3) { this.toSwim(wl); }
        break;
      }
      case 'chute': {
        const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        if (mag > 0.05) this.yaw = dampAngle(this.yaw, Math.atan2(dir.x, dir.z), 1.2, dt);
        const brake = c.down ? 1 : 0;
        this.vel.x = damp(this.vel.x, f.x * (9 - brake * 5), 1.5, dt); this.vel.z = damp(this.vel.z, f.z * (9 - brake * 5), 1.5, dt); this.vel.y = damp(this.vel.y, -3.4 - brake * 1.5, 2, dt);
        this.pos.addScaledVector(this.vel, dt); this.collide();
        this.chute.rotation.z = damp(this.chute.rotation.z, -(c.turn || 0) * 0.3, 3, dt);
        const ng = this.groundY();
        if (this.pos.y <= ng + 0.05) { this.chute.visible = false; this.land(ng); }
        if (this.pos.y < wl - 0.3) { this.chute.visible = false; this.toSwim(wl); }
        if (c.cutChute) { this.chute.visible = false; this.state = 'air'; }
        break;
      }
      case 'web': this.updWeb(dt, c, dir, mag); break;
      case 'fly': {
        // Flight power: fly where the camera points; Space climbs, Shift boosts, landing is automatic
        const aim = c.aimDir || this.forward(), boost = c.sprint ? 1 : 0;
        const tgt = new THREE.Vector3();
        if (mag > 0.05) { tgt.copy(dir).multiplyScalar(mag); if (c.aimDir) tgt.y = c.aimDir.y * mag * 1.2; }
        if (c.up) tgt.y += 0.8; if (c.down) tgt.y -= 0.8;
        const speed = boost ? 62 : 22;
        this.vel.x = damp(this.vel.x, tgt.x * speed, 2.2, dt); this.vel.y = damp(this.vel.y, tgt.y * speed + Math.sin(this.t * 2) * 0.3, 2.2, dt); this.vel.z = damp(this.vel.z, tgt.z * speed, 2.2, dt);
        if (mag > 0.05) this.yaw = dampAngle(this.yaw, Math.atan2(dir.x, dir.z), 4, dt);
        this.pos.addScaledVector(this.vel, dt); this.collide();
        const ng = this.groundY();
        if (this.pos.y < ng + 0.05) { this.pos.y = ng; if (this.vel.y < -1 && mag < 0.1) { this.state = 'ground'; this.landT = 0.25; } }
        if (this.pos.y < wl - 0.6) this.pos.y = wl - 0.6;
        if (boost && Math.hypot(this.vel.x, this.vel.z) > 30 && Math.random() < 0.6) burst('steam', this.pos.x - this.vel.x * 0.05, this.pos.y + 0.6, this.pos.z - this.vel.z * 0.05, 1, 0.5);
        break;
      }
      case 'slam': {
        // Thunder Slam: dive straight down, shockwave on impact
        this.slamT = (this.slamT || 0) + dt;
        if (this.slamT < 0.35 && this.slamUp) { this.vel.y = 16; } else { this.vel.y = Math.min(this.vel.y - 60 * dt, -38); }
        this.vel.x *= Math.exp(-2 * dt); this.vel.z *= Math.exp(-2 * dt);
        this.pos.addScaledVector(this.vel, dt); this.collide();
        const ng = this.groundY();
        if (this.pos.y <= ng) { this.pos.y = ng; this.state = 'ground'; this.landT = 0.45; this.vel.set(0, 0, 0); this.game.slamImpact && this.game.slamImpact(this); }
        if (this.pos.y < wl - 0.4) { this.toSwim(wl); this.game.slamImpact && this.game.slamImpact(this); }
        break;
      }
      case 'down': {
        this.downT -= dt; this.vel.x *= Math.exp(-5 * dt); this.vel.z *= Math.exp(-5 * dt); this.vel.y -= 20 * dt;
        this.pos.addScaledVector(this.vel, dt); this.collide(); const ng = this.groundY(); if (this.pos.y < ng) { this.pos.y = ng; this.vel.y = 0; }
        if (this.downT <= 0) { this.state = 'ground'; this.inv = 0.6; }
        break;
      }
    }
    // --- combat ---
    this.blocking = canAct && c.aim && this.weapon === 0 && this.state === 'ground';
    if (canAct && (this.state === 'ground' || this.state === 'air')) {
      if (c.weaponNext) { this.weapon = (this.weapon + 1) % WEAPONS.length; sfx('ui'); }
      if (c.setWeapon !== undefined) this.weapon = c.setWeapon;
      if (this.weapon === 0 || this.state === 'air') {
        if (c.attack && this.state === 'ground') this.queueAttack(this.combo && this.comboT > 0 ? ATK[this.combo].next : 'jab');
        if (c.kick && this.state === 'ground') this.queueAttack(this.combo === 'kick' && this.comboT > 0 ? 'round' : 'kick');
      } else if (c.fire || c.attack) this.fireGun(c);
    }
    if (this.atk) {
      this.atk.t += dt; const A = ATK[this.atk.id];
      if (!this.atk.done && this.atk.t >= A.dur * A.hit) { this.atk.done = true; this.game.meleeHit(this, A); }
      if (this.atk.t >= A.dur) { const nx = this.atk.queued; this.combo = this.atk.id; this.comboT = 0.45; this.atk = null; if (nx) this.startAttack(nx); }
    }
    this.animate(dt, c);
    this.chute.visible = this.state === 'chute';
    this.sync();
  }
  queueAttack(id) { if (!this.atk) this.startAttack(id); else if (this.atk.t > ATK[this.atk.id].dur * 0.45) this.atk.queued = id; }
  startAttack(id) {
    const tgt = this.game.nearestFoe(this, 4.5);
    if (tgt) this.yaw = Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z);
    this.atk = { id, t: 0, done: false }; sfx('whoosh', 0.5, this.game.camDist(this.pos));
    if (id === 'flykick') { const f = this.forward(); this.vel.x = f.x * 9; this.vel.z = f.z * 9; }
    else if (tgt && tgt.pos.distanceTo(this.pos) > 1.4) { const f = this.forward(); this.vel.x += f.x * 4; this.vel.z += f.z * 4; }
  }
  fireGun(c) {
    const W = WEAPONS[this.weapon]; if (this.t < (this.nextShot || 0)) return;
    if (this.clip[W.id] <= 0) { if (this.ammo[W.id] > 0) { const n = Math.min(W.mag, this.ammo[W.id]); this.clip[W.id] = n; this.ammo[W.id] -= n; this.nextShot = this.t + 1.2; sfx('ui', 0.6); } return; }
    this.clip[W.id]--; this.nextShot = this.t + W.rate;
    this.game.shoot(this, W, c);
  }
  land(ng) {
    const vy = this.vel.y; this.pos.y = ng; this.vel.y = 0; this.flipT = -1; this.anchor = null; setWeb(null);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (vy < -13) {
      if (sp > 4 || this.powers) { this.state = 'roll'; this.t2 = 0; this.inv = 0.4; burst('dust', this.pos.x, this.pos.y, this.pos.z, 8, 1); }
      else { this.state = 'ground'; this.landT = 0.35; }
      if (!this.powers && vy < -17) this.damage((-vy - 17) * 7, null);
      else if (this.powers && vy < -32) this.damage((-vy - 32) * 4, null);
      if (this === this.game.player) { sfx('step', 1); this.game.shake(clamp(-vy / 60, 0, 0.5)); }
    } else this.state = 'ground';
  }
  toSwim(wl) { this.state = 'swim'; this.vel.y = 0; this.pos.y = wl - 1.25; this.anchor = null; setWeb(null); this.chute.visible = false; }
  wallTop(w) { return w.c.y1; }
  tryMantle(w) {
    const top = w.c.y1, h = top - this.pos.y;
    if (h < 0.4 || h > (this.powers ? 2.4 : 1.9) || w.c.noTop) return false;
    const thick = Math.min(w.c.x1 - w.c.x0, w.c.z1 - w.c.z0);
    this.mFrom = this.pos.clone();
    const into = new THREE.Vector3(-w.nx, 0, -w.nz);
    if (thick < 2.2 && h < 1.4) { this.mTo = this.pos.clone().addScaledVector(into, thick + 1.2); this.mTo.y = this.groundYAt(this.mTo, top); this.state = 'vault'; this.mdur = 0.45; }
    else { this.mTo = this.pos.clone().addScaledVector(into, 0.9); this.mTo.y = top; this.state = 'mantle'; this.mdur = 0.5; }
    this.mt = 0; this.yaw = Math.atan2(into.x, into.z); this.vel.set(0, 0, 0); sfx('whoosh', 0.4);
    return true;
  }
  groundYAt(p, y) { return M.groundAt(p.x, p.z, y + 1, 1.5); }
  startClimb(w) { this.state = 'climb'; this.wallN = new THREE.Vector2(w.nx, w.nz); this.wallC = w.c; this.vel.set(0, 0, 0); this.yaw = Math.atan2(-w.nx, -w.nz); this.climbPh = 0; this.anchor = null; setWeb(null); }
  updClimb(dt, c, dir, mag) {
    const n = this.wallN, cc = this.wallC;
    const up = clamp((c.climbUp ?? (mag > 0.05 ? (dir.x * -n.x + dir.z * -n.y) : 0)), -1, 1);
    const side = mag > 0.05 ? (dir.x * -n.y + dir.z * n.x) : 0; // tangent
    const sp = this.climbSpeed * (c.sprint ? 1.5 : 1);
    this.pos.y += up * sp * dt; this.pos.x += -n.y * side * sp * 0.6 * dt; this.pos.z += n.x * side * sp * 0.6 * dt;
    this.climbPh += (Math.abs(up) + Math.abs(side)) * dt * 6;
    // stick to wall surface
    const px = clamp(this.pos.x, cc.x0, cc.x1), pz = clamp(this.pos.z, cc.z0, cc.z1);
    this.pos.x = px + n.x * (this.radius + 0.02); this.pos.z = pz + n.y * (this.radius + 0.02);
    if (this.pos.x < cc.x0 - 0.5 || this.pos.x > cc.x1 + 0.5 || this.pos.z < cc.z0 - 0.5 || this.pos.z > cc.z1 + 0.5) { this.state = 'air'; return; }
    if (this.pos.y > cc.y1 - 1.5 && up > 0) { this.mFrom = this.pos.clone(); this.mTo = this.pos.clone().add(new THREE.Vector3(-n.x * 0.9, 0, -n.y * 0.9)); this.mTo.y = cc.y1; this.state = 'mantle'; this.mt = 0; this.mdur = 0.55; return; }
    const ng = this.groundY(); if (this.pos.y <= ng && up < 0) { this.pos.y = ng; this.state = 'ground'; return; }
    if (c.jump) { this.state = 'air'; this.vel.set(n.x * 6.5, 7.5, n.y * 6.5); this.yaw = Math.atan2(n.x, n.y); this.usedFlip = false; sfx('whoosh', 0.6); }
    if ((c.web || c.webPress) && this.webCd <= 0) { this.state = 'air'; this.vel.set(n.x * 4, 3, n.y * 4); this.startWeb(c); }
  }
  // ---------- web swing ----------
  findAnchor(c) {
    const f = c.aimDir ? new THREE.Vector3(c.aimDir.x, 0, c.aimDir.z).normalize() : this.forward();
    const target = this.pos.clone().addScaledVector(f, 26); target.y += 22;
    let best = null, bs = -1e9;
    for (let gx = -2; gx <= 2; gx++) for (let gz = -2; gz <= 2; gz++) {
      for (const ci of M.collidersNear(target.x + gx * 40, target.z + gz * 40)) {
        const cc = M.colliders[ci]; if (cc.y1 < this.pos.y + 7) continue;
        const ax = clamp(target.x, cc.x0, cc.x1), az = clamp(target.z, cc.z0, cc.z1), ay = Math.min(cc.y1, this.pos.y + 45);
        const d = Math.hypot(ax - this.pos.x, ay - this.pos.y, az - this.pos.z); if (d > 70 || d < 8) continue;
        const ahead = (ax - this.pos.x) * f.x + (az - this.pos.z) * f.z; if (ahead < 2) continue;
        const s = ahead * 1.0 + (ay - this.pos.y) * 0.6 - Math.abs(d - 30) * 0.5;
        if (s > bs) { bs = s; best = new THREE.Vector3(ax, ay, az); }
      }
    }
    return best;
  }
  startWeb(c) {
    const a = this.findAnchor(c); if (!a) return false;
    this.anchor = a; this.ropeL = a.distanceTo(this.pos) * 0.92; this.state = 'web'; this.webCd = 0.25; sfx('web', 0.9);
    const f = this.forward(); this.vel.x += f.x * 4; this.vel.z += f.z * 4; return true;
  }
  updWeb(dt, c, dir, mag) {
    const a = this.anchor; if (!a) { this.state = 'air'; return; }
    this.vel.y -= 21 * dt;
    if (mag > 0.05) { this.vel.x += dir.x * 9 * dt; this.vel.z += dir.z * 9 * dt; }
    this.ropeL = Math.max(6, this.ropeL - (c.sprint ? 6 : 2.5) * dt);
    this.pos.addScaledVector(this.vel, dt);
    const d = new THREE.Vector3().subVectors(this.pos, a), L = d.length();
    if (L > this.ropeL) { d.multiplyScalar(1 / L); this.pos.copy(a).addScaledVector(d, this.ropeL); const vr = this.vel.dot(d); if (vr > 0) this.vel.addScaledVector(d, -vr); }
    const hv = Math.hypot(this.vel.x, this.vel.z); if (hv > 0.5) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 6, dt);
    this.collide();
    const hand = this.h.bones.handR.getWorldPosition(new THREE.Vector3()); setWeb(hand, a);
    const ng = this.groundY();
    const release = !(c.web) || this.pos.y > a.y - 1.0;
    if (release) { this.anchor = null; setWeb(null); this.state = 'air'; this.vel.y += 4.5; this.usedFlip = false; this.airT = 0.2; const vv = this.vel.length(); if (vv > 45) this.vel.multiplyScalar(45 / vv); }
    else if (this.pos.y <= ng) { this.anchor = null; setWeb(null); this.land(ng); }
  }
  // ---------- animation ----------
  animate(dt, c) {
    const H = this.h; let P;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.state === 'seated') P = this.seatPose ? this.seatPose(this.t) : Pose.sit(true);
    else if (this.busy) P = this.busy.pose(this.busy.t);
    else switch (this.state) {
      case 'ground': {
        if (this.landT > 0) { P = Pose.land(); break; }
        if (sp < 0.3) P = Pose.idle(this.t, this.pos.x);
        else { const rs = sp < 2.6 ? sp / 2.6 * 0.15 : sp < 6 ? lerp(0.15, 1, (sp - 2.6) / 3.4) : 1 + (sp - 6) / 5; this.ph += dt * (sp < 2.6 ? sp * 2.9 : 7 + sp * 0.75); P = Pose.locomotion(this.ph, rs); }
        if (this.blocking) P = overlay(P, Pose.attack('block', 1), UPPER);
        break;
      }
      case 'air': P = this.flipT >= 0 ? Pose.flip(this.flipT) : Pose.jump(this.vel.y > 0); break;
      case 'climb': P = Pose.climb(this.climbPh); break;
      case 'mantle': P = Pose.mantle(this.mt); break;
      case 'vault': P = Pose.vault(this.mt); break;
      case 'roll': P = Pose.roll(Math.min(1, (this.t2 || 0) / 0.62)); break;
      case 'swim': this.ph += dt * (sp > 0.3 ? 4 : 2); P = Pose.swim(this.ph, sp > 0.5); break;
      case 'glide': P = Pose.skydive(this.t); break;
      case 'chute': P = Pose.chute(this.t); break;
      case 'web': { const sw = clamp(this.vel.y / 15, -1, 1); P = Pose.web(this.t, sw); break; }
      case 'fly': P = sp > 4 ? Pose.fly(this.t, sp > 35) : Pose.hover(this.t); break;
      case 'slam': P = Pose.slam(Math.min(1, (this.slamT || 0) / 0.5)); break;
      case 'down': P = Pose.down(Math.min(1, (1.6 - this.downT) * 4)); if (this.downT < 0.5) P = blendPose(P, Pose.idle(0), 1 - this.downT / 0.5); break;
      case 'dead': P = Pose.down(Math.min(1, this.t * 3)); break;
      default: P = Pose.idle(this.t);
    }
    if (this.atk && (this.state === 'ground' || this.state === 'air')) { const A = ATK[this.atk.id]; P = Pose.attack(this.atk.id, this.atk.t / A.dur); }
    else if (this.weapon > 0 && (this.state === 'ground' || this.state === 'air') && (c && (c.aim || c.fire || c.attack) || this.t - (this.nextShot || -9) < 1.5)) P = overlay(P, Pose.aim(c && c.pitch ? c.pitch : 0, this.weapon === 2), UPPER);
    if (this.stun > 0) P = blendPose(P, Pose.hit(this.stun / 0.35), 0.6);
    H.apply(P, dt, this.state === 'roll' || this.flipT >= 0 || this.atk ? 26 : this.state === 'dead' ? 8 : 13);
    // tilt body into swings / glide
    if (this.state === 'glide') this.obj.rotation.x = 0;
  }
  remove() { this.game.scene.remove(this.obj); }
}

// ---------------- camera rig ----------------
export class CameraRig {
  constructor(cam) { this.cam = cam; this.yaw = Math.PI; this.pitch = 0.18; this.dist = 4.3; this.target = new THREE.Vector3(); this.pos = new THREE.Vector3(); this.idle = 0; this.fov = 62; this.zoom = 1; }
  update(dt, look, focus, mode, opts = {}) {
    const lx = look.x, ly = look.y; this.idle = Math.abs(lx) + Math.abs(ly) > 0.0005 ? 0 : this.idle + dt;
    this.yaw -= lx; this.pitch = clamp(this.pitch + ly, -1.25, 1.35);
    if (opts.followYaw !== undefined && this.idle > 1.0) this.yaw = dampAngle(this.yaw, opts.followYaw + Math.PI, opts.followK ?? 2.2, dt);
    if (opts.followPitch !== undefined && this.idle > 1.0) this.pitch = damp(this.pitch, opts.followPitch, 1.5, dt);
    const cfg = { foot: [4.2, 1.55, 0.42, 62], aim: [2.1, 1.6, 0.62, 48], car: [opts.len ? opts.len * 1.15 + 3 : 7.5, 1.9, 0, 64], heli: [17, 3, 0, 62], plane: [opts.len ? opts.len * 1.6 : 26, 3.5, 0, 65], horse: [5.8, 2.3, 0.3, 62], swim: [4.4, 0.6, 0.3, 62], air: [6, 1.4, 0, 70], interior: [4.2, 1.5, 0.3, 66], boat: [10, 2.6, 0, 62] }[mode] || [4.2, 1.5, 0.4, 62];
    this.dist = damp(this.dist, cfg[0] * this.zoom, 5, dt);
    const fovT = cfg[3] + (opts.speedFov || 0); this.fov = damp(this.fov, fovT, 4, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
    this.target.lerp(new THREE.Vector3(focus.x, focus.y + cfg[1], focus.z), 1 - Math.exp(-(mode === 'plane' || mode === 'car' ? 18 : 14) * dt));
    if (this.target.distanceTo(focus) > 60) this.target.set(focus.x, focus.y + cfg[1], focus.z);
    const cp = Math.cos(this.pitch), dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const base = this.target.clone().addScaledVector(right, cfg[2]);
    // collision: march out from target
    let d = this.dist; const step = 0.35;
    if (!opts.noCollide) for (let s = 0.5; s <= this.dist; s += step) {
      const p = base.clone().addScaledVector(dir, s);
      if (p.y < M.terrainH(p.x, p.z) + 0.4 && !opts.interior) { d = Math.max(0.6, s - step); break; }
      let blocked = false;
      for (const ci of M.collidersNear(p.x, p.z)) { const c = M.colliders[ci]; if (c.tree) continue; if (p.x > c.x0 - 0.2 && p.x < c.x1 + 0.2 && p.z > c.z0 - 0.2 && p.z < c.z1 + 0.2 && p.y > c.y0 - 0.2 && p.y < c.y1 + 0.2) { blocked = true; break; } }
      if (opts.interior && opts.interior.blocks(p)) blocked = true;
      if (blocked) { d = Math.max(0.5, s - step); break; }
    }
    this.curD = damp(this.curD ?? d, d, d < (this.curD ?? d) ? 30 : 4, dt);
    this.pos.copy(base).addScaledVector(dir, this.curD);
    const sh = fx.shake; if (sh > 0) this.pos.add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    this.cam.position.copy(this.pos);
    this.cam.lookAt(base);
    if (opts.roll) this.cam.rotateZ(opts.roll);
  }
  get forward() { const cp = Math.cos(this.pitch); return new THREE.Vector3(-Math.sin(this.yaw) * cp, -Math.sin(this.pitch), -Math.cos(this.yaw) * cp); }
}
