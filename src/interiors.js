// Enterable interiors (homes, shops, chai cafes) and caves. Built on demand far below the map,
// entered with a fade; walls/furniture have their own colliders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from './mapdata.js';
import { Character } from './player.js';
import { randomLook, Pose } from './human.js';
import { U, NOISE, patch } from './shaders.js';
import { clamp, mulberry32, lerp } from './util.js';
import { burst } from './fx.js';
import { sfx, say } from './audio.js';

const lin = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255].map((c) => Math.pow(c, 2.2));
function colored(g, hex) { if (g.index) g = g.toNonIndexed(); const n = g.attributes.position.count, c = lin(hex), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
const Y0 = -600;
export class Interiors {
  constructor(game) {
    this.game = game; this.active = false; this.group = null; this.cols = []; this.floorY = Y0; this.items = []; this.npcs = [];
    this.lights = [new THREE.PointLight(0xffd9a0, 0, 18, 1.6), new THREE.PointLight(0xffd9a0, 0, 18, 1.6)];
    for (const l of this.lights) { l.position.set(0, -2000, 0); game.scene.add(l); }
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    this.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.BackSide, flatShading: true });
    this.fanT = 0;
  }
  // ----- building interiors -----
  enter(b, idx, kind) {
    const lux = kind === 'mansion'; if (lux) kind = 'home';
    const w = clamp(b.x1 - b.x0, 7, lux ? 26 : 18), d = clamp(b.z1 - b.z0, 7, lux ? 20 : 16), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const ox = cx, oz = cz, H = lux ? 4.8 : 3.2, rng = mulberry32(idx * 7 + 3);
    this.exitPos = this.doorOutside(b);
    this.origin = new THREE.Vector3(ox, Y0, oz); this.kind = kind; this.w = w; this.d = d;
    const parts = [], glow = [], cols = [];
    const box = (sx, sy, sz, x, y, z, col, collide = true, ry = 0) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.rotateY(ry); g.translate(ox + x, Y0 + y, oz + z); parts.push(colored(g, col)); if (collide) cols.push({ x0: ox + x - (ry ? sz : sx) / 2, x1: ox + x + (ry ? sz : sx) / 2, z0: oz + z - (ry ? sx : sz) / 2, z1: oz + z + (ry ? sx : sz) / 2, y1: Y0 + y + sy / 2 }); };
    const cyl = (r, h, x, y, z, col) => { const g = new THREE.CylinderGeometry(r, r, h, 14); g.translate(ox + x, Y0 + y, oz + z); parts.push(colored(g, col)); };
    const wallC = [0xf3e5c0, 0xd8ecf0, 0xf5d6c6, 0xe3f0d6, 0xfff3d6, 0xe6dcf2][Math.floor(rng() * 6)];
    // floor (tiles) + ceiling + outer walls
    for (let i = 0; i < Math.ceil(w / 0.8); i++) for (let j = 0; j < Math.ceil(d / 0.8); j++) { const g = new THREE.PlaneGeometry(0.78, 0.78); g.rotateX(-Math.PI / 2); g.translate(ox - w / 2 + 0.4 + i * 0.8, Y0 + 0.01, oz - d / 2 + 0.4 + j * 0.8); parts.push(colored(g, lux ? ((i + j) % 2 ? 0xf3efe7 : 0xe2dbcf) : kind === 'home' ? ((i + j) % 2 ? 0xd7ccc8 : 0xbcaaa4) : (i + j) % 2 ? 0xeeeeee : 0x9e9e9e)); }
    const T = 0.2;
    // outer shell = inward-facing planes (camera can look in from outside, like a cutaway)
    const plane = (pw, ph, x, y, z, ry, rx, col) => { const g = new THREE.PlaneGeometry(pw, ph); g.rotateX(rx || 0); g.rotateY(ry); g.translate(ox + x, Y0 + y, oz + z); parts.push(colored(g, col)); };
    plane(w, d, 0, H, 0, 0, Math.PI / 2, 0xfafafa);
    plane(w, H, 0, H / 2, -d / 2, 0, 0, wallC); plane(d, H, -w / 2, H / 2, 0, Math.PI / 2, 0, wallC); plane(d, H, w / 2, H / 2, 0, -Math.PI / 2, 0, wallC);
    plane(w / 2 - 0.7, H, -w / 4 - 0.35, H / 2, d / 2, Math.PI, 0, wallC); plane(w / 2 - 0.7, H, w / 4 + 0.35, H / 2, d / 2, Math.PI, 0, wallC); plane(1.4, H - 2.2, 0, 2.2 + (H - 2.2) / 2, d / 2, Math.PI, 0, wallC);
    glow.push(colored(new THREE.PlaneGeometry(1.3, 2.15).rotateY(Math.PI).translate(ox, Y0 + 1.08, oz + d / 2 + 0.11), 0xfff4d0));
    this.door = new THREE.Vector3(ox, Y0, oz + d / 2 - 0.7);
    // windows (bright panels)
    for (const sx of [-1, 1]) { glow.push(colored(new THREE.PlaneGeometry(1.4, 1.1).rotateY(sx * Math.PI / 2).translate(ox - sx * (w / 2 - 0.11), Y0 + 1.7, oz - d / 4), U.uNight.value > 0.5 ? 0x1a2340 : 0xcfe8ff)); }
    this.stove = null; this.counter = null;
    if (kind === 'home') {
      // partition: back third = kitchen (left) + bedroom (right)
      const zp = -d / 2 + d * 0.42;
      box(w / 2 - 0.6, H, T, -w / 4 - 0.3 + 0, H / 2, zp, wallC); box(w / 2 - 1.6, H, T, w / 4 + 0.8, H / 2, zp, wallC); box(T, H, d * 0.42, 0, H / 2, -d / 2 + d * 0.21, wallC);
      // living room
      box(2.4, 0.45, 0.9, -w / 2 + 1.6, 0.25, d / 2 - 1.6, 0x6d4c41); box(2.4, 0.5, 0.25, -w / 2 + 1.6, 0.65, d / 2 - 1.15, 0x6d4c41, false);
      box(0.9, 0.45, 1.6, -w / 2 + 0.7, 0.25, d / 2 - 2.8, 0x6d4c41);
      box(1.2, 0.08, 0.6, -w / 2 + 1.8, 0.42, d / 2 - 2.9, 0x8d6e63); for (const [dx, dz] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) box(0.06, 0.4, 0.06, -w / 2 + 1.8 + dx, 0.2, d / 2 - 2.9 + dz, 0x5d4037, false);
      box(1.8, 0.5, 0.45, w / 2 - 1.3, 0.25, d / 2 - 2.5, 0x4e342e); box(1.6, 0.9, 0.06, w / 2 - 1.3, 1.05, d / 2 - 2.65, 0x111111, false);
      glow.push(colored(new THREE.PlaneGeometry(1.45, 0.78).translate(ox + w / 2 - 1.3, Y0 + 1.05, oz + d / 2 - 2.61), 0x6fa8dc));
      const rug = new THREE.PlaneGeometry(2.6, 1.8); rug.rotateX(-Math.PI / 2); rug.translate(ox - w / 2 + 2, Y0 + 0.02, oz + d / 2 - 2.6); parts.push(colored(rug, 0xb71c1c));
      // dining
      box(1.4, 0.06, 0.9, w / 2 - 2.2, 0.76, -d / 2 + d * 0.42 + 1.5, 0x8d6e63); for (const [dx, dz] of [[-0.8, 0], [0.8, 0]]) box(0.45, 0.9, 0.45, w / 2 - 2.2 + dx, 0.45, -d / 2 + d * 0.42 + 1.5 + dz, 0x795548);
      // kitchen
      const kx = -w / 2 + 0.45, kz0 = -d / 2;
      box(0.8, 0.9, d * 0.42 - 0.4, kx, 0.45, kz0 + d * 0.21, 0xeceff1); box(0.82, 0.05, d * 0.42 - 0.4, kx, 0.92, kz0 + d * 0.21, 0x37474f, false);
      box(0.6, 0.12, 0.5, kx, 1.0, kz0 + 1.0, 0x212121, false); cyl(0.14, 0.18, kx, 1.15, kz0 + 1.0, 0x9e9e9e);
      this.stove = new THREE.Vector3(ox + kx + 0.9, Y0, oz + kz0 + 1.0); this.stoveTop = new THREE.Vector3(ox + kx, Y0 + 1.25, oz + kz0 + 1.0);
      box(0.7, 1.8, 0.7, -0.8, 0.9, -d / 2 + 0.5, 0xb0bec5); cyl(0.17, 0.6, kx + 0.1, 0.3, kz0 + d * 0.42 - 0.5, 0xc62828);
      // bedroom
      box(1.6, 0.45, 2.0, w / 2 - 1.2, 0.25, -d / 2 + 1.2, 0x5d4037); box(1.5, 0.15, 1.9, w / 2 - 1.2, 0.55, -d / 2 + 1.25, 0xe3f2fd, false); box(1.4, 0.15, 0.4, w / 2 - 1.2, 0.68, -d / 2 + 0.35, 0xffffff, false);
      box(1.2, 2.0, 0.6, 1.0 + 0.4, 1.0, -d / 2 + 0.35, 0x8d6e63);
      // fan
      this.fan = new THREE.Mesh(mergeGeometries([0, 1, 2].map((k) => colored(new THREE.BoxGeometry(0.16, 0.02, 1.1).translate(0, 0, 0.55).rotateY(k * 2.094), 0x8d6e63))), this.mat);
      this.fan.position.set(ox - w / 4, Y0 + H - 0.35, oz + d / 4);
      // photos & plants
      for (let k = 0; k < 3; k++) box(0.5, 0.4, 0.03, -w / 2 + 1.0 + k * 0.7, 1.8, d / 2 - 0.12, [0x3949ab, 0xffb300, 0x00897b][k], false, 0);
      cyl(0.18, 0.35, w / 2 - 0.4, 0.18, d / 2 - 0.5, 0x6d4c41); const pl = new THREE.IcosahedronGeometry(0.35, 1); pl.translate(ox + w / 2 - 0.4, Y0 + 0.65, oz + d / 2 - 0.5); parts.push(colored(pl, 0x2e7d32));
      if (lux) {
        // mansion extras: crystal chandelier, sweeping staircase, grand piano, marble columns, big rug, art, palms in pots
        for (let r = 0; r < 3; r++) for (let a = 0; a < 6.28; a += 0.45 - r * 0.08) glow.push(colored(new THREE.SphereGeometry(0.07, 6, 4).translate(ox + Math.cos(a) * (0.9 - r * 0.28), Y0 + H - 1.2 - r * 0.25, oz + d * 0.12 + Math.sin(a) * (0.9 - r * 0.28)), 0xfff3c4));
        cyl(0.03, 1.0, 0, H - 0.6, d * 0.12, 0xd4af37);
        for (let k = 0; k < 14; k++) box(2.2, 0.22, 0.34, w / 2 - 1.4, 0.11 + k * 0.22, d * 0.18 - k * 0.32, 0xf5f0e6);
        box(0.08, 1.0, 4.6, w / 2 - 2.5, 1.6, d * 0.18 - 2.2, 0xd4af37, false);
        box(1.5, 0.95, 1.9, -w / 2 + 2.6, 0.48, -0.8, 0x111111); box(1.45, 0.08, 1.85, -w / 2 + 2.6, 1.0, -0.8, 0x050505, false); box(1.2, 0.1, 0.25, -w / 2 + 2.6, 0.88, 0.05, 0xf5f5f5, false);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(0.32, H, sx * w * 0.22, H / 2, sz * d * 0.2, 0xf1ece2);
        const rug = new THREE.PlaneGeometry(6, 4); rug.rotateX(-Math.PI / 2); rug.translate(ox, Y0 + 0.025, oz + d * 0.12); parts.push(colored(rug, 0x7b1f2b));
        box(3.4, 0.5, 1.0, 0, 0.25, d * 0.12 + 2.6, 0xe8e0d0); box(3.4, 0.6, 0.25, 0, 0.75, d * 0.12 + 3.0, 0xe8e0d0, false); box(1.6, 0.4, 0.9, 0, 0.2, d * 0.12, 0x3e2723);
        for (let k = 0; k < 4; k++) box(1.4, 1.0, 0.05, -w / 2 + 3 + k * 2.4, 2.4, -d / 2 + 0.13, [0x1a5276, 0xb9770e, 0x6c3483, 0x117864][k], false);
        for (const [px, pz] of [[-w / 2 + 0.7, d / 2 - 0.7], [w / 2 - 0.7, -d / 2 + 0.7], [-w / 2 + 0.7, -d / 2 + 0.7]]) { cyl(0.3, 0.6, px, 0.3, pz, 0xece6da); const pp = new THREE.ConeGeometry(0.7, 1.6, 7); pp.translate(ox + px, Y0 + 1.4, oz + pz); parts.push(colored(pp, 0x2e7d32)); }
      }
    } else {
      // shop / cafe: counter + shelves + tables
      box(w * 0.55, 1.0, 0.7, 0, 0.5, -d / 2 + 2.0, 0x8d6e63); this.counter = new THREE.Vector3(ox, Y0, oz - d / 2 + 2.9);
      for (let k = 0; k < 4; k++) { box(w - 1, 0.05, 0.45, 0, 0.6 + k * 0.55, -d / 2 + 0.35, 0x6d4c41, false); for (let j = 0; j < Math.floor(w * 2.2); j++) if (rng() < 0.8) box(0.25, 0.3 + rng() * 0.15, 0.3, -w / 2 + 0.8 + j * 0.42, 0.78 + k * 0.55, -d / 2 + 0.35, [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0xff7043, 0xffffff, 0x8e24aa][Math.floor(rng() * 7)], false); }
      box(w - 0.8, 2.4, 0.4, 0, 1.2, -d / 2 + 0.25, 0x5d4037);
      if (kind === 'cafe') { this.stove = this.counter.clone(); this.stoveTop = new THREE.Vector3(ox, Y0 + 1.2, oz - d / 2 + 2.0); cyl(0.25, 0.4, 0, 1.2, -d / 2 + 2.0, 0xb0bec5); for (let k = 0; k < 3; k++) { const tx = -w / 2 + 2 + k * (w - 4) / 2, tz = d / 2 - 2.2; cyl(0.45, 0.05, tx, 0.75, tz, 0x6d4c41); cyl(0.06, 0.75, tx, 0.37, tz, 0x4e342e); cols.push({ x0: ox + tx - 0.45, x1: ox + tx + 0.45, z0: oz + tz - 0.45, z1: oz + tz + 0.45, y1: Y0 + 0.8 }); } }
    }
    const geo = mergeGeometries(parts), mesh = new THREE.Mesh(geo, this.mat); mesh.receiveShadow = true;
    const gm = new THREE.Mesh(mergeGeometries(glow), this.glow);
    this.group = new THREE.Group(); this.group.add(mesh, gm); if (this.fan && kind === 'home') this.group.add(this.fan);
    this.game.scene.add(this.group); this.cols = cols;
    this.lights[0].position.set(ox - w / 4, Y0 + H - 0.4, oz + d / 4); this.lights[1].position.set(ox + w / 4, Y0 + H - 0.4, oz - d / 4);
    for (const l of this.lights) { l.intensity = 70; l.distance = 26; }
    this.bounds = { x0: ox - w / 2 + 0.25, x1: ox + w / 2 - 0.25, z0: oz - d / 2 + 0.25, z1: oz + d / 2 - 0.25 };
    if (kind !== 'home') { const k = new Character(this.game, randomLook(rng), { team: 'civ', x: ox + 0.5, z: oz - d / 2 + 1.2, yaw: 0 }); k.pos.y = Y0; k.sync(); this.npcs.push(k); setTimeout(() => say('NPC', kind === 'cafe' ? 'Aaiye! Garam chai, fresh samosa!' : 'Welcome! What can I get you?'), 600); }
    this.active = true; this.floorY = Y0; this.type = 'room';
    return new THREE.Vector3(ox, Y0, oz + d / 2 - 1.2);
  }
  doorOutside(b) {
    if (b.estate !== undefined) { const e = M.estates[b.estate], x = (b.x0 + b.x1) / 2, z = e.face > 0 ? b.z1 + 4.5 : b.z0 - 4.5; return new THREE.Vector3(x, M.groundAt(x, z), z); }
    const nr = M.nearestRoad((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2; let x = cx, z = b.z1 + 1.5;
    if (nr) { const dx = nr.x - cx, dz = nr.z - cz; if (Math.abs(dx) > Math.abs(dz)) { x = dx > 0 ? b.x1 + 1.5 : b.x0 - 1.5; z = cz; } else { z = dz > 0 ? b.z1 + 1.5 : b.z0 - 1.5; x = cx; } }
    return new THREE.Vector3(x, M.groundAt(x, z), z);
  }
  // ----- caves -----
  enterCave(cave) {
    const ox = cave.x, oz = cave.z, rng = mulberry32(cave.id === 'naag' ? 91 : 17);
    this.origin = new THREE.Vector3(ox, Y0, oz); this.kind = 'cave'; this.cave = cave;
    this.exitPos = new THREE.Vector3(cave.x - Math.sin(cave.ang) * 4, cave.y, cave.z - Math.cos(cave.ang) * 4);
    const pts = []; let x = 0, z = 0, a = 0;
    for (let k = 0; k < 14; k++) { pts.push(new THREE.Vector3(ox + x, Y0 + 2.5, oz + z)); a += (rng() - 0.5) * 0.9; x += Math.sin(a) * 14; z += Math.cos(a) * 14; }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 160, 5, 14, false);
    const p = tube.attributes.position; for (let i = 0; i < p.count; i++) { const n = Math.sin(p.getX(i) * 0.9) * Math.cos(p.getZ(i) * 0.7) * 0.8 + Math.sin(p.getY(i) * 2.1) * 0.3; const c = curve.getPointAt(Math.min(1, Math.floor(i / 15) / 160)); const dx = p.getX(i) - c.x, dy = p.getY(i) - c.y, dz = p.getZ(i) - c.z, l = Math.hypot(dx, dy, dz) || 1; p.setXYZ(i, p.getX(i) + dx / l * n, Math.max(Y0 - 0.2, p.getY(i) + dy / l * n), p.getZ(i) + dz / l * n); }
    tube.computeVertexNormals();
    const parts = [colored(tube, cave.id === 'naag' ? 0x7a6f8a : 0x8a7a68)];
    const end = pts[pts.length - 1];
    const ch = new THREE.IcosahedronGeometry(16, 2); const cp = ch.attributes.position; for (let i = 0; i < cp.count; i++) { const k = 1 + Math.sin(i * 1.7) * 0.08; cp.setXYZ(i, cp.getX(i) * k, Math.max(-2.6, cp.getY(i) * 0.6 * k), cp.getZ(i) * k); } ch.computeVertexNormals(); ch.translate(end.x, Y0 + 2.6, end.z); parts.push(colored(ch, 0x7d7064));
    const fl = new THREE.CircleGeometry(16, 24).rotateX(-Math.PI / 2).translate(end.x, Y0 + 0.02, end.z); parts.push(colored(fl, 0x6a5e52));
    const stal = [], glow = [];
    for (let k = 0; k < 70; k++) { const t = rng(), c = curve.getPointAt(t); const g = new THREE.ConeGeometry(0.2 + rng() * 0.4, 1 + rng() * 2.2, 6).rotateX(Math.PI); g.translate(c.x + (rng() - 0.5) * 6, Y0 + 4.6 + rng() * 2, c.z + (rng() - 0.5) * 6); stal.push(colored(g, 0x5d544b)); }
    const crystalC = cave.id === 'naag' ? [0x9c27ff, 0x7c4dff, 0xe040fb] : [0x00e5ff, 0x40c4ff, 0x64ffda];
    for (let k = 0; k < 45; k++) { const t = 0.2 + rng() * 0.8, c = curve.getPointAt(Math.min(1, t)); const g = new THREE.OctahedronGeometry(0.3 + rng() * 0.6).scale(0.6, 1.8, 0.6); g.rotateZ((rng() - 0.5) * 0.8); g.translate(c.x + (rng() - 0.5) * 7, Y0 + 0.4 + rng() * 1.5, c.z + (rng() - 0.5) * 7); glow.push(colored(g, crystalC[k % 3])); }
    for (let k = 0; k < 20; k++) { const a2 = rng() * 6.28, r = 6 + rng() * 8; const g = new THREE.OctahedronGeometry(0.5 + rng()).scale(0.6, 2.2, 0.6); g.translate(end.x + Math.cos(a2) * r, Y0 + 0.8, end.z + Math.sin(a2) * r); glow.push(colored(g, crystalC[k % 3])); }
    if (cave.id === 'naag') {
      // serpent shrine: coiled stone serpent + altar
      for (let k = 0; k < 40; k++) { const a2 = k * 0.35, r = 3 + k * 0.08; const g = new THREE.SphereGeometry(0.9 - k * 0.012, 8, 6); g.translate(end.x + Math.cos(a2) * r, Y0 + 0.7 + k * 0.09, end.z + Math.sin(a2) * r); parts.push(colored(g, 0x2e2a35)); }
      glow.push(colored(new THREE.OctahedronGeometry(0.9).translate(end.x, Y0 + 5.2, end.z), 0xd500f9));
      this.shrine = new THREE.Vector3(end.x, Y0, end.z + 5.5);
    } else { this.shrine = null; const chest = new THREE.BoxGeometry(1.4, 0.9, 0.9).translate(end.x, Y0 + 0.45, end.z); parts.push(colored(chest, 0x6d4c41)); glow.push(colored(new THREE.BoxGeometry(1.42, 0.1, 0.92).translate(end.x, Y0 + 0.92, end.z), 0xffc107)); this.chest = new THREE.Vector3(end.x, Y0, end.z + 1.2); }
    const mesh = new THREE.Mesh(mergeGeometries(parts), this.rockMat), sm = new THREE.Mesh(mergeGeometries(stal), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })), gm = new THREE.Mesh(mergeGeometries(glow), this.glow);
    this.group = new THREE.Group(); this.group.add(mesh, sm, gm); this.game.scene.add(this.group);
    this.curve = curve; this.curvePts = curve.getSpacedPoints(200); this.chamber = end; this.cols = [];
    this.lights[0].color.setHex(crystalC[0]); this.lights[1].color.setHex(crystalC[1]);
    this.lights[0].position.set(pts[4].x, Y0 + 3, pts[4].z); this.lights[1].position.set(end.x, Y0 + 4, end.z);
    for (const l of this.lights) { l.intensity = 220; l.distance = 60; }
    this.door = new THREE.Vector3(ox, Y0, oz);
    this.active = true; this.floorY = Y0; this.type = 'cave';
    say('Mira', cave.id === 'naag' ? 'This place hums... like something huge is breathing below us.' : 'Look at those crystals! Careful, Vikas, it is slippery.');
    return new THREE.Vector3(ox, Y0, oz).add(new THREE.Vector3(Math.sin(0) * 3, 0, 3));
  }
  // ----- shared -----
  collide(c) {
    if (this.type === 'room') {
      const b = this.bounds; c.pos.x = clamp(c.pos.x, b.x0 + c.radius, b.x1 - c.radius); c.pos.z = clamp(c.pos.z, b.z0 + c.radius, b.z1 - c.radius);
      for (const k of this.cols) { if (c.pos.y > k.y1 - 0.3) continue; const px = clamp(c.pos.x, k.x0, k.x1), pz = clamp(c.pos.z, k.z0, k.z1), dx = c.pos.x - px, dz = c.pos.z - pz, d = Math.hypot(dx, dz); if (d < c.radius && d > 1e-5) { c.pos.x += dx / d * (c.radius - d); c.pos.z += dz / d * (c.radius - d); } else if (d <= 1e-5) { c.pos.z = k.z1 + c.radius; } }
    } else if (this.type === 'cave') {
      let best = null, bd = 1e9; for (const p of this.curvePts) { const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z); if (d < bd) { bd = d; best = p; } }
      const dc = Math.hypot(c.pos.x - this.chamber.x, c.pos.z - this.chamber.z);
      if (dc < 14.5) return;
      if (bd > 3.6) { const dx = c.pos.x - best.x, dz = c.pos.z - best.z; c.pos.x = best.x + dx / bd * 3.6; c.pos.z = best.z + dz / bd * 3.6; }
    }
  }
  blocks(p) {
    if (this.type === 'room') { const b = this.bounds; return p.x < b.x0 || p.x > b.x1 || p.z < b.z0 || p.z > b.z1 || p.y > Y0 + 3.0 || p.y < Y0 + 0.1; }
    if (this.type === 'cave') { if (p.y > Y0 + 6 || p.y < Y0 + 0.2) return true; let bd = 1e9; for (const q of this.curvePts) bd = Math.min(bd, Math.hypot(p.x - q.x, p.z - q.z)); return bd > 4.2 && Math.hypot(p.x - this.chamber.x, p.z - this.chamber.z) > 14; }
    return false;
  }
  exit() {
    if (!this.active) return null;
    this.game.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const n of this.npcs) n.remove(); this.npcs = [];
    for (const l of this.lights) { l.intensity = 0; l.position.set(0, -2000, 0); }
    this.active = false; this.type = null; this.fan = null; this.cols = [];
    return this.exitPos;
  }
  update(dt) {
    if (!this.active) return;
    if (this.fan) this.fan.rotation.y += dt * 9;
    for (const n of this.npcs) n.update(dt, {});
    if (this.type === 'cave' && Math.random() < dt * 2) { const p = this.curvePts[Math.floor(Math.random() * this.curvePts.length)]; burst('dust', p.x, Y0 + 5.5, p.z, 1, 0.3); }
  }
  // what can the player do here?
  action(pos) {
    if (!this.active) return null;
    if (pos.distanceTo(this.door) < 2.2) return { label: this.type === 'cave' ? 'Leave cave' : 'Go outside', id: 'exit' };
    if (this.stove && Math.hypot(pos.x - this.stove.x, pos.z - this.stove.z) < 1.8) return { label: 'Make masala chai ☕', id: 'chai', at: this.stoveTop };
    if (this.shrine && pos.distanceTo(this.shrine) < 4) return { label: 'Touch the serpent shrine', id: 'shrine' };
    if (this.chest && pos.distanceTo(this.chest) < 2) return { label: 'Open treasure chest', id: 'chest' };
    if (this.counter && this.kind === 'shop' && pos.distanceTo(this.counter) < 2) return { label: 'Buy armour (₹500)', id: 'buy' };
    return null;
  }
}
