// Game orchestrator.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as M from './mapdata.js';
import { buildWorld, world, updateWorld, updateTrees, updateWorldLOD } from './world.js';
import { loadCarModels } from './carmodels.js';
import { updateTerrain, updateGrass, T as TR } from './terrain.js';
import { SkySystem } from './sky.js';
import { U } from './shaders.js';
import { Character, CameraRig, WEAPONS, ATK } from './player.js';
import { Pose } from './human.js';
import { Vehicle } from './vehicles.js';
import { CARS } from './vehicle_models.js';
import { Traffic } from './traffic.js';
import { buildCrowd, updateCrowd, setPanic, crowdNear, crowdRay, densityAt, crowd } from './crowd.js';
import { spawnAnimals, buildBirds, loadHorseModel } from './animals.js';
import { Serpent } from './serpent.js';
import { Makara, Rakshasa } from './bosses.js';
import { Underwater, REEF, WRECK } from './underwater.js';
import { Police } from './police.js';
import { loadAvatar, Avatar } from './avatars.js';
import { NPCs } from './npc.js';
import { Interiors } from './interiors.js';
import { Weather, SEASONS } from './weather.js';
import { Missions } from './missions.js';
import { initFx, updateFx, burst, explosion, tracer, setWeb, fx, initRain, updateRain } from './fx.js';
import { audio, initAudio, sfx, setMood, say, updateAmbience, setVolumes } from './audio.js';
import { input, pollInput, endFrame } from './input.js';
import { clamp, lerp, damp, angDiff, nextFrame } from './util.js';

const V3 = THREE.Vector3;
// weapons + powers the player cycles with Tab (powers appear once unlocked by defeating a boss)
export const TOOLS = [
  { id: 'fists', name: 'Fists' }, { id: 'pistol', name: 'Pistol' }, { id: 'rifle', name: 'Assault Rifle' }, { id: 'web', name: 'Web Shooter' },
  { id: 'flash', name: 'Flash Speed', power: 'flash', unlockLine: 'The Naag Mani... I can feel lightning in my legs!' },
  { id: 'slam', name: 'Thunder Slam', power: 'slam', unlockLine: 'The Makara pearl. Watch this — the ground will shake.' },
  { id: 'fly', name: 'Flight', power: 'flight', unlockLine: 'The Rakshasa crown... we can fly!' },
];
const BLACK = new THREE.Color(0);
export class Game {
  constructor(renderer, q, presetKey, hud) {
    this.renderer = renderer; this.q = q; this.presetKey = presetKey; this.hud = hud; hud.game = this;
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.4, q.far);
    this.rig = new CameraRig(this.cam); this.time = 0; this.paused = false; this.money = 2500; this.timeScale = 60; this.fpsOn = false;
    this.vehicles = []; this.missiles = []; this.threats = []; this.powersUnlocked = new Set(); this.world = world; this.camMode = 'foot'; this.fps = 60;
  }
  async init(progress) {
    const S = this.scene, q = this.q;
    this.sky = new SkySystem(S, this.renderer); this.sky.setShadowQuality(q.shadowMap, q.shadowRange);
    initFx(S);
    await buildWorld(S, q, progress, this.renderer);
    await progress('Populating Daman with people', 0.95);
    crowd.renderer = this.renderer; this.crowdN = buildCrowd(S, q);
    await progress('Starting traffic', 0.96);
    await Promise.all([loadCarModels(q), loadHorseModel()]);
    this.traffic = new Traffic(this, q);
    await progress('Waking the wildlife', 0.97);
    this.animals = spawnAnimals(this, q); this.birds = buildBirds(S);
    this.serpent = new Serpent(this); this.makara = new Makara(this); this.rakshasa = new Rakshasa(this);
    this.bosses = [this.serpent, this.makara, this.rakshasa];
    this.uw = new Underwater(this); this.police = new Police(this);
    world.labels.push({ name: 'Jampore Reef · São Jerónimo wreck (dive!)', x: WRECK.x, z: WRECK.z });
    for (const [b, nm] of [[this.serpent, 'BOSS · Kaala Naag Lair'], [this.makara, 'BOSS · Makara Bay'], [this.rakshasa, 'BOSS · Rakshasa Peak']]) { const h = b.home(); world.labels.push({ name: nm, x: h.x, z: h.z, boss: true }); }
    // put world content under one group so interiors can hide it without changing the light count (no shader recompiles)
    this.worldRoot = new THREE.Group(); this.worldRoot.name = 'worldRoot';
    const keepInScene = new Set([this.sky.sun, this.sky.sun.target, this.sky.hemi, ...fx.pool]);
    for (const o of S.children.slice()) if (!keepInScene.has(o)) this.worldRoot.add(o);
    S.add(this.worldRoot);
    this.worldObjs = [this.worldRoot];
    this.npcs = new NPCs(this); this.interior = new Interiors(this); this.weather = new Weather(this); this.missions = new Missions(this);
    this.rain = initRain(S, q.desktop ? 9000 : 3500);
    // heroes
    const sp = M.spawns.start;
    this.vikas = new Character(this, { skin: 0xc68642, top: 0x5f6a70, bottom: 0x1f3550, shoes: 0x3a2a20, sole: 0x2a221c, hair: 0x0e0a08, hairStyle: 'spiky', beard: true, jacket: 0x151515, sleeves: 'long', eyes: 0x2a1a0e }, { name: 'Vikas', detail: 2, team: 'hero', x: sp.x, z: sp.z, yaw: sp.ang, hp: 230, runSpeed: 5.7, sprintSpeed: 9.4, jumpV: 7.2, climbSpeed: 3.8, powers: true, dmgMul: 1.35 });
    this.mira = new Character(this, { female: true, skin: 0xd29b67, top: 0xb71c1c, bottom: 0x1c2733, shoes: 0xf0f0f0, sole: 0xffffff, hair: 0x120c08, hairStyle: 'pony', midriff: false, sleeves: 'short', jacket: null, eyes: 0x3b2314 }, { name: 'Mira', detail: 2, team: 'hero', x: sp.x + 1.5, z: sp.z - 1.5, yaw: sp.ang, hp: 190, runSpeed: 6.0, sprintSpeed: 10.2, jumpV: 7.8, climbSpeed: 4.6, powers: true, dmgMul: 1.0 });
    this.arjun = new Character(this, { skin: 0xa86b3c, top: 0x1f3a5f, bottom: 0x2b2b2b, shoes: 0x5d4037, sole: 0x2a221c, hair: 0x0a0806, hairStyle: 'short', beard: true, jacket: null, sleeves: 'short', eyes: 0x24160c, build: 1.08 }, { name: 'Arjun', detail: 2, team: 'hero', x: sp.x - 1.5, z: sp.z + 1.5, yaw: sp.ang, hp: 210, runSpeed: 5.8, sprintSpeed: 9.6, jumpV: 7.0, climbSpeed: 3.6, powers: false, dmgMul: 1.15 });
    this.heroes = [this.vikas, this.mira, this.arjun]; this.player = this.vikas; this.companion = this.mira; this.friends = [this.mira, this.arjun];
    await progress('Dressing Vikas, Mira and Arjun', 0.985);
    await this.loadAvatars();
    for (const h of this.heroes) h.weapon = 0;
    // parked vehicles
    for (const c of M.spawns.cars) this.addVehicle('car', c.key || (c.kind === 'super' ? 'rakshas' : c.kind === 'gt' ? 'agni' : 'bison'), c.color, c.x, c.z, c.ang);
    for (const b of M.spawns.bikes || []) this.addVehicle('car', b.key, CARS[b.key].paints[b.paint || 0], b.x, b.z, b.ang);
    const extra = [['shera', 0x0b4fb3, -2255.4, -640, 0], ['gajraj', 0x0b0b0b, -2244.6, -600, Math.PI], ['bison', 0x7a0a0a, -2255.4, -560, 0], ['regent', 0x0d0d0d, -2244.6, -1300, Math.PI], ['amba', 0xf5f5f5, -2244.6, 700, Math.PI], ['jeep', 0x556b2f, M.L.jungleCamp.x - 20, M.L.jungleCamp.z + 25, 0.5], ['kaveri', 0xb71c1c, -2255.4, 3300, 0], ['jeep', 0xd84315, M.L.ghatEnd ? M.L.ghatEnd.x - 20 : 6400, M.L.ghatEnd ? M.L.ghatEnd.z : -500, 1]];
    for (const [k, col, x, z, a] of extra) this.addVehicle('car', k, col, x, z, a);
    for (const h of M.spawns.heli) this.addVehicle('heli', 'heli', 0xffffff, h.x, h.z, 0);
    this.addVehicle('plane', 'jet', 0xffffff, M.spawns.plane[0].x, M.spawns.plane[0].z, Math.PI / 2);
    for (const j of M.spawns.jet) this.addVehicle('jet', 'fighter', 0xd0d4d8, j.x, j.z, j.ang);
    this.addVehicle('jet', 'fighter', 0xb0bec5, M.spawns.jet[0].x + 40, M.spawns.jet[0].z + 10, Math.PI / 2);
    for (const b of M.spawns.boats) this.addVehicle('boat', 'boat', 0xffffff, b.x, b.z, 0);
    this.load();
    this.setupPost();
    await progress('Lighting the sky', 0.99);
    this.sky.waterMats = [TR.sea, TR.lake].filter(Boolean).map((m) => m.material);
    await this.sky.loadPhotoSky(q);
    this.sky.bakeEnv(this.sky.photo ? this.sky.photo.keys.map((k) => k.h) : q.desktop ? [0, 5.8, 6.6, 8, 10.5, 13, 15.5, 17.3, 18.3, 19.2, 21.5] : [0, 6.2, 9, 13, 17.4, 18.6, 21.5]);
    this.sky.updateEnv(this.sky.hour);
    this.renderer.shadowMap.autoUpdate = false; this.frameNo = 0;
    this.rig.yaw = this.player.yaw + Math.PI;
    this.hud.stars(0);
  }
  addVehicle(kind, key, color, x, z, ang) { const v = new Vehicle(this, kind, key, color, x, z, ang); this.vehicles.push(v); return v; }
  setupPost() {
    const q = this.q, r = this.renderer;
    if (!q.bloom && !q.ao) { this.composer = null; return; }
    const rt = new THREE.WebGLRenderTarget(innerWidth * r.getPixelRatio(), innerHeight * r.getPixelRatio(), { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.cam));
    if (q.ao) { const ao = new GTAOPass(this.scene, this.cam, innerWidth, innerHeight);
      // grass and flat impostor cards don't belong in the AO normal/depth pass (cost + wrong occlusion)
      const ov = ao.overrideVisibility.bind(ao), rv = ao.restoreVisibility.bind(ao); let hidden = [];
      ao.overrideVisibility = () => { ov(); hidden = []; this.scene.traverseVisible((o) => { if (o.userData.noAO || (o.material && o.material.isShaderMaterial)) { hidden.push(o); } }); for (const o of hidden) o.visible = false; };
      ao.restoreVisibility = () => { for (const o of hidden) o.visible = true; hidden = []; rv(); }; ao.blendIntensity = 0.85; ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 12 }); this.composer.addPass(ao); this.aoPass = ao; }
    if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.45, 0.82); this.composer.addPass(this.bloom); }
    this.composer.addPass(new OutputPass());
  }
  resize() {
    const w = innerWidth, h = innerHeight; this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
  }
  // ---------------- helpers ----------------
  playerPos() { const p = this.player; if (p.vehicle) return p.vehicle.pos; if (p.mount) return p.mount.pos; return p.pos; }
  camDist(p) { return this.cam.position.distanceTo(p); }
  shake(a) { fx.shake = Math.max(fx.shake, a); }
  markers() { const m = this.missions.markers(); for (const st of this.missions.starts()) m.push({ x: st.x, z: st.z, color: '#ffd54f', mission: st.m.name }); for (const b of this.bosses || []) if (!b.defeated && !b.active) { const h = b.home(); m.push({ x: h.x, z: h.z, color: b.color || '#d500f9', boss: b.name }); } return m; }
  threatAt(pos) {
    for (const t of this.threats) if (this.time - t.t < 6 && t.p.distanceTo(pos) < t.r) return t.p;
    const P = this.player; if (!P.vehicle && P.pos.distanceTo(pos) < (P.state === 'web' ? 25 : 7)) return P.pos;
    if (P.vehicle && P.vehicle.pos.distanceTo(pos) < 18 && Math.abs(P.vehicle.speed) > 4) return P.vehicle.pos;
    for (const b of this.bosses) if (b.active && b.head.distanceTo(pos) < 120) return b.head;
    return null;
  }
  addThreat(p, r) { this.threats.push({ p: p.clone(), r, t: this.time }); if (this.threats.length > 20) this.threats.shift(); }
  // ---- freeflow combat helpers ----
  freeflowTarget(c, inDir) {
    let best = null, bs = -1e9;
    const list = [...this.npcs.enemies, ...this.animals.filter((a) => (a.type === 'tiger' || a.angry > 0) && !a.dead)];
    for (const e of list) {
      if (e.alive === false || e.dead || e.state === 'down') continue;
      const dx = e.pos.x - c.pos.x, dz = e.pos.z - c.pos.z, d = Math.hypot(dx, dz); if (d > 7.5 || Math.abs(e.pos.y - c.pos.y) > 2.5) continue;
      const fx = inDir ? inDir.x : Math.sin(c.yaw), fz = inDir ? inDir.z : Math.cos(c.yaw), al = (dx * fx + dz * fz) / Math.max(d, 0.01);
      if (al < 0.25 && d > 2.2) continue;
      const sc = al * 3 - d * 0.55 + (e.telegraph > 0 ? 1 : 0); if (sc > bs) { bs = sc; best = e; }
    }
    return best || this.nearestFoe(c, 3);
  }
  downedFoe(c, r) { for (const e of this.npcs.enemies) if (e.alive && e.state === 'down' && Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z) < r) return e; return null; }
  counterTarget(c) { let best = null, bd = 3.4; for (const e of this.npcs.enemies) { if (!e.alive || !(e.telegraph > 0) || e.state === 'down') continue; const d = Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z); if (d < bd) { bd = d; best = e; } } return best; }
  onCounter(c, e) { e.telegraph = 0; if (e.ai) { e.ai.wind = 0; e.ai.cd = 1.4; } e.atk = null; e.stun = 0.7; this.slowmo(0.45, 0.28); this.hud.pop && this.hud.pop('COUNTER!', '#4fc3f7'); sfx('punch', 1); }
  slowmo(t, k) { if (!this.slow || this.slow.t <= 0 || k < this.slow.k) this.slow = { t, k }; }
  nearestFoe(c, r) {
    let best = null, bd = r;
    const list = c.team === 'hero' ? [...this.npcs.enemies, ...this.animals.filter((a) => (a.type === 'tiger' || a.angry > 0) && !a.dead)] : this.heroes;
    for (const e of list) { if (e.alive === false || e.dead) continue; const p = e.pos; const d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z); if (d < bd && Math.abs(p.y - c.pos.y) < 3) { bd = d; best = e; } }
    return best;
  }
  // ---------------- combat ----------------
  meleeHit(att, A) {
    const f = att.forward(), dmg = A.dmg * (att.dmgMul || 1); let hit = false, foes = 0;
    const inFront = (p) => { const dx = p.x - att.pos.x, dz = p.z - att.pos.z, d = Math.hypot(dx, dz); return d < A.range && Math.abs(p.y - att.pos.y) < 2 && (A.aoe || (dx * f.x + dz * f.z) / Math.max(d, 0.01) > 0.35); };
    if (att.team === 'hero') {
      for (const e of this.npcs.enemies) {
        if (!e.alive || !inFront(e.pos)) continue;
        if (A.ground ? e.state !== 'down' : e.state === 'down' && !A.aoe) continue;      // stomps hit downed foes, strikes hit standing ones
        e.damage(dmg, att, A.kb, A.down); hit = true; foes++; e.ai && (e.ai.alert = true); e.telegraph = 0; if (e.ai) e.ai.wind = 0;
        if (A.launch && e.alive) e.vel.y = Math.max(e.vel.y, A.launch);
      }
      for (const a of this.animals) if (!a.dead && !a.rider && inFront(a.pos)) { a.hurt(dmg, att); hit = true; }
      for (const c of this.npcs.civs) if (c.alive && c.state !== 'down' && inFront(c.pos)) { c.damage(dmg * 0.5, att, A.kb, true); hit = true; }
      if (att === this.player && !this.interior.active) for (const p of crowdNear(att.pos.x + f.x, att.pos.z + f.z, A.range)) { if (inFront(p)) { const vel = new V3(f.x * A.kb, 2, f.z * A.kb); this.npcs.knockCivilian(p, att.pos, vel); this.npcs.crime(1); hit = true; break; } }
      for (const c of this.traffic.near(att.pos.x, att.pos.z, 3.5)) { if (inFront(new V3(c.x, c.y, c.z))) { this.traffic.hit(c, dmg * 0.3, att); hit = true; } }
      for (const b of this.bosses) { const part = b.active ? b.meleeTest(att.pos, A.range) : null; if (part) { b.hurt(dmg, part); hit = true; } }
    } else {
      for (const h of this.heroes) if (h.alive && !h.vehicle && inFront(h.pos)) { h.damage(dmg, att, A.kb, A.down); hit = true; }
    }
    if (hit) {
      sfx('punch', 1, this.camDist(att.pos)); burst('spark', att.pos.x + f.x * 1.2, att.pos.y + (A.ground ? 0.3 : 1.3), att.pos.z + f.z * 1.2, A.fin ? 16 : 5, A.fin ? 0.9 : 0.4);
      if (att === this.player) {
        this.shake(A.fin ? 0.5 : A.down ? 0.25 : 0.1); this.slowmo(A.fin ? 0.5 : 0.06, A.fin ? 0.25 : 0.12);     // hit-stop on every connected blow
        if (foes) { this.combo = this.combo || { n: 0, t: 0 }; this.combo.n += foes; this.combo.t = 2.4; this.hud.combo && this.hud.combo(this.combo.n); }
        if ((A.fin || A === ATK.counter) && foes) this.finCam = 0.7;
        if (A.fin && foes) this.hud.pop && this.hud.pop('FINISHER!', '#ffca28'); else if (A.ground && foes) this.hud.pop && this.hud.pop('TAKEDOWN', '#ff7043');
      }
    }
  }
  // world ray: buildings + terrain; returns distance
  rayWorld(o, d, maxT) {
    let best = maxT;
    for (let s = 0; s < maxT; s += 3) {
      const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s;
      if (!this.interior.active && y < M.terrainH(x, z)) { best = Math.min(best, Math.max(0, s - 1.5)); break; }
      for (const ci of M.collidersNear(x, z)) {
        const c = M.colliders[ci]; if (c.tree) continue;
        // slab test
        let t0 = 0, t1 = maxT;
        for (const [oo, dd, lo, hi] of [[o.x, d.x, c.x0, c.x1], [o.y, d.y, c.y0, c.y1], [o.z, d.z, c.z0, c.z1]]) { if (Math.abs(dd) < 1e-6) { if (oo < lo || oo > hi) { t0 = 1e9; break; } } else { let a = (lo - oo) / dd, b = (hi - oo) / dd; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); } }
        if (t0 <= t1 && t0 < best && t0 > 0.3) best = t0;
      }
      if (best < s) break;
    }
    return best;
  }
  rayHit(o, d, maxT, team, dmg, from) {
    let tW = this.rayWorld(o, d, maxT), hit = null;
    const capsule = (c, h0 = 0.2, h1 = 1.75, r = 0.42) => { const vx = c.pos.x - o.x, vz = c.pos.z - o.z, t = vx * d.x + (c.pos.y + 1 - o.y) * d.y + vz * d.z; if (t < 0 || t > tW) return; const px = o.x + d.x * t - c.pos.x, py = o.y + d.y * t - c.pos.y, pz = o.z + d.z * t - c.pos.z; if (px * px + pz * pz < r * r && py > h0 - 0.2 && py < h1 + 0.1 && (!hit || t < hit.t)) hit = { t, char: c, head: py > 1.5 }; };
    if (team === 'hero') { for (const e of this.npcs.enemies) if (e.alive) capsule(e); for (const c of this.npcs.civs) if (c.alive) capsule(c); for (const a of this.animals) if (!a.dead && !a.rider) { const vx = a.pos.x - o.x, vy = a.pos.y + a.S.back * 0.7 - o.y, vz = a.pos.z - o.z, t = vx * d.x + vy * d.y + vz * d.z; if (t > 0 && t < tW) { const dx = o.x + d.x * t - a.pos.x, dy = o.y + d.y * t - (a.pos.y + a.S.back * 0.7), dz = o.z + d.z * t - a.pos.z, r = a.S.bodyR ? a.S.bodyR[2] : 0.4; if (dx * dx + dy * dy + dz * dz < r * r && (!hit || t < hit.t)) hit = { t, animal: a }; } } }
    else for (const h of this.heroes) if (h.alive && !h.vehicle && h.state !== 'seated') capsule(h);
    if (team !== 'hero') { const P = this.player; if (P.vehicle) { const v = P.vehicle, vx = v.pos.x - o.x, vy = v.pos.y + 1 - o.y, vz = v.pos.z - o.z, t = vx * d.x + vy * d.y + vz * d.z; if (t > 0 && t < tW) { const dx = o.x + d.x * t - v.pos.x, dy = o.y + d.y * t - v.pos.y - 1, dz = o.z + d.z * t - v.pos.z; if (dx * dx + dy * dy + dz * dz < 4 && (!hit || t < hit.t)) hit = { t, veh: v }; } } }
    const tc = this.traffic.ray(o, d, Math.min(tW, maxT)); if (tc && (!hit || tc.t < hit.t)) hit = { t: tc.t, car: tc.car };
    for (const v of this.vehicles) { if (v.dead || (from && from.vehicle === v)) continue; const vx = v.pos.x - o.x, vy = v.pos.y + 1 - o.y, vz = v.pos.z - o.z, t = vx * d.x + vy * d.y + vz * d.z; if (t < 0 || t > tW) continue; const dx = o.x + d.x * t - v.pos.x, dy = o.y + d.y * t - v.pos.y - 1, dz = o.z + d.z * t - v.pos.z, r = Math.max(v.wid, 2) * 0.6; if (dx * dx + dy * dy + dz * dz < r * r && (!hit || t < hit.t)) hit = { t, veh: v }; }
    for (const b of this.bosses) { const ts = b.ray(o, d, Math.min(tW, maxT)); if (ts && (!hit || ts.t < hit.t)) hit = { t: ts.t, boss: b, part: ts.part }; }
    if (team === 'hero' && !this.interior.active) { const cp = crowdRay(o, d, Math.min(tW, maxT, 120)); if (cp && (!hit || cp.t < hit.t)) hit = { t: cp.t, person: cp }; }
    const tEnd = hit ? hit.t : tW, end = o.clone().addScaledVector(d, tEnd);
    if (hit) {
      if (hit.char) hit.char.damage(dmg * (hit.head ? 2 : 1), from, 1.5, false);
      else if (hit.animal) hit.animal.hurt(dmg, from);
      else if (hit.car) this.traffic.hit(hit.car, dmg * 0.5, from);
      else if (hit.veh) { hit.veh.damage(dmg * 0.25); burst('spark', end.x, end.y, end.z, 6); sfx('hit', 0.6, this.camDist(end)); }
      else if (hit.boss) { hit.boss.hurt(dmg, hit.part); burst(hit.part === hit.boss.weak || hit.part === 'gem' ? 'venom' : 'spark', end.x, end.y, end.z, 6, 1); }
      else if (hit.person) { this.npcs.knockCivilian(hit.person, o, new V3(d.x * 3, 2, d.z * 3)); this.npcs.crime(2); }
    } else if (tW < maxT) burst('spark', end.x, end.y, end.z, 5, 0.6);
    return end;
  }
  shoot(sh, W, c) {
    const hand = sh.h.bones.handR.getWorldPosition(new V3()).add(sh.forward().multiplyScalar(0.25));
    let dir;
    if (sh === this.player) {
      if (c.aim) { const cf = this.rig.forward, cp = this.cam.position.clone(); const far = this.rayWorld(cp, cf, 300); const tgt = cp.addScaledVector(cf, Math.max(far, 4)); dir = tgt.sub(hand).normalize(); }
      else { const foe = this.nearestFoe(sh, 45); if (foe) { sh.yaw = Math.atan2(foe.pos.x - sh.pos.x, foe.pos.z - sh.pos.z); dir = new V3(foe.pos.x, foe.pos.y + 1.2, foe.pos.z).sub(hand).normalize(); } else { dir = this.rig.forward.clone(); dir.y = Math.max(dir.y, -0.2); dir.normalize(); sh.yaw = Math.atan2(dir.x, dir.z); } }
    } else dir = c.aimDir ? c.aimDir.clone() : sh.forward();
    dir.x += (Math.random() - 0.5) * W.spread; dir.y += (Math.random() - 0.5) * W.spread; dir.z += (Math.random() - 0.5) * W.spread; dir.normalize();
    const end = this.rayHit(hand, dir, W.range, sh.team === 'hero' ? 'hero' : 'foe', W.dmg * (sh === this.player ? 1 : 0.55), sh);
    burst('muzzle', hand.x, hand.y, hand.z, 1); tracer(hand, end); sfx(W.sound, 1, this.camDist(hand));
    this.addThreat(hand, 70);
    if (sh.team === 'hero' && !this.interior.active) { setPanic(hand.x, hand.z, 120); if (densityAt(hand.x, hand.z) > 0.3) this.npcs.crime(1); }
  }
  vehicleGun(v, off) {
    const f = v.kind === 'heli' ? this.rig.forward : new V3(0, 0, 1).applyQuaternion(v.q);
    const o = v.pos.clone().addScaledVector(f, off).add(new V3(0, v.kind === 'heli' ? 0.9 : 1.6, 0));
    const d = f.clone(); d.x += (Math.random() - 0.5) * 0.02; d.y += (Math.random() - 0.5) * 0.02; d.z += (Math.random() - 0.5) * 0.02; d.normalize();
    const end = this.rayHit(o, d, 600, 'hero', 30, this.player); tracer(o, end); sfx('cannon', 0.8, this.camDist(o)); this.addThreat(o, 100); setPanic(end.x, end.z, 150);
    if (Math.random() < 0.3) burst('muzzle', o.x, o.y, o.z, 1);
  }
  fireMissile(v) {
    const f = new V3(0, 0, 1).applyQuaternion(v.q), o = v.pos.clone().addScaledVector(f, 3).add(new V3(0, 1, 0));
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xff6600, emissiveIntensity: 0.4 }));
    mesh.position.copy(o); this.scene.add(mesh);
    this.missiles.push({ mesh, pos: o, vel: f.clone().multiplyScalar(Math.max(v.speed, 60) + 40), t: 0 }); sfx('missile', 1, this.camDist(o));
  }
  updateMissiles(dt) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]; m.t += dt;
      let tgt = null, tb = null; for (const b of this.bosses) if (b.active && b.head.distanceTo(m.pos) < 1500 && (!tb || b.head.distanceTo(m.pos) < tb.head.distanceTo(m.pos))) tb = b; if (tb) tgt = tb.target();
      if (tgt) { const want = tgt.clone().sub(m.pos).normalize().multiplyScalar(m.vel.length()); m.vel.lerp(want, 1 - Math.exp(-3 * dt)); }
      m.vel.multiplyScalar(1 + dt * 0.4); m.pos.addScaledVector(m.vel, dt); m.mesh.position.copy(m.pos); m.mesh.lookAt(m.pos.clone().add(m.vel));
      burst('smoke', m.pos.x, m.pos.y, m.pos.z, 1, 0.4);
      const hitS = tgt && m.pos.distanceTo(tgt) < 14; const g = M.groundAt(m.pos.x, m.pos.z);
      if (hitS || m.pos.y < g || m.t > 8) { explosion(m.pos.x, m.pos.y, m.pos.z, 1.6); sfx('boom', 1, this.camDist(m.pos)); if (hitS && tb) tb.hurt(380, 'head'); this.onExplosion(m.pos, 14); this.scene.remove(m.mesh); this.missiles.splice(i, 1); }
    }
  }
  onExplosion(p, r) {
    this.addThreat(p, 120); setPanic(p.x, p.z, 160);
    for (const c of [...this.npcs.enemies, ...this.heroes, ...this.npcs.civs]) { if (!c.alive || c.vehicle) continue; const d = c.pos.distanceTo(p); if (d < r) c.damage((1 - d / r) * 120, { pos: p }, 14 * (1 - d / r), true); }
    for (const car of this.traffic.near(p.x, p.z, r)) this.traffic.hit(car, 120, null);
    for (const v of this.vehicles) if (!v.dead && v.pos.distanceTo(p) < r * 0.8 && v.pos.distanceTo(p) > 0.5) v.damage(60);
    if (!this.interior.active) for (const per of crowdNear(p.x, p.z, r * 0.7, U.uTime.value, 6)) this.npcs.knockCivilian(per, p, new V3(per.x - p.x, 3, per.z - p.z).normalize().multiplyScalar(8));
    if (this.camDist(p) < 150) this.shake(clamp(1 - this.camDist(p) / 150, 0.1, 1));
  }
  onCharacterHurt(c, from) { if (c === this.player) { this.hud.hurtFlash(0.35); this.shake(0.15); } }
  onCharacterDied(c) {
    if (c.team === 'gang' || c.team === 'police') { this.money += c.ai && c.ai.boss ? 2000 : 60; if (c.team === 'police') this.npcs.crime(Math.min(5, this.npcs.wanted + 1)); }
    if (c === this.player) {
      this.hud.toast('KNOCKED OUT', 3, '#ff5252'); sfx('boom', 0.4);
      setTimeout(() => { this.money = Math.max(0, this.money - 500); for (const h of this.heroes) { const s = M.spawns.hospital; h.revive(s.x + (h === this.mira ? 1.5 : 0), s.z); } this.npcs.wanted = 0; this.hud.stars(0); this.hud.toast('Govt. Hospital Marwad · −₹500', 2.5, '#fff'); if (!this.missions.cur) for (const b of this.bosses) if (b.active) { if (b === this.serpent) { b.active = false; b.setVisible(false); this.hud.boss(null, 0); } else b.sleep(); } }, 3500);
    } else if (c === this.arjun) setTimeout(() => { if (!c.alive) { const p = this.player.pos; c.revive(p.x + 2, p.z - 2); say('Arjun', 'Back on my feet. Let us finish this!'); } }, 20000);
    else if (c === this.companion) setTimeout(() => { if (!c.alive) { const p = this.player.pos; c.revive(p.x - 2, p.z - 2); say(c.name, 'I am back! That one hurt.'); } }, 20000);
  }
  onSerpentDefeated() { this.money += 25000; this.hud.toast('KAALA NAAG DEFEATED!  + ₹25,000', 5, '#e040fb'); setMood('day'); setTimeout(() => this.unlockPower('flash'), 2500); }
  onBossDefeated(b) {
    const cash = b === this.makara ? 40000 : 60000; this.money += cash; this.save();
    this.hud.toast(`${b.name.toUpperCase()} DEFEATED!  + ₹${cash.toLocaleString('en-IN')}`, 5, b.color); setMood('day');
    setTimeout(() => this.unlockPower(b.reward), 2500);
  }
  // short boss intro: letterbox, title card, camera framing the boss
  startCinematic(target, title, sub, dur) { this.cine = { target, t: 0, dur }; this.hud.cinematic(title, sub, dur); }
  // go to a boss arena and start the fight (Bosses menu / map)
  fightBoss(b) {
    const h = b.home(); this.fastTravel({ name: b.name, x: h.x, z: h.z });
    if (b.defeated) b.defeated = false;
    if (b === this.rakshasa) { b.pos.set(b.center.x, 0, b.center.z); b.place(); }
    setTimeout(() => b.awaken(), 900);
  }
  // ---------------- vehicles / mounts ----------------
  enterVehicle(v) {
    const p = this.player; p.vehicle = v; v.driver = p; p.state = 'seated'; p.vel.set(0, 0, 0); p.anchor = null; setWeb(null);
    v.obj.add(p.obj); p.obj.position.copy(v.seat); p.obj.rotation.set(0, 0, 0); p.seatPose = () => Pose.drive(v.kind === 'car' && v.spec.P && v.spec.P.roofY < 1.35);
    if (v.key === 'scooter') { p.seatPose = () => ({ ...Pose.sit(true), thighL: [-1.2, 0, 0.2], thighR: [-1.2, 0, -0.2] }); }
    if (v.spec && v.spec.bike) { const sport = v.key === 'vayurr'; p.seatPose = (t) => Pose.bike(sport, t); }
    const c = this.companion;
    if (c.alive && c.pos.distanceTo(v.pos) < 30 && v.kind !== 'boat' && v.key !== 'scooter' && v.key !== 'vayurr') { c.vehicle = v; c.state = 'seated'; v.obj.add(c.obj); c.obj.position.set(-v.seat.x, v.seat.y, v.seat.z); if (v.spec && v.spec.bike) { c.obj.position.set(0, v.seat.y + 0.06, v.seat.z - 0.48); c.seatPose = () => ({ ...Pose.bike(false), armL: [-0.7, 0, 0.35], foreL: [-1.0, 0, 0], armR: [-0.7, 0, -0.35], foreR: [-1.0, 0, 0], spine: [0.1, 0, 0] }); } c.obj.rotation.set(0, 0, 0); c.seatPose = () => Pose.passenger(v.kind === 'car' && v.spec.P && v.spec.P.roofY < 1.35); if (v.kind === 'jet') c.setVisible(false); }
    v.startEngine(); sfx('door', 0.8);
    if (v.kind === 'car') say(p.name, ['Nice ride.', 'Hold on, Mira!', 'Let us see what this beauty can do.'][Math.floor(Math.random() * 3)]);
  }
  exitVehicle(eject = false) {
    const p = this.player, v = p.vehicle; if (!v) return;
    v.obj.remove(p.obj); this.scene.add(p.obj); v.driver = null; p.vehicle = null;
    const side = new V3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
    p.pos.copy(v.pos).addScaledVector(side, (v.wid || 2) * 0.5 + 1.0); p.yaw = v.yaw;
    const g = M.groundAt(p.pos.x, p.pos.z, v.pos.y + 3);
    if ((v.kind === 'jet' || v.kind === 'plane' || v.kind === 'heli') && v.pos.y - g > 20) { p.pos.copy(v.pos).add(new V3(0, 4, 0)); p.state = 'glide'; p.vel.copy(v.vel).multiplyScalar(0.5); p.vel.y = 6; p.t = 0; say(p.name, 'Ejecting!'); }
    else if (v.kind === 'boat' || M.waterLevelAt(p.pos.x, p.pos.z) > g + 1.2) { p.state = 'swim'; p.pos.y = M.waterLevelAt(p.pos.x, p.pos.z) - 1.2; }
    else { p.pos.y = g; p.state = 'ground'; }
    p.seatPose = null; v.stopEngine();
    const c = this.companion;
    if (c.vehicle === v) { v.obj.remove(c.obj); this.scene.add(c.obj); c.vehicle = null; c.setVisible(true); c.pos.copy(p.pos).addScaledVector(side, -((v.wid || 2) + 1.5)); c.state = p.state === 'glide' ? 'glide' : 'ground'; c.vel.copy(p.vel); c.t = 0; c.pos.y = p.state === 'glide' ? p.pos.y : M.groundAt(c.pos.x, c.pos.z, c.pos.y + 3); c.seatPose = null; }
    this.rig.yaw = v.yaw + Math.PI; sfx('door', 0.6);
  }
  ejectFrom(v, hurt) { if (v.driver === this.player) this.exitVehicle(true); for (const h of this.heroes) if (hurt && h.pos.distanceTo(v.pos) < 8) h.damage(35, { pos: v.pos }, 8, true); }
  hijack(c) {
    const spec = CARS[c.key]; this.traffic.remove(c);
    const v = this.addVehicle('car', c.key, c.tint.getHex(), c.x, c.z, c.yaw); v.hijacked = true; this.enterVehicle(v);
    if (c.key !== 'scooter' && c.key !== 'auto' && Math.random() < 0.7) say('NPC', ['Arre! My car!', 'Hey! Chor! Thief!', 'Police! Somebody stole my gaadi!'][Math.floor(Math.random() * 3)]);
    this.npcs.crime(1);
  }
  spawnMissionCar(key) { const p = this.player.pos, nr = M.nearestRoad(p.x, p.z); const x = nr ? nr.x : p.x + 4, z = nr ? nr.z : p.z; const v = this.addVehicle('car', key, CARS[key].paints[0], x, z, nr ? nr.ang : 0); this.missionCar = v; return v; }
  mountHorse(a) { const p = this.player; p.mount = a; a.rider = p; p.state = 'seated'; p.seatPose = () => Pose.ride(a.ph); this.scene.add(p.obj); sfx('neigh', 0.8); }
  dismountHorse() { const p = this.player, a = p.mount; if (!a) return; a.rider = null; a.want = 0; p.mount = null; p.state = 'ground'; p.seatPose = null; p.pos.copy(a.pos).add(new V3(Math.cos(a.yaw) * 1.2, 0, -Math.sin(a.yaw) * 1.2)); p.pos.y = M.groundAt(p.pos.x, p.pos.z); }
  // ---------------- weapons & powers ("tools") ----------------
  toolList(p) { return TOOLS.filter((t) => (!t.power || this.powersUnlocked.has(t.power)) && (t.id !== 'web' || p.powers)); }
  toolOf(p) { const L = this.toolList(p); return L.find((t) => t.id === p.toolId) || L[0]; }
  setTool(p, id) { if (this.toolList(p).some((t) => t.id === id)) { p.toolId = id; sfx('ui'); } }
  nextTool(p) { const L = this.toolList(p), i = L.findIndex((t) => t.id === this.toolOf(p).id); p.toolId = L[(i + 1) % L.length].id; sfx('ui'); this.hud.toast(L[(i + 1) % L.length].name.toUpperCase(), 0.9, '#fff'); }
  unlockPower(id, quiet) {
    if (this.powersUnlocked.has(id)) return; this.powersUnlocked.add(id); this.save();
    if (!quiet) { const t = TOOLS.find((t) => t.power === id); this.hud.toast(`NEW POWER: ${t.name.toUpperCase()}`, 4, '#ffd54f'); sfx('coin'); say('Vikas', t.unlockLine); }
  }
  usePower(p, power) {
    if (power === 'flash') {
      if (p.flash > 0) { p.flash = 0; return; }
      if ((p.flashCd || 0) > this.time) { this.hud.toast('Flash Speed recharging', 0.8, '#9e9e9e'); return; }
      p.flash = 8; sfx('whoosh', 1); burst('spark', p.pos.x, p.pos.y + 1, p.pos.z, 30, 1.5); this.shake(0.15);
    } else if (power === 'flight') {
      if (p.state === 'fly') { p.state = 'air'; p.usedFlip = true; return; }
      if (['ground', 'air', 'glide', 'chute', 'web', 'swim'].includes(p.state)) { if (p.state === 'ground' || p.state === 'swim') p.vel.y = 9; p.state = 'fly'; p.chute.visible = false; p.anchor = null; sfx('whoosh', 1); burst('dust', p.pos.x, p.pos.y, p.pos.z, 20, 1.2); }
    } else if (power === 'slam') {
      if (p.state === 'slam' || (p.slamCd || 0) > this.time) return;
      p.slamUp = p.state === 'ground'; p.state = 'slam'; p.slamT = 0; p.chute.visible = false; p.anchor = null; sfx('whoosh', 1);
    }
  }
  onPowerEnd(p, power) { if (power === 'flash') p.flashCd = this.time + 4; }
  slamImpact(p) {
    p.slamCd = this.time + 2.5; const P = p.pos;
    sfx('boom', 1, this.camDist(P)); this.shake(0.7); burst('dust', P.x, P.y + 0.2, P.z, 60, 4); burst('debris', P.x, P.y + 0.3, P.z, 25, 3);
    for (const e of this.npcs.enemies) if (e.alive) { const d = e.pos.distanceTo(P); if (d < 14) { e.damage(70 * (1 - d / 16), p, 12, true); } }
    for (const per of crowdNear(P.x, P.z, 9, U.uTime.value, 8)) this.npcs.knockCivilian(per, P, new V3((per.x - P.x) * 1.5, 6, (per.z - P.z) * 1.5));
    setPanic(P.x, P.z, 90);
    for (const b of this.bosses || []) if (b.active) b.slamHit(P, 18);
  }
  switchHero() {
    const a = this.player, b = this.companion; if (!b.alive || !a.alive) return;
    if (a.mount) this.dismountHorse();
    if (a.vehicle && b.vehicle === a.vehicle) { const v = a.vehicle; const sa = a.obj.position.clone(); a.obj.position.copy(b.obj.position); b.obj.position.copy(sa); v.driver = b; this.player = b; this.companion = a; const low = v.kind === 'car' && v.spec.P && v.spec.P.roofY < 1.35; b.seatPose = () => Pose.drive(low); a.seatPose = () => Pose.passenger(low); if (v.kind === 'jet') { b.setVisible(true); a.setVisible(false); } }
    else { if (a.vehicle) return; this.player = b; this.companion = a; this.rig.yaw = b.yaw + Math.PI; }
    sfx('ui'); this.hud.toast(this.player.name.toUpperCase(), 1.2, '#fff'); say(this.player.name, this.player === this.mira ? 'My turn.' : 'Leave it to me.');
  }
  fastTravel(L) {
    const p = this.player; if (p.vehicle) this.exitVehicle(); if (p.mount) this.dismountHorse(); if (this.interior.active) this.leaveInterior();
    let x = L.x, z = L.z; const nr = M.nearestRoad(x, z); if (nr && nr.d < 120) { x = nr.x; z = nr.z; }
    for (let k = 0; k < 30 && (M.terrainH(x, z) < 0.5 || M.waterLevelAt(x, z) > M.terrainH(x, z)); k++) { x += 15; }
    p.pos.set(x, M.groundAt(x, z), z); p.state = 'ground'; p.vel.set(0, 0, 0);
    const c = this.companion; if (c.alive) { c.pos.set(x + 2, M.groundAt(x + 2, z + 2), z + 2); c.state = 'ground'; }
    const a = this.arjun; if (a.alive && !a.vehicle) { a.pos.set(x - 2, M.groundAt(x - 2, z + 2), z + 2); a.state = 'ground'; }
    this.hud.toast(L.name, 2, '#fff'); this.rig.target.copy(p.pos);
  }
  enterInterior(pos) { this.inside = true; this.player.pos.copy(pos); this.player.state = 'ground'; this.player.vel.set(0, 0, 0); const c = this.companion; if (c.alive) { c.pos.copy(pos).add(new V3(0.8, 0, 0.4)); c.state = 'ground'; } if (this.arjun.alive) { this.arjun.pos.copy(pos).add(new V3(-0.8, 0, 0.5)); this.arjun.state = 'ground'; } for (const o of this.worldObjs) o.visible = false; this.rig.target.copy(pos); sfx('door'); }
  leaveInterior() { const out = this.interior.exit(); this.inside = false; for (const o of this.worldObjs) o.visible = true; if (out) { this.player.pos.copy(out); this.player.state = 'ground'; const c = this.companion; if (c.alive) { c.pos.copy(out).add(new V3(1, 0, 0)); c.state = 'ground'; } if (this.arjun.alive) { this.arjun.pos.copy(out).add(new V3(-1, 0, 0.5)); this.arjun.state = 'ground'; } this.rig.target.copy(out); } sfx('door'); }
  makeChai(at) {
    const p = this.player; p.weapon = 0; p.busy = { t: 0, dur: 7, pose: (t) => (t < 4.5 ? Pose.chai(t) : Pose.sip(t)), done: () => { for (const h of this.heroes) { if (h.alive) { h.hp = h.maxHp; } } this.hud.toast('☕ Masala chai · Health restored', 2.5, '#ffcc80'); this.missions.event('chai'); } };
    sfx('pour', 0.8); const t0 = this.time; this.chaiSteam = { at: at.clone(), until: this.time + 7 };
    say(p.name, ['Adrak, elaichi, thoda zyada patti... perfect.', 'One cutting chai coming up.', 'Nothing a good chai cannot fix.'][Math.floor(Math.random() * 3)]);
  }
  // ---------------- interaction ----------------
  findAction() {
    const p = this.player; if (p.busy || !p.alive) return null;
    if (p.vehicle) return { label: p.vehicle.kind === 'jet' || p.vehicle.kind === 'plane' ? (p.vehicle.pos.y - M.groundAt(p.vehicle.pos.x, p.vehicle.pos.z) > 20 ? 'Eject' : 'Exit') : 'Exit', id: 'exitv' };
    if (p.mount) return { label: 'Dismount', id: 'dismount' };
    if (this.interior.active) return this.interior.action(p.pos);
    if ((p.state === 'dive' || p.state === 'swim') && this.uw) { const a = this.uw.action(p.pos); if (a) return a; }
    if (p.state === 'ground') { const st = this.missions.nearStart(p.pos); if (st) return { label: 'Start mission: ' + st.m.name, id: 'mission', m: st.m }; }
    if (p.state !== 'ground' && p.state !== 'swim') return null;
    let bv = null, bd = 4.5; for (const v of this.vehicles) { if (v.dead || v.driver) continue; const d = v.pos.distanceTo(p.pos) - (v.len || 4) * 0.3; if (d < bd) { bd = d; bv = v; } }
    if (bv) return { label: (bv.kind === 'car' ? 'Drive ' : bv.kind === 'boat' ? 'Drive ' : 'Fly ') + bv.spec.name, id: 'enterv', v: bv };
    const tc = this.traffic.nearest(p.pos.x, p.pos.z, 3.6); if (tc) return { label: 'Hijack ' + CARS[tc.key].name, id: 'hijack', c: tc };
    for (const a of this.animals) if (a.rideable && !a.dead && !a.rider && a.pos.distanceTo(p.pos) < 2.8) return { label: 'Ride horse', id: 'mount', a };
    for (const s of world.stalls || []) if (Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 2.6) return { label: 'Make masala chai ☕', id: 'chai', at: s.top };
    if (world.skyBase && p.pos.distanceTo(new V3(world.skyBase.x, p.pos.y, world.skyBase.z)) < 7 && p.pos.y < world.skyBase.y + 5) return { label: 'Elevator to the top (224 m)', id: 'elevator' };
    if (world.skyTop && p.pos.distanceTo(new V3(world.skyTop.x, world.skyTop.y, world.skyTop.z)) < 6) return { label: 'Elevator down', id: 'elevdown' };
    for (const c of world.caves) if (Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 9) return { label: 'Enter ' + c.name, id: 'cave', c };
    // buildings
    for (const ci of M.collidersNear(p.pos.x, p.pos.z)) { const c = M.colliders[ci]; if (c.bld === undefined) continue; const b = M.buildings[c.bld]; if (!b || b.style === 3 || b.h > 70) continue; const dx = Math.max(c.x0 - p.pos.x, 0, p.pos.x - c.x1), dz = Math.max(c.z0 - p.pos.z, 0, p.pos.z - c.z1); if (Math.hypot(dx, dz) < 0.9 && p.pos.y < b.y + 3) return { label: b.style === 1 ? 'Enter shop' : b.style === 2 ? 'Enter café' : b.style === 5 ? 'Enter mansion' : 'Enter house', id: 'building', b, idx: c.bld }; }
    return null;
  }
  doAction(a) {
    const p = this.player;
    switch (a.id) {
      case 'exitv': this.exitVehicle(); break; case 'dismount': this.dismountHorse(); break;
      case 'enterv': this.enterVehicle(a.v); break; case 'hijack': this.hijack(a.c); break; case 'mount': this.mountHorse(a.a); break;
      case 'chai': this.makeChai(a.at); break;
      case 'elevator': { const t = world.skyTop; p.pos.set(t.x + 12, t.y, t.z); p.state = 'ground'; this.hud.toast('Daman Sky Tower · 224 m', 2, '#fff'); this.missions.event('top'); say(this.player.name, 'What a view! The whole coast of Daman.'); break; }
      case 'elevdown': { const b = world.skyBase; p.pos.set(b.x, M.groundAt(b.x, b.z), b.z); p.state = 'ground'; break; }
      case 'cave': this.enterInterior(this.interior.enterCave(a.c)); this.missions.event('cave:' + a.c.id); break;
      case 'building': this.enterInterior(this.interior.enter(a.b, a.idx, a.b.style === 1 ? 'shop' : a.b.style === 2 ? 'cafe' : a.b.style === 5 ? 'mansion' : 'home')); break;
      case 'exit': this.leaveInterior(); break;
      case 'shrine': { this.leaveInterior(); this.missions.event('shrine'); const s = this.serpent; p.pos.set(M.PLAT.lx - 330, 0, M.PLAT.lz - 120); p.pos.y = M.groundAt(p.pos.x, p.pos.z); if (!this.missions.cur) s.awaken(); this.hud.toast('NAAG SAROVAR', 2, '#e040fb'); break; }
      case 'seachest': this.uw.open(a.c); break;
      case 'mission': this.missions.start(a.m.id); break;
      case 'chest': this.money += 15000; sfx('coin'); this.hud.toast('Treasure! + ₹15,000', 2.5, '#ffd54f'); this.interior.chest = null; break;
      case 'buy': if (this.money >= 500) { this.money -= 500; for (const h of this.heroes) h.armor = 100; for (const h of this.heroes) { h.ammo.pistol += 60; h.ammo.rifle += 120; } sfx('coin'); this.hud.toast('Armour + ammo', 2, '#4fc3f7'); } break;
    }
  }
  // realistic scanned bodies for the three heroes (procedural skeleton keeps driving them)
  async loadAvatars() {
    if (this.q.avatars === false) return;
    const list = [[this.vikas, 'vikas', 1.79], [this.mira, 'mira', 1.67], [this.arjun, 'arjun', 1.8]];
    await Promise.all(list.map(async ([c, n, h]) => {
      try { const fbx = await loadAvatar(n); const av = new Avatar(n, fbx, c.h, h); if (!av.ok) return; av.calibrate(); c.avatar = av; c.sync(); }
      catch (e) { console.warn('avatar ' + n + ' unavailable, using the procedural body', e && e.message); }
    }));
  }
  // ---------------- photo mode: frozen world, free-flying camera, HUD hidden ----------------
  startPhoto() {
    this.hud.closeMenu(); this.paused = false;
    this.photo = { yaw: this.rig.yaw, pitch: this.rig.pitch, pos: this.cam.position.clone() };
    document.body.classList.add('photo'); this.hud.photoUI(true);
  }
  stopPhoto() { this.photo = null; document.body.classList.remove('photo'); this.hud.photoUI(false); }
  updatePhoto(dt) {
    const I = input, ph = this.photo, held = (a) => I.held.has(a);
    if (I.pressed.has('pause') || I.pressed.has('interact')) { this.stopPhoto(); return; }
    ph.yaw -= I.lookX; ph.pitch = clamp(ph.pitch + I.lookY, -1.45, 1.45);
    const cp = Math.cos(ph.pitch), f = new V3(-Math.sin(ph.yaw) * cp, -Math.sin(ph.pitch), -Math.cos(ph.yaw) * cp), r = new V3(Math.cos(ph.yaw), 0, -Math.sin(ph.yaw));
    const sp = held('sprint') ? 32 : 8;
    ph.pos.addScaledVector(f, (I.my || 0) * sp * dt).addScaledVector(r, (I.mx || 0) * sp * dt);
    ph.pos.y += ((held('jump') ? 1 : 0) - (held('down') ? 1 : 0)) * sp * 0.6 * dt + (I.wheel || 0) * -0.8;
    const P = this.playerPos(); if (ph.pos.distanceTo(P) > 250) ph.pos.sub(P).setLength(250).add(P);        // stay near the scene you are framing
    ph.pos.y = Math.max(ph.pos.y, M.groundAt(ph.pos.x, ph.pos.z) + 0.3);
    this.cam.position.copy(ph.pos); this.cam.lookAt(ph.pos.clone().add(f));
    // keep the camera-centred world (terrain LOD, near trees, tiles, grass, crowd, rain) following the photo camera
    const cpos = this.cam.position; updateTerrain(cpos, this.q); updateTrees(cpos, this.q); updateWorldLOD(cpos); updateGrass(cpos); updateCrowd(cpos, this.q, this.inside); updateRain(cpos);
    this.uw.update(0);
  }
  // ---------------- companion AI ----------------
  companionCtl(dt, c = this.companion, slot = 0) {
    const L = this.player, ctl = { move: new V3() };
    if (!c.alive || c.state === 'seated') return ctl;
    c.setVisible(true);
    if (L.vehicle) { const vp = L.vehicle.pos; if (c.pos.distanceTo(vp) > 60) { c.pos.set(vp.x - 4, M.groundAt(vp.x - 4, vp.z - 4), vp.z - 4); c.state = 'ground'; c.vel.set(0, 0, 0); } return ctl; }
    const foe = c.holdBack ? null : this.nearestFoe(c, 22);
    if (foe && foe.ai && foe.ai.alert) {
      const to = new V3().subVectors(foe.pos, c.pos); to.y = 0; const d = to.length(); to.normalize();
      if (d > 1.5) { ctl.move.copy(to); ctl.sprint = d > 6; } else if ((c.cmpCd = (c.cmpCd || 0) - dt) < 0) { if (Math.random() < 0.6) ctl.attack = true; else ctl.kick = true; c.cmpCd = 0.5 + Math.random() * 0.5; }
      ctl.face = d < 3; ctl.faceYaw = Math.atan2(to.x, to.z);
      return ctl;
    }
    const lp = L.pos, side = new V3(Math.cos(L.yaw), 0, -Math.sin(L.yaw)), back = L.forward().multiplyScalar(slot ? -2.8 : -1.8);
    const tgt = lp.clone().add(back).addScaledVector(side, slot ? -1.9 : 1.6);
    const to = new V3().subVectors(tgt, c.pos); to.y = 0; const d = to.length();
    if (d > 70 || (Math.abs(lp.y - c.pos.y) > 6 && L.state === 'ground' && (c.cmpStuck = (c.cmpStuck || 0) + dt) > 3)) { c.cmpStuck = 0; c.pos.copy(tgt); c.pos.y = L.state === 'ground' ? lp.y : M.groundAt(tgt.x, tgt.z); c.state = 'ground'; c.vel.set(0, 0, 0); return ctl; }
    if (d > 1.2) { ctl.move.copy(to.normalize()).multiplyScalar(Math.min(1, d / 3)); ctl.sprint = d > 8; }
    if (L.state === 'air' && d < 4 && Math.random() < 0.02) ctl.jump = true;
    return ctl;
  }
  // ---------------- main update ----------------
  update(dt) {
    pollInput();
    const I = input, held = (a) => I.held.has(a), pr = (a) => I.pressed.has(a);
    if (this.photo) { this.updatePhoto(dt); endFrame(); return; }
    if (pr('pause')) { this.paused ? this.hud.closeMenu() : this.hud.openMenu(); }
    if (pr('map')) { this.hud.mapEl.style.display === 'flex' ? this.hud.closeMap() : this.hud.openMap(); }
    if (this.paused) { endFrame(); return; }
    if (this.slow && this.slow.t > 0) { this.slow.t -= dt; dt *= this.slow.k; }
    if (this.combo && this.combo.n > 0 && (this.combo.t -= dt) < 0) { this.combo.n = 0; this.hud.combo && this.hud.combo(0); }
    this.time += dt; U.uTime.value = this.time;
    const p = this.player;
    const desk = !I.touch && !I.usingPad;
    if (p.vehicle || p.mount) I.wheelWalk = 0;
    // camera-relative movement (free-look: relative to where the hero faces, so you can look around while running)
    const cf = this.rig.forward; const fwd = new V3(cf.x, 0, cf.z).normalize();
    if (desk && I.freeLook && !p.vehicle && !p.mount) fwd.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const right = new V3(-fwd.z, 0, fwd.x);
    const move = new V3().addScaledVector(fwd, I.my).addScaledVector(right, I.mx);
    const camYaw = Math.atan2(cf.x, cf.z);
    // action / prompt
    const act = this.findAction(); this.curAction = act;
    if (pr('interact') && act) this.doAction(act);
    if (pr('camera')) this.rig.zoom = this.rig.zoom > 1.2 ? 0.75 : this.rig.zoom > 0.9 ? 1.5 : 1;
    if (I.wheel && (p.vehicle || !desk)) this.rig.zoom = clamp(this.rig.zoom + I.wheel * 0.1, 0.6, 2.2);
    if (pr('horn')) sfx('horn', 0.8);
    // weapons & powers ("tools"): Tab / GUN button cycles through what this hero has
    if (pr('weapon')) this.nextTool(p);
    if (pr('w1')) this.setTool(p, 'fists'); if (pr('w2')) this.setTool(p, 'pistol'); if (pr('w3')) this.setTool(p, 'rifle'); if (pr('w4')) this.setTool(p, 'web');
    const tool = this.toolOf(p), gun = tool.id === 'pistol' || tool.id === 'rifle';
    p.weapon = tool.id === 'pistol' ? 1 : tool.id === 'rifle' ? 2 : 0;
    const aiming = held('aim'), click = pr('click');
    const use = desk ? (aiming ? pr('attack') : click) : pr('attack');          // one-shot use of the selected tool
    const useHeld = desk ? aiming && held('lmb') : held('attack');            // held (auto-fire / keep swinging)
    const shiftKick = desk && click && held('sprint') && !gun && tool.id === 'fists';
    // player control
    const ctl = { move, sprint: held('sprint'), jump: pr('jump'), up: held('jump'), aim: aiming, down: held('down'), camYaw, aimDir: cf, pitch: this.rig.pitch * 0.6, turn: I.mx,
      attack: (tool.id === 'fists' && use && !shiftKick) || (gun && use), fire: gun && (useHeld || use),
      kick: pr('kick') || shiftKick, roll: pr('roll'), counter: tool.id === 'fists' && (pr('counter') || pr('aim')),
      web: held('web') || (tool.id === 'web' && useHeld) || (tool.id === 'web' && desk && held('lmb')), webPress: pr('web') || (tool.id === 'web' && use),
      chute: pr('chute') || (pr('jump') && (p.state === 'glide' || (p.state === 'air' && (p.usedFlip || p.pos.y - M.groundAt(p.pos.x, p.pos.z) > 25) && p.vel.y < -6))) };
    if (tool.power && use) this.usePower(p, tool.power);
    // mouse turns the hero (unless holding LMB to look around freely)
    if (desk && !I.freeLook && I.mouseMoved > 0 && move.lengthSq() < 0.01 && p.state === 'ground' && !p.vehicle && !p.mount) { ctl.face = true; ctl.faceYaw = camYaw; }
    if (p.state === 'glide' || p.state === 'chute') { ctl.move = move; ctl.dive = Math.max(0, I.my); }
    if (p.state === 'chute' && held('down')) ctl.down = true;
    if (p.vehicle) {
      const v = p.vehicle;
      const air = v.kind === 'plane' || v.kind === 'jet';
      const vc = { mx: I.mx, my: I.my, hand: held('jump'), nitro: held('sprint'), up: held('jump'), down: held('down'), fire: desk ? held('lmb') || held('attack') : held('attack'), missile: pr('kick') || (desk && pr('aim')), boost: held('sprint'), camYaw, yaw: (held('yawR') ? 1 : 0) - (held('yawL') ? 1 : 0) };
      if (desk) {
        if (v.kind === 'heli') vc.down = held('down') || held('sprint');
        if (air) { vc.mx = I.wasd.x; vc.my = I.wasd.y; vc.up = held('jump') || I.arrows.y > 0; vc.down = held('down') || I.arrows.y < 0; vc.yaw = vc.yaw || I.arrows.x; }
        if (v.kind === 'car' && click) sfx('horn', 0.8);
      }
      if (v.kind === 'heli') vc.yawFollow = I.touch;
      v.update(dt, vc);
      p.update(dt, {});
    } else if (p.mount) {
      const a = p.mount; a.rideCtl = { move, sprint: held('sprint'), sprintPress: pr('sprint'), jump: pr('jump') };
      a.seatPos(p.pos); p.yaw = a.yaw; p.update(dt, {}); p.obj.position.copy(p.pos); p.obj.rotation.set(0, a.yaw, 0);
    } else p.update(dt, ctl);
    if (this.chaiSteam && this.time < this.chaiSteam.until && Math.random() < 0.5) burst('steam', this.chaiSteam.at.x, this.chaiSteam.at.y, this.chaiSteam.at.z, 1);
    // companion
    const c = this.companion; if (c.state !== 'seated') c.update(dt, this.companionCtl(dt)); else c.update(dt, {});
    { const a = this.arjun; if (a.state !== 'seated') a.update(dt, this.companionCtl(dt, a, 1)); else a.update(dt, {}); }
    // other vehicles (parked / unmanned) still need physics when moving
    this.police.update(dt);
    for (const v of this.vehicles) if (v !== p.vehicle && !v.ai && (v.speed !== 0 || v.burn > 0 || v.kind === 'heli' && v.rotor > 0.01 || v.airborne)) v.update(dt, null);
    // vehicle vs pedestrians / traffic
    if (p.vehicle && p.vehicle.kind === 'car' && Math.abs(p.vehicle.speed) > 3) {
      const v = p.vehicle, f = v.forward.clone();
      for (const per of crowdNear(v.pos.x + f.x * 1.5, v.pos.z + f.z * 1.5, (v.wid || 2) * 0.7 + 0.5, U.uTime.value, 4)) { this.npcs.knockCivilian(per, v.pos, new V3(f.x * v.speed * 0.6, 3 + Math.abs(v.speed) * 0.1, f.z * v.speed * 0.6)); this.npcs.crime(2); v.speed *= 0.9; sfx('crash', 0.5); }
      for (const tc of this.traffic.near(v.pos.x, v.pos.z, 4.2)) { const d = new V3(tc.x - v.pos.x, 0, tc.z - v.pos.z); const dl = d.length(); if (dl < 3.4) { d.normalize(); const imp = Math.abs(v.vel.dot(d)); v.vel.addScaledVector(d, -imp * 1.2); tc.x += d.x * (3.4 - dl); tc.z += d.z * (3.4 - dl); if (imp > 5) { this.traffic.hit(tc, imp * 1.5, p); v.damage(imp * 0.5); sfx('crash', clamp(imp / 25, 0.3, 1)); burst('spark', (tc.x + v.pos.x) / 2, v.pos.y + 0.7, (tc.z + v.pos.z) / 2, 12); this.shake(clamp(imp / 40, 0.1, 0.5)); } } }
    }
    // systems
    const P = this.playerPos();
    this.npcs.update(dt);
    for (const a of this.animals) a.update(dt, P);
    for (const b of this.bosses) b.update(dt);
    this.interior.update(dt);
    this.updateMissiles(dt);
    this.missions.update(dt);
    if (!this.inside) this.traffic.update(dt, P, this.q);
    // camera
    this.updateCamera(dt);
    this.uw.update(dt);
    // sky / weather / world
    this.sky.update(dt, P, this.time, this.timeScale);
    this.weather.update(dt, this.sky, this.sky.hour);
    if (this.inside) { this.sky.sun.intensity = 0; this.sky.sun.shadow.intensity = 0; const cave = this.interior.type === 'cave'; this.sky.hemi.intensity = cave ? 1.6 : 0.7; if (cave) { this.sky.hemi.color.setRGB(0.25, 0.35, 0.5); this.sky.hemi.groundColor.setRGB(0.1, 0.08, 0.12); } else { this.sky.hemi.color.setRGB(1, 0.92, 0.8); this.sky.hemi.groundColor.setRGB(0.5, 0.42, 0.35); } this.scene.environmentIntensity = 0.3; this.scene.background = BLACK; } else this.scene.background = null;
    this.renderer.toneMappingExposure = this.sky.exposure * (this.inside ? 1.2 : 1);
    if (!this.inside) { const L = this.interior.lights[0], n = U.uNight.value; if (n > 0.3) { const pp = this.playerPos(); L.color.setRGB(1, 0.85, 0.65); L.position.set(pp.x + 1.5, pp.y + 7, pp.z + 1.5); L.intensity = 90 * n; L.distance = 30; } else if (L.intensity > 0) { L.intensity = 0; L.position.set(0, -2000, 0); } }
    updateWorld(this.time, U.uNight.value);
    const cp = this.cam.position;
    updateTerrain(cp, this.q); updateTrees(cp, this.q); updateWorldLOD(cp); updateGrass(cp); updateCrowd(cp, this.q, this.inside);
    updateFx(dt, cp); updateRain(cp);
    // audio
    this.updateAudio(dt);
    // HUD
    const W = WEAPONS[p.weapon], v = p.vehicle;
    let speed = null, unit = '';
    if (v) { if (v.kind === 'car' || v.kind === 'boat') { speed = Math.abs(v.speed) * 3.6; unit = 'KM/H'; } else { speed = v.speed * 3.6; unit = `KM/H · ALT ${Math.round(v.pos.y - M.groundAt(v.pos.x, v.pos.z))} M` + (v.kind !== 'heli' ? ` · THR ${Math.round(v.throttle * 100)}%` : '') + (v.fighter ? ` · MSL ${v.missiles}` : ''); } }
    else if (p.mount) { speed = p.mount.speed * 3.6; unit = 'KM/H'; }
    else if (p.state === 'glide' || p.state === 'chute' || (p.state === 'air' && p.pos.y - M.groundAt(p.pos.x, p.pos.z) > 15)) { speed = p.pos.y - M.groundAt(p.pos.x, p.pos.z); unit = 'M ALTITUDE'; }
    const mode = v ? (v.kind === 'car' ? 'car' : v.kind === 'boat' ? 'boat' : v.kind === 'heli' ? 'heli' : v.kind === 'jet' ? 'jet' : 'plane') : p.mount ? 'horse' : p.busy ? 'busy' : p.state === 'swim' ? 'swim' : p.state === 'dive' ? 'dive' : p.state === 'glide' ? 'glide' : p.state === 'chute' ? 'chute' : p.state === 'climb' ? 'climb' : p.state === 'fly' ? 'fly' : p.state === 'air' || p.state === 'web' || p.state === 'slam' ? 'air' : 'foot';
    this.hud.setMode(mode, !!act, !!(mode === 'foot' && this.counterTarget(p)));
    this.hud.update(dt, {
      hour: this.sky.hour, season: SEASONS[this.weather.season].name, rain: this.weather.rain, money: this.money, weaponName: v || p.mount ? '' : (() => { const t = this.toolOf(p); return t.id === 'pistol' || t.id === 'rifle' ? `${W.name}  ${p.clip[W.id]}/${p.ammo[W.id]}` : t.name + (t.power === 'flash' && p.flash > 0 ? ` ${Math.ceil(p.flash)}s` : ''); })(),
      speed, speedUnit: unit, aim: ctl.aim && !v && p.weapon > 0, prompt: act ? act.label : null, objective: this.missions.objective, fps: this.fps, fpsOn: this.fpsOn, res: this.gov && this.gov.enabled ? Math.round(this.gov.scale * 100) : 0,
      markers: this.markers(), enemies: this.npcs.enemies.filter((e) => e.alive && e.ai && e.ai.alert).map((e) => ({ x: e.pos.x, z: e.pos.z, team: e.team })), serpent: (this.bosses.find((b) => b.active) || {}).head || null, mmZoom: v && v.kind !== 'car' ? 1.0 : v ? 1.8 : 2.6,
    });
    // auto-save every 60 s
    if ((this.saveT = (this.saveT || 0) + dt) > 60) { this.saveT = 0; this.save(); }
    endFrame();
  }
  updateCamera(dt) {
    const p = this.player, I = input, v = p.vehicle, look = { x: I.lookX, y: I.lookY };
    let mode = 'foot', focus = p.pos.clone(), opts = {};
    if (v) {
      focus = v.pos.clone();
      if (v.kind === 'car') { mode = 'car'; opts = { followYaw: Math.abs(v.speed) > 2 ? v.yaw + (v.speed < -1 ? Math.PI : 0) : undefined, followK: 3, followPitch: 0.16, len: v.len, speedFov: clamp(Math.abs(v.speed) / 4, 0, 18) }; }
      else if (v.kind === 'boat') { mode = 'boat'; opts = { followYaw: v.yaw, followPitch: 0.2 }; }
      else if (v.kind === 'heli') { mode = 'heli'; opts = { followYaw: Math.hypot(v.vel.x, v.vel.z) > 6 ? Math.atan2(v.vel.x, v.vel.z) : undefined, followK: 1, followPitch: 0.25 }; }
      else { mode = 'plane'; const f = new V3(0, 0, 1).applyQuaternion(v.q); opts = { followYaw: Math.atan2(f.x, f.z), followK: 5, followPitch: clamp(-Math.asin(f.y) + 0.15, -1, 1.2), len: v.len, speedFov: clamp(v.speed / 15, 0, 15), noCollide: v.pos.y - M.groundAt(v.pos.x, v.pos.z) > 40 }; if (this.rig.idle > 0.5) this.rig.idle = 2; }
    } else if (p.mount) { mode = 'horse'; focus = p.mount.pos.clone(); focus.y += 0.6; opts = { followYaw: p.mount.speed > 2 ? p.mount.yaw : undefined, followK: 1.5 }; }
    else if (this.inside) mode = 'interior';
    else if (p.state === 'climb' || p.state === 'mantle') opts = { followYaw: p.yaw, followK: 3 };
    else if (I.held.has('aim') && p.weapon > 0) mode = 'aim';
    else if (p.state === 'swim' || p.state === 'dive') mode = 'swim';
    else if (p.state === 'glide' || p.state === 'chute' || p.state === 'web' || p.state === 'fly' || p.state === 'slam') { mode = 'air'; opts = { followYaw: Math.hypot(p.vel.x, p.vel.z) > 4 ? Math.atan2(p.vel.x, p.vel.z) : undefined, followK: 1.2, speedFov: clamp(p.vel.length() / 3, 0, 14) }; }
    if (this.inside) { opts.noCollide = true; opts.followPitch = 0.45; }
    this.camMode = mode;
    if (this.finCam > 0 && mode === 'foot') { this.finCam -= dt; opts.zoomK = 0.62; }
    this.rig.update(dt, look, focus, mode, opts);
    if (!p.vehicle && (p.state === 'swim' || p.state === 'dive')) { const cp = this.cam.position, wl = M.waterLevelAt(cp.x, cp.z); if (p.state === 'swim' && cp.y < wl + 0.35) cp.y = wl + 0.35; if (p.state === 'dive' && cp.y > wl - 0.35) cp.y = wl - 0.35; }
    if (this.camOverride) { const o = this.camOverride(); this.cam.position.copy(o.pos); this.cam.lookAt(o.look); }
    if (this.cine) {
      const c = this.cine; c.t += dt; const T = c.target(), P = this.playerPos();
      const away = new V3(P.x - T.x, 0, P.z - T.z).normalize(), k = Math.min(1, c.t / 0.8) * Math.min(1, (c.dur - c.t) / 0.6);
      const pos = P.clone().addScaledVector(away, 22).add(new V3(0, 9 + Math.sin(c.t * 0.4) * 2, 0));
      this.cam.position.lerp(pos, k); const look = new V3().lerpVectors(P.clone().add(new V3(0, 2, 0)), T, 0.8); const m = new THREE.Matrix4().lookAt(this.cam.position, look, new V3(0, 1, 0)); const q = new THREE.Quaternion().setFromRotationMatrix(m); this.cam.quaternion.slerp(q, k);
      if (c.t > c.dur) this.cine = null;
    }
  }
  updateAudio(dt) {
    if (!audio.on) return;
    const P = this.playerPos(), p = this.player, v = p.vehicle;
    const coastD = Math.abs(P.x - M.coastX(P.z)), alt = P.y - M.groundAt(P.x, P.z);
    const fallsD = world.fallsSound ? Math.hypot(P.x - world.fallsSound.x, P.z - world.fallsSound.z) : 1e9;
    const night = U.uNight.value, inside = this.inside;
    updateAmbience(dt, { ocean: inside ? 0 : clamp(1 - coastD / 450, 0, 1) * clamp(1 - alt / 300, 0, 1), wind: inside ? 0 : clamp((p.vel.length() - 8) / 30, 0, 1) + (v && v.kind !== 'car' ? 0.3 : 0) + clamp(alt / 400, 0, 0.6), rain: inside ? this.weather.rain * 0.3 : this.weather.rain, crowd: inside ? 0 : clamp(densityAt(P.x, P.z), 0, 1) * clamp(1 - alt / 60, 0, 1), falls: inside ? 0 : clamp(1 - fallsD / 400, 0, 1), traffic: inside ? 0 : M.zoneAt(P.x, P.z) === 'rural' ? 0.15 : 0.6, birds: inside ? 0 : (1 - night) * (M.isJungle(P.x, P.z) ? 1 : 0.4), crickets: inside ? 0 : night * 0.8, horns: inside ? 0 : M.zoneAt(P.x, P.z) === 'nani' || M.zoneAt(P.x, P.z) === 'moti' ? 1 : 0 });
    let mood;
    const fighting = this.npcs.enemies.some((e) => e.alive && e.ai && e.ai.alert && e.pos.distanceTo(P) < 45) || this.npcs.wanted >= 2;
    if (this.bosses.some((b) => b.active)) mood = 'boss'; else if (fighting) mood = 'combat'; else if (inside) mood = 'interior';
    else if (v && (v.kind === 'car' || v.kind === 'boat')) mood = 'drive'; else if (v || p.state === 'glide' || p.state === 'web') mood = 'fly';
    else if (M.isJungle(P.x, P.z) || P.x > 6500) mood = 'jungle';
    else { const h = this.sky.hour; mood = h >= 5 && h < 9 ? 'morning' : h < 16 ? 'day' : h < 19.5 ? 'evening' : 'night'; }
    setMood(mood);
  }
  render() {
    const sm = this.renderer.shadowMap, every = this.q.shadowEvery || 1;
    sm.needsUpdate = !this.inside && (this.frameNo++ % every === 0);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.cam);
  }
  // ---------------- save / load ----------------
  save() {
    try {
      const p = this.player, P = this.playerPos();
      localStorage.setItem('damanduo.save', JSON.stringify({ money: this.money, done: [...this.missions.done], season: this.weather.season, hour: this.sky.hour, pos: this.inside ? null : [P.x, P.z], hero: 'vikas', chests: this.uw ? [...this.uw.found] : [], powers: [...this.powersUnlocked], tools: [this.vikas.toolId, this.mira.toolId], music: audio.musicVol, voices: audio.voiceOn, sens: input.sens }));
    } catch (e) {}
  }
  load() {
    let s = null; try { s = JSON.parse(localStorage.getItem('damanduo.save') || 'null'); } catch (e) {}
    if (!s || this.newGame) return;
    this.money = s.money ?? this.money; for (const d of s.done || []) this.missions.done.add(d);
    if (s.season) this.weather.setSeason(s.season); if (s.hour !== undefined) this.sky.hour = s.hour;
    if (s.pos) { const [x, z] = s.pos; if (Math.abs(x) < M.HALF && Math.abs(z) < M.HALF && M.terrainH(x, z) > 0.5) { this.vikas.pos.set(x, M.groundAt(x, z), z); this.mira.pos.set(x + 1.5, M.groundAt(x + 1.5, z), z); } }
    if (s.chests && this.uw) this.uw.restore(s.chests);
    for (const pw of s.powers || []) this.powersUnlocked.add(pw); if (s.tools) { this.vikas.toolId = s.tools[0]; this.mira.toolId = s.tools[1]; }
    if (s.music !== undefined) setVolumes(s.music, audio.sfxVol); if (s.voices !== undefined) audio.voiceOn = s.voices; if (s.sens) input.sens = s.sens;
  }
  setMusic(v) { setVolumes(v, audio.sfxVol); this.save(); }
  applyPreset(k) { try { localStorage.setItem('damanduo.preset', k); } catch (e) {} this.save(); location.reload(); }
  applyCrowd(k) { try { localStorage.setItem('damanduo.crowd', String(k)); } catch (e) {} this.save(); location.reload(); }
}
