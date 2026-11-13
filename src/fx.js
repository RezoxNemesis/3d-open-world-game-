// Particles, explosions, tracers, web lines, rain.
import * as THREE from 'three';
import { U } from './shaders.js';

const MAXP = 6000;
export const fx = { shake: 0, flashes: [] };
let geo, pts, P, life, maxLife, vel, kind, size0, col0, cursor = 0, scene;
export function initFx(sc) {
  scene = sc;
  geo = new THREE.BufferGeometry();
  P = new Float32Array(MAXP * 3); life = new Float32Array(MAXP); maxLife = new Float32Array(MAXP); vel = new Float32Array(MAXP * 3); kind = new Uint8Array(MAXP);
  size0 = new Float32Array(MAXP); col0 = new Float32Array(MAXP * 3);
  const aSize = new Float32Array(MAXP), aCol = new Float32Array(MAXP * 4);
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1)); geo.setAttribute('aCol', new THREE.BufferAttribute(aCol, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uScale: { value: 600 } },
    vertexShader: `attribute float aSize; attribute vec4 aCol; varying vec4 vC; uniform float uScale;
      void main(){ vC = aCol; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = aSize*uScale/max(-mv.z,0.1); gl_Position = projectionMatrix*mv; if (aCol.a <= 0.001) gl_Position = vec4(2.,2.,2.,1.); }`,
    fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord-0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(vC.rgb, vC.a*a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5; sc.add(pts);
  fx.mat = mat;
  fx.pool = [new THREE.PointLight(0xffa040, 0, 80, 2), new THREE.PointLight(0xffa040, 0, 80, 2)]; fx.pi = 0;
  for (const L of fx.pool) { L.position.set(0, -3000, 0); sc.add(L); }
}
// kinds: 0 spark, 1 smoke, 2 fire, 3 splash, 4 dust, 5 steam, 6 blood-ish hit puff (dark red mist), 7 leaf, 8 debris
export function emit(k, x, y, z, vx, vy, vz, l, sz, r, g, b) {
  const i = cursor; cursor = (cursor + 1) % MAXP;
  P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
  life[i] = l; maxLife[i] = l; kind[i] = k; size0[i] = sz; col0[i * 3] = r; col0[i * 3 + 1] = g; col0[i * 3 + 2] = b;
}
const rnd = (a) => (Math.random() - 0.5) * a;
export function burst(type, x, y, z, n = 10, scale = 1) {
  for (let k = 0; k < n; k++) {
    switch (type) {
      case 'spark': emit(0, x, y, z, rnd(8) * scale, Math.random() * 5 * scale, rnd(8) * scale, 0.25 + Math.random() * 0.3, 0.12, 4, 2.6, 1.2); break;
      case 'hit': emit(6, x, y, z, rnd(2), Math.random() * 1.5, rnd(2), 0.25, 0.14, 0.45, 0.06, 0.05); break;
      case 'dust': emit(4, x + rnd(0.6), y, z + rnd(0.6), rnd(2) * scale, Math.random() * 1.2, rnd(2) * scale, 0.8 + Math.random() * 0.6, 0.6 * scale, 0.62, 0.56, 0.46); break;
      case 'splash': emit(3, x + rnd(1) * scale, y, z + rnd(1) * scale, rnd(3) * scale, 2 + Math.random() * 4 * scale, rnd(3) * scale, 0.7, 0.35 * scale, 0.85, 0.92, 1.0); break;
      case 'smoke': emit(1, x + rnd(1) * scale, y, z + rnd(1) * scale, rnd(1), 1.5 + Math.random() * 2, rnd(1), 2.5 + Math.random() * 2, 2.2 * scale, 0.25, 0.25, 0.25); break;
      case 'fire': emit(2, x + rnd(1.5) * scale, y, z + rnd(1.5) * scale, rnd(2), 2 + Math.random() * 3, rnd(2), 0.6 + Math.random() * 0.5, 1.6 * scale, 3.5, 1.4, 0.3); break;
      case 'steam': emit(5, x + rnd(0.1), y, z + rnd(0.1), rnd(0.2), 0.4 + Math.random() * 0.3, rnd(0.2), 1.6, 0.18, 0.9, 0.9, 0.9); break;
      case 'leaf': emit(7, x + rnd(4), y, z + rnd(4), rnd(1), -0.5, rnd(1), 3, 0.2, 0.3, 0.5, 0.1); break;
      case 'debris': emit(8, x, y, z, rnd(16) * scale, 4 + Math.random() * 10 * scale, rnd(16) * scale, 1.5 + Math.random(), 0.35, 0.15, 0.13, 0.12); break;
      case 'muzzle': emit(0, x, y, z, 0, 0, 0, 0.05, 0.6, 6, 4, 1.5); break;
      case 'venom': emit(2, x + rnd(2), y, z + rnd(2), rnd(3), Math.random() * 2, rnd(3), 1.0, 2.2, 0.4, 2.2, 0.3); break;
    }
  }
}
export function explosion(x, y, z, big = 1) {
  burst('fire', x, y + 1, z, 40 * big, 1.6 * big); burst('smoke', x, y + 2, z, 30 * big, 2 * big); burst('debris', x, y + 1, z, 25 * big, big); burst('spark', x, y + 1, z, 30, 2);
  const L = fx.pool[fx.pi++ % fx.pool.length]; L.intensity = 4000 * big; L.distance = 80 * big; L.position.set(x, y + 3, z); fx.flashes.push({ L, t: 0.6 });
  fx.shake = Math.max(fx.shake, 0.8 * big);
}
// tracers
const tracers = [];
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
export function tracer(a, b) {
  const g = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
  const l = new THREE.Line(g, tracerMat); scene.add(l); tracers.push({ l, t: 0.06 });
}
// web line (single reusable)
let webLine;
export function setWeb(a, b) {
  if (!webLine) {
    webLine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf5f5f5 }));
    scene.add(webLine);
  }
  if (!a) { webLine.visible = false; return; }
  webLine.visible = true; webLine.position.copy(a); webLine.lookAt(b); webLine.scale.set(1, 1, a.distanceTo(b));
}
export function updateFx(dt, camPos) {
  const aSize = geo.attributes.aSize.array, aCol = geo.attributes.aCol.array;
  for (let i = 0; i < MAXP; i++) {
    if (life[i] <= 0) { aCol[i * 4 + 3] = 0; continue; }
    life[i] -= dt; const t = 1 - life[i] / maxLife[i], k = kind[i];
    let g = -9.8, drag = 0.5;
    if (k === 1 || k === 5) { g = 0.6; drag = 1.2; } else if (k === 2) { g = 2.5; drag = 1.5; } else if (k === 4) { g = 0.2; drag = 2; } else if (k === 6) { g = -1; drag = 3; } else if (k === 7) { g = -0.6; drag = 1; }
    vel[i * 3 + 1] += g * dt; const df = Math.exp(-drag * dt);
    vel[i * 3] *= df; vel[i * 3 + 1] *= k === 0 || k === 3 || k === 8 ? 1 : df; vel[i * 3 + 2] *= df;
    P[i * 3] += vel[i * 3] * dt; P[i * 3 + 1] += vel[i * 3 + 1] * dt; P[i * 3 + 2] += vel[i * 3 + 2] * dt;
    let sz = size0[i], a = 1 - t;
    if (k === 1) { sz *= 1 + t * 3; a = (1 - t) * 0.55 * Math.min(1, t * 6); } else if (k === 2) { sz *= 1 + t; a = (1 - t); } else if (k === 5) { sz *= 1 + t * 4; a = (1 - t) * 0.4; } else if (k === 4) { sz *= 1 + t * 2; a = (1 - t) * 0.5; } else if (k === 6) { sz *= 1 + t * 2; a = (1 - t) * 0.6; }
    const amb = k === 2 || k === 0 ? 1 : 0.4 + 0.6 * (1 - U.uNight.value * 0.8);
    aSize[i] = sz; aCol[i * 4] = col0[i * 3] * (k === 1 ? amb : 1) * (k === 2 ? 1 - t * 0.6 : 1); aCol[i * 4 + 1] = col0[i * 3 + 1] * (k === 1 ? amb : 1) * (k === 2 ? 1 - t * 0.7 : 1); aCol[i * 4 + 2] = col0[i * 3 + 2] * (k === 1 ? amb : 1); aCol[i * 4 + 3] = a;
  }
  geo.attributes.position.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aCol.needsUpdate = true;
  for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].t -= dt; if (tracers[i].t <= 0) { scene.remove(tracers[i].l); tracers[i].l.geometry.dispose(); tracers.splice(i, 1); } }
  for (let i = fx.flashes.length - 1; i >= 0; i--) { const f = fx.flashes[i]; f.t -= dt; f.L.intensity *= Math.exp(-6 * dt); if (f.t <= 0) { f.L.intensity = 0; f.L.position.set(0, -3000, 0); fx.flashes.splice(i, 1); } }
  fx.shake = Math.max(0, fx.shake - dt * 1.5);
}

// ---------- rain (camera-following streaks) ----------
let rain;
export function initRain(sc, count) {
  const g = new THREE.BufferGeometry(), n = count, p = new Float32Array(n * 6), seed = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 40, z = (Math.random() - 0.5) * 60; p.set([x, y, z, x, y, z], i * 6); seed[i * 2] = Math.random(); seed[i * 2 + 1] = 1; }
  const top = new Float32Array(n * 2); for (let i = 0; i < n; i++) { top[i * 2] = 0; top[i * 2 + 1] = 1; }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aTop', new THREE.BufferAttribute(top, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime: U.uTime, uCam: { value: new THREE.Vector3() }, uRain: U.uRain, uWind: { value: new THREE.Vector2(3, 1) } },
    vertexShader: `attribute float aTop; uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; varying float vA;
      void main(){ vec3 p = position; float sp = 22.;
        p.y = mod(p.y - uTime*sp, 40.) - 12.;
        p.xz += uWind * (p.y*0.04);
        p.x = mod(p.x - uCam.x + 30., 60.) - 30. + uCam.x; p.z = mod(p.z - uCam.z + 30., 60.) - 30. + uCam.z; p.y += uCam.y;
        p += aTop*vec3(uWind.x*0.03, 0.9, uWind.y*0.03);
        vA = 0.35; gl_Position = projectionMatrix*viewMatrix*vec4(p,1.); }`,
    fragmentShader: `uniform float uRain; varying float vA; void main(){ gl_FragColor = vec4(0.75,0.8,0.88, vA*uRain); }`,
  });
  rain = new THREE.LineSegments(g, mat); rain.frustumCulled = false; rain.renderOrder = 6; sc.add(rain);
  return rain;
}
export function updateRain(cam) { if (rain) { rain.material.uniforms.uCam.value.copy(cam); rain.visible = U.uRain.value > 0.01; } }
