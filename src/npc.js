// NPC brains: gang members, police (wanted system), knocked-down civilians.
import * as THREE from 'three';
import * as M from './mapdata.js';
import { Character, WEAPONS } from './player.js';
import { randomLook } from './human.js';
import { setAlive, lookOf } from './crowd.js';
import { clamp, angDiff, mulberry32 } from './util.js';
import { sfx, say } from './audio.js';

const GANG_LINES = ['Arre! Who are these two?', 'Get them!', 'This is Kaala Naag territory!', 'You picked the wrong dock, hero!', 'Boss said no visitors!'];
const POLICE_LINES = ['Daman Police! Stop right there!', 'Hands up!', 'Rukk jao! Stop!', 'Backup requested near your location!'];
export class NPCs {
  constructor(game) { this.game = game; this.enemies = []; this.civs = []; this.wanted = 0; this.calm = 0; this.rng = mulberry32(55); this.gangRespawn = 0; }
  spawnEnemy(team, x, z, opts = {}) {
    const r = this.rng;
    const look = team === 'police' ? { skin: [0xc68642, 0x8d5524, 0xa86b3c, 0xe0ac69][Math.floor(r() * 4)], top: 0xb39a6b, bottom: 0xa88f60, denim: false, shoes: 0x120d0a, sole: 0x0a0a0a, hair: 0x120c08, hairStyle: 'short', sleeves: 'short', cap: 0x1f2a44, beard: r() < 0.4, police: true }
      : { ...randomLook(r, false), top: r() < 0.6 ? 0x111111 : 0x3e2723, bottom: 0x1a1a2e, cap: 0xb71c1c, beard: r() < 0.6, jacket: r() < 0.3 ? 0x212121 : null };
    const c = new Character(this.game, look, { team, x, z, hp: team === 'police' ? 110 : opts.boss ? 400 : 90, runSpeed: 5, sprintSpeed: 7.4, detail: 1, name: team === 'police' ? 'Constable' : opts.boss ? 'Gang Boss' : 'Gangster' });
    c.weapon = opts.weapon ?? (r() < (team === 'police' ? 0.75 : 0.45) ? 1 : 0); if (opts.rifle) c.weapon = 2;
    c.ai = { home: new THREE.Vector3(x, 0, z), cd: r() * 2, strafe: r() < 0.5 ? 1 : -1, alert: !!opts.alert, boss: !!opts.boss, talked: false };
    c.ammo = { pistol: 999, rifle: 999 };
    if (opts.boss) { c.h.mesh.scale.setScalar(1.12); c.dmgMul = 1.5; }
    this.enemies.push(c); return c;
  }
  spawnGang(n, cx, cz, alert = false) {
    const out = [];
    for (let k = 0; k < n; k++) { const a = this.rng() * 6.28, r = 8 + this.rng() * 40; const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; out.push(this.spawnEnemy('gang', x, z, { alert, weapon: k % 3 === 0 ? 2 : undefined })); }
    return out;
  }
  crime(level) {
    this.wanted = clamp(Math.max(this.wanted, level), 0, 5); this.calm = 0;
    this.game.hud.stars(this.wanted);
  }
  knockCivilian(p, from, vel) {
    // a GPU crowd person becomes a CPU character that falls, gets up and runs away
    if (this.civs.length > 24) { const old = this.civs.shift(); this.despawnCiv(old); }
    setAlive(p.i, false);
    const look = lookOf(p.i), c = new Character(this.game, look, { team: 'civ', x: p.x, z: p.z, yaw: p.yaw, detail: 0, hp: 60 });
    c.h.mesh.scale.setScalar(look.scale || 1);
    c.crowdIdx = p.i; c.state = 'down'; c.downT = 2.2; c.vel.copy(vel || new THREE.Vector3()); c.vel.y = Math.max(c.vel.y, 3); c.fleeFrom = from.clone(); c.life = 18;
    if (Math.random() < 0.4) say('NPC', ['Arre baap re!', 'Bachao!', 'Hey! Watch it!', 'Ouch! Kya kar rahe ho?'][Math.floor(Math.random() * 4)]);
    this.civs.push(c); return c;
  }
  despawnCiv(c) { c.remove(); if (c.crowdIdx !== undefined) setAlive(c.crowdIdx, true); }
  update(dt) {
    const g = this.game, P = g.player;
    // wanted decay + police spawns
    if (this.wanted > 0) {
      this.calm += dt;
      const nearCops = this.enemies.filter((e) => e.team === 'police' && e.alive && e.pos.distanceTo(g.playerPos()) < 90).length;
      if (this.calm > 18 + this.wanted * 6 && nearCops === 0) { this.wanted--; this.calm = 0; g.hud.stars(this.wanted); }
      const cops = this.enemies.filter((e) => e.team === 'police' && e.alive).length;
      if (cops < this.wanted * 2 && Math.random() < dt * 0.6 && !g.interior.active) {
        const nr = M.nearestRoad(g.playerPos().x + (Math.random() - 0.5) * 140, g.playerPos().z + (Math.random() - 0.5) * 140);
        if (nr && Math.hypot(nr.x - g.playerPos().x, nr.z - g.playerPos().z) > 45) { const c = this.spawnEnemy('police', nr.x, nr.z, { alert: true }); if (Math.random() < 0.5) say('NPC', POLICE_LINES[Math.floor(Math.random() * POLICE_LINES.length)]); }
      }
    }
    // gang presence at the docks (respawns when cleared)
    const H = M.L.hideout;
    const gangAlive = this.enemies.filter((e) => e.team === 'gang' && e.alive).length;
    if (gangAlive === 0) { this.gangRespawn -= dt; if (this.gangRespawn < 0 && g.playerPos().distanceTo(new THREE.Vector3(H.x, 0, H.z)) > 300) { this.spawnGang(8, H.x, H.z); this.gangRespawn = 120; } }
    // enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) { e.deadT = (e.deadT || 0) + dt; e.update(dt, {}); if (e.deadT > 25) { e.remove(); this.enemies.splice(i, 1); } continue; }
      const far = e.pos.distanceTo(g.playerPos());
      if (far > 400) { if (e.team === 'police' && this.wanted === 0) { e.remove(); this.enemies.splice(i, 1); } continue; }
      e.update(dt, this.think(e, dt));
    }
    for (let i = this.civs.length - 1; i >= 0; i--) {
      const c = this.civs[i]; c.life -= dt;
      const away = new THREE.Vector3().subVectors(c.pos, c.fleeFrom); away.y = 0; away.normalize();
      c.update(dt, c.state === 'down' || !c.alive ? {} : { move: away, sprint: true });
      if (c.life < 0) { this.despawnCiv(c); this.civs.splice(i, 1); }
    }
  }
  think(e, dt) {
    const g = this.game, ai = e.ai, ctl = { move: new THREE.Vector3() };
    // pick target among heroes
    let tgt = null, td = 1e9;
    for (const h of g.heroes) { if (!h.alive) continue; const hp = h === g.player && h.vehicle ? h.vehicle.pos : h.pos; const d = hp.distanceTo(e.pos); if (d < td) { td = d; tgt = { c: h, p: hp }; } }
    const aggro = e.team === 'police' ? this.wanted > 0 : (ai.alert || td < 28 || e.hp < e.maxHp);
    if (!tgt || !aggro || td > 120) {
      // patrol
      ai.cd -= dt; if (!ai.wp || ai.cd < 0) { const a = Math.random() * 6.28; ai.wp = ai.home.clone().add(new THREE.Vector3(Math.cos(a) * 25, 0, Math.sin(a) * 25)); ai.cd = 5 + Math.random() * 6; }
      const d = new THREE.Vector3().subVectors(ai.wp, e.pos); d.y = 0; if (d.length() > 2) ctl.move.copy(d.normalize().multiplyScalar(0.45));
      return ctl;
    }
    if (!ai.alert) { ai.alert = true; if (e.team === 'gang' && Math.random() < 0.5) say('Gang', GANG_LINES[Math.floor(Math.random() * GANG_LINES.length)]); }
    const to = new THREE.Vector3().subVectors(tgt.p, e.pos); to.y = 0; const d = to.length(); to.normalize();
    ctl.face = true; ctl.faceYaw = Math.atan2(to.x, to.z); ai.cd -= dt;
    if (e.weapon > 0) {
      const W = WEAPONS[e.weapon];
      if (d > 26) { ctl.move.copy(to); ctl.sprint = d > 40; }
      else if (d < 9) ctl.move.copy(to).multiplyScalar(-0.6);
      else ctl.move.set(-to.z * ai.strafe * 0.6, 0, to.x * ai.strafe * 0.6);
      if (Math.random() < dt * 0.3) ai.strafe *= -1;
      if (d < 55 && ai.cd < 0) {
        ctl.aim = true; ctl.fire = true;
        const acc = clamp(d / 220, 0.03, 0.22) + (tgt.c.state === 'web' || tgt.c.state === 'glide' ? 0.15 : 0);
        ctl.aimDir = new THREE.Vector3(tgt.p.x - e.pos.x + (Math.random() - 0.5) * d * acc * 2, (tgt.p.y + 1.2) - (e.pos.y + 1.45) + (Math.random() - 0.5) * d * acc, tgt.p.z - e.pos.z + (Math.random() - 0.5) * d * acc * 2).normalize();
        if (Math.random() < dt * 0.6) ai.cd = 1 + Math.random() * 1.5;
      }
    } else {
      if (d > 1.6) { ctl.move.copy(to); ctl.sprint = d > 6; }
      else if (ai.cd < 0) { if (Math.random() < 0.65) ctl.attack = true; else ctl.kick = true; ai.cd = (ai.boss ? 0.5 : 0.8) + Math.random() * 0.8; }
      if (d < 3 && Math.random() < 0.01) { ctl.aim = true; }
    }
    if (e.hp < e.maxHp * 0.2 && e.team === 'gang' && !ai.boss) { ctl.move.copy(to).multiplyScalar(-1); ctl.sprint = true; ctl.attack = false; ctl.fire = false; }
    return ctl;
  }
  clearAll() { for (const e of this.enemies) e.remove(); this.enemies.length = 0; for (const c of this.civs) this.despawnCiv(c); this.civs.length = 0; }
}
