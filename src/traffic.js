// AI traffic on the road graph (left-hand driving), instanced per model.
import * as THREE from 'three';
import * as M from './mapdata.js';
import { CARS, vehicleGeometry } from './vehicle_models.js';
import { vehicleMaterial } from './vehicles.js';
import { mulberry32, clamp, lerp, damp, dampAngle, hexRGB } from './util.js';
import { burst, explosion } from './fx.js';
import { sfx } from './audio.js';

const MIX = [['chhota', 22], ['sedan', 16], ['auto', 18], ['scooter', 14], ['thunder', 7], ['shera220', 9], ['vayurr', 0.7], ['policebike', 0.8], ['kaveri', 7], ['bus', 4], ['truck', 5], ['amba', 3], ['regent', 2], ['police', 1], ['jeep', 2], ['bison', 0.8], ['agni', 0.4], ['shera', 0.8], ['gajraj', 1.2]];
const VMAX = { scooter: 13, auto: 10, bus: 13, truck: 13, amba: 13, police: 18, thunder: 15, shera220: 16, vayurr: 21, policebike: 18 };
const _pm = new THREE.Matrix4(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
export class Traffic {
  constructor(game, q) {
    this.game = game; this.cars = []; this.models = {}; this.hash = new Map();
    const rng = mulberry32(99), total = MIX.reduce((a, b) => a + b[1], 0);
    const roadEdges = M.edges.map((e, i) => i).filter((i) => M.edges[i].lanes > 0 && M.edges[i].type !== 'fort');
    const weightOf = (e) => (e.zone === 'nani' || e.zone === 'moti' || e.zone === 'devka' ? 3 : e.type === 'major' || e.type === 'coast' ? 2 : 1) * e.len;
    const cum = []; let acc = 0; for (const i of roadEdges) { acc += weightOf(M.edges[i]); cum.push(acc); }
    const pickEdge = () => { const r = rng() * acc; let lo = 0, hi = cum.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; } return roadEdges[lo]; };
    const counts = {};
    for (let k = 0; k < q.traffic; k++) {
      let r = rng() * total, key = 'chhota'; for (const [kk, w] of MIX) { if ((r -= w) < 0) { key = kk; break; } }
      const ei = pickEdge(), e = M.edges[ei], paints = CARS[key].paints;
      const car = { key, edge: ei, dir: rng() < 0.5 ? 1 : -1, s: rng() * e.len, speed: 0, vmax: (VMAX[key] || 16) * (0.85 + rng() * 0.3), lane: e.lanes > 1 && rng() < 0.5 ? 1 : 0,
        tint: new THREE.Color(paints[Math.floor(rng() * paints.length)]), x: 0, y: 0, z: 0, yaw: 0, alive: true, hp: key === 'bus' || key === 'truck' ? 160 : 70, stop: 0, idx: -1, init: false };
      this.cars.push(car); counts[key] = (counts[key] || 0) + 1;
    }
    // two instanced meshes per model: full detail near the camera, a light version further away
    const mat = vehicleMaterial(true);
    for (const key in counts) {
      const vg = vehicleGeometry(key), mk = (src, shadow) => {
        const g = src.clone(); const tint = new THREE.InstancedBufferAttribute(new Float32Array(counts[key] * 3), 3); g.setAttribute('aTint', tint);
        const mesh = new THREE.InstancedMesh(g, mat, counts[key]); mesh.count = 0; mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.frustumCulled = false;
        game.scene.add(mesh); return { mesh, tint, n: 0 };
      };
      this.models[key] = { hi: mk(vg.all, true), lo: vg.low ? mk(vg.low, false) : null };
    }
    this.frustum = new THREE.Frustum(); this.sphere = new THREE.Sphere(new THREE.Vector3(), 6);
    for (const c of this.cars) this.place(c, true);
  }
  lanePos(c, out) {
    const e = M.edges[c.edge], A = M.nodes[c.dir > 0 ? e.a : e.b], B = M.nodes[c.dir > 0 ? e.b : e.a];
    const dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len, lw = e.w / (2 * e.lanes), off = lw * (0.5 + c.lane);
    const t = clamp(c.s / e.len, 0, 1);
    out.x = A.x + dx * c.s + dz * off; out.z = A.z + dz * c.s - dx * off; out.yaw = Math.atan2(dx, dz);
    out.y = e.elev ? lerp(A.y, B.y, t) : M.terrainH(out.x, out.z) + 0.1;
    return out;
  }
  place(c, snap) { const o = {}; this.lanePos(c, o); if (snap || !c.init) { c.x = o.x; c.y = o.y; c.z = o.z; c.yaw = o.yaw; c.init = true; } return o; }
  nextEdge(c) {
    const e = M.edges[c.edge], node = M.nodes[c.dir > 0 ? e.b : e.a], nodeId = c.dir > 0 ? e.b : e.a;
    const opts = node.e.filter((ei) => ei !== c.edge && M.edges[ei].lanes > 0 && M.edges[ei].type !== 'fort');
    const ni = opts.length ? opts[Math.floor(Math.random() * opts.length)] : c.edge;
    const ne = M.edges[ni];
    c.edge = ni; c.dir = ne.a === nodeId ? 1 : -1; c.lane = ne.lanes > 1 ? c.lane : 0;
  }
  update(dt, focus, q) {
    // spatial hash
    this.hash.clear();
    for (let i = 0; i < this.cars.length; i++) { const c = this.cars[i]; const k = Math.floor(c.x / 25) * 100000 + Math.floor(c.z / 25); let l = this.hash.get(k); if (!l) this.hash.set(k, (l = [])); l.push(i); }
    for (const m of Object.values(this.models)) { m.hi.n = 0; if (m.lo) m.lo.n = 0; }
    const far = q.desktop ? 900 : 550, simFar = 2500, lodD = q.desktop ? 160 : 85;
    const cam = this.game.cam; cam.updateMatrixWorld(); _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this.frustum.setFromProjectionMatrix(_pm);
    const P = this.game.playerPos();
    const o = {};
    for (const c of this.cars) {
      const dist = Math.hypot(c.x - focus.x, c.z - focus.z);
      if (!c.alive) { c.stop -= dt; if (c.stop < 0 && dist > 300) { c.alive = true; c.hp = 70; c.tint.setHex(CARS[c.key].paints[0]); this.respawnFar(c, focus); } }
      else if (dist < simFar || Math.random() < 0.05) {
        const step = dist < simFar ? dt : dt * 20;
        const e = M.edges[c.edge];
        let tgt = c.vmax * (e.type === 'major' || e.type === 'coast' ? 1 : 0.72);
        if (e.len - c.s < 14) tgt = Math.min(tgt, 7);
        if (c.stop > 0) { c.stop -= step; tgt = 0; }
        // look ahead for cars / player
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), ax = c.x + fx * 9, az = c.z + fz * 9;
        const near = this.hash.get(Math.floor(ax / 25) * 100000 + Math.floor(az / 25));
        if (near) for (const j of near) { const d = this.cars[j]; if (d === c) continue; const rx = d.x - c.x, rz = d.z - c.z, along = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx); if (along > 0 && along < 11 && side < 1.6) { tgt = Math.min(tgt, Math.max(0, (along - 5) * 1.2)); } }
        if (P) { const rx = P.x - c.x, rz = P.z - c.z, along = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx); if (along > 0 && along < 12 && side < 2.2) { tgt = Math.min(tgt, Math.max(0, (along - 4) * 1.0)); if (along < 8 && Math.random() < 0.01) sfx('horn', 0.5, dist); } }
        c.speed = damp(c.speed, tgt, tgt < c.speed ? 4 : 1.2, step);
        c.s += c.speed * step;
        while (c.s > M.edges[c.edge].len) { c.s -= M.edges[c.edge].len; this.nextEdge(c); }
        this.lanePos(c, o);
        if (dist < simFar) { c.x = damp(c.x, o.x, 7, step); c.z = damp(c.z, o.z, 7, step); c.y = o.y; } else { c.x = o.x; c.z = o.z; c.y = o.y; }
        c.yaw = dampAngle(c.yaw, o.yaw, 5, step);
      }
      this.sphere.center.set(c.x, c.y + 1, c.z); this.sphere.radius = c.key === 'bus' || c.key === 'truck' ? 7 : 4;
      if (dist < far && (dist < 25 || this.frustum.intersectsSphere(this.sphere))) {
        const mm = this.models[c.key]; if (!mm) continue;
        const md = dist < lodD || !mm.lo ? mm.hi : mm.lo;
        const i = md.n++; c.idx = i;
        _q.setFromEuler(_e.set(0, c.yaw, 0)); _m.compose(_p.set(c.x, c.y, c.z), _q, _s);
        md.mesh.setMatrixAt(i, _m); md.tint.setXYZ(i, c.tint.r, c.tint.g, c.tint.b);
      } else c.idx = dist < far ? 0 : -1;
    }
    for (const mm of Object.values(this.models)) for (const m of [mm.hi, mm.lo]) { if (!m) continue; m.mesh.count = m.n; m.mesh.instanceMatrix.clearUpdateRanges(); m.mesh.instanceMatrix.addUpdateRange(0, m.n * 16); m.mesh.instanceMatrix.needsUpdate = true; m.tint.needsUpdate = true; }
  }
  respawnFar(c, focus) {
    for (let k = 0; k < 20; k++) { const ei = Math.floor(Math.random() * M.edges.length), e = M.edges[ei]; if (e.lanes < 1 || e.type === 'fort') continue; const A = M.nodes[e.a]; if (Math.hypot(A.x - focus.x, A.z - focus.z) > 400) { c.edge = ei; c.s = 0; c.dir = 1; c.speed = 0; this.place(c, true); return; } }
  }
  near(x, z, r) { const out = []; for (const c of this.cars) if (c.alive !== undefined && Math.abs(c.x - x) < r && Math.abs(c.z - z) < r && Math.hypot(c.x - x, c.z - z) < r) out.push(c); return out; }
  nearest(x, z, r) { let b = null, bd = r; for (const c of this.cars) { if (!c.alive) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; b = c; } } return b; }
  remove(c) { c.alive = false; c.stop = 25; c.x = 1e6; c.z = 1e6; }
  hit(c, dmg, from) {
    c.hp -= dmg; c.stop = 3; c.speed = 0;
    if (c.hp <= 0 && c.alive) { c.alive = false; c.stop = 30; explosion(c.x, c.y, c.z, c.key === 'bus' || c.key === 'truck' ? 1.4 : 1); sfx('boom', 1, this.game.camDist(new THREE.Vector3(c.x, c.y, c.z))); c.tint.setRGB(0.04, 0.04, 0.04); this.game.onExplosion(new THREE.Vector3(c.x, c.y, c.z), 8); }
  }
  ray(origin, dir, maxT) {
    let best = null;
    for (const c of this.cars) {
      if (!c.alive || c.idx < 0) continue;
      const vx = c.x - origin.x, vy = c.y + 0.9 - origin.y, vz = c.z - origin.z, t = vx * dir.x + vy * dir.y + vz * dir.z; if (t < 0 || t > maxT) continue;
      const dx = origin.x + dir.x * t - c.x, dy = origin.y + dir.y * t - c.y - 0.9, dz = origin.z + dir.z * t - c.z, r = c.key === 'bus' || c.key === 'truck' ? 3.2 : c.key === 'scooter' || CARS[c.key].bike ? 0.8 : 1.8;
      if (dx * dx + dy * dy + dz * dz < r * r && (!best || t < best.t)) best = { car: c, t };
    }
    return best;
  }
}
