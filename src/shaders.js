// Shared GLSL snippets + global uniforms
import * as THREE from 'three';
export const U = {
  uTime: { value: 0 }, uNight: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) }, uZenith: { value: new THREE.Color(0.3, 0.5, 0.9) },
  uHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) }, uFogColor: { value: new THREE.Color(0.7, 0.8, 0.9) },
  uFogDensity: { value: 0.00011 }, uAmbient: { value: new THREE.Color(0.4, 0.45, 0.5) },
  uSeason: { value: new THREE.Vector4(0.5, 0.3, 0, 0) }, uWet: { value: 0 }, uRain: { value: 0 },
  uCrowdLight: { value: new THREE.Color(1, 1, 1) },
};
export const NOISE = /* glsl */`
float h21(vec2 p){ p = fract(p*vec2(0.1031,0.1030)); p += dot(p, p.yx+33.33); return fract((p.x+p.y)*p.x); }
float h31(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  float a=h21(mod(i,289.)), b=h21(mod(i+vec2(1,0),289.)), c=h21(mod(i+vec2(0,1),289.)), d=h21(mod(i+vec2(1,1),289.));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
float fbm2(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=.5;} return s/0.9375; }
`;
// inject helper into a material
function hashStr(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
export function patch(mat, fn, key = '') { const k = hashStr(fn.toString()) + key + JSON.stringify(mat.defines || {}); mat.onBeforeCompile = (s) => { fn(s); }; mat.customProgramCacheKey = () => k; return mat; }
