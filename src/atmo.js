// Atmosphere: one fog model for every material in the game.
//   1. the weather haze           three's FogExp2 curve, driven by scene.fog.density (rain, winter mist, underwater)
//   2. aerial perspective         a thin haze that is densest near the ground and thins out with altitude, integrated
//                                 along the view ray, so far hills go pale and blue and the horizon melts into the sky
//   3. sun in-scattering          the haze takes the colour of the sky around the sun when you look towards it
// It replaces three's fog shader chunks, so built-in materials, patched materials and the custom shaders that include
// <fog_fragment> all pick it up. The three extra uniforms are shared typed arrays (three clones Vector/Color uniform
// values per material but passes typed arrays by reference), so they are written once per frame for the whole scene.
import * as THREE from 'three';
import { HDR_GUARD } from './hdrsafe.js';

export const ATMO = {
  air: new Float32Array([0, 1 / 260]),        // x = haze density at sea level (per metre), y = 1 / scale height
  sun: new Float32Array([0, 1, 0, 0]),        // xyz = direction to the sun, w = strength of the tint
  sunFog: new Float32Array([1, 1, 1]),        // haze colour looking at the sun (in the colour space the scene is drawn in)
  linear: false,                              // true when the scene is drawn into a linear buffer (post-processing path)
};
export const atmoUniforms = () => ({ ddAir: { value: ATMO.air }, ddSun: { value: ATMO.sun }, ddSunFog: { value: ATMO.sunFog } });

// ray = world-space vector from the camera to the fragment; returns rgb = haze colour, a = how much of it
export const ATMO_GLSL = /* glsl */`
  uniform vec2 ddAir; uniform vec4 ddSun; uniform vec3 ddSunFog;
  float ddFogAmt(vec3 ray, float dens){
    float d = length(ray), g = dens*d, od = g*g;
    float y0 = max(cameraPosition.y, -40.0), y1 = max(y0 + ray.y, -40.0), dy = y1 - y0;
    float e0 = exp(-ddAir.y*y0);
    od += ddAir.x*d*(abs(dy) > 0.5 ? (e0 - exp(-ddAir.y*y1))/(ddAir.y*dy) : e0);
    return 1.0 - exp(-od);
  }
  float ddSunK(vec3 ray){ float s = max(dot(normalize(ray), ddSun.xyz), 0.0); s *= s; s *= s*s; return min(1.0, s*ddSun.w); }
  vec4 ddFog(vec3 ray, vec3 fogCol, float dens){ return vec4(mix(fogCol, ddSunFog, ddSunK(ray)), ddFogAmt(ray, dens)); }`;

let installed = false;
export function installAtmosphere() {
  if (installed) return; installed = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogRay;
#endif`;
  // the view matrix is a rotation plus a translation, so (view-space position) * mat3(viewMatrix) is the world-space offset from the camera
  C.fog_vertex = /* glsl */`
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogRay = mvPosition.xyz * mat3( viewMatrix );
#endif`;
  C.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogRay;
	#ifdef FOG_EXP2
		uniform float fogDensity;
		${ATMO_GLSL}
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`;
  C.fog_fragment = /* glsl */`
#ifdef USE_FOG
	#ifdef FOG_EXP2
		vec4 ddF = ddFog( vFogRay, fogColor, fogDensity );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, ddF.rgb, ddF.a );
		${HDR_GUARD}
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	#endif
#endif`;
  // built-in materials copy their uniforms from ShaderLib (already assembled when three was imported); custom shaders that
  // merge UniformsLib.fog get them from there
  Object.assign(THREE.UniformsLib.fog, atmoUniforms());
  for (const k in THREE.ShaderLib) { const u = THREE.ShaderLib[k].uniforms; if (u && u.fogColor) Object.assign(u, atmoUniforms()); }
}

const tmp = new THREE.Color(), out = new THREE.Color();
// once per frame. sunDir = unit vector to the sun; sunFog = THREE.Color of the haze towards the sun (linear working space, like scene.fog.color)
export function setAtmosphere(density, sunDir, sunFog, strength) {
  ATMO.air[0] = density;
  ATMO.sun[0] = sunDir.x; ATMO.sun[1] = sunDir.y; ATMO.sun[2] = sunDir.z; ATMO.sun[3] = strength;
  tmp.copy(sunFog).getRGB(out, ATMO.linear ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace);
  ATMO.sunFog[0] = out.r; ATMO.sunFog[1] = out.g; ATMO.sunFog[2] = out.b;
}
