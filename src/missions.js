// Story missions + markers.
import * as THREE from 'three';
import * as M from './mapdata.js';
import { say, sfx, setMood } from './audio.js';
import { U } from './shaders.js';

export class Missions {
  constructor(game) {
    this.game = game; this.cur = null; this.step = 0; this.done = new Set(); this.objs = []; this.timer = 0;
    const L = M.L, ap = L.airport;
    const fort = L.motiFort;
    this.list = [
      { id: 'chai', name: 'Chai Pe Charcha', desc: 'Make masala chai with Mira', reward: 2000, steps: [
        { say: [['Mira', 'Veer! Welcome back to Daman. First things first — chai.'], ['Veer', 'You read my mind. Let us find a stall near the jetty.']] },
        { goto: 'stall', text: 'Go to a chai stall or into any home kitchen' }, { chai: true, text: 'Make masala chai (F)' },
        { say: [['Veer', 'Ahh. Perfect masala chai. Now I am ready for anything.'], ['Mira', 'Good, because Daman needs us. Kaala Naag gang is back at the docks.']] }] },
      { id: 'fort', name: 'Fort Run', desc: 'Parkour race over Moti Daman Fort to the lighthouse', reward: 5000, steps: [
        { goto: { x: fort.x1 + 22, z: (fort.z0 + fort.z1) / 2 }, r: 12, text: 'Go to the east gate of Moti Daman Fort' },
        { say: [['Mira', 'Race you to the lighthouse — over the walls, not around them!']] },
        { cps: [{ x: fort.x1, z: fort.z0 + 60, y: 1 }, { x: (fort.x0 + fort.x1) / 2, z: fort.z0, y: 1 }, { x: fort.x0 + 30, z: fort.z0, y: 1 }, { x: L.lighthouse.x, z: L.lighthouse.z, y: 0 }], time: 110, r: 9, text: 'Reach the checkpoints' }] },
      { id: 'gang', name: 'Kaala Naag Gang', desc: 'Clear the gang from Kachigam Docks', reward: 10000, steps: [
        { goto: { x: L.hideout.x - 120, z: L.hideout.z - 100 }, r: 20, text: 'Drive to Kachigam Docks' },
        { say: [['Veer', 'There they are. Ten of them... and their boss.'], ['Mira', 'Stay close. I will cover you.']] },
        { kill: { n: 10, boss: true }, text: 'Defeat the Kaala Naag gang' }, { say: [['Mira', 'Docks are clear. But that boss kept talking about a serpent...']] }] },
      { id: 'dash', name: 'Devka Dash', desc: 'Supercar race up the coast to Devka', reward: 8000, steps: [
        { spawnCar: 'rakshas', text: 'Get in the Vayu Rakshas' }, { inCar: true, text: 'Get in the Vayu Rakshas' },
        { cps: [{ x: M.coastRoadX(-900), z: -900 }, { x: M.coastRoadX(-1800), z: -1800 }, { x: M.coastRoadX(-2700), z: -2700 }, { x: M.coastRoadX(-3600), z: -3600 }, { x: M.coastRoadX(-4300), z: -4300 }], time: 95, r: 16, text: 'Race to Devka!' }] },
      { id: 'sky', name: 'Sky Tower Dive', desc: 'Skydive from the 260 m tower onto Devka beach', reward: 8000, steps: [
        { goto: 'skybase', r: 8, text: 'Go to the Daman Sky Tower' }, { top: true, text: 'Take the elevator to the top (F)' },
        { say: [['Mira', 'Jump, dive, then open the chute. Land on the beach marker!']] },
        { land: { x: M.coastX(-3550) + 50, z: -3550 }, r: 30, text: 'Land on the marker on Devka beach' }] },
      { id: 'wings', name: 'Wings Over Daman', desc: 'Fly the Vajra fighter through the sky rings', reward: 12000, steps: [
        { goto: { x: ap.runX0 + 140, z: ap.runZ + 70 }, r: 25, text: 'Go to the fighter jet at Daman Airport' }, { inJet: true, text: 'Board the Vajra F1 (F)' },
        { rings: [[400, 120, 2300], [1800, 200, 1500], [800, 260, -400], [-3000, 180, -800], [-4200, 300, 1500], [-2700, 140, 2600]], time: 240, text: 'Fly through the rings' }] },
      { id: 'jungle', name: 'Into the Jungle', desc: 'Ride a horse from Jungle Camp to Ganga Dhara Falls', reward: 8000, steps: [
        { goto: { x: L.jungleCamp.x, z: L.jungleCamp.z }, r: 30, text: 'Go to the Jungle Camp' }, { onHorse: true, text: 'Mount a horse (F)' },
        { goto: { x: (this.game.world.falls ? this.game.world.falls.bot : 5900) - 90, z: M.PLAT.z - 60 }, r: 25, text: 'Ride to the Ganga Dhara Falls' },
        { say: [['Mira', 'Look at that waterfall... and those claw marks. Something enormous lives up there.'], ['Veer', 'Naag Gufa is in the mountains. That is where we go next.']] }] },
      { id: 'naag', name: 'The Serpent Awakens', desc: 'Enter Naag Gufa and defeat Kaala Naag', reward: 100000, steps: [
        { goto: 'naagcave', r: 10, text: 'Find Naag Gufa (Serpent Cave) in the Ghats' }, { cave: 'naag', text: 'Enter the cave (F)' }, { shrine: true, text: 'Touch the serpent shrine' },
        { boss: true, text: 'Defeat Kaala Naag at Naag Sarovar — aim for the glowing gem!' },
        { say: [['Veer', 'It is over. Daman is safe.'], ['Mira', 'Chai on me. Let us go home, partner.']] }] },
    ];
  }
  start(id) {
    this.cleanup(); const m = this.list.find((x) => x.id === id); if (!m) return;
    this.cur = m; this.step = 0; this.timer = 0; this.stepInit = false; sfx('mission'); this.game.hud.toast(m.name.toUpperCase(), 2.5);
  }
  cleanup() { for (const o of this.objs) this.game.scene.remove(o); this.objs = []; this.cps = null; this.rings = null; }
  beam(x, z, y, color = 0xffd54f, h = 60, r = 3) {
    const g = new THREE.CylinderGeometry(r, r, h, 16, 1, true);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.position.set(x, (y ?? M.groundAt(x, z)) + h / 2, z); this.game.scene.add(m); this.objs.push(m); return m;
  }
  resolve(t) {
    const g = this.game, P = g.playerPos();
    if (t === 'stall') { let best = null, bd = 1e9; for (const s of g.world.stalls || []) { const d = Math.hypot(s.x - P.x, s.z - P.z); if (d < bd) { bd = d; best = s; } } return best || { x: M.L.jetty.x, z: M.L.jetty.z }; }
    if (t === 'skybase') return g.world.skyBase; if (t === 'naagcave') return g.world.caves.find((c) => c.id === 'naag');
    return t;
  }
  get objective() {
    if (!this.cur) return null; const s = this.cur.steps[this.step]; if (!s) return null;
    let t = s.text || ''; if ((s.cps || s.rings) && s.time) t += `  ⏱ ${Math.max(0, Math.ceil(s.time - this.timer))}s`;
    if (s.cps && this.cps) t += `  (${this.cpIdx}/${s.cps.length})`; if (s.rings && this.rings) t += `  (${this.ringIdx}/${s.rings.length})`;
    if (s.kill && this.killGroup) t += `  (${this.killGroup.filter((e) => !e.alive).length}/${this.killGroup.length})`;
    return t;
  }
  markers() {
    const out = []; if (!this.cur) return out; const s = this.cur.steps[this.step]; if (!s) return out;
    if (s.goto) { const p = this.resolve(s.goto); if (p) out.push({ x: p.x, z: p.z }); }
    if (s.cps && this.cps) { const c = s.cps[this.cpIdx]; if (c) out.push({ x: c.x, z: c.z }); }
    if (s.rings && this.rings) { const r = s.rings[this.ringIdx]; if (r) out.push({ x: r[0], z: r[2] }); }
    if (s.land) out.push({ x: s.land.x, z: s.land.z }); if (s.kill && this.killGroup) for (const e of this.killGroup) if (e.alive) out.push({ x: e.pos.x, z: e.pos.z, color: '#ff5252' });
    if (s.boss && this.game.serpent.active) out.push({ x: this.game.serpent.head.x, z: this.game.serpent.head.z, color: '#d500f9' });
    return out;
  }
  event(name) { if (!this.cur) return; const s = this.cur.steps[this.step]; if (!s) return; if ((name === 'chai' && s.chai) || (name === 'top' && s.top) || (name === 'shrine' && s.shrine) || (name === 'cave:naag' && s.cave === 'naag')) this.next(); }
  next() { this.step++; this.stepInit = false; this.timer = 0; this.cleanup(); sfx('coin', 0.6); if (this.step >= this.cur.steps.length) this.complete(); }
  complete() {
    const m = this.cur; this.done.add(m.id); this.game.money += m.reward; this.cur = null; sfx('mission');
    this.game.hud.toast(`MISSION PASSED<br><span style="font-size:20px;color:#9dff8a">+ ₹${m.reward.toLocaleString('en-IN')}</span>`, 4);
    this.game.save();
    const nxt = this.list.find((x) => !this.done.has(x.id));
    if (nxt) setTimeout(() => this.game.hud.toast(`Next: ${nxt.name}<br><span style="font-size:15px">Open the menu ❚❚ → Missions</span>`, 4, '#fff'), 4500);
    else setTimeout(() => this.game.hud.toast('ALL MISSIONS COMPLETE!<br><span style="font-size:16px">Daman is yours to explore.</span>', 6), 4500);
  }
  fail(why) { this.game.hud.toast('MISSION FAILED<br><span style="font-size:16px">' + why + '</span>', 3.5, '#ff5252'); const id = this.cur.id; this.cleanup(); this.cur = null; setTimeout(() => this.game.hud.toast('Retry from the menu ❚❚', 2.5, '#fff'), 3600); }
  update(dt) {
    const g = this.game; if (!this.cur) return; const s = this.cur.steps[this.step]; if (!s) return;
    const P = g.playerPos(); this.timer += dt;
    if (!this.stepInit) {
      this.stepInit = true;
      if (s.say) { let n = s.say.length; s.say.forEach(([w, t]) => say(w, t, () => { if (--n === 0 && this.cur && this.cur.steps[this.step] === s) this.next(); })); }
      if (s.goto) { const p = this.resolve(s.goto); if (p) this.beam(p.x, p.z); }
      if (s.cps) { this.cps = s.cps; this.cpIdx = 0; this.cpBeam = this.beam(s.cps[0].x, s.cps[0].z, undefined, 0x00e5ff, 40, s.r * 0.6); }
      if (s.rings) { this.rings = s.rings.map(([x, y, z], i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(26, 2.2, 10, 40), new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffd54f : 0x00e5ff, transparent: true, opacity: 0.8 })); m.position.set(x, M.terrainH(x, z) + y, z); const nx = s.rings[i + 1] || s.rings[i - 1]; m.lookAt(nx[0], m.position.y, nx[2]); g.scene.add(m); this.objs.push(m); return m; }); this.ringIdx = 0; }
      if (s.kill) { this.killGroup = g.npcs.spawnGang(s.kill.n, M.L.hideout.x, M.L.hideout.z, true); if (s.kill.boss) this.killGroup.push(g.npcs.spawnEnemy('gang', M.L.hideout.x + 10, M.L.hideout.z + 10, { boss: true, alert: true })); setMood('combat'); }
      if (s.spawnCar) { g.spawnMissionCar(s.spawnCar); this.next(); return; }
      if (s.land) this.beam(s.land.x, s.land.z, undefined, 0xff4081, 200, 12);
      if (s.boss) g.serpent.awaken();
    }
    const near = (p, r) => p && Math.hypot(P.x - p.x, P.z - p.z) < r;
    if (s.goto && near(this.resolve(s.goto), s.r || 10)) this.next();
    else if (s.inCar && g.player.vehicle && g.player.vehicle.kind === 'car') this.next();
    else if (s.inJet && g.player.vehicle && g.player.vehicle.kind === 'jet') this.next();
    else if (s.onHorse && g.player.mount) this.next();
    else if (s.cps) {
      const c = s.cps[this.cpIdx];
      if (near(c, s.r)) { this.cpIdx++; sfx('coin'); if (this.cpBeam) { g.scene.remove(this.cpBeam); } if (this.cpIdx >= s.cps.length) return this.next(); const n = s.cps[this.cpIdx]; this.cpBeam = this.beam(n.x, n.z, undefined, 0x00e5ff, 40, s.r * 0.6); }
      if (this.timer > s.time) this.fail('Out of time!');
    } else if (s.rings) {
      const r = this.rings[this.ringIdx]; if (r && r.position.distanceTo(P) < 26) { r.visible = false; this.ringIdx++; sfx('coin'); if (this.rings[this.ringIdx]) this.rings[this.ringIdx].material.color.setHex(0xffd54f); if (this.ringIdx >= this.rings.length) return this.next(); }
      if (this.timer > s.time) this.fail('Out of time!');
    } else if (s.land) { const p = g.player; if ((p.state === 'ground' || p.state === 'roll') && this.timer > 3) { if (near(s.land, s.r)) this.next(); else if (p.pos.y < 60 && this.timer > 5 && !this.warned) { this.warned = true; this.fail('Missed the landing zone'); } } }
    else if (s.kill) { if (this.killGroup.every((e) => !e.alive)) this.next(); }
    else if (s.boss) { if (g.serpent.defeated) this.next(); }
    if (!g.player.alive && this.cur && (s.cps || s.kill || s.boss)) this.fail('You were knocked out');
  }
}
