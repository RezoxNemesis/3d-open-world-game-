// Police pursuit: when you are wanted, patrol bikes and police SUVs come after you with sirens and flashing
// lightbars, chase you down, box you in, and constables jump out to arrest you. Units drive with the same
// vehicle physics as the player (steer + throttle), and back up and re-route when they get stuck.
import * as THREE from 'three';
import * as M from './mapdata.js';
import { CARS } from './vehicle_models.js';
import { clamp, angDiff } from './util.js';
import { sirenLoop, updateSiren, stopLoop, say } from './audio.js';

const LINES = ['Control, suspect is on the move — pursuing!', 'Pull over! Police!', 'Stop the vehicle! Hands where I can see them!', 'All units, suspect heading for the highway!', 'Rukk jaao! Police!'];
const WANT = [[], ['policebike'], ['police', 'policebike'], ['police', 'police', 'policebike'], ['police', 'police', 'police', 'policebike'], ['police', 'police', 'police', 'police', 'policebike']];

// A* over the road graph (nodes/edges from mapdata); returns a list of node ids
function nodeNear(x, z) { const r = M.nearestRoad(x, z); if (!r) return -1; const e = M.edges[r.e]; return r.t < 0.5 ? e.a : e.b; }
function route(a, b, maxIt = 9000) {
  if (a < 0 || b < 0) return null; if (a === b) return [a];
  const N = M.nodes, E = M.edges, B = N[b], g = new Map([[a, 0]]), came = new Map(), heap = [[Math.hypot(N[a].x - B.x, N[a].z - B.z), a]];
  const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (let it = 0; heap.length && it < maxIt; it++) {
    const [, u] = pop(); if (u === b) { const path = [b]; let c = b; while (came.has(c)) { c = came.get(c); path.push(c); } return path.reverse(); }
    const gu = g.get(u);
    for (const ei of N[u].e) { const e = E[ei]; if (e.lanes === 0) continue; const v = e.a === u ? e.b : e.a, gv = gu + e.len; if (gv < (g.get(v) ?? 1e18)) { g.set(v, gv); came.set(v, u); push([gv + Math.hypot(N[v].x - B.x, N[v].z - B.z), v]); } }
  }
  return null;
}

export class Police {
  constructor(game) { this.game = game; this.units = []; this.spawnT = 2; this.siren = null; this.lineT = 0; }
  // a spawn point on a road 160–260 m away, preferably behind the player
  spawnPoint() {
    const g = this.game, P = g.playerPos(), f = g.player.vehicle ? g.player.vehicle.forward.clone() : new THREE.Vector3(Math.sin(g.player.yaw), 0, Math.cos(g.player.yaw));
    for (let k = 0; k < 10; k++) {
      const a = Math.atan2(-f.x, -f.z) + (Math.random() - 0.5) * 2.2, d = 160 + Math.random() * 100;
      const nr = M.nearestRoad(P.x + Math.sin(a) * d, P.z + Math.cos(a) * d);
      if (nr && Math.hypot(nr.x - P.x, nr.z - P.z) > 120 && M.terrainH(nr.x, nr.z) > 0.6) return nr;
    }
    return null;
  }
  spawn(key) {
    const g = this.game, sp = this.spawnPoint(); if (!sp) return;
    const P = g.playerPos(), v = g.addVehicle('car', key, CARS[key].paints[0], sp.x, sp.z, Math.atan2(P.x - sp.x, P.z - sp.z));
    v.police = true; v.ai = true;
    this.units.push({ v, key, state: 'chase', t: 0, stuck: 0, rev: 0, cops: 0, life: 0 });
  }
  update(dt) {
    const g = this.game, w = g.npcs.wanted, P = g.playerPos();
    // keep the right number of units for the wanted level
    const want = g.inside || g.interior.active ? [] : WANT[w] || [];
    this.spawnT -= dt;
    if (this.spawnT < 0) {
      this.spawnT = 3 + Math.random() * 3;
      const have = this.units.filter((u) => u.state !== 'leave' && !u.v.dead).map((u) => u.key);
      for (const k of want) { const i = have.indexOf(k); if (i >= 0) have.splice(i, 1); else { this.spawn(k); break; } }
    }
    let nearest = 1e9;
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i], v = u.v; u.t += dt; u.life += dt;
      if (v.driver === g.player) { this.units.splice(i, 1); v.police = false; v.ai = false; continue; }    // you stole it!
      const dx = P.x - v.pos.x, dz = P.z - v.pos.z, d = Math.hypot(dx, dz); nearest = Math.min(nearest, d);
      if (v.dead || (w === 0 && u.state !== 'leave')) { u.state = 'leave'; u.t = 0; }
      if (u.state === 'leave') { if ((d > 260 || u.t > 25 || v.dead) && (!g.player.vehicle || g.player.vehicle !== v)) { this.remove(u, i); } else this.drive(u, dt, v.pos.clone().add(v.forward.clone().multiplyScalar(60)), 0.6); continue; }
      if (u.state === 'chase') {
        // aim a little ahead of a moving target so they cut you off
        const tv = g.player.vehicle ? g.player.vehicle.vel : g.player.vel, lead = Math.min(2.5, d / 25), ps = Math.hypot(tv.x, tv.z);
        let tgt = new THREE.Vector3(P.x + tv.x * lead, 0, P.z + tv.z * lead);
        if (d > 70) {
          if ((u.rt -= dt) === undefined || u.rt < 0 || !u.path) { u.rt = 3; u.path = route(nodeNear(v.pos.x, v.pos.z), nodeNear(P.x, P.z)); u.pi = 0;
            // if we are already part-way along the first road segment, aim straight for its far end
            while (u.path && u.pi + 1 < u.path.length) { const a = M.nodes[u.path[u.pi]], b = M.nodes[u.path[u.pi + 1]]; if (Math.hypot(b.x - v.pos.x, b.z - v.pos.z) < Math.hypot(b.x - a.x, b.z - a.z) + 4) u.pi++; else break; } }
          if (u.path && u.pi < u.path.length) {
            const n = M.nodes[u.path[u.pi]], dn = Math.hypot(n.x - v.pos.x, n.z - v.pos.z); if (dn < 9) u.pi++;
            const i2 = Math.min(u.pi, u.path.length - 1), n2 = M.nodes[u.path[i2]]; tgt = new THREE.Vector3(n2.x, 0, n2.z);
            // brake for sharp corners at the next junction
            const n3 = M.nodes[u.path[Math.min(i2 + 1, u.path.length - 1)]], a1 = Math.atan2(n2.x - v.pos.x, n2.z - v.pos.z), a2 = Math.atan2(n3.x - n2.x, n3.z - n2.z), turn = n3 === n2 ? 0 : Math.abs(angDiff(a1, a2));
            const dj = Math.hypot(n2.x - v.pos.x, n2.z - v.pos.z); u.cornerV = turn > 0.5 && dj < 55 ? 9 + 22 * (1 - turn / Math.PI) + dj * 0.35 : 1e3;
          }
        } else u.cornerV = 1e3;
        // speed plan: flat out when far or when the suspect is fleeing fast, ease off to stop beside them
        u.vmax = Math.min(u.cornerV ?? 1e3, d > 45 || ps > 8 ? 1e3 : Math.max(2, d * 0.7));
        this.drive(u, dt, tgt, 1);
        if (d < (u.key === 'policebike' ? 9 : 13) && Math.abs(v.speed) < 6) { u.state = 'arrest'; u.t = 0; }
        if (d > 600 && u.life > 20) this.remove(u, i);
      } else if (u.state === 'arrest') {
        // stop, constables jump out, then the unit waits with lights on; re-chase if you get away
        v.update(dt, { mx: 0, my: -1, hand: true });
        if (u.cops < (u.key === 'policebike' ? 1 : 2) && u.t > 0.4) {
          u.cops++; const side = new THREE.Vector3(-Math.cos(v.yaw), 0, Math.sin(v.yaw)).multiplyScalar(u.cops === 1 ? 1.6 : -1.6);
          g.npcs.spawnEnemy('police', v.pos.x + side.x, v.pos.z + side.z, { alert: true });
          if (u.cops === 1) say('NPC', LINES[1 + Math.floor(Math.random() * 3)]);
        }
        if (d > 70) { u.state = 'chase'; u.t = 0; u.cops = 0; }
      }
    }
    // pursuit pressure keeps the stars from cooling while units are close
    if (w > 0 && nearest < 90) g.npcs.calm = Math.min(g.npcs.calm, 4);
    if (w > 0 && nearest < 140 && (this.lineT -= dt) < 0) { this.lineT = 14 + Math.random() * 10; say('NPC', LINES[Math.floor(Math.random() * LINES.length)]); }
    // one siren voice, panned/attenuated by the closest unit
    const active = this.units.some((u) => u.state !== 'leave');
    if (active && !this.siren) this.siren = sirenLoop();
    if (this.siren) { updateSiren(this.siren, active ? clamp(1 - nearest / 320, 0, 1) * 0.5 : 0); if (!active && nearest > 200) { stopLoop(this.siren); this.siren = null; } }
  }
  // steer toward a target with the shared vehicle physics; back up when stuck
  drive(u, dt, tgt, thrK) {
    const v = u.v, want = Math.atan2(tgt.x - v.pos.x, tgt.z - v.pos.z), da = angDiff(v.yaw, want), d = Math.hypot(tgt.x - v.pos.x, tgt.z - v.pos.z);
    if (u.rev > 0) { u.rev -= dt; v.update(dt, { mx: da > 0 ? 1 : -1, my: -1, hand: false }); return; }
    const slow = Math.abs(da) > 1.4 ? 0.35 : 1, vmax = u.vmax ?? 1e3, turnV = 8 + 40 / (1 + Math.abs(da) * 3);
    const over = v.speed > Math.min(vmax, turnV + 25);
    v.update(dt, { mx: clamp(-da * 2.2, -1, 1), my: over ? -1 : thrK * slow, hand: Math.abs(da) > 1.2 && Math.abs(v.speed) > 18, nitro: false });
    if (Math.abs(v.speed) < 1.2) { u.stuck += dt; if (u.stuck > 1.6) { u.stuck = 0; u.rev = 1.3; } } else u.stuck = 0;
    if (v.pos.distanceTo(this.game.cam.position) > 260) { /* far away: physics is cheap enough to keep running */ }
  }
  remove(u, i) { const g = this.game, v = u.v; this.units.splice(i, 1); if (v.driver) return; v.obj.parent && v.obj.parent.remove(v.obj); v.stopEngine && v.stopEngine(); const k = g.vehicles.indexOf(v); if (k >= 0) g.vehicles.splice(k, 1); }
}
