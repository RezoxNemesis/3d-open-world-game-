// Built-in stress test: six heavy scenes played back on rails while every frame is timed.
// Shows the real frame rate of this device (average, 1% low, worst frame), how much the scene asks of the GPU
// (draw calls, triangles) and recommends settings. The same stages run headless in CI (window.__TEST.bench).
import * as THREE from 'three';
import * as M from './mapdata.js';
import { U } from './shaders.js';
import { explosion, burst } from './fx.js';
import { flushDissolves } from './fade.js';
import { refreshNearPool } from './crowd.js';
import { input } from './input.js';
import { requestRefresh } from './perf.js';

const V3 = THREE.Vector3;
const orbit = (cx, cz, r, h, lookH, turns) => (k) => { const a = k * Math.PI * 2 * turns; return { pos: new V3(cx + Math.cos(a) * r, M.groundAt(cx, cz) + h, cz + Math.sin(a) * r), look: new V3(cx, M.groundAt(cx, cz) + lookH, cz) }; };
function stages() {
  const n = M.nodes.find((n) => n.e.length >= 3 && Math.abs(n.x + 2000) < 200 && Math.abs(n.z + 900) < 300) || M.nodes[0];
  const pz = -3905, F = M.seaFrame(pz), jc = M.L.jungleCamp;
  return [
    { name: 'Market streets', hour: 11, x: n.x + 6, z: n.z + 6, path: orbit(n.x, n.z, 46, 7, 2, 0.8) },
    { name: 'Devka sea face', hour: 17.85, x: F.x - 13, z: pz,
      path: (k) => { const z = pz + k * 190, f = M.seaFrame(z) || F; return { pos: new V3(f.x - 12, f.y + 2.4, z), look: new V3(f.x - 16 + Math.sin(k * 5) * 14, f.y + 1.6, z + 60) }; } },
    { name: 'Low flight over the city', hour: 18, x: -2400, z: -1500, follow: true,
      path: (k) => { const x = -2400 + k * 950, z = -1500 + k * 700; return { pos: new V3(x, 190, z), look: new V3(x + 260, 20, z + 190) }; } },
    { name: 'Monsoon night', hour: 21.5, rain: 1, x: -2238, z: -1170, path: orbit(-2238, -1170, 30, 5, 2, 0.7) },
    { name: 'Jungle', hour: 15, x: jc.x - 30, z: jc.z - 20, path: orbit(jc.x - 30, jc.z - 20, 26, 4, 1.5, 0.7) },
    { name: 'Explosions', hour: 13, x: n.x + 6, z: n.z + 6, boom: true, path: orbit(n.x, n.z, 34, 5, 2, 0.5) },
  ];
}
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

export class Benchmark {
  constructor(game, opts = {}) {
    this.g = game; this.dur = opts.dur || 9; this.warm = opts.warm ?? 1.5; this.stages = stages(); this.i = -1; this.results = []; this.done = false; this.onDone = opts.onDone || (() => {});
    const g = game, p = g.player;
    // step out of any vehicle, saddle or building first: the spot to come back to is then a real place on the ground
    // (while driving p.pos is stale, and indoors it is a coordinate inside the interior set)
    if (p.vehicle) g.exitVehicle(); if (p.mount) g.dismountHorse(); if (g.interior.active) g.leaveInterior();
    g.transit = null; p.busy = null;
    this.saved = { x: p.pos.x, z: p.pos.z, hour: g.sky.hour, timeScale: g.timeScale, season: g.weather.season, rain: g.weather.targetRain, wt: g.weather.timer, cap: g.gov && g.gov.cap, drs: g.gov && g.gov.enabled, autoReset: g.renderer.info.autoReset };
    g.timeScale = 0; g.renderer.info.autoReset = false;
    if (g.gov) { requestRefresh(240); g.gov.cap = 240; g.gov.enabled = false; if (g.gov.scale !== 1) { g.gov.scale = 1; g.gov.onScale(1); } }
    g.benchmark = this; this.next();
  }
  warp(x, z) {
    const g = this.g, p = g.player;
    if (p.vehicle) g.exitVehicle(); if (p.mount) g.dismountHorse(); if (g.interior.active) g.leaveInterior();
    g.transit = null; p.busy = null; p.pos.set(x, M.groundAt(x, z), z); p.state = 'ground'; p.vel.set(0, 0, 0);
    const c = g.companion; if (c && c.alive) { c.pos.set(x + 2, M.groundAt(x + 2, z + 2), z + 2); c.state = 'ground'; }
  }
  next() {
    const g = this.g; this.i++;
    if (this.i >= this.stages.length) return this.finish();
    const s = this.stages[this.i]; this.s = s; this.t = 0; this.dts = []; this.calls = 0; this.tris = 0; this.n = 0; this.boomT = 0;
    this.warp(s.x, s.z); g.sky.hour = s.hour;
    g.weather.targetRain = g.weather.rain = s.rain || 0; g.weather.timer = 1e6; U.uWet.value = s.rain || 0;
    g.camOverride = () => s.path(Math.min(1, this.t / this.dur));
    const o = g.camOverride(); g.cam.position.copy(o.pos); g.cam.lookAt(o.look);
    flushDissolves(); refreshNearPool();
    if (this.onStage) this.onStage(s, this.i, this.stages.length);
  }
  // call once per rendered frame, before game.update; ms = real time since the previous frame
  frame(ms, dt) {
    if (this.done) return;
    const g = this.g, s = this.s, p = g.player, info = g.renderer.info;
    if (input.pressed.has('pause')) { input.pressed.clear(); this.aborted = true; return this.finish(); }      // pause/back cancels the test
    input.held.clear(); input.pressed.clear();
    if (this.t > this.warm && ms < 1000) { this.dts.push(ms); this.calls += info.render.calls; this.tris += info.render.triangles; this.n++; }
    info.reset();
    this.t += dt; p.hp = p.maxHp; input.tx = 0; input.ty = 0;
    if (s.follow) { const o = s.path(Math.min(1, this.t / this.dur)); p.pos.set(o.pos.x, M.groundAt(o.pos.x, o.pos.z), o.pos.z); }
    if (s.boom && (this.boomT -= dt) < 0) {
      this.boomT = 0.22; const a = Math.random() * 6.283, r = 6 + Math.random() * 22, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r, y = M.groundAt(x, z);
      explosion(x, y + 0.5, z, 0.7 + Math.random() * 0.8); burst('spark', x, y + 1, z, 14, 1.2);
    }
    if (this.t >= this.dur) {
      const d = this.dts.slice().sort((a, b) => a - b), sum = d.reduce((a, b) => a + b, 0) || 1;
      this.results.push({ name: s.name, frames: d.length, fps: d.length ? 1000 * d.length / sum : 0, low: d.length ? 1000 / pct(d, 0.99) : 0, worst: d.length ? d[d.length - 1] : 0,
        calls: Math.round(this.calls / Math.max(1, this.n)), tris: Math.round(this.tris / Math.max(1, this.n)) });
      this.next();
    }
  }
  finish() {
    const g = this.g, S = this.saved; this.done = true; g.benchmark = null; g.camOverride = null;
    g.sky.hour = S.hour; g.timeScale = S.timeScale; g.weather.timer = S.wt; g.weather.season = S.season; g.weather.targetRain = g.weather.rain = S.rain; U.uWet.value = S.rain;
    g.renderer.info.autoReset = S.autoReset;
    if (g.gov) { g.gov.cap = S.cap; g.gov.enabled = S.drs; g.gov.win.length = 0; requestRefresh(S.cap); }
    this.warp(S.x, S.z); flushDissolves(); refreshNearPool();
    this.summary = summarise(this.results, g);
    this.onDone(this);
  }
}

export function summarise(results, g) {
  const ok = results.filter((r) => r.frames > 0);
  const fps = ok.length ? ok.reduce((a, r) => a + r.fps, 0) / ok.length : 0, low = ok.length ? Math.min(...ok.map((r) => r.low)) : 0;
  const worst = ok.length ? Math.max(...ok.map((r) => r.worst)) : 0, top = ok.length ? Math.max(...ok.map((r) => r.fps)) : 0;
  const order = ['low', 'mobile', 'high', 'ultra'], pi = order.indexOf(g.presetKey);
  const cap = low >= 82 ? 90 : low >= 54 ? 60 : low >= 40 ? 45 : 30;
  let preset = g.presetKey, note;
  if (fps < 40 && pi > 0) { preset = order[pi - 1]; note = `This device runs ${g.q.name} below 40 fps. ${PRESET_NAME[preset]} graphics will be smoother.`; }
  else if (fps < 52) note = `Playable. For a steadier picture choose ${cap} fps with Auto resolution on${g.up ? '' : ', or turn on Upscaling'}.`;
  else if (low >= 82) note = pi < order.length - 1 && low >= 110 ? `Plenty of headroom: ${PRESET_NAME[order[pi + 1]]} graphics should still hold 60 fps.` : 'Excellent: this device holds 90 fps.';
  else note = `Smooth: this device holds ${cap} fps.`;
  return { fps, low, worst, top, cap, preset, note };
}
const PRESET_NAME = { low: 'Low', mobile: 'Mobile', high: 'High', ultra: 'Ultra' };

// results card (plain DOM so it works above the canvas on every platform)
export function showBenchResults(b, g) {
  const S = b.summary, el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(6,10,16,.82);font-family:system-ui,sans-serif;color:#e9eef5;padding:12px';
  const row = (r) => `<tr><td style="text-align:left;padding:3px 10px 3px 0">${r.name}</td><td>${r.fps.toFixed(0)}</td><td>${r.low.toFixed(0)}</td><td>${r.worst.toFixed(0)} ms</td><td>${r.calls}</td><td>${(r.tris / 1000).toFixed(0)}k</td></tr>`;
  el.innerHTML = `<div style="background:#101823;border:1px solid #2b3a4e;border-radius:14px;padding:18px 20px;max-width:640px;width:100%;max-height:96vh;overflow:auto">
    <div style="font-size:12px;letter-spacing:.25em;opacity:.6">STRESS TEST · ${g.q.name.toUpperCase()} GRAPHICS${g.up ? ' · UPSCALING ' + g.upMode.toUpperCase() : ''}</div>
    <div style="display:flex;gap:26px;margin:10px 0 12px;flex-wrap:wrap">
      <div><div style="font-size:34px;font-weight:700;color:#ffd54f">${S.fps.toFixed(0)}</div><div style="font-size:11px;opacity:.6">AVERAGE FPS</div></div>
      <div><div style="font-size:34px;font-weight:700">${S.low.toFixed(0)}</div><div style="font-size:11px;opacity:.6">1% LOW</div></div>
      <div><div style="font-size:34px;font-weight:700">${S.worst.toFixed(0)}<span style="font-size:14px"> ms</span></div><div style="font-size:11px;opacity:.6">WORST FRAME</div></div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;text-align:right"><tr style="opacity:.55;font-size:11px"><td style="text-align:left">SCENE</td><td>FPS</td><td>1% LOW</td><td>WORST</td><td>DRAWS</td><td>TRIS</td></tr>${b.results.map(row).join('')}</table>
    <div style="margin:12px 0 4px;font-size:14px;color:#9dff8a">${S.note}</div>
    <div style="font-size:11px;opacity:.55">${g.gpu && g.gpu.renderer ? 'GPU: ' + g.gpu.renderer : ''}</div>
    <div data-bar style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap"></div></div>`;
  el.dataset.bench = '1';
  const bar = el.querySelector('[data-bar]');
  const btn = (t, fn, main) => { const e = document.createElement('button'); e.textContent = t; e.style.cssText = `padding:10px 16px;border-radius:9px;border:1px solid ${main ? '#ffd54f' : '#3a4a60'};background:${main ? '#ffd54f' : 'transparent'};color:${main ? '#111' : '#e9eef5'};font-weight:600;font-size:13px`; e.onclick = fn; bar.appendChild(e); };
  const close = () => { el.remove(); g.paused = false; };
  if (S.preset !== g.presetKey) btn(`USE ${PRESET_NAME[S.preset].toUpperCase()} GRAPHICS`, () => g.applyPreset(S.preset), true);
  else if (g.gov && g.gov.cap !== S.cap) btn(`SET ${S.cap} FPS`, () => { g.gov.cap = S.cap; g.gov.enabled = true; requestRefresh(S.cap); try { localStorage.setItem('damanduo.fps', String(S.cap)); localStorage.setItem('damanduo.drs', '1'); } catch (e) {} close(); }, true);
  btn('CLOSE', close, false);
  document.body.appendChild(el);
  try { localStorage.setItem('damanduo.bench', JSON.stringify({ at: Date.now(), preset: g.presetKey, fps: Math.round(S.fps), low: Math.round(S.low) })); } catch (e) {}
  return el;
}
