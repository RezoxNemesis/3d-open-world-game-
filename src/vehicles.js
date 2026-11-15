// Drivable vehicles: cars, helicopter, private jet, fighter jet, speedboat.
import * as THREE from 'three';
import { lodBand, fadeable } from './fade.js';
import * as M from './mapdata.js';
import { CARS, vehicleGeometry, heliGeometry, jetGeometry, boatGeometry } from './vehicle_models.js';
import { STATIC_MODELS } from './carmodels.js';
import { U, patch } from './shaders.js';
import { clamp, lerp, damp, angDiff, dampAngle } from './util.js';
import { burst, explosion, fx } from './fx.js';
import { sfx, engineLoop, updateEngine, stopLoop } from './audio.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
// shared material for vehicle "statics" (vertex coloured, paint tinted)
const GLASS = new THREE.MeshPhysicalMaterial({ color: 0x10161c, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.42, depthWrite: false, envMapIntensity: 1.4 });
// split a car body into opaque parts and its glass (aEmit == 5), cached on the geometry set
function splitGlass(vg) {
  if (vg.split) return vg.split;
  const src = vg.body, E = src.attributes.aEmit;
  if (!E) return (vg.split = { opaque: src, glass: null });
  const isG = (i) => Math.abs(E.getX(i) - 5) < 0.5;
  const tri = src.index ? src.index.array : null, n = tri ? tri.length : src.attributes.position.count;
  const keepO = [], keepG = [];
  for (let t = 0; t < n; t += 3) { const a = tri ? tri[t] : t, b = tri ? tri[t + 1] : t + 1, c = tri ? tri[t + 2] : t + 2; (isG(a) && isG(b) && isG(c) ? keepG : keepO).push(a, b, c); }
  if (!keepG.length) return (vg.split = { opaque: src, glass: null });
  const mk = (ids) => { const g = new THREE.BufferGeometry(); for (const k in src.attributes) g.setAttribute(k, src.attributes[k]); g.setIndex(ids); g.computeBoundingSphere(); return g; };
  return (vg.split = { opaque: mk(keepO), glass: mk(keepG) });
}
export function vehicleMaterial(instanced, lite = false) {
  // player/parked cars get a clear-coated paint (MeshPhysical) on PC; traffic and phones use the cheaper standard material
  const m = instanced || lite ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.45 }) : new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.05 });
  patch(m, (s) => {
    s.uniforms.uNight = U.uNight; s.uniforms.uTint = { value: new THREE.Color(1, 1, 1) }; m.userData.uTint = s.uniforms.uTint; s.uniforms.uBrake = { value: 0 }; m.userData.uBrake = s.uniforms.uBrake;
    s.uniforms.uTime = U.uTime;
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
      attribute float aPaint; attribute float aEmit; varying float vPaint; varying float vEmit; ${instanced ? 'attribute vec3 aTint; varying vec3 vTint;' : ''}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
      vPaint = aPaint; vEmit = aEmit; ${instanced ? 'vTint = aTint;' : ''}`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uNight, uBrake, uTime; uniform vec3 uTint; varying float vPaint; varying float vEmit; ${instanced ? 'varying vec3 vTint;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 tint = ${instanced ? 'vTint' : 'uTint'};
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*tint, vPaint);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vEmit > 6.5 ? 0.92 : vEmit > 4.5 && vEmit < 5.5 ? 0.04 : vEmit > 5.5 ? 0.14 : mix(0.72, 0.3, vPaint);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vEmit > 6.5 ? 0.0 : vEmit > 5.5 ? 1.0 : vEmit > 4.5 ? 0.0 : mix(0.0, 0.5, vPaint);')
      .replace('#include <lights_physical_fragment>', THREE.ShaderChunk.lights_physical_fragment.replace('material.clearcoat = clearcoat;', 'material.clearcoat = clearcoat * vPaint;') + '\n      if (vEmit > 6.5) { material.specularColor *= 0.35; material.specularF90 = 0.4; }   // tyres, rubber, matte trim')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if (vEmit > 0.5 && vEmit < 1.5) totalEmissiveRadiance += vec3(1.,0.95,0.8)*(0.15 + uNight*3.5);
      if (vEmit > 1.5 && vEmit < 2.5) totalEmissiveRadiance += vec3(1.,0.05,0.03)*(0.1 + uNight*2. + uBrake*3.);
      if (vEmit > 2.5 && vEmit < 3.5) totalEmissiveRadiance += vec3(1.,0.1,0.1)*step(0.5, fract(uTime*2.5))*4.;
      if (vEmit > 3.5 && vEmit < 4.5) totalEmissiveRadiance += vec3(0.1,0.3,1.)*step(0.5, fract(uTime*2.5+0.5))*4.;`);
  }, instanced ? 'inst' : lite ? 'lite' : 'single');
  return m;
}
export class Vehicle {
  constructor(game, kind, key, color, x, z, ang) {
    this.game = game; this.kind = kind; this.key = key; this.color = color;
    this.obj = new THREE.Group(); this.pos = new THREE.Vector3(x, 0, z); this.vel = new THREE.Vector3();
    this.yaw = ang || 0; this.pitch = 0; this.roll = 0; this.q = new THREE.Quaternion();
    this.speed = 0; this.steer = 0; this.hp = 100; this.dead = false; this.driver = null; this.throttle = 0; this.rotor = 0; this.airborne = false; this.vy = 0;
    this.wheels = []; this.mat = vehicleMaterial(false, !game.q.desktop); this.mat.color = new THREE.Color(1, 1, 1);
    this.tint = new THREE.Color(color);
    const g = this.mat;
    if (kind === 'car' || kind === 'boat') {
      const spec = kind === 'boat' ? { name: 'Machhli Speedboat', top: 40, acc: 9, grip: 0.5, sound: 'car' } : CARS[key];
      this.spec = spec;
      if (kind === 'boat') { const m = new THREE.Mesh(boatGeometry(), g); m.castShadow = true; this.obj.add(m); this.len = 6; this.wid = 2.2; }
      else {
        const vg = vehicleGeometry(key), sg = splitGlass(vg);
        const body = new THREE.Mesh(sg.opaque, g); body.castShadow = true; body.receiveShadow = true; this.obj.add(body);
        // see-through tinted glass so the driver and the interior show (one extra draw for the cars you can drive)
        if (sg.glass) { const gm = new THREE.Mesh(sg.glass, GLASS); gm.renderOrder = 2; this.obj.add(gm); this.glassM = gm; }
        for (const [wx, r, wz] of vg.wheels) { const w = new THREE.Mesh(vg.wheel, g); w.position.set(wx, r, wz); if (vg.mirrorLeft && wx < 0) w.scale.x = -1; w.castShadow = true; this.obj.add(w); this.wheels.push({ m: w, front: wz > 0, r }); }
        this.len = vg.len; this.wid = vg.wid; this.wheelBase = Math.max(1.2, Math.abs(vg.wheels[0][2] - vg.wheels[vg.wheels.length - 1][2]));
        // parked-car LODs: full detail near the camera, one merged mesh at mid range (the model phones drive anyway) and a
        // light one far out. Neighbouring levels cross-dissolve over a band, and the car dissolves away before its draw distance.
        const mk = (lg, sh) => { const m = new THREE.Mesh(lg, g); m.visible = false; m.castShadow = sh; this.obj.add(m); return m; };
        if (vg.all || vg.low) {
          const B = game.q.desktop ? { a: 70, w: 12, b: 250, w2: 30, gone: 1200 } : { a: 38, w: 8, b: 130, w2: 16, gone: 600 }; this.lodB = B;
          const mid = vg.all || vg.low, farG = vg.all && vg.low ? vg.low : null;
          const band = (geo, ...v) => { if (geo && !geo.attributes.aLodBand) geo.setAttribute('aLodBand', lodBand(...v)); };
          band(sg.opaque, 0, 0, B.a - B.w, B.a + B.w); band(sg.glass, 0, 0, B.a - B.w, B.a + B.w); band(vg.wheel, 0, 0, B.a - B.w, B.a + B.w);
          if (farG) { band(mid, B.a - B.w, B.a + B.w, B.b - B.w2, B.b + B.w2); band(farG, B.b - B.w2, B.b + B.w2, B.gone * 0.8, B.gone); }
          else band(mid, B.a - B.w, B.a + B.w, B.gone * 0.8, B.gone);
          fadeable(GLASS);
          this.lodM = mk(mid, true); this.lodF = farG ? mk(farG, !!game.q.desktop) : null;
          this.detail = [body, ...(this.glassM ? [this.glassM] : []), ...this.wheels.map((w) => w.m)]; this.detailOn = true;
        }
      }
      const P = this.spec.P;
      if (kind === 'boat') this.seat = new THREE.Vector3(-0.4, 0.75, 0);
      else if (P) this.seat = P.seat ? new THREE.Vector3(...P.seat) : new THREE.Vector3(-0.38, P.roofY - 1.1, (P.rf + P.rr) / 2 - 0.22);
      else if (spec.bike) this.seat = new THREE.Vector3(0, key === 'vayurr' ? 0.66 : 0.6, key === 'vayurr' ? -0.16 : -0.28);
      else this.seat = new THREE.Vector3(0, key === 'scooter' ? 0.62 : 0.55, key === 'scooter' ? -0.25 : 0.4);
      if (key === 'bus') this.seat.set(-0.8, 1.15, 4.2); if (key === 'truck') this.seat.set(-0.55, 1.2, 3.0);
    } else if (kind === 'heli') {
      const hg = heliGeometry(); const b = new THREE.Mesh(hg.body, g); b.castShadow = true; this.obj.add(b);
      this.rotorM = new THREE.Mesh(hg.rotor, g); this.rotorM.position.y = hg.rotorY; this.obj.add(this.rotorM);
      this.tailM = new THREE.Mesh(hg.tail, g); this.tailM.position.set(...hg.tailPos); this.obj.add(this.tailM);
      this.spec = { name: 'Garuda H4 Helicopter', top: 75 }; this.len = 11; this.wid = 3; this.seat = new THREE.Vector3(0.45, 1.1, 1.2);
    } else {
      const fighter = kind === 'jet';
      const bj = !fighter && STATIC_MODELS.rajhans;   // Blender-built business jet when available
      const m = new THREE.Mesh(bj ? bj.geo : jetGeometry(fighter), g); m.castShadow = true; m.receiveShadow = !!bj; this.obj.add(m);
      this.spec = fighter ? { name: 'Vajra F1 Fighter Jet', top: 330, stall: 55, rot: 70 } : { name: 'Rajhans R7 Business Jet', top: 230, stall: 48, rot: 62 };
      this.len = fighter ? 16 : bj ? 20 : 18; this.wid = fighter ? 11 : bj ? 18 : 15; this.seat = fighter ? new THREE.Vector3(0, 2.1, 3.6) : bj ? new THREE.Vector3(0.45, 1.95, 7.3) : new THREE.Vector3(0.45, 2.1, 6.3);
      this.fighter = fighter; this.ammo = 999; this.missiles = 24; this.after = 0;
    }
    this.mat.userData.uTintVal = this.tint;
    this.mat.onBeforeCompile = ((ob) => (s) => { ob(s); s.uniforms.uTint.value = this.tint; this.uBrake = s.uniforms.uBrake; })(this.mat.onBeforeCompile);
    this.pos.y = this.ground();
    if (kind === 'boat') this.pos.y = M.waterLevelAt(x, z) + 0.05;
    this.q.setFromEuler(_e.set(0, this.yaw, 0));
    this.sync();
    game.scene.add(this.obj);
    this.loop = null;
  }
  ground(y) { return M.groundAt(this.pos.x, this.pos.z, y ?? M.terrainH(this.pos.x, this.pos.z) + 1, 1.2); }
  get forward() { return _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  sync() {
    if (this.kind === 'car' || this.kind === 'boat') this.obj.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    else this.obj.quaternion.copy(this.q);
    this.obj.position.copy(this.pos);
  }
  startEngine() { if (!this.loop) this.loop = engineLoop(this.kind === 'heli' ? 'heli' : this.kind === 'jet' || this.kind === 'plane' ? 'jet' : this.spec.sound || 'car'); }
  stopEngine() { stopLoop(this.loop); this.loop = null; }
  damage(n, src) {
    if (this.dead) return; this.hp -= n;
    if (this.hp < 35 && Math.random() < 0.3) burst('smoke', this.pos.x, this.pos.y + 1.2, this.pos.z, 1, 0.6);
    if (this.hp <= 0) this.explode();
  }
  explode() {
    this.dead = true; this.hp = 0; explosion(this.pos.x, this.pos.y, this.pos.z, this.kind === 'car' || this.kind === 'boat' ? 1 : 2);
    sfx('boom', 1, this.game.camDist(this.pos)); this.tint.setRGB(0.05, 0.05, 0.05); this.burn = 12; this.stopEngine();
    if (this.driver) this.game.ejectFrom(this, true);
    this.game.onExplosion(this.pos, 9);
  }
  // ---------- per-frame ----------
  update(dt, c) {
    if (this.burn > 0) { this.burn -= dt; if (Math.random() < 0.6) burst('fire', this.pos.x, this.pos.y + 1, this.pos.z, 1, 0.8); if (Math.random() < 0.5) burst('smoke', this.pos.x, this.pos.y + 2, this.pos.z, 1, 1); }
    if (this.kind === 'car') this.updCar(dt, c); else if (this.kind === 'boat') this.updBoat(dt, c); else if (this.kind === 'heli') this.updHeli(dt, c); else this.updPlane(dt, c);
    this.sync();
    if (this.loop) { const rpm = this.kind === 'heli' ? this.rotor : this.kind === 'car' || this.kind === 'boat' ? clamp(Math.abs(this.speed) / (this.spec.top * 0.35), 0, 1) % 1 * 0.7 + clamp(Math.abs(this.speed) / this.spec.top, 0, 1) * 0.5 : clamp(this.throttle + this.after * 0.5, 0, 1.5); updateEngine(this.loop, rpm, c ? Math.max(0, c.my) : 0, this.driver === this.game.player ? 0.5 : 0); }
  }
  collide(radius, ox = 0, oz = 0) {
    // circle vs AABB colliders, returns impact speed
    const x = this.pos.x + ox, z = this.pos.z + oz; let hit = 0;
    for (const ci of M.collidersNear(x, z)) {
      const cc = M.colliders[ci];
      if (this.pos.y + 0.5 > cc.y1 || this.pos.y + 1.6 < cc.y0) continue;
      const px = clamp(x, cc.x0, cc.x1), pz = clamp(z, cc.z0, cc.z1); let dx = x - px, dz = z - pz; let d = Math.hypot(dx, dz);
      if (d >= radius) continue;
      if (d < 1e-4) { const l = x - cc.x0, r = cc.x1 - x, b = z - cc.z0, f = cc.z1 - z, m = Math.min(l, r, b, f); dx = m === l ? -1 : m === r ? 1 : 0; dz = m === b ? -1 : m === f ? 1 : 0; d = 0; }
      else { dx /= d; dz /= d; }
      const push = radius - d; this.pos.x += dx * push; this.pos.z += dz * push;
      const vn = this.vel.x * dx + this.vel.z * dz;
      if (vn < 0) { this.vel.x -= dx * vn * 1.35; this.vel.z -= dz * vn * 1.35; hit = Math.max(hit, -vn); }
    }
    return hit;
  }
  updCar(dt, c) {
    const S = this.spec, f = this.forward.clone(), right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    let vf = this.vel.dot(f), vr = this.vel.dot(right);
    const live = c && !this.dead;
    // pedals: separate gas / brake when given (touch pedals, triggers), otherwise the stick / W-S axis
    const gasIn = live ? (c.gas ?? Math.max(0, c.my)) : 0, brkIn = live ? (c.brake ?? Math.max(0, -c.my)) : 0;
    const hb = live && c.hand, nitro = live && c.nitro && S.nitro;
    // W/S semantics: brake while rolling forward, reverse once (almost) stopped; gas while reversing brakes first
    let thr = 0, brk = 0, rev = 0;
    if (vf > 0.6) { thr = gasIn; brk = brkIn; } else if (vf < -0.6) { rev = brkIn; brk = gasIn; } else { thr = gasIn; rev = gasIn > 0 ? 0 : brkIn; }
    const bike = !!S.bike, mass = S.mass || 1.3;
    // surface: off the tarmac a car is slower, looser and kicks up dust (low sports cars suffer most, the Bison least)
    if (this.driver) { this.surfT = (this.surfT || 0) - dt; if (this.surfT <= 0) { this.surfT = 0.15; this.paved = M.pavedAt(this.pos.x, this.pos.z); } } else this.paved = true;
    const offK = this.offK = damp(this.offK || 0, this.paved === false ? 1 : 0, 3, dt), offS = offK * (S.offroad ?? (S.top > 62 ? 0.5 : bike ? 0.3 : 0.34));
    if (!this.airborne) {
      const top = S.top * (nitro ? 1.22 : 1) * (1 - offS), acc = S.acc * (nitro ? 1.7 : 1) * (1 - offS * 0.55);
      // engine: strong pull at low speed tapering to the top speed; traction-limited launch
      if (thr > 0) vf += Math.min(acc * 1.25, acc * (1.15 - Math.pow(Math.max(0, vf) / top, 1.8))) * thr * dt;
      if (rev > 0) vf = Math.max(-Math.min(14, top * 0.25), vf - acc * 0.55 * rev * dt);
      // brakes ~1 g (bikes a little less), handbrake locks the rear
      const bd = (bike ? 9.5 : 11.5) * brk + (hb ? 6.5 : 0);
      if (bd > 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), bd * dt);
      // rolling resistance + air drag + engine braking off-throttle
      const drag = 0.25 + 0.00045 * vf * vf * (bike ? 1.2 : 1) / mass + (thr || rev ? 0 : 1.1) + offS * (1.4 + Math.max(0, Math.abs(vf) - top) * 0.6);
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), drag * dt);
      // slopes pull the car downhill (handbrake / brake held at rest keeps it parked)
      if (!(Math.abs(vf) < 0.4 && (brk || hb || (!thr && !rev)))) vf -= 9.8 * Math.sin(-(this.slope || 0)) * dt * 0.85;
      // steering: speed-sensitive lock, rate-limited, quicker to self-centre; analogue input tracks directly
      const sIn = live ? -c.mx : 0, analog = live && c.analog;
      const lock = bike ? lerp(0.72, 0.07, clamp(Math.abs(vf) / 38, 0, 1)) : lerp(0.6, 0.085, clamp(Math.abs(vf) / 42, 0, 1) ** 0.85);
      const target = sIn * lock, centring = Math.abs(target) < Math.abs(this.steer) || Math.sign(target) !== Math.sign(this.steer);
      const rate = analog ? 5.5 : centring ? 4.2 : lerp(2.6, 1.4, clamp(Math.abs(vf) / 40, 0, 1));
      this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
      // yaw from the steering geometry, capped by tyre grip (understeer instead of snapping at speed)
      const wb = bike ? 1.45 : this.wheelBase || 2.6;
      let yawRate = (vf * Math.tan(this.steer)) / wb;
      const aLat = 9.8 * S.grip * (bike ? 1.1 : 1.05) * (hb ? 1.6 : 1) * (1 - offK * 0.28);
      const cap = aLat / Math.max(2, Math.abs(vf));
      yawRate = clamp(yawRate, -cap, cap) * (hb && Math.abs(vf) > 6 ? 1.3 : 1);
      this.yawRate = damp(this.yawRate || 0, yawRate, bike ? 10 : 14, dt);
      this.yaw += this.yawRate * dt;
      // sideways slip dies away fast with grip; the handbrake lets the tail slide (drift)
      const grip = (hb ? 1.2 : bike ? 11 : 10) * S.grip * (1 - offK * 0.45);
      if (offK > 0.5 && Math.abs(vf) > 9 && Math.random() < 0.35) burst('dust', this.pos.x - f.x * this.len * 0.45, this.pos.y + 0.2, this.pos.z - f.z * this.len * 0.45, 1, 0.9);
      vr *= Math.exp(-grip * dt);
      if (hb && Math.abs(vf) > 8) vr += this.yawRate * Math.abs(vf) * 0.06 * dt * 10;
      if (Math.abs(vr) > 5 && Math.random() < 0.5) burst('dust', this.pos.x - f.x * this.len * 0.4, this.pos.y + 0.2, this.pos.z - f.z * this.len * 0.4, 1, 0.8);
      const nf = this.forward.clone(), nr = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
      this.vel.x = nf.x * vf + nr.x * vr; this.vel.z = nf.z * vf + nr.z * vr;
      if (nitro && thr > 0) burst('fire', this.pos.x - nf.x * this.len * 0.5, this.pos.y + 0.45, this.pos.z - nf.z * this.len * 0.5, 1, 0.25);
    } else this.yaw += this.steer * 0.3 * dt;
    if (this.uBrake) this.uBrake.value = (brk > 0 && Math.abs(vf) > 0.5) || rev > 0 ? 1 : 0;
    this.speed = vf;
    // integrate
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    const gPrev = this.gPrev ?? this.pos.y, g = this.ground(this.pos.y + 0.5);
    if (this.airborne) {
      this.vy -= 22 * dt; this.pos.y += this.vy * dt;
      this.pitch = damp(this.pitch, clamp(-this.vy * 0.02, -0.4, 0.4), 2, dt);
      if (this.pos.y <= g) { this.pos.y = g; if (this.vy < -14) { this.damage(-this.vy * 0.6); sfx('crash', 0.8, this.game.camDist(this.pos)); this.game.shake(0.4); } this.vy = 0; this.airborne = false; }
    } else {
      const climb = (g - gPrev) / Math.max(dt, 1e-3);
      if (g < this.pos.y - 0.6 && Math.abs(vf) > 8) { this.airborne = true; this.vy = clamp(this.lastClimb || 0, -5, 25); }
      else { this.pos.y = g; this.lastClimb = clamp(climb, -10, 30); }
      // body attitude from terrain
      const L = (this.len || 4) * 0.4, W = (this.wid || 1.8) * 0.4;
      const hf = M.groundAt(this.pos.x + f.x * L, this.pos.z + f.z * L, this.pos.y + 1.2, 1.2), hr = M.groundAt(this.pos.x - f.x * L, this.pos.z - f.z * L, this.pos.y + 1.2, 1.2);
      const hl = M.groundAt(this.pos.x - right.x * W, this.pos.z - right.z * W, this.pos.y + 1.2, 1.2), hrr = M.groundAt(this.pos.x + right.x * W, this.pos.z + right.z * W, this.pos.y + 1.2, 1.2);
      this.slope = -Math.atan2(hf - hr, 2 * L); this.pitch = damp(this.pitch, this.slope - clamp(thr * 0.025 - brk * 0.035, -0.04, 0.04), 10, dt);
      this.roll = damp(this.roll, Math.atan2(hrr - hl, 2 * W) + clamp(vr * 0.004 + this.steer * vf * 0.003, -0.08, 0.08), 8, dt);
      // motorbikes lean into the turn (and rest on the side stand when parked)
      if (S.bike) { const yr = (vf * Math.tan(this.steer)) / 2.1; this.roll = damp(this.roll, this.driver ? clamp(-Math.atan(vf * yr / 9.8), -0.85, 0.85) : Math.abs(vf) < 0.5 ? 0.17 : 0, this.driver ? 6 : 3, dt); if (this.driver && thr > 0 && nitro && vf < 25) this.pitch = damp(this.pitch, -0.22, 6, dt); }
    }
    this.gPrev = this.pos.y;
    // collisions (two circles)
    const r = (this.wid || 1.8) * 0.55, off = (this.len || 4) * 0.28;
    const hit = Math.max(this.collide(r, f.x * off, f.z * off), this.collide(r, -f.x * off, -f.z * off));
    if (hit > 4) { this.damage(hit * 0.9); sfx('crash', clamp(hit / 30, 0.3, 1), this.game.camDist(this.pos)); burst('spark', this.pos.x + f.x * this.len * 0.5, this.pos.y + 0.6, this.pos.z + f.z * this.len * 0.5, 12); if (this.driver === this.game.player) this.game.shake(clamp(hit / 30, 0.1, 0.6)); }
    // water
    if (this.pos.y < M.waterLevelAt(this.pos.x, this.pos.z) - 1.0) { this.vel.multiplyScalar(Math.exp(-3 * dt)); if (!this.sunk) { this.sunk = true; burst('splash', this.pos.x, this.pos.y + 1, this.pos.z, 30, 2); sfx('splash'); if (this.driver) this.game.ejectFrom(this, false); } }
    // wheels
    for (const w of this.wheels) { w.m.rotation.x += (vf / (w.r || 0.35)) * dt; if (w.front) w.m.rotation.y = this.steer; }
    this.pos.x = clamp(this.pos.x, -M.HALF + 5, M.HALF - 5); this.pos.z = clamp(this.pos.z, -M.HALF + 5, M.HALF - 5);
  }
  updBoat(dt, c) {
    const S = this.spec, f = this.forward.clone(), wl = M.waterLevelAt(this.pos.x, this.pos.z), h = M.terrainH(this.pos.x, this.pos.z);
    let vf = this.vel.dot(f);
    const thr = c ? c.my : 0;
    vf += thr * S.acc * dt * (thr > 0 ? Math.max(0.05, 1 - Math.pow(vf / S.top, 2)) : 0.6); vf *= Math.exp(-0.25 * dt);
    this.yaw -= (c ? c.mx : 0) * dt * clamp(Math.abs(vf) / 10, 0.2, 1) * 0.9;
    const nf = this.forward; this.vel.set(nf.x * vf, 0, nf.z * vf);
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (M.terrainH(nx, nz) < wl - 0.6) { this.pos.x = nx; this.pos.z = nz; } else { this.vel.multiplyScalar(-0.3); if (Math.abs(vf) > 5) sfx('crash', 0.5, this.game.camDist(this.pos)); }
    this.speed = vf; const t = U.uTime.value;
    this.pos.y = wl + 0.05 + Math.sin(t * 2 + this.pos.x * 0.1) * 0.12;
    this.pitch = damp(this.pitch, -clamp(vf / S.top, 0, 1) * 0.12 + Math.sin(t * 1.6) * 0.03, 4, dt); this.roll = damp(this.roll, (c ? c.mx : 0) * 0.12 * clamp(vf / 20, 0, 1), 4, dt);
    if (Math.abs(vf) > 6 && Math.random() < 0.6) burst('splash', this.pos.x - nf.x * 3, wl + 0.1, this.pos.z - nf.z * 3, 1, 0.6);
    if (h > wl - 0.3) { this.pos.y = Math.max(this.pos.y, h); }
  }
  updHeli(dt, c) {
    const on = !!this.driver && !this.dead; this.rotor = damp(this.rotor, on ? 1 : 0, 0.8, dt);
    this.rotorM.rotation.y += this.rotor * 28 * dt; this.tailM.rotation.x += this.rotor * 40 * dt;
    const g = this.ground(this.pos.y + 0.5);
    if (c && on) {
      const lift = (c.up ? 1 : 0) - (c.down ? 1 : 0);
      const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), r = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
      const auth = this.rotor > 0.6 ? 1 : 0;
      this.vel.addScaledVector(f, c.my * 26 * dt * auth).addScaledVector(r, c.mx * 16 * dt * auth);
      this.vel.y += lift * 16 * dt * auth;
      if (c.camYaw !== undefined && (Math.abs(c.my) > 0.1 || c.yawFollow)) this.yaw = dampAngle(this.yaw, c.camYaw, 1.6, dt);
      if (c.yaw) this.yaw += c.yaw * 1.4 * dt;
      this.pitch = damp(this.pitch, c.my * 0.28, 3, dt); this.roll = damp(this.roll, -c.mx * 0.3, 3, dt);
      if (c.fire && this.game.time > (this.nextFire || 0)) { this.nextFire = this.game.time + 0.09; this.game.vehicleGun(this, 2.5, false); }
    } else { this.pitch = damp(this.pitch, 0, 2, dt); this.roll = damp(this.roll, 0, 2, dt); }
    this.vel.y -= (1 - this.rotor) * 9.8 * dt;
    this.vel.multiplyScalar(Math.exp(-0.75 * dt));
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y < g) { if (this.vel.y < -9) this.damage(-this.vel.y * 3); this.pos.y = g; this.vel.y = Math.max(0, this.vel.y); this.vel.x *= 0.8; this.vel.z *= 0.8; }
    const hit = this.collide(3.2); if (hit > 5) { this.damage(hit * 2); sfx('crash', 1, this.game.camDist(this.pos)); }
    this.pos.y = Math.min(this.pos.y, 2600);
    this.q.setFromEuler(_e.set(this.pitch, this.yaw, this.roll, 'YXZ'));
    this.speed = this.vel.length(); this.throttle = this.rotor;
    if (this.rotor > 0.5 && this.pos.y - g < 25) for (let k = 0; k < 2; k++) burst(M.waterLevelAt(this.pos.x, this.pos.z) > g ? 'splash' : 'dust', this.pos.x + (Math.random() - 0.5) * 16, Math.max(g, M.waterLevelAt(this.pos.x, this.pos.z)) + 0.3, this.pos.z + (Math.random() - 0.5) * 16, 1, 1);
  }
  updPlane(dt, c) {
    const S = this.spec, on = !!this.driver && !this.dead;
    if (c && on) {
      if (c.up) this.throttle = Math.min(1, this.throttle + dt * 0.6); if (c.down) this.throttle = Math.max(0, this.throttle - dt * 0.6);
      this.after = this.fighter && c.boost && this.throttle > 0.9 ? 1 : damp(this.after, 0, 3, dt);
    } else this.throttle = damp(this.throttle, 0, 0.5, dt);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.q);
    const thrust = (this.throttle * (this.fighter ? 38 : 26) + this.after * 45);
    this.speed += (thrust - this.speed * this.speed * (this.fighter ? 0.00034 : 0.00048) - fwd.y * 9.8) * dt;
    this.speed = Math.max(0, this.speed);
    const g = this.ground(this.pos.y + 1), onGround = this.pos.y <= g + 0.05;
    const authority = clamp(this.speed / S.stall, 0, 1.4);
    if (c && on) {
      const pr = -c.my * (this.fighter ? 1.9 : 1.1) * authority, rr = -c.mx * (this.fighter ? 3.2 : 1.6) * authority, yr = (c.yaw || 0) * 0.5 * authority;
      if (onGround) { this.q.multiply(_q.setFromEuler(_e.set(Math.min(pr, 0) * (this.speed > S.rot ? 1 : 0) * dt, (-c.mx * 0.6 * clamp(this.speed / 15, 0, 1)) * dt, 0))); }
      else this.q.multiply(_q.setFromEuler(_e.set(pr * dt, yr * dt, rr * dt)));
      if (c.fire && this.fighter && this.game.time > (this.nextFire || 0)) { this.nextFire = this.game.time + 0.05; this.game.vehicleGun(this, this.len * 0.5, false); }
      if (c.missile && this.fighter && this.missiles > 0 && this.game.time > (this.nextMissile || 0)) { this.nextMissile = this.game.time + 0.6; this.missiles--; this.game.fireMissile(this); }
    }
    // bank-induced turn
    const bank = Math.asin(clamp(-new THREE.Vector3(1, 0, 0).applyQuaternion(this.q).y, -1, 1));
    if (!onGround) this.q.premultiply(_q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), bank * 0.6 * authority * dt));
    this.q.normalize();
    const nf = new THREE.Vector3(0, 0, 1).applyQuaternion(this.q);
    const sink = Math.max(0, S.stall - this.speed) * 0.35;
    this.vel.copy(nf).multiplyScalar(this.speed); this.vel.y -= sink + (onGround ? 0 : 0);
    if (onGround && this.speed < S.rot) this.vel.y = Math.min(this.vel.y, 0);
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y < g) {
      const vy = this.vel.y, nose = nf.y, roll = Math.abs(bank);
      if (vy < -9 || roll > 0.5 || nose < -0.25 || (this.speed > 40 && !this.onRunway())) { if (this.speed > 25 || vy < -9) { this.damage(200); return; } }
      this.pos.y = g;
      const e = new THREE.Euler().setFromQuaternion(this.q, 'YXZ'); this.q.setFromEuler(e.set(Math.min(e.x, 0), e.y, 0, 'YXZ'));
      this.speed *= Math.exp(-(c && c.down && this.throttle < 0.05 ? 0.6 : 0.06) * dt);
    }
    if (this.after > 0.2) burst('fire', this.pos.x - nf.x * 8, this.pos.y + 1.9 - nf.y * 8, this.pos.z - nf.z * 8, 2, 0.7);
    const hit = this.collide(4); if (hit > 3 && this.pos.y > g + 1) this.damage(200);
    this.pos.y = Math.min(this.pos.y, 6000);
    const e2 = new THREE.Euler().setFromQuaternion(this.q, 'YXZ'); this.yaw = e2.y; this.pitch = e2.x; this.roll = e2.z;
  }
  onRunway() { const ap = M.L.airport; return this.pos.x > ap.runX0 - 30 && this.pos.x < ap.runX1 + 30 && Math.abs(this.pos.z - ap.runZ) < 70; }
  // which LOD meshes are switched on: each one covers its own range plus the cross-dissolve bands (the shader does the hand-over)
  lodUpdate(cam) {
    if (!this.lodM) return;
    const B = this.lodB, d = Math.hypot(cam.x - this.pos.x, cam.z - this.pos.z), m = 4;
    const det = d < B.a + B.w + m, mid = d > B.a - B.w - m && (!this.lodF || d < B.b + B.w2 + m), far = !!this.lodF && d > B.b - B.w2 - m;
    this.obj.visible = d < B.gone + m;
    if (det !== this.detailOn) { this.detailOn = det; for (const o of this.detail) o.visible = det; }
    this.lodM.visible = mid; if (this.lodF) this.lodF.visible = far;
  }
  remove() { this.stopEngine(); this.game.scene.remove(this.obj); }
}
