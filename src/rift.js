// The Rift: a portal outbreak over Daman. A tear opens in the sky, shades pour out of it, and the heroes close it by holding
// the anchors that pin it to the ground. Everything is built once at start-up and kept hidden (see Game.precompile()).
import * as THREE from 'three';
import * as M from './mapdata.js';
import { U, NOISE } from './shaders.js';
import { emit, burst, explosion } from './fx.js';
import { sfx, say } from './audio.js';
import { clamp, lerp, damp } from './util.js';
import { ATMO } from './atmo.js';

const VIOLET = new THREE.Color(0.2, 0.08, 0.34);
const SHADE_LINES = ['It is cold on your side of the sky.', 'We remember this shore.', 'The door is open. We are many.'];

function portalMat() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: U.uTime, uOpen: { value: 0 }, uSeed: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }',
    fragmentShader: `uniform float uTime, uOpen, uSeed; varying vec2 vP;
      ${NOISE}
      void main(){
        float r = length(vP)/max(uOpen, 0.02); if (r > 1.0) discard;
        // a spiral that winds tighter towards the middle; noise is sampled on the unit circle so there is no seam
        float sw = atan(vP.y, vP.x) + 2.6/(r + 0.22) - uTime*1.1 + uSeed;
        vec2 d = vec2(cos(sw), sin(sw));
        float n = vn(d*2.1 + vec2(r*4.5 - uTime*0.7, uSeed))*0.62 + vn(d*5.3 + vec2(3.1, r*9.0 - uTime*1.5))*0.38;
        float arms = smoothstep(0.38, 0.82, n);
        float rim = smoothstep(0.80, 0.94, r)*(0.75 + 0.5*vn(d*9.0 + uTime*2.3));
        float edge = 1.0 - smoothstep(0.90 + 0.06*n, 1.0, r);
        // the void in the middle, a churning violet disc, a white-hot rim that crackles
        vec3 col = mix(vec3(0.012, 0.0, 0.035), vec3(0.42, 0.10, 0.95), arms*smoothstep(0.12, 0.7, r));
        col += vec3(1.0, 0.25, 0.9)*arms*arms*arms*smoothstep(0.3, 0.9, r)*1.4;
        col += vec3(0.75, 0.9, 1.6)*rim*2.2;
        col += vec3(0.8, 0.85, 1.0)*step(0.985, h21(floor(vP*90.0)))*(1.0 - smoothstep(0.1, 0.5, r));
        gl_FragColor = vec4(col, edge);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
// the sky bruises around the tear: a wide dark-violet disc of slow cloud behind it
function haloMat() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: U.uTime, uOpen: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }',
    fragmentShader: `uniform float uTime, uOpen; varying vec2 vP;
      ${NOISE}
      void main(){
        float r = length(vP); if (r > 1.0) discard;
        float sw = atan(vP.y, vP.x) + 1.2/(r + 0.3) - uTime*0.12; vec2 d = vec2(cos(sw), sin(sw));
        float n = vn(d*1.7 + vec2(r*3.0 - uTime*0.05, 2.0))*0.6 + vn(d*4.1 + vec2(r*7.0, uTime*0.08))*0.4;
        float a = (1.0 - smoothstep(0.12, 1.0, r))*(0.55 + 0.45*n)*uOpen;
        vec3 col = mix(vec3(0.02, 0.0, 0.05), vec3(0.16, 0.04, 0.30), n*n*(1.0 - r));
        gl_FragColor = vec4(col, a*0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
const glow = (r, g, b, o = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: o < 1, opacity: o, depthWrite: o >= 1, blending: o < 1 ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });

// is (x, z) open ground a person can stand on?
function freeSpot(x, z, pad = 2.5) {
  const h = M.terrainH(x, z); if (h < 0.8 || M.waterLevelAt(x, z) > h - 0.2) return false;
  for (const dx of [-pad, pad]) for (const dz of [-pad, pad]) for (const i of M.collidersNear(x + dx, z + dz)) {
    const c = M.colliders[i]; if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) return false;
  }
  return true;
}
function findSpot(cx, cz, ang, r0, r1) {
  for (let k = 0; k < 40; k++) {
    const a = ang + ((k % 8) - 3.5) * 0.14, r = lerp(r0, r1, Math.floor(k / 8) / 4), x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
    if (freeSpot(x, z)) return { x, z };
  }
  return { x: cx + Math.sin(ang) * r0, z: cz + Math.cos(ang) * r0 };
}

// the look of a shade: a tall figure of dark violet smoke-skin; the glowing eyes, horns and heart are added in dress()
export const SHADE_LOOK = { female: false, skin: 0x150a24, top: 0x150a24, bottom: 0x100719, shoes: 0x100719, sole: 0x08040d, hair: 0x100719, hairStyle: 'bald', beard: false, sleeves: 'short' };
let eyeGeo, hornGeo, heartGeo, eyeMat, hornMat, heartMat;
export function dressShade(c, big) {
  if (!eyeGeo) {
    eyeGeo = new THREE.SphereGeometry(0.017, 8, 6); hornGeo = new THREE.ConeGeometry(0.03, 0.2, 6); heartGeo = new THREE.OctahedronGeometry(0.055);
    eyeMat = glow(3.2, 0.5, 2.6); hornMat = new THREE.MeshStandardMaterial({ color: 0x0b0612, roughness: 0.55 }); heartMat = glow(2.4, 0.3, 3.2);
  }
  const B = c.h.bones;
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(0.031 * s, 0.047, 0.088); B.head.add(e);
    const h = new THREE.Mesh(hornGeo, hornMat); h.position.set(0.062 * s, 0.17, 0.0); h.rotation.set(-0.25, 0, -0.42 * s); B.head.add(h);
  }
  const k = new THREE.Mesh(heartGeo, heartMat); k.position.set(0, 0.02, 0.125); B.chest.add(k); c.heart = k;
  c.h.mesh.scale.setScalar(big ? 1.5 : 1.12 + Math.random() * 0.16);
}

export class Rift {
  constructor(game) {
    this.g = game; this.state = 'idle'; this.open = 0; this.site = null; this.shades = []; this.spawnT = 0; this.sealed = 0; this.dark = 0; this.surgeT = 420; this.boltT = 0;
    this.cap = game.q.desktop ? 8 : 5;
    const root = this.root = new THREE.Group(); root.visible = false; game.scene.add(root);
    this.mat = portalMat();
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), this.mat); this.disc.renderOrder = 4; this.disc.frustumCulled = false; root.add(this.disc);
    this.haloMat = haloMat(); this.halo = new THREE.Mesh(new THREE.CircleGeometry(1, 40), this.haloMat); this.halo.renderOrder = 3; this.halo.frustumCulled = false; root.add(this.halo);
    // lightning from the rim to the ground
    this.boltMat = new THREE.LineBasicMaterial({ color: new THREE.Color(2.2, 1.6, 3.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.bolts = []; for (let i = 0; i < 3; i++) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3)); const l = new THREE.Line(g, this.boltMat); l.frustumCulled = false; root.add(l); this.bolts.push(l); }
    // anchors: a spinning shard over a ring; a small gate beside it lets the shades through; a tether runs up to the tear
    const shardGeo = new THREE.OctahedronGeometry(0.9), ringGeo = new THREE.TorusGeometry(5, 0.1, 6, 56).rotateX(Math.PI / 2), fillGeo = new THREE.RingGeometry(0.2, 5, 48).rotateX(-Math.PI / 2), gateGeo = new THREE.CircleGeometry(1, 28);
    this.shardMat = new THREE.MeshStandardMaterial({ color: 0x3a0a5e, emissive: new THREE.Color(0.75, 0.08, 1.1), roughness: 0.18, metalness: 0.2, flatShading: true }); this.ringMat = glow(0.9, 0.22, 1.5, 0.85); this.fillMat = glow(0.45, 0.1, 0.75, 0.45); this.tetherMat = new THREE.LineBasicMaterial({ color: new THREE.Color(1.4, 0.5, 2.2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.anchors = [];
    for (let i = 0; i < 3; i++) {
      const grp = new THREE.Group(); root.add(grp);
      const shard = new THREE.Mesh(shardGeo, this.shardMat); shard.scale.set(0.7, 1.5, 0.7); grp.add(shard);
      const ring = new THREE.Mesh(ringGeo, this.ringMat); grp.add(ring);
      const fill = new THREE.Mesh(fillGeo, this.fillMat); fill.position.y = 0.06; grp.add(fill);
      const gate = new THREE.Mesh(gateGeo, portalMat()); gate.material.uniforms.uSeed.value = 1.7 + i * 2.1; gate.material.uniforms.uOpen.value = 1; gate.scale.set(1.5, 2.4, 1); gate.renderOrder = 4; grp.add(gate);
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)); const tether = new THREE.Line(tg, this.tetherMat); tether.frustumCulled = false; root.add(tether);
      this.anchors.push({ grp, shard, ring, fill, gate, tether, x: 0, z: 0, y: 0, k: 0, done: false, on: false });
    }
  }
  get active() { return this.state === 'open'; }
  // the tear appears, high and small: it can be seen from town but nothing comes through yet
  omen(site, quiet) {
    if (this.state !== 'idle') return;
    this.place(site, {}); this.state = 'omen'; for (const a of this.anchors) { a.grp.visible = false; a.tether.visible = false; }
    if (!quiet) { sfx('rift', 1); this.g.shake(0.6); this.g.hud.cinematic('THE SKY TEARS OPEN', 'Something is coming through over Moti Daman', 5); }
  }
  place(site, o) {
    const mini = !!o.mini, gy = M.groundAt(site.x, site.z);
    this.site = { x: site.x, z: site.z, y: gy, R: mini ? 9 : 46, H: mini ? 13 : 96, mini, n: mini ? 1 : 3, hold: mini ? 5 : 7, reward: o.reward || 0, onSealed: o.onSealed || null };
    this.root.visible = true; this.disc.position.set(site.x, gy + this.site.H, site.z); this.disc.scale.setScalar(this.site.R); this.halo.scale.setScalar(this.site.R * 4.2); this.mat.uniforms.uSeed.value = Math.random() * 6;
  }
  // the outbreak proper: anchors drop, shades start coming through
  begin(site, o = {}) {
    if (this.state === 'open') return;
    if (this.state === 'idle' || o.mini) this.place(site, o);
    const S = this.site; this.state = 'open'; this.sealed = 0; this.spawnT = 1.5;
    const a0 = Math.random() * 6.28;
    this.anchors.forEach((a, i) => {
      a.on = i < S.n; a.done = false; a.k = 0; a.grp.visible = a.on; a.tether.visible = a.on; if (!a.on) return;
      const p = findSpot(S.x, S.z, a0 + i * 2.094, S.mini ? 10 : 46, S.mini ? 22 : 78); a.x = p.x; a.z = p.z; a.y = M.groundAt(p.x, p.z);
      a.grp.position.set(a.x, a.y, a.z); a.gate.position.set(Math.sin(a0 + i * 2.094) * 3.2, 2.5, Math.cos(a0 + i * 2.094) * 3.2); a.gate.rotation.y = a0 + i * 2.094 + Math.PI;
      a.ring.scale.setScalar(1); a.shard.visible = true; a.fill.scale.setScalar(0.04);
    });
    sfx('rift', 1); this.g.shake(0.8); explosion(S.x, S.y + 2, S.z, 0.6);
  }
  spawnShade() {
    const g = this.g, live = this.anchors.filter((a) => a.on && !a.done); if (!live.length) return;
    const a = live[Math.floor(Math.random() * live.length)], wx = a.x + a.gate.position.x, wz = a.z + a.gate.position.z;
    const big = !this.site.mini && this.sealed === 2 && !this.shades.some((s) => s.alive && s.ai.boss);
    const c = g.npcs.spawnEnemy('rift', wx, wz, { alert: true, boss: big });
    this.shades.push(c); burst('smoke', wx, a.y + 1.4, wz, 8, 1.2); sfx('shade', 0.6, c.pos.distanceTo(g.playerPos()));
    if (Math.random() < 0.18) say('Shade', SHADE_LINES[Math.floor(Math.random() * SHADE_LINES.length)]);
  }
  collapse() {
    const S = this.site; this.state = 'closing'; sfx('riftclose', 1); this.g.shake(1);
    for (const c of this.shades) if (c.alive) { c.damage(1e5, null); }
    for (const a of this.anchors) { a.grp.visible = false; a.tether.visible = false; }
    if (S.reward) { this.g.money += S.reward; this.g.hud.toast(`RIFT SEALED  + ₹${S.reward.toLocaleString('en-IN')}`, 4, '#e040fb'); }
    if (S.onSealed) S.onSealed();
  }
  // back to nothing (or to the waiting tear when the story still needs it)
  reset(toOmen) {
    for (const c of this.shades) if (c.alive) c.damage(1e5, null);
    this.shades.length = 0; const s = this.site; this.state = 'idle'; this.open = 0; this.root.visible = false;
    if (toOmen && s && !s.mini) this.omen(s, true);
  }
  // progress of the anchor the player is holding, 0..1 (for the objective line)
  get holding() { let k = 0; for (const a of this.anchors) if (a.on && !a.done) k = Math.max(k, a.k); return k; }
  update(dt) {
    const g = this.g, P = g.playerPos(), t = U.uTime.value;
    // surges: after the heroes choose to keep the shard, small rifts keep opening near them
    if (this.state === 'idle' && g.choices.rift === 'keep' && !g.missions.cur && !g.inside && !g.benchmark && g.player.state === 'ground' && !g.player.vehicle) {
      this.surgeT -= dt;
      if (this.surgeT < 0) {
        this.surgeT = 400 + Math.random() * 240; const p = findSpot(P.x, P.z, g.player.yaw, 30, 60);
        if (freeSpot(p.x, p.z)) { this.begin(p, { mini: true, reward: 3000 }); g.hud.toast('RIFT SURGE<br><span style="font-size:15px">The shard is pulling another one open</span>', 4, '#e040fb'); }
      }
    }
    // how dark the sky is here: full under the tear, gone 1.6 km away (weather.js reads this.dark)
    const S = this.site, dist = S ? Math.hypot(P.x - S.x, P.z - S.z) : 1e9;
    const want = this.state === 'open' ? (S.mini ? 0.35 : 1) : this.state === 'omen' ? 0.3 : 0;
    this.dark = damp(this.dark, want * clamp(1 - dist / (S && S.mini ? 220 : 1600), 0, 1), 1.2, dt);
    if (this.state === 'idle') return;
    const target = this.state === 'open' ? 1 : this.state === 'omen' ? 0.42 : 0;
    this.open = damp(this.open, target, this.state === 'closing' ? 2.2 : 0.9, dt); this.mat.uniforms.uOpen.value = this.open;
    const ry = Math.atan2(P.x - S.x, P.z - S.z); this.disc.rotation.y = ry; this.halo.rotation.y = ry; this.haloMat.uniforms.uOpen.value = this.open;
    this.halo.position.set(S.x - Math.sin(ry) * 3, S.y + S.H, S.z - Math.cos(ry) * 3);     // just behind the tear
    if (this.state === 'closing') { if (this.open < 0.03) { explosion(S.x, S.y + S.H * 0.5, S.z, S.mini ? 0.8 : 2); this.reset(false); } return; }
    // embers spiral up into the tear
    if (dist < 900) for (let k = 0; k < (this.state === 'open' ? 3 : 1); k++) {
      const a = Math.random() * 6.28, r = S.R * (0.3 + Math.random() * 0.9), y = S.y + Math.random() * S.H * 0.8;
      emit(0, S.x + Math.cos(a) * r, y, S.z + Math.sin(a) * r, -Math.cos(a) * r * 0.25, 6 + Math.random() * 9, -Math.sin(a) * r * 0.25, 1.6 + Math.random(), S.mini ? 0.2 : 0.55, 2.4, 0.5, 3.0);
    }
    // lightning
    this.boltT -= dt; this.boltMat.opacity = Math.max(0, this.boltMat.opacity - dt * 7);
    if (this.boltT < 0 && this.state === 'open') {
      this.boltT = 0.25 + Math.random() * (S.mini ? 1.6 : 0.9); this.boltMat.opacity = 1;
      for (const l of this.bolts) {
        const p = l.geometry.attributes.position, a = Math.random() * 6.28, x0 = S.x + Math.cos(a) * S.R * 0.8, z0 = S.z + Math.sin(a) * S.R * 0.8, y0 = S.y + S.H - S.R * 0.5;
        const x1 = S.x + Math.cos(a) * S.R * (0.6 + Math.random() * 1.6), z1 = S.z + Math.sin(a) * S.R * (0.6 + Math.random() * 1.6), y1 = M.groundAt(x1, z1), j = S.R * 0.09;
        for (let i = 0; i < 16; i++) { const k = i / 15, w = i === 0 || i === 15 ? 0 : j; p.setXYZ(i, lerp(x0, x1, k) + (Math.random() - 0.5) * w, lerp(y0, y1, k) + (Math.random() - 0.5) * w, lerp(z0, z1, k) + (Math.random() - 0.5) * w); }
        p.needsUpdate = true;
      }
      if (dist < 500 && Math.random() < 0.35) sfx('thunder', 0.35);
    }
    if (this.state !== 'open') return;
    // anchors: stand in the ring to drain one; it refills slowly when left alone
    let holdingOne = false;
    for (const a of this.anchors) {
      if (!a.on || a.done) continue;
      a.shard.position.y = 2.6 + Math.sin(t * 1.7 + a.x) * 0.3; a.shard.rotation.y = t * 1.4; a.gate.material.uniforms.uOpen.value = 1;
      const tp = a.tether.geometry.attributes.position; tp.setXYZ(0, a.x, a.y + a.shard.position.y, a.z); tp.setXYZ(1, S.x, S.y + S.H - S.R * 0.55, S.z); tp.needsUpdate = true;
      const inRing = Math.hypot(P.x - a.x, P.z - a.z) < 5.2 && Math.abs(P.y - a.y) < 4 && g.player.alive;
      a.k = clamp(a.k + (inRing ? dt / S.hold : -dt / 22), 0, 1); a.fill.scale.setScalar(Math.max(0.04, a.k)); if (inRing) holdingOne = true;
      if (inRing && Math.random() < dt * 14) emit(0, a.x + (Math.random() - 0.5) * 8, a.y + 0.3, a.z + (Math.random() - 0.5) * 8, 0, 5, 0, 0.7, 0.16, 3, 0.8, 3);
      if (a.k >= 1) {
        a.done = true; a.grp.visible = false; a.tether.visible = false; this.sealed++;
        explosion(a.x, a.y + 2.5, a.z, 0.9); sfx('riftclose', 0.7); g.shake(0.5);
        if (this.sealed < S.n) g.hud.toast(`ANCHOR BROKEN  ${this.sealed}/${S.n}`, 2.2, '#e040fb'); else this.collapse();
      }
    }
    if (this.state !== 'open') return;
    this.holdingNow = holdingOne;
    // shades
    for (let i = this.shades.length - 1; i >= 0; i--) {
      const c = this.shades[i];
      if (c.alive) { if (c.heart) c.heart.rotation.y = t * 3; continue; }
      if (!c.gone) { c.gone = true; c.deadT = 21; burst('smoke', c.pos.x, c.pos.y + 1, c.pos.z, 14, 1.4); g.money += c.ai && c.ai.boss ? 1500 : 150; }
      this.shades.splice(i, 1);
    }
    this.spawnT -= dt;
    if (this.spawnT < 0 && dist < 260) {
      const cap = S.mini ? 4 : this.cap;
      if (this.shades.length < cap) this.spawnShade();
      this.spawnT = (S.mini ? 3.2 : 2.4) + Math.random() * 1.5 + (holdingOne ? 0 : 1.5);
    }
  }
  // tint the day while the tear is open (called by Game after the sky and the weather have set their colours)
  tint(sky, scene) {
    const k = this.dark; if (k < 0.004) return;
    sky.sun.intensity *= 1 - 0.6 * k; sky.hemi.intensity *= 1 - 0.3 * k;
    scene.fog.color.lerp(VIOLET, 0.55 * k); U.uFogColor.value.copy(scene.fog.color); U.uFogSun.value.lerp(VIOLET, 0.5 * k);
    ATMO.sun[3] *= 1 - 0.7 * k;
    U.uHorizon.value.lerp(VIOLET, 0.4 * k); U.uZenith.value.lerp(new THREE.Color(0.05, 0.02, 0.1), 0.5 * k);
  }
}
