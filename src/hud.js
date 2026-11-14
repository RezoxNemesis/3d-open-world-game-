// DOM user interface: title, loading, HUD, minimap, big map (fast travel), menus, touch controls.
import { touchApi, input } from './input.js';
import { audio } from './audio.js';

const $ = (tag, attrs = {}, parent) => { const e = document.createElement(tag); for (const k in attrs) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'html') e.innerHTML = attrs[k]; else if (k === 'style') e.style.cssText = attrs[k]; else e.setAttribute(k, attrs[k]); } if (parent) parent.appendChild(e); return e; };
const TIPS = ['Make masala chai at a stall or in any home kitchen to heal fully.', 'Hold WEB in the air to swing between buildings and trees.', 'Climb any wall: run into it and keep pushing, or jump onto it.', 'Jump off the Daman Sky Tower and open your parachute with CHUTE.', 'Switch between Veer and Mira any time with ⇄.', 'Kaala Naag sleeps beneath Naag Sarovar on the plateau…', 'Fighter jets wait at Daman Airport. Missiles lock on to big targets.', 'Horses graze on Jampore beach and at the Jungle Camp.', 'Monsoon brings storms; winter brings fog and mustard fields.'];
export class HUD {
  constructor(game) {
    this.game = game; this.root = $('div', { id: 'hud', class: 'ui' }, document.body); this.root.style.display = 'none';
    const tl = $('div', { id: 'topl' }, this.root);
    this.ports = ['Veer', 'Mira'].map((n, i) => { const p = $('div', { class: 'port' + (i === 0 ? ' on' : '') }, tl); $('b', { text: n.toUpperCase() }, p); const hp = $('div', { class: 'hp' }, p); const bar = $('div', {}, hp); const ar = $('div', { class: 'hp ar' }, p); const abar = $('div', { style: 'width:0%' }, ar); p.onclick = () => this.game.switchHero(); return { p, bar, abar }; });
    const tr = $('div', { id: 'topr' }, this.root);
    this.clock = $('div', { id: 'clock' }, tr); this.season = $('div', { id: 'season' }, tr); this.money = $('div', { id: 'money' }, tr); this.starsEl = $('div', { id: 'stars' }, tr); this.weapon = $('div', { id: 'weapon' }, tr);
    this.mm = $('div', { id: 'minimap' }, this.root); this.mmc = $('canvas', { width: 256, height: 256 }, this.mm); this.mmx = this.mmc.getContext('2d');
    this.mm.onclick = () => this.openMap();
    const mb = $('div', { id: 'mapbtn', text: 'MAP' }, this.root); mb.onclick = () => this.openMap();
    this.promptEl = $('div', { id: 'prompt' }, this.root); this.promptEl.onclick = () => { touchApi.down('interact'); setTimeout(() => touchApi.up('interact'), 80); };
    this.obj = $('div', { id: 'objective' }, this.root); this.sub = $('div', { id: 'subtitle' }, this.root); this.toastEl = $('div', { id: 'toast' }, this.root);
    this.speedo = $('div', { id: 'speedo' }, this.root); this.cross = $('div', { id: 'cross' }, this.root);
    this.bossEl = $('div', { id: 'boss', html: '<span></span><div class="hp"><div></div></div>' }, this.root);
    this.fps = $('div', { id: 'fps' }, this.root);
    const pb = $('div', { id: 'pausebtn', text: '❚❚' }, this.root); pb.onclick = () => this.openMenu();
    this.flash = $('div', { id: 'flash' }, document.body);
    this.buildTouch(); this.buildMenu(); this.buildMap(); this.buildHelp();
    this.mmT = 0; this.toastT = 0;
  }
  // ---------- title & loading ----------
  title(opts, onPlay) {
    const t = $('div', { id: 'title' }, document.body);
    $('h1', { text: 'DAMAN DUO' }, t); $('h2', { text: 'OPEN-WORLD ACTION · DAMAN, INDIA' }, t);
    const play = $('button', { class: 'btn', text: opts.hasSave ? 'CONTINUE' : 'PLAY' }, t);
    $('div', { class: 'lbl', text: 'GRAPHICS' }, t);
    const r1 = $('div', { class: 'row' }, t);
    const chips = (row, list, cur, cb) => { const els = list.map(([k, label]) => { const b = $('button', { class: 'btn alt' + (k === cur ? ' on' : ''), text: label }, row); b.onclick = () => { els.forEach((e) => e.classList.remove('on')); b.classList.add('on'); cb(k); }; return b; }); };
    chips(r1, [['low', 'Low'], ['mobile', 'Mobile'], ['high', 'High'], ['ultra', 'Ultra']], opts.preset, (k) => (opts.preset = k));
    $('div', { class: 'lbl', text: 'CROWD (PEOPLE ON THE MAP)' }, t);
    const r2 = $('div', { class: 'row' }, t);
    chips(r2, [[50000, '50K'], [100000, '1 LAKH'], [200000, '2 LAKH'], [300000, '3 LAKH']], opts.crowd, (k) => (opts.crowd = k));
    const r3 = $('div', { class: 'row', style: 'margin-top:12px' }, t);
    if (opts.hasSave) { const nb = $('button', { class: 'btn alt', text: 'NEW GAME' }, r3); nb.onclick = () => { opts.newGame = true; go(); }; }
    const hb = $('button', { class: 'btn alt', text: 'CONTROLS' }, r3); hb.onclick = () => this.showHelp(true);
    $('div', { class: 'foot', text: `v${opts.version} · ${opts.platformLabel} · Built entirely in code · Desktop: WASD + mouse, F interact, Q switch hero, R web, G parachute, M map, Esc menu` }, t);
    const go = () => { t.remove(); onPlay(opts); };
    play.onclick = go;
    this.titleEl = t;
  }
  loading(show) {
    if (!this.loadEl) { this.loadEl = $('div', { id: 'loading' }, document.body); $('div', { class: 'msg' }, this.loadEl); $('div', { class: 'bar', html: '<div></div>' }, this.loadEl); $('div', { class: 'tip' }, this.loadEl); }
    this.loadEl.style.display = show ? 'flex' : 'none';
    if (show) this.loadEl.querySelector('.tip').textContent = 'TIP: ' + TIPS[Math.floor(Math.random() * TIPS.length)];
  }
  progress(msg, p) { if (!this.loadEl) return; this.loadEl.querySelector('.msg').textContent = msg; this.loadEl.querySelector('.bar div').style.width = Math.round(p * 100) + '%'; }
  show() { this.root.style.display = 'block'; }
  // ---------- touch controls ----------
  buildTouch() {
    const T = this.touch = $('div', { id: 'touch', class: 'ui' }, document.body);
    const stick = $('div', { id: 'stick', html: '<div></div>' }, T), knob = stick.firstChild;
    let sid = null, cx = 0, cy = 0; const R = 60;
    const move = (x, y) => { let dx = x - cx, dy = y - cy; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } knob.style.transform = `translate(${dx}px,${dy}px)`; touchApi.stick(dx / R, -dy / R); };
    stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; sid = t.identifier; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(t.clientX, t.clientY); e.preventDefault(); e.stopPropagation(); }, { passive: false });
    stick.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === sid) move(t.clientX, t.clientY); e.preventDefault(); e.stopPropagation(); }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === sid) { sid = null; knob.style.transform = ''; touchApi.stick(0, 0); } };
    stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
    // buttons: [id, label, action, right, bottom, big, toggle]
    const B = [
      ['atk', 'PUNCH', 'attack', 30, 40, 1], ['jump', 'JUMP', 'jump', 30, 140], ['kick', 'KICK', 'kick', 130, 30], ['sprint', 'SPRINT', 'sprint', 112, 118, 0, 1], ['web', 'WEB', 'web', 200, 70],
      ['aim', 'AIM', 'aim', 210, 160, 0, 1], ['roll', 'ROLL', 'roll', 285, 30], ['act', 'F', 'interact', 30, 225], ['sw', '⇄', 'switch', 120, 205], ['gun', 'GUN', 'weapon', 200, 245],
      ['chute', 'CHUTE', 'chute', 290, 120], ['up', 'UP ▲', 'jump', 30, 140], ['down', 'DOWN ▼', 'down', 120, 40], ['fire', 'FIRE', 'attack', 30, 40, 1], ['missile', 'MISSILE', 'kick', 130, 30], ['boost', 'BOOST', 'sprint', 112, 118],
      ['hand', 'DRIFT', 'jump', 30, 140], ['nitro', 'NITRO', 'sprint', 112, 118], ['exit', 'EXIT', 'interact', 30, 225], ['horn', 'HORN', 'horn', 130, 30], ['gallop', 'GALLOP', 'sprint', 30, 40, 1], ['cam', 'CAM', 'camera', 200, 245],
    ];
    this.tb = {};
    for (const [id, label, act, r, b, big, toggle] of B) {
      const el = $('div', { class: 'tb' + (big ? ' big' : '') + ' hide', text: label }, T); el.style.right = `calc(${r}px + env(safe-area-inset-right))`; el.style.bottom = b + 'px';
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); if (toggle) { touchApi.toggle(act); el.classList.toggle('on', input.held.has(act)); } else { touchApi.down(act); el.classList.add('on'); } }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); if (!toggle) { touchApi.up(act); el.classList.remove('on'); } }, { passive: false });
      el.addEventListener('touchcancel', () => { if (!toggle) { touchApi.up(act); el.classList.remove('on'); } });
      this.tb[id] = el;
    }
    this.modeSets = {
      foot: ['atk', 'jump', 'kick', 'sprint', 'web', 'aim', 'roll', 'sw', 'gun'], air: ['atk', 'jump', 'web', 'chute', 'sw'], glide: ['chute', 'web'], chute: ['down'],
      swim: ['jump', 'sprint', 'sw'], car: ['hand', 'nitro', 'exit', 'horn', 'cam'], heli: ['up', 'down', 'fire', 'exit', 'cam'], plane: ['up', 'down', 'exit', 'boost', 'cam'], jet: ['up', 'down', 'fire', 'missile', 'boost', 'exit', 'cam'],
      horse: ['gallop', 'jump', 'exit', 'cam'], boat: ['exit', 'horn', 'cam'], busy: [], climb: ['jump', 'web', 'sprint'],
    };
    this.curMode = '';
  }
  showTouch(on) { this.touch.style.display = on ? 'block' : 'none'; this.touchOn = on; }
  setMode(mode, canAct) {
    const key = mode + (canAct ? '+' : '');
    if (key === this.curMode) return; this.curMode = key;
    const set = new Set(this.modeSets[mode] || []); if (canAct) set.add('act');
    for (const id in this.tb) this.tb[id].classList.toggle('hide', !set.has(id));
    this.tb.atk.textContent = this.game.player && this.game.player.weapon > 0 ? 'FIRE' : 'PUNCH';
  }
  // ---------- per-frame HUD ----------
  update(dt, s) {
    const g = this.game;
    g.heroes.forEach((h, i) => { this.ports[i].bar.style.width = Math.max(0, (h.hp / h.maxHp) * 100) + '%'; this.ports[i].abar.style.width = Math.min(100, h.armor) + '%'; this.ports[i].p.classList.toggle('on', h === g.player); });
    const hr = Math.floor(s.hour), mn = Math.floor((s.hour % 1) * 60);
    this.clock.textContent = `${hr % 12 === 0 ? 12 : hr % 12}:${String(mn).padStart(2, '0')} ${hr < 12 ? 'AM' : 'PM'}`;
    this.season.textContent = s.season + (s.rain > 0.2 ? ' · Rain' : '');
    this.money.textContent = '₹ ' + Math.floor(s.money).toLocaleString('en-IN');
    const p = g.player, W = s.weaponName;
    this.weapon.textContent = W ? W : '';
    if (s.speed !== null) { this.speedo.style.display = 'block'; this.speedo.innerHTML = `${Math.round(s.speed)}<small>${s.speedUnit}</small>`; } else this.speedo.style.display = 'none';
    this.cross.style.display = s.aim ? 'block' : 'none';
    if (s.prompt) { this.promptEl.style.display = 'block'; this.promptEl.textContent = (this.touchOn ? 'Tap F: ' : '[F] ') + s.prompt; } else this.promptEl.style.display = 'none';
    if (s.objective) { this.obj.style.display = 'block'; this.obj.textContent = s.objective; } else this.obj.style.display = 'none';
    const st = audio.subtitle; if (st && performance.now() - st.t < 9000) { this.sub.style.display = 'block'; this.sub.innerHTML = `<b>${st.who}:</b> ${st.text}`; } else this.sub.style.display = 'none';
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.style.display = 'none'; }
    this.fps.textContent = s.fpsOn ? `${Math.round(s.fps)} fps` + (s.res ? ` · ${s.res}% res` : '') : '';
    this.mmT -= dt; if (this.mmT <= 0) { this.mmT = 1 / 15; this.drawMinimap(s); }
  }
  hurtFlash(a) { this.flash.style.opacity = a; setTimeout(() => (this.flash.style.opacity = 0), 120); }
  toast(text, t = 3, color = '#ffd54f') { this.toastEl.style.display = 'block'; this.toastEl.style.color = color; this.toastEl.innerHTML = text; this.toastT = t; }
  stars(n) { this.starsEl.textContent = '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n)); this.starsEl.style.display = n ? 'block' : 'none'; }
  boss(name, frac) { if (name) { this.bossEl.style.display = 'block'; this.bossEl.querySelector('span').textContent = name; } if (frac !== undefined) this.bossEl.querySelector('.hp div').style.width = frac * 100 + '%'; if (frac <= 0) setTimeout(() => (this.bossEl.style.display = 'none'), 3000); }
  drawMinimap(s) {
    const c = this.mmx, W = 256, g = this.game, mc = g.world.mapCanvas; if (!mc) return;
    const P = g.playerPos(), scale = mc.width / (2 * 10000), zoom = s.mmZoom || 2.6;
    c.save(); c.fillStyle = '#1b4f6e'; c.fillRect(0, 0, W, W);
    c.translate(W / 2, W / 2); c.rotate(-(g.rig.yaw + Math.PI)); c.scale(zoom, zoom);
    c.drawImage(mc, -(P.x + 10000) * scale, -(P.z + 10000) * scale);
    const dot = (x, z, col, r = 3) => { c.fillStyle = col; c.beginPath(); c.arc((x - P.x) * scale, (z - P.z) * scale, r / zoom, 0, 7); c.fill(); };
    for (const m of s.markers) dot(m.x, m.z, m.color || '#ffd54f', 6);
    for (const e of s.enemies) dot(e.x, e.z, e.team === 'police' ? '#42a5f5' : '#ff5252', 3);
    for (const h of g.heroes) if (h !== g.player) dot(h.pos.x, h.pos.z, '#69f0ae', 4);
    if (s.serpent) dot(s.serpent.x, s.serpent.z, '#d500f9', 9);
    c.restore();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(W / 2, W / 2 - 11); c.lineTo(W / 2 - 7, W / 2 + 8); c.lineTo(W / 2 + 7, W / 2 + 8); c.closePath(); c.fill();
    const na = -(g.rig.yaw + Math.PI); c.fillStyle = '#ff5252'; c.font = 'bold 20px sans-serif'; c.fillText('N', W / 2 + Math.sin(-na) * 108 - 7, W / 2 - Math.cos(-na) * 108 + 7);
  }
  // ---------- big map + fast travel ----------
  buildMap() {
    const m = this.mapEl = $('div', { id: 'map' }, document.body);
    this.mapC = $('canvas', { width: 1024, height: 1024 }, m); $('div', { class: 'hint', text: 'Tap a place to fast-travel · tap outside to close' }, m);
    m.onclick = (e) => { if (e.target === m) this.closeMap(); };
    this.mapC.onclick = (e) => {
      const r = this.mapC.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 20000 - 10000, z = ((e.clientY - r.top) / r.height) * 20000 - 10000;
      let best = null, bd = 450; for (const L of this.game.world.labels) { const d = Math.hypot(L.x - x, L.z - z); if (d < bd) { bd = d; best = L; } }
      if (best) { this.closeMap(); this.game.fastTravel(best); }
    };
  }
  openMap() {
    const g = this.game, c = this.mapC.getContext('2d'); g.paused = true;
    c.drawImage(g.world.mapCanvas, 0, 0, 1024, 1024);
    const k = 1024 / 20000, X = (x) => (x + 10000) * k, Z = (z) => (z + 10000) * k;
    c.font = 'bold 15px sans-serif'; c.textAlign = 'center';
    for (const L of g.world.labels) { c.fillStyle = '#ffd54f'; c.beginPath(); c.arc(X(L.x), Z(L.z), 5, 0, 7); c.fill(); c.fillStyle = '#000a'; c.fillText(L.name, X(L.x) + 1, Z(L.z) - 9); c.fillStyle = '#fff'; c.fillText(L.name, X(L.x), Z(L.z) - 10); }
    const P = g.playerPos(); c.fillStyle = '#00e5ff'; c.beginPath(); c.arc(X(P.x), Z(P.z), 9, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke();
    for (const mk of g.markers()) { c.fillStyle = '#ffeb3b'; c.fillRect(X(mk.x) - 7, Z(mk.z) - 7, 14, 14); }
    this.mapEl.style.display = 'flex';
  }
  closeMap() { this.mapEl.style.display = 'none'; this.game.paused = false; }
  // ---------- menu ----------
  buildMenu() {
    const m = this.menuEl = $('div', { id: 'menu' }, document.body), p = $('div', { class: 'panel' }, m);
    $('h3', { text: 'PAUSED' }, p);
    this.menuBody = $('div', {}, p);
    const row = $('div', { class: 'row', style: 'display:flex;flex-wrap:wrap;gap:6px;margin-top:12px' }, p);
    const btn = (t, f) => { const b = $('button', { class: 'btn alt', text: t }, row); b.onclick = f; return b; };
    btn('RESUME', () => this.closeMenu()); btn('MAP', () => { this.closeMenu(); this.openMap(); }); btn('SAVE', () => { this.game.save(); this.toast('Game saved', 1.5, '#9dff8a'); }); btn('CONTROLS', () => this.showHelp(true)); btn('QUIT TO TITLE', () => location.reload());
  }
  openMenu() {
    const g = this.game; g.paused = true; this.menuEl.style.display = 'flex'; if (document.exitPointerLock) document.exitPointerLock();
    const b = this.menuBody; b.innerHTML = '';
    const sec = (t) => $('div', { class: 'lbl', text: t, style: 'margin:14px 0 4px;opacity:.7;letter-spacing:.2em;font-size:12px' }, b);
    sec('MISSIONS');
    for (const ms of g.missions.list) { const r = $('div', { class: 'setrow' }, b); $('span', { text: (ms.done ? '✔ ' : '') + ms.name + ' — ' + ms.desc }, r); const go = $('button', { class: 'btn alt', text: ms.done ? 'REPLAY' : 'START' }, r); go.onclick = () => { this.closeMenu(); g.missions.start(ms.id); }; }
    sec('WORLD');
    const set = (label, opts, cur, cb) => { const r = $('div', { class: 'setrow' }, b); $('span', { text: label }, r); const o = $('div', { class: 'opts' }, r); const els = opts.map(([k, t]) => { const e = $('button', { class: 'btn alt' + (k === cur ? ' on' : ''), text: t }, o); e.onclick = () => { els.forEach((x) => x.classList.remove('on')); e.classList.add('on'); cb(k); }; return e; }); };
    set('Season', [['summer', 'Summer'], ['monsoon', 'Monsoon'], ['postmonsoon', 'Post-monsoon'], ['winter', 'Winter']], g.weather.season, (k) => g.weather.setSeason(k));
    set('Weather', [['clear', 'Clear'], ['rain', 'Rain / storm']], g.weather.targetRain > 0 ? 'rain' : 'clear', (k) => { g.weather.targetRain = k === 'rain' ? 0.9 : 0; g.weather.timer = 300; });
    set('Time', [[6, 'Dawn'], [11, 'Day'], [16.5, 'Afternoon'], [18.2, 'Sunset'], [22, 'Night']], null, (k) => (g.sky.hour = k));
    set('Day speed', [[0, 'Frozen'], [30, 'Slow'], [60, 'Normal'], [240, 'Fast']], g.timeScale, (k) => (g.timeScale = k));
    sec('PERFORMANCE');
    const gv = g.gov;
    if (gv) {
      set('Frame rate', [[30, '30'], [45, '45'], [60, '60'], [120, 'Max']], gv.cap, (k) => { gv.cap = k; try { localStorage.setItem('damanduo.fps', String(k)); } catch (e) {} });
      set('Auto resolution', [[true, 'On'], [false, 'Off']], gv.enabled, (k) => { gv.enabled = k; if (!k && gv.scale !== 1) { gv.scale = 1; gv.onScale(1); } try { localStorage.setItem('damanduo.drs', k ? '1' : '0'); } catch (e) {} });
    }
    if (g.gpu && g.gpu.renderer) $('div', { class: 'lbl', text: `GPU: ${g.gpu.renderer}`, style: 'font-size:11px;opacity:.55;margin:4px 0;text-transform:none;letter-spacing:0' }, b);
    sec('GRAPHICS (restarts)');
    set('Preset', [['low', 'Low'], ['mobile', 'Mobile'], ['high', 'High'], ['ultra', 'Ultra']], g.presetKey, (k) => g.applyPreset(k));
    set('Crowd', [[50000, '50K'], [100000, '1 Lakh'], [200000, '2 Lakh'], [300000, '3 Lakh']], g.q.crowd, (k) => g.applyCrowd(k));
    sec('AUDIO & CONTROLS');
    set('Music', [[0, 'Off'], [0.3, 'Low'], [0.55, 'Med'], [0.9, 'High']], audio.musicVol, (k) => g.setMusic(k));
    set('Voices', [[true, 'On'], [false, 'Off']], audio.voiceOn, (k) => (audio.voiceOn = k));
    set('Look speed', [[0.6, 'Slow'], [1, 'Normal'], [1.6, 'Fast']], input.sens, (k) => (input.sens = k));
    set('Invert Y', [[false, 'Off'], [true, 'On']], input.invertY, (k) => (input.invertY = k));
    set('FPS counter', [[false, 'Off'], [true, 'On']], g.fpsOn, (k) => (g.fpsOn = k));
  }
  closeMenu() { this.menuEl.style.display = 'none'; this.game.paused = false; }
  buildHelp() {
    const h = this.helpEl = $('div', { id: 'help' }, document.body), p = $('div', { class: 'panel' }, h);
    p.innerHTML = `<h3>CONTROLS</h3>
    <p><b>Phone:</b> left stick moves, drag the right side to look. Buttons change with what you're doing (on foot, driving, flying, riding, swimming). F appears when you can interact.</p>
    <p><b>Desktop:</b> <kbd>WASD</kbd> move · mouse look · <kbd>Shift</kbd> sprint · <kbd>Space</kbd> jump / double-jump flip · <kbd>LMB</kbd> punch / fire · <kbd>E</kbd> kick · <kbd>RMB</kbd> aim / block · <kbd>X</kbd> roll · <kbd>R</kbd> hold to web-swing · <kbd>G</kbd> wingsuit → parachute · <kbd>F</kbd> enter / exit / interact · <kbd>Q</kbd> switch Veer ⇄ Mira · <kbd>Tab</kbd> weapon · <kbd>M</kbd> map · <kbd>V</kbd> camera · <kbd>Esc</kbd> menu · <kbd>F11</kbd> fullscreen</p>
    <p><b>Cars:</b> <kbd>W</kbd>/<kbd>S</kbd> gas/brake · <kbd>A</kbd>/<kbd>D</kbd> steer · <kbd>Space</kbd> handbrake drift · <kbd>Shift</kbd> nitro · <kbd>H</kbd> horn.<br>
    <b>Helicopter:</b> <kbd>WASD</kbd> tilt · <kbd>Space</kbd> up · <kbd>C</kbd> down · <kbd>LMB</kbd> guns.<br>
    <b>Jets:</b> <kbd>W</kbd>/<kbd>S</kbd> pitch · <kbd>A</kbd>/<kbd>D</kbd> roll · <kbd>Z</kbd>/<kbd>Y</kbd> yaw · <kbd>Space</kbd> throttle up · <kbd>C</kbd> throttle down · <kbd>Shift</kbd> afterburner · <kbd>LMB</kbd> cannon · <kbd>E</kbd> missile · <kbd>F</kbd> eject (parachute!).<br>
    <b>Horse:</b> move with stick · <kbd>Shift</kbd> tap repeatedly to gallop · <kbd>Space</kbd> jump.</p>
    <p><b>Things to do:</b> story missions (menu), street fights, gang hideout at Kachigam Docks, enter any building, make chai, explore caves, climb the 260 m Sky Tower and skydive, ride horses along Jampore beach, fly a fighter jet over the Arabian Sea, find the serpent of Naag Sarovar.</p>
    <button class="btn" id="helpclose">GOT IT</button>`;
    p.querySelector('#helpclose').onclick = () => this.showHelp(false);
  }
  showHelp(on) { this.helpEl.style.display = on ? 'flex' : 'none'; }
}
