// Photo-scanned CC0 textures (Poly Haven, see assets/tex/CREDITS.md).
// Phones load the 1K set, Ultra on desktop loads 2K. The single-file web build embeds the 1K set as data URLs.
import * as THREE from 'three';

export const TEX = {};
// asset path -> URL (the single-file web build embeds some assets as data URLs)
export const assetURL = (p) => (window.__DD_ASSETS && window.__DD_ASSETS[p]) || p;
export const EMBEDDED = () => !!window.__DD_ASSETS;
const KEYS = { sand: 1, grass: 1, forest: 1, soil: 1, ground: 1, rock: 1, asphalt: 1, pavers: 1, cobble: 0, fortwall: 1, plaster: 1, stained: 1, cracked: 0, brick: 1, rooftile: 1, shutter: 0, tin: 0, wood: 0, bark: 0 };

export async function loadTextures(renderer, q, progress) {
  const res = q.texRes || '1k', embedded = window.__DD_TEX || null;
  const aniso = Math.min(renderer.capabilities.getMaxAnisotropy(), q.desktop ? 8 : 4);
  const loader = new THREE.TextureLoader();
  const url = (name) => (embedded && embedded[name]) || `assets/tex/${res}/${name}.jpg`;
  const jobs = [];
  let done = 0, total = 0;
  for (const [k, hasN] of Object.entries(KEYS)) {
    TEX[k] = {};
    for (const suf of hasN ? ['d', 'n'] : ['d']) {
      total++;
      jobs.push(new Promise((resolve) => {
        loader.load(url(`${k}_${suf}`), (t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
          t.colorSpace = suf === 'd' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          TEX[k][suf] = t; done++; if (progress) progress(done / total); resolve();
        }, undefined, () => { TEX[k][suf] = fallback(suf); done++; resolve(); });
      }));
    }
  }
  await Promise.all(jobs);
  return TEX;
}
// flat fallback if a file is missing (keeps the game running)
let _fd, _fn;
function fallback(suf) {
  if (suf === 'n') return (_fn ||= mk([128, 128, 255, 255], THREE.NoColorSpace));
  return (_fd ||= mk([150, 140, 120, 255], THREE.SRGBColorSpace));
}
function mk(c, cs) { const t = new THREE.DataTexture(new Uint8Array(c), 1, 1); t.colorSpace = cs; t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }

// GLSL helpers shared by terrain / roads / buildings
export const TEX_GLSL = /* glsl */`
// sample at two scales with a rotated second lookup to hide tiling
vec4 tex2s(sampler2D t, vec2 p, float s){ vec2 q = mat2(0.8, -0.6, 0.6, 0.8)*p*s*0.23 + 0.31; return mix(texture2D(t, p*s), texture2D(t, q), 0.38); }
// world-space normal from a tangent-space normal map on a mostly-horizontal surface (u along +x, v along +z)
vec3 nmapXZ(vec3 tn, vec3 N){ vec3 T = normalize(vec3(1.,0.,0.) - N*N.x); vec3 B = cross(N, T); return normalize(T*tn.x - B*tn.y + N*tn.z); }
vec3 unpackN(vec4 c, float k){ vec3 n = c.xyz*2.0 - 1.0; n.xy *= k; return normalize(n); }
`;
