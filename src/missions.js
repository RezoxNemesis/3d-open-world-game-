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
        { say: [['Mira', 'Vikas! Welcome back to Daman. First things first — chai.'], ['Vikas', 'You read my mind. Let us find a stall near the jetty.']] },
        { goto: 'stall', text: 'Go to a chai stall or into any home kitchen' }, { chai: true, text: 'Make masala chai (F)' },
        { say: [['Vikas', 'Ahh. Perfect masala chai. Now I am ready for anything.'], ['Mira', 'Good, because Daman needs us. Kaala Naag gang is back at the docks.']] }] },
      { id: 'fort', name: 'Fort Run', desc: 'Parkour race over Moti Daman Fort to the lighthouse', reward: 5000, steps: [
        { goto: { x: fort.x1 + 22, z: (fort.z0 + fort.z1) / 2 }, r: 12, text: 'Go to the east gate of Moti Daman Fort' },
        { say: [['Mira', 'Race you to the lighthouse — over the walls, not around them!']] },
        { cps: [{ x: fort.x1, z: fort.z0 + 60, y: 1 }, { x: (fort.x0 + fort.x1) / 2, z: fort.z0, y: 1 }, { x: fort.x0 + 30, z: fort.z0, y: 1 }, { x: L.lighthouse.x, z: L.lighthouse.z, y: 0 }], time: 110, r: 9, text: 'Reach the checkpoints' }] },
      { id: 'gang', name: 'Kaala Naag Gang', desc: 'Clear the gang from Kachigam Docks', reward: 10000, steps: [
        { goto: { x: L.hideout.x - 120, z: L.hideout.z - 100 }, r: 20, text: 'Drive to Kachigam Docks' },
        { say: [['Vikas', 'There they are. Ten of them... and their boss.'], ['Mira', 'Stay close. I will cover you.']] },
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
        { say: [['Mira', 'Look at that waterfall... and those claw marks. Something enormous lives up there.'], ['Vikas', 'Naag Gufa is in the mountains. That is where we go next.']] }] },
      { id: 'naag', name: 'The Serpent Awakens', desc: 'Enter Naag Gufa and defeat Kaala Naag', reward: 100000, steps: [
        { goto: 'naagcave', r: 10, text: 'Find Naag Gufa (Serpent Cave) in the Ghats' }, { cave: 'naag', text: 'Enter the cave (F)' }, { shrine: true, text: 'Touch the serpent shrine' },
        { boss: true, text: 'Defeat Kaala Naag at Naag Sarovar — aim for the glowing gem!' },
        { say: [['Vikas', 'It is over. Daman is safe.'], ['Mira', 'Chai on me. Let us go home, partner.']] }] },
      { id: 'sunken', name: 'Sunken Gold', desc: 'Dive to the São Jerónimo galleon and recover its treasure', reward: 30000, steps: [
        { say: [['Arjun', 'Vikas, the old fishermen say a Portuguese galleon sank off Jampore in 1640. Full of gold.'], ['Vikas', 'Then let us go swimming.']] },
        { goto: { x: M.coastX(3320) - 300, z: 3320 }, r: 30, text: 'Swim out to the wreck buoy off Jampore (look down + swim to dive)' },
        { chests: 3, text: 'Dive down and open 3 treasure chests (Enter)' },
        { say: [['Mira', 'Gold coins with the Portuguese crown! Arjun, your fishermen were right.'], ['Arjun', 'There are more down there. We will come back.']] }] },
      { id: 'bulletrun', name: 'Bullet Run', desc: 'Race a Thunder 350 down the coast to Moti Daman Fort', reward: 20000, steps: [
        { say: [['Arjun', 'My cousin bet me his Thunder 350 cannot reach the fort in two minutes. Prove him wrong.']] },
        { spawnCar: 'thunder', text: 'Get on the Amba Thunder 350' }, { inBike: true, text: 'Get on the Amba Thunder 350 (Enter)' },
        { cps: [3300, 2800, 2300, 1800, 1300, 800].map((z) => ({ x: M.coastRoadX(z), z })).concat([{ x: fort.x1 + 22, z: (fort.z0 + fort.z1) / 2 }]), time: 135, r: 14, text: 'Ride to Moti Daman Fort!' },
        { say: [['Arjun', 'Ha! He owes me a full thali now.']] }] },
      { id: 'pursuit', name: 'Hot Pursuit', desc: 'Steal a police interceptor bike and lose a three-star chase', reward: 25000, steps: [
        { say: [['Arjun', 'The inspector at Nani Daman is on the gang payroll. Let us borrow his bike — and give his boys a workout.']] },
        { spawnCar: 'policebike', text: 'Steal the police bike' }, { inBike: true, text: 'Steal the police bike (Enter)' },
        { wanted: 3, lose: true, text: 'Lose the police! Get out of their sight' },
        { say: [['Mira', 'You two are insane. I love it.']] }] },
      { id: 'streetkings', name: 'Street Kings of Devka', desc: 'Win the underground fight on Devka beach', reward: 30000, steps: [
        { goto: { x: M.L.devkaBeach.x + 30, z: M.L.devkaBeach.z }, r: 16, text: 'Go to the fight ring on Devka beach' },
        { say: [['NPC', 'Fresh meat! Three rounds. Last one standing takes the purse.'], ['Vikas', 'Counter when they flash. Mira, Arjun — stay out of the ring.']] },
        { fight: { n: 3, at: M.L.devkaBeach, solo: true }, text: 'Round 1 — beat 3 fighters' },
        { fight: { n: 4, at: M.L.devkaBeach, solo: true }, text: 'Round 2 — beat 4 fighters' },
        { fight: { n: 5, at: M.L.devkaBeach, boss: true, solo: true, combo: 10 }, text: 'Final round — beat the champion and land a 10-hit combo' },
        { say: [['NPC', 'A new Street King of Devka! Take your purse.'], ['Mira', 'Show-off.']] }] },
      { id: 'mahal', name: 'The Sagar Mahal Job', desc: 'Storm the palace estate and recover the gang ledger', reward: 50000, steps: [
        { say: [['Mira', 'The Kaala Naag gang launders money through Sagar Mahal. Their ledger is inside.'], ['Vikas', 'Then we walk in through the front gate.']] },
        { goto: 'palace', r: 40, text: 'Go to Sagar Mahal in Jampore Villa Colony' },
        { fight: { n: 7, at: 'palace', armed: true }, text: 'Defeat the palace guards' },
        { mansion: true, text: 'Enter the palace (Enter at the front door)' },
        { say: [['Vikas', 'Got the ledger. Every bribe, every name.'], ['Arjun', 'The commissioner will want to read this.']] }] },
      { id: 'makara', name: 'Makara Rising', desc: 'Defeat the Makara, sea monster of Devka', reward: 40000, steps: [
        { say: [['Mira', 'Fishermen at Devka are missing boats. Something huge with a crocodile head...'], ['Vikas', 'The Makara. Aim for the pearl on its head.']] },
        { bossFight: 'makara', text: 'Defeat the Makara — hit the glowing pearl!' },
        { say: [['Arjun', 'The sea is calm again. Devka owes you one.']] }] },
      { id: 'rakshasa', name: 'Demon of the Ghats', desc: 'Climb the Ghats and defeat the Maha Rakshasa', reward: 60000, steps: [
        { say: [['Arjun', 'Herders in the Ghats saw a giant with horns and a golden mace.'], ['Vikas', 'Then we climb. The gem on his chest — that is his heart.']] },
        { bossFight: 'rakshasa', text: 'Defeat the Maha Rakshasa — strike the gem on his chest!' },
        { say: [['Mira', 'Vikas... you are flying.'], ['Vikas', 'Daman has a new guardian now.']] }] },
    ];
  }
  // where each mission is picked up in the world
  startAt(m) {
    const g = this.game, L = M.L, fort = L.motiFort;
    const at = { chai: L.jetty, fort: { x: fort.x1 + 22, z: (fort.z0 + fort.z1) / 2 }, gang: { x: L.hideout.x - 140, z: L.hideout.z - 110 }, dash: { x: -2236, z: -800 }, sky: g.world.skyBase,
      wings: { x: L.airport.runX0 + 120, z: L.airport.runZ + 90 }, jungle: { x: L.jungleCamp.x, z: L.jungleCamp.z }, naag: this.resolve('naagcave'), sunken: { x: M.coastX(3320) + 45, z: 3320 },
      bulletrun: { x: M.ZONES.villa.x0 - 16, z: 3410 }, pursuit: { x: -2120, z: -1480 }, streetkings: { x: M.L.devkaBeach.x + 30, z: M.L.devkaBeach.z }, mahal: this.resolve('palace'),
      makara: { x: M.coastX(-3450) + 40, z: -3450 }, rakshasa: g.rakshasa ? g.rakshasa.home() : null }[m.id];
    return at ? { x: at.x, z: at.z } : null;
  }
  starts() { if (this.cur) return []; const out = []; for (const m of this.list) { if (this.done.has(m.id)) continue; const p = this.startAt(m); if (p) out.push({ m, x: p.x, z: p.z }); } return out; }
  updateStarts(dt) {
    const g = this.game, P = g.playerPos(), list = this.starts();
    if (!this.startMeshes) { this.startMeshes = new Map(); this.startMat = markerMat(0xffd54f, 0.42); this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }); }
    const live = new Set();
    for (const st of list) {
      live.add(st.m.id); let o = this.startMeshes.get(st.m.id);
      if (!o) { o = new THREE.Group(); const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.07, 8, 40).rotateX(Math.PI / 2), this.ringMat), col = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 7, 32, 1, true).translate(0, 3.5, 0), this.startMat); o.add(ring, col); o.position.set(st.x, M.groundAt(st.x, st.z) + 0.15, st.z); g.scene.add(o); this.startMeshes.set(st.m.id, o); }
      const d = Math.hypot(st.x - P.x, st.z - P.z); o.visible = d < 450; o.children[0].scale.setScalar(1 + 0.08 * Math.sin(g.time * 3));
    }
    for (const [id, o] of this.startMeshes) if (!live.has(id)) { g.scene.remove(o); this.startMeshes.delete(id); }
  }
  nearStart(P) { for (const st of this.starts()) if (Math.hypot(st.x - P.x, st.z - P.z) < 3.5) return st; return null; }
  start(id) {
    this.cleanup(); const m = this.list.find((x) => x.id === id); if (!m) return;
    this.cur = m; this.step = 0; this.timer = 0; this.stepInit = false; sfx('mission'); this.game.hud.toast(m.name.toUpperCase(), 2.5);
  }
  cleanup() { for (const o of this.objs) this.game.scene.remove(o); this.objs = []; this.cps = null; this.rings = null; for (const f of this.game.friends || []) f.holdBack = false; }
  beam(x, z, y, color = 0xffd54f, h = 60, r = 3) {
    const g = new THREE.CylinderGeometry(r, r, h, 24, 1, true);
    const m = new THREE.Mesh(g, markerMat(color, 0.55));
    m.position.set(x, (y ?? M.groundAt(x, z)) + h / 2, z); this.game.scene.add(m); this.objs.push(m); return m;
  }
  resolve(t) {
    const g = this.game, P = g.playerPos();
    if (t === 'stall') { let best = null, bd = 1e9; for (const s of g.world.stalls || []) { const d = Math.hypot(s.x - P.x, s.z - P.z); if (d < bd) { bd = d; best = s; } } return best || { x: M.L.jetty.x, z: M.L.jetty.z }; }
    if (t === 'palace') { const e = M.estates.find((e) => e.name); return e ? { x: e.cx, z: e.cz + e.face * ((e.z1 - e.z0) / 2 - 20) } : null; }
    if (t === 'skybase') return g.world.skyBase; if (t === 'naagcave') return g.world.caves.find((c) => c.id === 'naag');
    return t;
  }
  get objective() {
    if (!this.cur) return null; const s = this.cur.steps[this.step]; if (!s) return null;
    let t = s.text || ''; if ((s.cps || s.rings) && s.time) t += `  ⏱ ${Math.max(0, Math.ceil(s.time - this.timer))}s`;
    if (s.cps && this.cps) t += `  (${this.cpIdx}/${s.cps.length})`; if (s.rings && this.rings) t += `  (${this.ringIdx}/${s.rings.length})`;
    if ((s.kill || s.fight) && this.killGroup) t += `  (${this.killGroup.filter((e) => !e.alive).length}/${this.killGroup.length})`;
    if (s.fight && s.fight.combo) t += `  · best combo ${this.bestCombo || 0}/${s.fight.combo}`;
    if (s.chests) t += `  (${Math.max(0, this.game.uw.found.size - this.chest0)}/${s.chests})`;
    if (s.lose) t += `  ★${this.game.npcs.wanted}`;
    return t;
  }
  markers() {
    const out = []; if (!this.cur) return out; const s = this.cur.steps[this.step]; if (!s) return out;
    if (s.goto) { const p = this.resolve(s.goto); if (p) out.push({ x: p.x, z: p.z }); }
    if (s.cps && this.cps) { const c = s.cps[this.cpIdx]; if (c) out.push({ x: c.x, z: c.z }); }
    if (s.rings && this.rings) { const r = s.rings[this.ringIdx]; if (r) out.push({ x: r[0], z: r[2] }); }
    if (s.chests) for (const c of this.game.uw.chests) if (!c.done) out.push({ x: c.x, z: c.z, color: '#ffd54f' });
    if (s.land) out.push({ x: s.land.x, z: s.land.z }); if ((s.kill || s.fight) && this.killGroup) for (const e of this.killGroup) if (e.alive) out.push({ x: e.pos.x, z: e.pos.z, color: '#ff5252' });
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
    const g = this.game; this.updateStarts(dt); if (!this.cur) return; const s = this.cur.steps[this.step]; if (!s) return;
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
      if (s.chests) this.chest0 = g.uw.found.size;
      if (s.wanted) g.npcs.crime(s.wanted);
      if (s.bossFight) { const b = g[s.bossFight]; if (b) { b.defeated = false; g.fightBoss(b); } }
      if (s.fight) {
        const at = this.resolve(s.fight.at) || g.playerPos(), P0 = g.playerPos();
        this.killGroup = []; this.bestCombo = 0;
        for (let k = 0; k < s.fight.n; k++) { const a = (k / s.fight.n) * Math.PI * 2, x = P0.x + Math.cos(a) * 7, z = P0.z + Math.sin(a) * 7; const e = g.npcs.spawnEnemy('gang', s.fight.at === 'palace' ? at.x + Math.cos(a) * 12 : x, s.fight.at === 'palace' ? at.z + Math.sin(a) * 12 : z, { alert: true, weapon: s.fight.armed && k % 2 ? 1 : 0 }); this.killGroup.push(e); }
        if (s.fight.boss) { const b = g.npcs.spawnEnemy('gang', P0.x + 5, P0.z + 5, { alert: true, boss: true, weapon: 0 }); this.killGroup.push(b); }
        if (s.fight.solo) for (const f of g.friends) f.holdBack = true;
      }
    }
    const near = (p, r) => p && Math.hypot(P.x - p.x, P.z - p.z) < r;
    if (s.goto && near(this.resolve(s.goto), s.r || 10)) this.next();
    else if (s.inCar && g.player.vehicle && g.player.vehicle.kind === 'car') this.next();
    else if (s.inJet && g.player.vehicle && g.player.vehicle.kind === 'jet') this.next();
    else if (s.onHorse && g.player.mount) this.next();
    else if (s.inBike && g.player.vehicle && g.player.vehicle.spec && g.player.vehicle.spec.bike) this.next();
    else if (s.chests) { if (g.uw.found.size - this.chest0 >= s.chests) this.next(); }
    else if (s.lose) { if (g.npcs.wanted === 0 && this.timer > 3) this.next(); }
    else if (s.bossFight) { const b = g[s.bossFight]; if (b && b.defeated) this.next(); }
    else if (s.mansion) { if (g.inside && g.interior.lux) this.next(); }
    else if (s.fight) {
      if (g.combo) this.bestCombo = Math.max(this.bestCombo || 0, g.combo.n);
      if (this.killGroup.every((e) => !e.alive)) {
        if (s.fight.combo && (this.bestCombo || 0) < s.fight.combo) { g.hud.toast(`Land a ${s.fight.combo}-hit combo! More fighters incoming`, 2.5, '#ffca28'); const P0 = g.playerPos(); for (let k = 0; k < 3; k++) this.killGroup.push(g.npcs.spawnEnemy('gang', P0.x + Math.cos(k * 2.1) * 7, P0.z + Math.sin(k * 2.1) * 7, { alert: true, weapon: 0 })); }
        else this.next();
      }
    }
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
    if (!g.player.alive && this.cur && (s.cps || s.kill || s.boss || s.fight || s.bossFight)) this.fail('You were knocked out');
  }
}
// GTA-style marker column: bright at the ground, fading out upward, gently pulsing
function markerMat(color, k) {
  return new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(color) }, uK: { value: k }, uTime: U.uTime }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uC; uniform float uK, uTime; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.4)*uK*(0.82 + 0.18*sin(uTime*3.0 - vUv.y*9.0)); gl_FragColor = vec4(uC*a, 1.0); }',
  });
}
