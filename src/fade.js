// Distance and time dissolves: nothing in the world pops in or out.
// Objects dissolve with a stable screen-door pattern (no blending, no sorting, works with MSAA and on phones) either
//   - over the last stretch of their draw distance (per instance, by the instance's own distance to the camera), or
//   - over a fraction of a second when a whole streamed tile is switched on or off.
// The control lives in one tiny per-geometry attribute, aFadeCtl = (far distance, dissolve 0..1), stored with a huge
// instancing divisor so every vertex and every instance reads element 0. A geometry without the attribute reads (0, 0):
// no fade. That keeps materials shareable between meshes with different draw distances.
import * as THREE from 'three';

const NOISE = 'float ddNoise(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056, 0.00583715)))); }\n';
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
const done = new WeakSet();

// add the dissolve to a compiled built-in shader (Standard/Physical/Lambert/Basic); no-op when it is already there
// vDdFade.x dissolves OUT (normal noise), vDdFade.y dissolves IN (inverted noise): two LODs with matching bands swap
// pixel by pixel, each pixel always drawn by exactly one of them.
export function injectFade(s) {
  if (s.vertexShader.includes('aFadeCtl') || !s.vertexShader.includes('#include <project_vertex>') || !s.fragmentShader.includes('#include <clipping_planes_fragment>')) return;
  s.vertexShader = 'attribute vec2 aFadeCtl; attribute vec4 aLodBand; varying vec2 vDdFade;\n' + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      { float ddOut = 1.0 - aFadeCtl.y, ddIn = 1.0;
      #ifdef USE_INSTANCING
        // instances dissolve as a whole, by the distance of their origin
        float ddD = distance((modelMatrix*instanceMatrix*vec4(0.0, 0.0, 0.0, 1.0)).xz, cameraPosition.xz);
        if (aFadeCtl.x > 0.0) ddOut *= 1.0 - smoothstep(aFadeCtl.x*0.78, aFadeCtl.x, ddD);
      #else
        // merged meshes dissolve by the distance of each vertex; LOD bands use the object origin
        float ddD = distance(modelMatrix[3].xz, cameraPosition.xz);
        if (aFadeCtl.x > 0.0) ddOut *= 1.0 - smoothstep(aFadeCtl.x*0.78, aFadeCtl.x, distance((modelMatrix*vec4(transformed, 1.0)).xz, cameraPosition.xz));
      #endif
      // (a geometry without the attribute reads the GL default (0, 0, 0, 1): bands shorter than 1.5 m mean "none")
      if (aLodBand.w > 1.5) ddOut *= 1.0 - smoothstep(aLodBand.z, aLodBand.w, ddD);
      if (aLodBand.y > 1.5) ddIn = smoothstep(aLodBand.x, aLodBand.y, ddD);
      vDdFade = vec2(ddOut, ddIn);
      #ifdef USE_INSTANCING
        if (ddOut <= 0.004 || ddIn <= 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);    // fully dissolved: cull before rasterising
      #endif
      }`);
  s.fragmentShader = 'varying vec2 vDdFade;\n' + NOISE + s.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      if (vDdFade.x < 0.996 || vDdFade.y < 0.996) { float ddN = ddNoise(gl_FragCoord.xy); if (vDdFade.x <= ddN || vDdFade.y <= 1.0 - ddN) discard; }`);
}
// shaders.js patch() adds the dissolve itself and marks the material here
export function markFadeable(mat) { done.add(mat); }
// make a built-in material understand aFadeCtl; safe to call more than once and before or after patch()
export function fadeable(mat) {
  if (Array.isArray(mat)) { mat.forEach(fadeable); return mat; }
  if (!mat || done.has(mat) || mat.isShaderMaterial || mat.isMeshDepthMaterial || mat.isMeshDistanceMaterial) return mat;
  done.add(mat);
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  const src = prev ? hash(prev.toString()) : '';
  mat.onBeforeCompile = function (s, r) { if (prev) prev.call(this, s, r); injectFade(s); };
  mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|dd' + src; };
  mat.needsUpdate = true;
  return mat;
}

// one control attribute: [far, dissolve]. Share it between the geometries that fade together.
export function fadeCtl(far = 0, dissolve = 0) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array([far, dissolve]), 2, false, 1e9);
  a.setUsage(THREE.DynamicDrawUsage);
  return a;
}
// LOD band attribute: dissolve in over [in0, in1] and out over [out0, out1] metres from the camera (0, 0 = no band on that side)
export function lodBand(in0 = 0, in1 = 0, out0 = 0, out1 = 0) { return new THREE.InstancedBufferAttribute(new Float32Array([in0, in1, out0, out1]), 4, false, 1e9); }
// shallow copy of a geometry (shares all buffers) so it can carry its own control attribute
export function shallowGeo(geo) {
  const g = new THREE.BufferGeometry();
  for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
  if (geo.index) g.setIndex(geo.index);
  for (const gr of geo.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.boundingBox = geo.boundingBox; g.boundingSphere = geo.boundingSphere; g.drawRange.start = geo.drawRange.start; g.drawRange.count = geo.drawRange.count;
  return g;
}

// ---- timed dissolves for whole objects (streamed tiles, LOD swaps) ----
const live = new Set();
export class Dissolve {
  // meshes: the meshes that fade together; their geometries must be private to this group (use shallowGeo)
  constructor(obj, meshes, far = 0) {
    this.obj = obj; this.ctl = fadeCtl(far, obj.visible ? 0 : 1); this.k = obj.visible ? 1 : 0; this.want = this.k; this.rate = 2.6;
    for (const m of meshes) { fadeable(m.material); m.geometry.setAttribute('aFadeCtl', this.ctl); }
  }
  // show / hide with a dissolve; instant = no animation (first frame, teleports)
  set(on, instant = false) {
    const w = on ? 1 : 0; if (w === this.want && !instant) return;
    this.want = w;
    if (instant) { this.k = w; this.apply(); live.delete(this); return; }
    if (w) this.obj.visible = true;
    live.add(this);
  }
  apply() { this.ctl.array[1] = 1 - this.k; this.ctl.needsUpdate = true; this.obj.visible = this.k > 0.003; }
  step(dt) {
    const d = this.rate * dt; this.k = this.want ? Math.min(1, this.k + d) : Math.max(0, this.k - d); this.apply();
    return this.k !== this.want;
  }
}
export function updateDissolves(dt) { for (const d of live) if (!d.step(dt)) live.delete(d); }
// after a teleport or a camera cut: finish every running dissolve at once
export function flushDissolves() { for (const d of live) { d.k = d.want; d.apply(); } live.clear(); }
