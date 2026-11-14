// Night light glows: soft camera-facing halos around every lamp, plus fake wet-ground reflections
// (the long vertical streaks a lamp leaves on wet asphalt). Both are single instanced draws.
import * as THREE from 'three';
import { U, NOISE } from './shaders.js';

const list = [];
// x,y,z = light centre; size = halo radius (m); col = THREE.Color-ish [r,g,b]; ground = surface y under it (null = no reflection)
export function addGlow(x, y, z, size, col, ground = null) { list.push({ x, y, z, size, col, ground }); }

export function buildGlows(scene, q) {
  if (!list.length) return null;
  const n = list.length;
  const quad = new THREE.PlaneGeometry(1, 1);
  const halo = new THREE.InstancedBufferGeometry(); halo.index = quad.index; halo.setAttribute('position', quad.attributes.position);
  const P = new Float32Array(n * 4), C = new Float32Array(n * 4);
  list.forEach((g, i) => { P.set([g.x, g.y, g.z, g.size], i * 4); C.set([g.col[0], g.col[1], g.col[2], g.ground ?? -9999], i * 4); });
  halo.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 4)); halo.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 4));
  halo.instanceCount = n;
  const far = q.desktop ? 2600 : 1400;
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uNight: U.uNight, uRain: U.uRain, uFar: { value: far } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 aP, aC; uniform float uNight, uRain, uFar; varying vec2 vUv; varying vec3 vC; varying float vK;
      void main(){
        vec4 mv = viewMatrix*vec4(aP.xyz, 1.); float d = -mv.z;
        // keep far lamps visible as points of light; rain makes the halos bigger and softer
        float sz = aP.w*(1.0 + uRain*0.6)*max(1.0, d*0.0035);
        mv.xyz += normalize(-mv.xyz)*min(0.5, d*0.5);
        mv.xy += position.xy*sz*2.0;
        vUv = position.xy*2.0; vC = aC.rgb;
        vK = uNight*smoothstep(uFar, uFar*0.6, d)*step(0.02, uNight)*(0.75 + 0.25*smoothstep(400., 60., d));
        gl_Position = vK > 0.0 ? projectionMatrix*mv : vec4(0., 0., -2., 1.);
      }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vC; varying float vK;
      void main(){
        float r2 = dot(vUv, vUv); if (r2 > 1.0) discard;
        float g = exp(-r2*9.0)*0.55 + exp(-r2*60.0)*1.6 + (1.0 - r2)*0.05;
        gl_FragColor = vec4(vC*g*vK, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const hm = new THREE.Mesh(halo, haloMat); hm.frustumCulled = false; hm.renderOrder = 5; scene.add(hm);

  // wet reflections: a streak lying on the ground between the lamp's mirror point and the viewer
  const refl = list.filter((g) => g.ground !== null);
  let rm = null;
  if (refl.length) {
    const rg = new THREE.InstancedBufferGeometry(); rg.index = quad.index; rg.setAttribute('position', quad.attributes.position);
    const RP = new Float32Array(refl.length * 4), RC = new Float32Array(refl.length * 4);
    refl.forEach((g, i) => { RP.set([g.x, g.y, g.z, g.size], i * 4); RC.set([g.col[0], g.col[1], g.col[2], g.ground], i * 4); });
    rg.setAttribute('aP', new THREE.InstancedBufferAttribute(RP, 4)); rg.setAttribute('aC', new THREE.InstancedBufferAttribute(RC, 4)); rg.instanceCount = refl.length;
    const rmat = new THREE.ShaderMaterial({
      uniforms: { uNight: U.uNight, uWet: U.uWet, uTime: U.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -20,
      vertexShader: `attribute vec4 aP, aC; uniform float uNight, uWet; varying vec2 vUv; varying vec3 vC; varying float vK; varying vec3 vW;
        void main(){
          float g = aC.w, h = max(aP.y - g, 0.5);
          vec3 C = cameraPosition; float ch = max(C.y - g, 0.3);
          // mirror point of the lamp on the ground plane, seen from the camera
          vec2 P = mix(C.xz, aP.xz, ch/(ch + h));
          vec2 D = C.xz - P; float dl = length(D); D = dl > 0.01 ? D/dl : vec2(0., 1.); vec2 S = vec2(-D.y, D.x);
          float len = clamp(dl*0.55, 2.0, 22.0)*(0.6 + 0.4*uWet), wid = 0.35 + aP.w*0.25;
          vec2 xz = P + D*(position.y + 0.5)*len*0.85 - D*len*0.15 + S*position.x*wid*2.0;
          vW = vec3(xz.x, g + 0.04, xz.y);
          vUv = vec2(position.x*2.0, position.y + 0.5); vC = aC.rgb;
          float far = length(C - aP.xyz);
          vK = uNight*uWet*smoothstep(260., 120., far)*step(0.05, uNight*uWet);
          gl_Position = vK > 0.0 ? projectionMatrix*viewMatrix*vec4(vW, 1.) : vec4(0., 0., -2., 1.);
        }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vC; varying float vK; varying vec3 vW; ${NOISE}
        void main(){
          float across = exp(-vUv.x*vUv.x*3.5), along = smoothstep(0.0, 0.18, vUv.y)*pow(1.0 - vUv.y, 1.6);
          float rip = 0.65 + 0.7*vn(vW.xz*vec2(2.2, 0.6) + uTime*vec2(0.0, 0.8));   // rain ripples break the streak up
          gl_FragColor = vec4(vC*across*along*rip*vK*0.9, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    rm = new THREE.Mesh(rg, rmat); rm.frustumCulled = false; rm.renderOrder = 4; scene.add(rm);
  }
  return { halo: hm, refl: rm, count: n };
}
