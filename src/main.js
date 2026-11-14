// Daman Duo — bootstrap: platform detection, graphics preset, title screen, main loop, test hooks.
import * as THREE from 'three';
import { PRESETS, detectPlatform, defaultPreset, FPS_CAPS } from './quality.js';
import { Governor, gpuInfo, autoPreset } from './perf.js';
import { HUD } from './hud.js';
import { Game } from './game.js';
import { initInput, input } from './input.js';
import { initAudio, audio } from './audio.js';
import { nextFrame } from './util.js';
import * as M from './mapdata.js';
import { world } from './world.js';
import { crowd } from './crowd.js';
import { U } from './shaders.js';

const qs = new URLSearchParams(location.search);
const platform = detectPlatform(), TEST = qs.has('test');
const ls = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
// first launch: pick a preset from the GPU (Adreno/Mali/Apple/NVIDIA/AMD/Intel tiers)
let gpu = { tier: 2, renderer: '' };
try { const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl'); if (gl) { gpu = gpuInfo(gl); const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } } catch (e) {}
let presetKey = qs.get('quality') || ls('damanduo.preset') || (gpu.renderer ? autoPreset(platform, gpu.tier) : defaultPreset(platform));
if (!PRESETS[presetKey]) presetKey = 'mobile';
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';
const canvas = document.getElementById('gl');
const hud = new HUD({});

async function start(opts) {
  presetKey = opts.preset; try { localStorage.setItem('damanduo.preset', presetKey); localStorage.setItem('damanduo.crowd', String(opts.crowd)); } catch (e) {}
  const q = { ...PRESETS[presetKey], crowd: TEST ? Math.min(opts.crowd, 60000) : opts.crowd };
  if (!TEST) { initAudio(); if (platform !== 'desktop' && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !q.bloom && !q.ao && !TEST, powerPreference: 'high-performance', stencil: false });
  const basePR = TEST ? 1 : Math.min(devicePixelRatio || 1, q.pixelRatio);
  renderer.setPixelRatio(basePR); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = q.desktop ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  hud.loading(true);
  const game = new Game(renderer, q, presetKey, hud); game.newGame = !!opts.newGame; window.__game = game; window.__M = M;
  if (opts.newGame) try { localStorage.removeItem('damanduo.save'); } catch (e) {}
  const t0 = performance.now();
  await game.init(async (msg, p) => { hud.progress(msg, p); await nextFrame(); });
  console.log('world ready in', Math.round(performance.now() - t0), 'ms', JSON.stringify(world.stats), 'people', crowd.n);
  initInput(canvas, hud);
  if (platform === 'android' || platform === 'mobile-web') { input.touch = true; hud.showTouch(true); }
  addEventListener('resize', () => game.resize());
  hud.loading(false); hud.show();
  if (!TEST) {
    const cap = parseInt(ls('damanduo.fps') || '60', 10);
    const gov = new Governor({ cap: FPS_CAPS.includes(cap) ? cap : 60, basePR, minScale: q.minScale, drs: ls('damanduo.drs') !== '0', onScale: () => { renderer.setPixelRatio(gov.pixelRatio); game.resize(); } });
    game.gov = gov; game.gpu = gpu;
    let last = performance.now(), fpsAcc = 0, fpsN = 0;
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (!gov.tick(now)) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { game.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
      game.update(dt); game.render();
    };
    requestAnimationFrame(loop);
    setTimeout(() => { if (!game.missions.done.size && !game.missions.cur) game.missions.start('chai'); }, 1500);
    document.addEventListener('visibilitychange', () => { if (audio.ctx) document.hidden ? audio.ctx.suspend() : audio.ctx.resume(); });
  } else setupTests(game);
}

// ---------------- test scenarios (headless render test) ----------------
function setupTests(game) {
  const undo = [];
  const step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) game.update(dt); game.render(); };
  const at = (x, z, yaw) => { const p = game.player; if (p.vehicle) game.exitVehicle(); if (p.mount) game.dismountHorse(); if (game.inside) game.leaveInterior(); p.pos.set(x, M.groundAt(x, z), z); p.state = 'ground'; p.vel.set(0, 0, 0); p.yaw = yaw ?? p.yaw; game.rig.yaw = p.yaw + Math.PI; game.rig.target.set(x, p.pos.y + 1.5, z); game.companion.pos.set(x + 1.5, M.groundAt(x + 1.5, z - 1.5), z - 1.5); };
  const S = {
    spawn: () => { game.sky.hour = 17.2; step(8); },
    duo_closeup: () => { const p = game.player; at(p.pos.x, p.pos.z, 0.6); game.rig.pitch = 0.05; game.rig.zoom = 0.55; game.sky.hour = 16.4; step(10); game.rig.zoom = 1; },
    hero_face: () => { const p = game.player; at(M.coastX(-3700) + 60, -3700, 1.2); game.companion.pos.set(p.pos.x - Math.cos(p.yaw) * 0.9, p.pos.y, p.pos.z + Math.sin(p.yaw) * 0.9); game.companion.yaw = p.yaw; game.rig.yaw = p.yaw + 0.25; game.sky.hour = 16.2;
      game.camOverride = () => { const f = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)), r = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw)); const head = p.pos.clone().add(new THREE.Vector3(0, 1.62, 0)).addScaledVector(r, -0.45); return { pos: head.clone().addScaledVector(f, 1.6).addScaledVector(r, -0.25).add(new THREE.Vector3(0, 0.05, 0)), look: head }; };
      step(12); },
    car_closeup: () => {
      const keys = ['rakshas', 'agni', 'regent', 'amba'], vs = keys.map((k) => game.vehicles.find((v) => v.key === k)).filter(Boolean);
      const base = new THREE.Vector3(M.coastX(-3300) + 90, 0, -3300);
      vs.forEach((v, i) => { v.pos.set(base.x + i * 4.2, M.groundAt(base.x + i * 4.2, base.z), base.z); v.yaw = 0.5; if (v.obj) { v.obj.position.copy(v.pos); v.obj.rotation.set(0, v.yaw, 0); } });
      at(base.x - 6, base.z - 8, 0); game.sky.hour = 16.5;
      game.camOverride = () => ({ pos: new THREE.Vector3(base.x + 3, base.y + M.groundAt(base.x, base.z) + 1.6, base.z + 7.5), look: new THREE.Vector3(base.x + 5, M.groundAt(base.x, base.z) + 0.6, base.z) });
      step(6);
    },
    horse_closeup: () => {
      const h = game.animals.find((a) => a.rideable && a.parts.saddle && a.parts.saddle.visible) || game.animals.find((a) => a.type === 'horse');
      at(h.pos.x + 3, h.pos.z + 3, 0); h.want = 0; h.speed = 0; h.state = 'idle'; h.t = 99; game.sky.hour = 9.5; h.pos.y = M.groundAt(h.pos.x, h.pos.z); h.obj.position.copy(h.pos); const ft = h.update.bind(h); h.update = (dt) => { h.speed = 0; h.want = 0; h.animate(dt); h.obj.position.copy(h.pos); }; undo.push(() => (h.update = ft));
      game.camOverride = () => { const s = new THREE.Vector3(Math.cos(h.yaw), 0, -Math.sin(h.yaw)); return { pos: h.pos.clone().addScaledVector(s, 4.2).add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(new THREE.Vector3(Math.sin(h.yaw), 0, Math.cos(h.yaw)), 1.2), look: h.pos.clone().add(new THREE.Vector3(0, 1.0, 0)) }; };
      step(5);
    },
    supercar: () => { at(-2238, -770, Math.PI); const v = game.vehicles.find((v) => v.key === 'rakshas'); game.enterVehicle(v); input.tx = 0; input.ty = 1; for (let i = 0; i < 45; i++) { input.held.add('sprint'); game.update(1 / 30); } input.held.delete('sprint'); input.tx = 0; input.ty = 0; game.sky.hour = 17.8; step(3); },
    traffic_street: () => { const n = M.nodes.find((n) => n.e.length >= 3 && Math.abs(n.x + 2000) < 200 && Math.abs(n.z + 900) < 300) || M.nodes[0]; at(n.x + 6, n.z + 6, 2.3); game.sky.hour = 10.5; step(20); },
    devka_beach: () => { at(M.coastX(-3900) + 70, -3900, -Math.PI / 2); game.rig.pitch = 0.25; game.sky.hour = 17.6; step(10); },
    moti_fort: () => { const F = M.L.motiFort; at(F.x1 + 30, (F.z0 + F.z1) / 2, -Math.PI / 2); game.rig.zoom = 2; game.rig.pitch = 0.35; game.sky.hour = 9.5; step(10); game.rig.zoom = 1; },
    wall_climb: () => { const b = M.buildings.find((b) => b.h > 12 && b.h < 25 && Math.abs(b.x0 + 2000) < 500 && Math.abs(b.z0 + 1500) < 600) || M.buildings[0]; at(b.x0 - 0.6, (b.z0 + b.z1) / 2, Math.PI / 2); const w = { nx: -1, nz: 0, c: M.colliders.find((c) => c.bld === M.buildings.indexOf(b)) }; game.player.startClimb(w); game.player.pos.y += 6; game.rig.yaw = -Math.PI / 2 + Math.PI + 0.6; step(15); },
    web_swing: () => { at(-2250, -1600, Math.PI); const p = game.player; p.pos.y += 25; p.state = 'air'; p.vel.set(0, 0, -14); input.held.add('web'); input.pressed.add('web'); for (let i = 0; i < 25; i++) { input.held.add('web'); game.update(1 / 30); } input.held.delete('web'); game.render(); },
    skydive: () => { const t = world.skyTop; at(t.x + 12, t.z, 0); const p = game.player; p.pos.y = t.y + 40; p.state = 'chute'; p.chute.visible = true; game.rig.pitch = 0.3; game.sky.hour = 12; step(12); },
    fighter_jet: () => { const j = game.vehicles.find((v) => v.kind === 'jet'); game.enterVehicle(j); j.pos.y = 260; j.speed = 160; j.throttle = 1; j.q.setFromEuler(new THREE.Euler(0, Math.PI, 0)); j.pos.x = -1500; j.pos.z = 400; step(25); game.sky.hour = 18; step(2); },
    helicopter: () => { const h = game.vehicles.find((v) => v.kind === 'heli'); at(h.pos.x + 4, h.pos.z, 0); game.enterVehicle(h); input.held.add('jump'); for (let i = 0; i < 60; i++) game.update(1 / 30); input.held.delete('jump'); game.sky.hour = 8; step(3); },
    horse_ride: () => { const h = game.animals.find((a) => a.rideable); at(h.pos.x + 1, h.pos.z, 0); game.mountHorse(h); input.tx = 0; input.ty = 1; for (let i = 0; i < 40; i++) { input.pressed.add('sprint'); input.held.add('sprint'); game.update(1 / 30); } input.held.delete('sprint'); input.tx = 0; input.ty = 0; game.render(); },
    jungle_animals: () => { at(M.L.jungleCamp.x - 30, M.L.jungleCamp.z - 20, 0.8); game.rig.zoom = 2.2; game.rig.pitch = 0.3; game.sky.hour = 15; step(10); game.rig.zoom = 1; },
    waterfall: () => { at(world.falls.bot - 160, M.PLAT.z - 40, Math.PI / 2 - 0.2); game.rig.zoom = 1.6; game.rig.pitch = -0.05; game.sky.hour = 11; step(10); game.rig.zoom = 1; },
    mountains: () => { at(M.L.peak.x, M.L.peak.z, -Math.PI / 2); game.rig.zoom = 2; game.rig.pitch = 0.15; game.sky.hour = 6.6; game.weather.setSeason('winter'); step(10); game.weather.setSeason('postmonsoon'); game.rig.zoom = 1; },
    serpent_boss: () => { at(M.PLAT.lx - 330, M.PLAT.lz - 140, Math.PI / 2); game.serpent.awaken(); game.sky.hour = 18.4; for (let i = 0; i < 160; i++) game.update(1 / 20); game.rig.zoom = 2.2; game.rig.pitch = 0.2; game.rig.yaw = Math.atan2(game.player.pos.x - game.serpent.head.x, game.player.pos.z - game.serpent.head.z); step(3); game.rig.zoom = 1; },
    serpent_close: () => { const S = game.serpent; game.fightBoss(S); S.awaken(); for (let i = 0; i < 200; i++) game.update(1 / 20); game.sky.hour = 17.6;
      game.camOverride = () => { const h = S.head, d = new THREE.Vector3(Math.sin(S.yaw), 0, Math.cos(S.yaw)); return { pos: h.clone().addScaledVector(d, 70).add(new THREE.Vector3(18, -6, 0)), look: h.clone().add(new THREE.Vector3(0, -8, 0)) }; }; step(3); },
    makara_boss: () => { const B = game.makara; game.fightBoss(B); B.awaken(); for (let i = 0; i < 130; i++) game.update(1 / 20); game.sky.hour = 16.5;
      game.camOverride = () => { const p = B.pos, d = new THREE.Vector3(Math.sin(B.yaw), 0, Math.cos(B.yaw)); const sd = new THREE.Vector3(d.z, 0, -d.x); return { pos: p.clone().addScaledVector(d, 30).addScaledVector(sd, 22).add(new THREE.Vector3(0, 9, 0)), look: p.clone().addScaledVector(d, 8).add(new THREE.Vector3(0, 3, 0)) }; }; step(3); },
    rakshasa_boss: () => { const B = game.rakshasa; game.fightBoss(B); B.awaken(); for (let i = 0; i < 130; i++) game.update(1 / 20); game.sky.hour = 15.5;
      game.camOverride = () => { const p = B.pos, d = new THREE.Vector3(Math.sin(B.yaw), 0, Math.cos(B.yaw)); const sd = new THREE.Vector3(d.z, 0, -d.x); return { pos: p.clone().addScaledVector(d, 26).addScaledVector(sd, 8).add(new THREE.Vector3(0, 19, 0)), look: p.clone().add(new THREE.Vector3(0, 19, 0)) }; }; step(3); },
    boss_intro: () => { const B = game.rakshasa; B.sleep && B.sleep(); game.fightBoss(B); B.awaken(); for (let i = 0; i < 40; i++) game.update(1 / 20); step(2); },
    power_flight: () => { const p = game.player; at(-2300, -1300, Math.PI); for (const k of ['flash', 'slam', 'flight']) game.powersUnlocked.add(k); game.setTool(p, 'fly'); game.usePower(p, 'flight'); input.tx = 0; input.ty = 1; for (let i = 0; i < 70; i++) { input.held.add('sprint'); game.update(1 / 30); } input.held.delete('sprint'); input.ty = 0; game.sky.hour = 16; step(3); },
    power_flash: () => { const p = game.player; at(-2238, -770, Math.PI); game.powersUnlocked.add('flash'); game.setTool(p, 'flash'); game.usePower(p, 'flash'); input.tx = 0; input.ty = 1; for (let i = 0; i < 25; i++) game.update(1 / 30); input.ty = 0; step(2); },
    villa_colony: () => { const p = M.estates.find((e) => e.name) || M.estates[0]; at(p.cx + 40, p.cz + p.face * (p.z1 - p.z0) * 0.5 + p.face * 30, p.face > 0 ? Math.PI : 0); game.sky.hour = 17.3;
      game.camOverride = () => ({ pos: new THREE.Vector3(p.cx + 70, p.y + 38, p.cz + p.face * 120), look: new THREE.Vector3(p.cx, p.y + 8, p.cz) }); step(6); },
    mansion_front: () => { const e = M.estates.find((e) => e.kind === 'mansion' && e.style === 'modern') || M.estates[0], H = e.house, hx = (H.x0 + H.x1) / 2; at(hx, e.pool.z0 + e.face * 14, 0); game.sky.hour = 18.6;
      game.camOverride = () => ({ pos: new THREE.Vector3(hx + 16, e.y + 7, (e.pool.z0 + e.pool.z1) / 2 + e.face * 26), look: new THREE.Vector3(hx, e.y + 5, (H.z0 + H.z1) / 2) }); step(6); },
    villa_night: () => { const e = M.estates.find((e) => e.kind === 'villa') || M.estates[0], H = e.house, hx = (H.x0 + H.x1) / 2; at(hx, e.pool.z0 + e.face * 10, 0); game.sky.hour = 21;
      game.camOverride = () => ({ pos: new THREE.Vector3(hx - 10, e.y + 5, (e.pool.z0 + e.pool.z1) / 2 + e.face * 16), look: new THREE.Vector3(hx, e.y + 3.5, (H.z0 + H.z1) / 2) }); step(6); },
    mansion_interior: () => { const i = M.buildings.findIndex((b) => b.style === 5 && M.estates[b.estate].kind === 'mansion'), b = M.buildings[i]; game.enterInterior(game.interior.enter(b, i, 'mansion')); game.rig.zoom = 1.6; game.rig.pitch = 0.25; step(10); },
    gang_fight: () => { at(M.L.hideout.x - 20, M.L.hideout.z - 20, 0.7); const g = game.npcs.spawnGang(6, M.L.hideout.x, M.L.hideout.z, true); for (const e of g) e.pos.set(game.player.pos.x + (Math.random() - 0.5) * 8, game.player.pos.y, game.player.pos.z + 3 + Math.random() * 4); for (let i = 0; i < 30; i++) { input.pressed.add('attack'); game.update(1 / 30); } game.render(); },
    interior_home: () => { at(-2238, -770, 0); const b = M.buildings.find((b) => b.style === 0 && Math.abs(b.x0 + 2300) < 300 && Math.abs(b.z0 + 900) < 300); game.enterInterior(game.interior.enter(b, M.buildings.indexOf(b), 'home')); const p = game.player; p.pos.copy(game.interior.stove).add(new THREE.Vector3(0.6, 0, 0.2)); p.yaw = -Math.PI / 2; game.makeChai(game.interior.stoveTop); game.rig.yaw = p.yaw + Math.PI + 0.7; game.rig.pitch = 0.2; step(40); game.leaveInterior(); },
    cave: () => { const c = world.caves[0]; game.enterInterior(game.interior.enterCave(c)); step(12); game.leaveInterior(); },
    monsoon_night: () => { at(-2238, -1170, Math.PI); game.weather.setSeason('monsoon'); game.weather.targetRain = 1; game.weather.rain = 1; U.uWet.value = 1; game.sky.hour = 21.5; step(10); game.weather.targetRain = 0; game.weather.rain = 0; U.uWet.value = 0; game.weather.setSeason('postmonsoon'); },
    city_aerial: () => { at(-2400, -1500, Math.PI); game.player.pos.y += 180; game.player.state = 'chute'; game.rig.zoom = 2; game.rig.pitch = 0.6; game.sky.hour = 18.0; step(4); game.rig.zoom = 1; },
  };
  window.__TEST = {
    ready: true, scenarios: Object.keys(S),
    run: async (n) => { game.camOverride = null; while (undo.length) undo.pop()(); const t0 = performance.now(); S[n](); await nextFrame(); return { ms: Math.round(performance.now() - t0), state: game.player.state, hp: Math.round(game.player.hp), pos: game.playerPos().toArray().map(Math.round) }; },
    stats: () => ({ ...world.stats, people: crowd.n, traffic: game.traffic.cars.length, animals: game.animals.length, vehicles: game.vehicles.length, programs: game.renderer.info.programs.length, tris: game.renderer.info.render.triangles, calls: game.renderer.info.render.calls }),
  };
}

// ---------------- entry ----------------
let hasSave = false; try { hasSave = !!localStorage.getItem('damanduo.save'); } catch (e) {}
const crowdPref = parseInt(ls('damanduo.crowd') || '0', 10) || (platform === 'desktop' ? 300000 : platform === 'web' ? 200000 : 100000);
const platformLabel = { desktop: 'Desktop', android: 'Android', 'mobile-web': 'Mobile browser', web: 'Browser' }[platform];
if (TEST) start({ preset: presetKey, crowd: 60000 });
else hud.title({ preset: presetKey, crowd: crowdPref, hasSave, version: VERSION, platformLabel }, start);
