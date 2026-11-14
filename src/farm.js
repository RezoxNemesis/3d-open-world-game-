// Farmsteads round the villages, haystacks out in the fields and a horse ranch: Blender-built props
// (tools/blender/farm.py: tiled CC0 photo materials baked to albedo x AO + normal maps) instanced per map tile.
import * as THREE from 'three';
import * as M from './mapdata.js';
import { loadModels } from './models.js';
import { mulberry32 } from './util.js';

export const FARM_PROPS = ['farmhouse', 'farmhouse_b', 'cowshed', 'haystack', 'fodderstack', 'watertank', 'bullockcart', 'tractor', 'well', 'fence_bamboo', 'fence_paddock', 'stable', 'haybales', 'trough'];
// footprint half sizes (x, z) and height for colliders
const COL = { farmhouse: [5.4, 3.6, 5.6, 1.6], farmhouse_b: [5.4, 3.6, 5.6, 1.6], cowshed: [4.2, 2.7, 3.6, 0], stable: [9.4, 4.4, 6.0, 0], watertank: [1.0, 1.0, 4.4, 0],
  well: [1.2, 1.2, 0.9, 0], tractor: [1.1, 1.9, 2.0, 0], bullockcart: [1.0, 1.6, 1.4, 0], haystack: [1.5, 1.5, 3.3, 0], fodderstack: [2.6, 1.2, 1.9, 0], haybales: [1.9, 0.5, 2.1, 0], trough: [1.2, 0.4, 0.7, 0] };
const FAR = { fence_bamboo: [420, 220], fence_paddock: [520, 260], trough: [420, 200], well: [600, 280], haybales: [700, 320], bullockcart: [700, 320], tractor: [800, 360], watertank: [1200, 600] };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export async function buildFarms(scene, q, H, splat) {
  const MD = await loadModels(q, FARM_PROPS);
  if (!MD.farmhouse) return null;
  const items = {}; for (const n of FARM_PROPS) items[n] = [];
  for (const f of M.farms) for (const p of f.parts) if (items[p.n]) items[p.n].push(p);
  // haystacks and fodder ridges out in the crop fields (blue channel of the biome splat), near the villages
  const data = splat && splat.image && splat.image.data, S = splat && splat.image ? splat.image.width : 0, rng = mulberry32(5150);
  const fieldAt = (x, z) => { if (!data) return 0; const i = Math.floor((x + M.HALF) / (2 * M.HALF) * S), j = Math.floor((z + M.HALF) / (2 * M.HALF) * S); return i < 0 || j < 0 || i >= S || j >= S ? 0 : data[(i + j * S) * 4 + 2] / 255; };
  for (const v of M.villages) {
    for (let k = 0, n = 0; k < 60 && n < 9; k++) {
      const a = rng() * Math.PI * 2, r = 150 + rng() * 260, x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r;
      if (fieldAt(x, z) < 0.9 || M.occAt(x, z) || M.occAt(x + 4, z) || M.occAt(x, z + 4)) continue;
      // sit on a field bund (the terrain shader's 70 x 48 m field grid) so the stacks line the field edges
      const bx = Math.round((x + 13) / 70) * 70 - 13, bz = Math.round((z + 7) / 48) * 48 - 7;
      const px = rng() < 0.5 ? bx + (rng() - 0.5) * 2 : x, pz = px === x ? bz + (rng() - 0.5) * 2 : z;
      const kind = rng() < 0.7 ? 'haystack' : 'fodderstack';
      items[kind].push({ n: kind, x: px, z: pz, y: M.terrainH(px, pz) - 0.05, yaw: rng() * 6.28, s: 0.8 + rng() * 0.35 }); n++;
      if (rng() < 0.35) { const ox = (rng() - 0.5) * 9, oz = (rng() - 0.5) * 9; items.haystack.push({ n: 'haystack', x: px + ox, z: pz + oz, y: M.terrainH(px + ox, pz + oz) - 0.05, yaw: rng() * 6.28, s: 0.75 + rng() * 0.3 }); }
    }
  }
  const put = (m, o, i) => { _m.compose(_p.set(o.x, o.y, o.z), _q.setFromEuler(_e.set(0, o.yaw, 0)), _s.set(o.s, o.s, o.s)); m.setMatrixAt(i, _m); };
  let count = 0;
  for (const n of FARM_PROPS) {
    const md = MD[n], list = items[n]; if (!md || !list.length) continue;
    const [fd, fm] = FAR[n] || [1500, 700];
    md.mat.side = THREE.FrontSide;
    H.instTiles(scene, md.geo, md.mat, list, 500, q.desktop ? fd : fm, put, { shadow: !n.startsWith('fence') });
    count += list.length;
    const c = COL[n];
    if (c) for (const o of list) {
      // rotated footprint -> axis-aligned collider (the long side stays the long side)
      const ca = Math.abs(Math.cos(o.yaw)), sa = Math.abs(Math.sin(o.yaw)), hx = (c[0] * ca + c[1] * sa) * o.s, hz = (c[0] * sa + c[1] * ca) * o.s;
      H.addCol(o.x - hx, o.z - hz, o.x + hx, o.z + hz, o.y, o.y + c[2] * o.s, { farm: true });
    }
  }
  for (const f of M.farms) if (f.kind === 'ranch') H.labels.push({ name: 'Kesar Horse Ranch', x: f.x, z: f.z });
  return { count, farms: M.farms.length };
}
