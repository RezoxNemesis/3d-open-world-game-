// Keeps the picture finite on the post-processing (HDR) path.
//
// The scene is drawn into a half-float buffer. One pixel that is out of range there (a clear-coat sun glint, an explosion
// flash, any shader that divides by zero on a particular GPU) is +Inf or NaN. Bloom then blurs that pixel over five
// shrinking copies of the frame and tone mapping turns Inf/NaN into black, so a single bad pixel became a black rectangle
// roughly 1300 x 1000 px on a 1080p screen, flickering as the glint came and went.
//
// Three guards, so no one shader has to be trusted:
//   1. every material clamps what it writes (0 .. HDR_MAX) just before fog and tone mapping,
//   2. the bloom high-pass and the ambient-occlusion blend clean what they read,
//   3. the tone mapper cleans its input.
import * as THREE from 'three';
import { LuminosityHighPassShader } from 'three/addons/shaders/LuminosityHighPassShader.js';
import { GTAOBlendShader } from 'three/addons/shaders/GTAOShader.js';

export const HDR_MAX = 64;      // brightest value a surface may write (bloom starts around 1; the sun's glint is ~10-40)
// `x >= 0.0` is false for NaN, so NaN and negatives become `bad`, and +Inf becomes the cap
const guard = (v, cap, bad = '0.0') => ['r', 'g', 'b'].map((c) => `${v}.${c} = ${v}.${c} >= 0.0 ? min( ${v}.${c}, ${cap} ) : ${bad};`).join(' ');
// for hand-written shaders that do not include <tonemapping_fragment>: paste at the end of main()
export const HDR_GUARD = guard('gl_FragColor', HDR_MAX.toFixed(1));
const swap = (src, from, to, what) => { if (!src.includes(from)) { console.warn('hdrsafe: could not patch ' + what); return src; } return src.replace(from, to); };

let installed = false;
export function installHdrSafety() {
  if (installed) return; installed = true;
  const C = THREE.ShaderChunk;
  // 1. all built-in materials, and every custom shader that includes <tonemapping_fragment>
  C.tonemapping_fragment = `\t${guard('gl_FragColor', HDR_MAX.toFixed(1))}\n` + C.tonemapping_fragment;
  // 3. the tone mapper itself (also used by the output pass after post-processing)
  C.tonemapping_pars_fragment = swap(C.tonemapping_pars_fragment, 'vec3 ACESFilmicToneMapping( vec3 color ) {', `vec3 ACESFilmicToneMapping( vec3 color ) {\n\t${guard('color', '4096.0')}`, 'the tone mapper');
  // 2. bloom reads the scene here; ambient occlusion multiplies the scene by this value (a bad one means "not occluded")
  LuminosityHighPassShader.fragmentShader = swap(LuminosityHighPassShader.fragmentShader, 'vec4 texel = texture2D( tDiffuse, vUv );', `vec4 texel = texture2D( tDiffuse, vUv ); ${guard('texel', HDR_MAX.toFixed(1))}`, 'the bloom high-pass');
  GTAOBlendShader.fragmentShader = swap(GTAOBlendShader.fragmentShader, 'vec4 texel = texture2D( tDiffuse, vUv );', `vec4 texel = texture2D( tDiffuse, vUv ); ${guard('texel', '1.0', '1.0')}`, 'the ambient-occlusion blend');
}
