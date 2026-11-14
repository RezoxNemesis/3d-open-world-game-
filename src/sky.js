import * as THREE from 'three';
import { U, NOISE } from './shaders.js';
import { assetURL, EMBEDDED } from './textures.js';
import { smooth, lerp, clamp } from './util.js';

export class SkySystem {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    // art-directed sky (matches the reference look): deep-blue days, orange golden hour with a visible sun disc,
    // pink/purple twilight, navy night. Palettes are computed on the CPU so water/windows/fog share them.
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { uZ: { value: new THREE.Color() }, uH: { value: new THREE.Color() }, uH2: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uDisc: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uGround: { value: new THREE.Color() },
        uPA: { value: null }, uPB: { value: null }, uPO: { value: null }, uRot: { value: new THREE.Vector3() }, uSc: { value: new THREE.Vector3(1, 1, 1) }, uMix: { value: 0 }, uOver: { value: 0 }, uPhoto: { value: 0 }, uElMin: { value: -6 } },
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }',
      fragmentShader: `uniform vec3 uZ, uH, uH2, uGlow, uDisc, uSun, uGround, uRot, uSc; uniform sampler2D uPA, uPB, uPO; uniform float uMix, uOver, uPhoto, uElMin; varying vec3 vD;
      // photo sky: CC0 HDRIs stored Reinhard+gamma encoded (x = L/(1-L), L = c^2.2), upper hemisphere only
      vec3 photo(sampler2D t, float rot, vec3 d){
        float az = atan(d.x, d.z) - rot, el = degrees(asin(clamp(d.y, -1., 1.)));
        vec2 uv = vec2(fract(az/6.2831853), (max(el, uElMin) - uElMin)/(90. - uElMin));
        vec3 L = pow(texture2D(t, uv).rgb, vec3(2.2)); return L/max(1. - L, 0.004);
      }
      void main(){
        vec3 d = normalize(vD); float h = d.y;
        if (uPhoto > 0.5) {
          vec3 c = mix(photo(uPA, uRot.x, d)*uSc.x, photo(uPB, uRot.y, d)*uSc.y, uMix);
          if (uOver > 0.001) c = mix(c, photo(uPO, uRot.z, d)*uSc.z, uOver);
          c = mix(c, mix(c, uGround, 0.6), smoothstep(-0.02, -0.1, h));
          float sd = max(dot(d, normalize(uSun)), 0.0);
          c += uGlow*(pow(sd, 40.0)*0.25 + pow(sd, 400.0)*1.2)*(1. - uOver);
          c += uDisc*smoothstep(0.99955, 0.99975, sd)*28.0*(1. - uOver*0.9);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          return;
        }
        vec2 sh = normalize(uSun.xz + 1e-4), dh = normalize(d.xz + 1e-4);
        float toward = dot(sh, dh)*0.5 + 0.5;                             // 1 facing the sun, 0 away
        vec3 hor = mix(uH2, uH, pow(toward, 1.6));                         // horizon warmer toward the sun
        float t = pow(1.0 - clamp(h, 0.0, 1.0), 4.0);
        vec3 col = mix(uZ, hor, t);
        col = mix(col, mix(hor, uGround, 0.6), smoothstep(0.0, -0.08, h)); // below the horizon: haze into ground tone
        float sd = max(dot(d, normalize(uSun)), 0.0);
        col += uGlow*(pow(sd, 8.0)*0.28 + pow(sd, 40.0)*0.7 + pow(sd, 400.0)*2.6);
        col += uDisc*smoothstep(0.99955, 0.99975, sd)*28.0;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(45000, 48, 24), this.skyMat); this.sky.renderOrder = -2; this.sky.frustumCulled = false; scene.add(this.sky);
    this.nightMat = new THREE.ShaderMaterial({
      uniforms: { uNight: U.uNight, uMoon: { value: new THREE.Vector3() }, uTime: U.uTime, uMoonK: { value: 1 }, uStars: { value: 1 } }, side: THREE.BackSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }',
      fragmentShader: `uniform float uNight, uTime, uMoonK, uStars; uniform vec3 uMoon; varying vec3 vD; ${NOISE}
      void main(){
        vec3 d = normalize(vD);
        vec3 col = mix(vec3(0.012,0.02,0.045), vec3(0.002,0.004,0.014), clamp(d.y*1.5,0.,1.))*uStars;
        vec3 c = d*220.; vec3 i = floor(c); float h = h31(i);
        float star = step(0.9965, h) * smoothstep(0.42, 0.0, length(fract(c)-0.5)) * (0.6+0.4*sin(uTime*3.+h*100.));
        col += vec3(0.9,0.95,1.)*star*1.6*uStars*smoothstep(0.,0.15,d.y);
        float mw = smoothstep(0.35, 0.0, abs(dot(d, normalize(vec3(0.4,0.6,0.7))) )) * fbm2(d.xz*6.)*0.06;
        col += vec3(0.5,0.55,0.7)*mw;
        // big cinematic moon (~5 deg wide) with maria, limb darkening and a soft halo
        vec3 mo = normalize(uMoon); float md = dot(d, mo);
        vec3 mu = normalize(cross(mo, vec3(0.,1.,0.))), mv = cross(mu, mo);
        vec2 muv = vec2(dot(d, mu), dot(d, mv))/0.044; float mr = length(muv);
        if (md > 0.99 && mr < 1.0) {
          float limb = sqrt(1.0 - mr*mr);
          float maria = smoothstep(0.42, 0.6, fbm2(muv*1.4 + 3.1))*0.5 + smoothstep(0.5, 0.68, fbm2(muv*3.4 + 8.0))*0.22;
          float crat = vn(muv*24.0)*0.08;
          vec3 mcol = vec3(1.0,0.97,0.9)*(1.0 - maria - crat)*(0.55 + 0.45*limb);
          col += mcol*2.2*uMoonK*smoothstep(1.0, 0.97, mr);
        }
        col += vec3(0.55,0.65,0.85)*(pow(max(md,0.), 30.)*0.16 + pow(max(md,0.), 250.)*0.45)*(1.0 - step(0.99,md)*step(mr,1.0))*uMoonK;
        gl_FragColor = vec4(col*uNight, 1.);
      }`,
    });
    this.night = new THREE.Mesh(new THREE.SphereGeometry(40000, 32, 16), this.nightMat); this.night.renderOrder = -1; scene.add(this.night);
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uCov: { value: 0.48 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform float uTime, uNight, uCov; uniform vec3 uSunDir, uSunColor, uHorizon, uZenith, uAmbient; varying vec3 vW; ${NOISE}
      float dens(vec2 p){ vec2 q = p + vec2(fbm2(p*0.7 + 5.2), fbm2(p*0.7 + 1.3))*0.6; float n = fbm2(q)*0.62 + fbm2(q*2.7 + 3.0)*0.28 + fbm2(q*7.0 + 9.0)*0.1; return n; }
      void main(){
        vec2 p = vW.xz*0.00018 + vec2(uTime*0.0035, uTime*0.0012);
        float n = dens(p), cov = smoothstep(uCov, uCov + 0.16, n), core = smoothstep(uCov + 0.04, uCov + 0.42, n);
        // light march toward the sun: thicker cloud between this point and the sun = darker
        vec2 sd = normalize(uSunDir.xz + 1e-4)*0.035;
        float occ = smoothstep(uCov, uCov + 0.4, dens(p + sd)) * 0.6 + smoothstep(uCov, uCov + 0.4, dens(p + sd*2.2)) * 0.4;
        float sunUp = clamp(uSunDir.y*4.0 + 0.3, 0.0, 1.0);
        vec3 lit = uSunColor*1.25 + uZenith*0.35 + vec3(0.05);
        vec3 shade = mix(uAmbient*0.85 + uHorizon*0.3, uHorizon*0.75, 0.35);
        vec3 col = mix(lit, shade, clamp(occ*0.85 + core*0.25, 0.0, 1.0));
        col += uSunColor*pow(1.0 - core, 4.0)*0.6*sunUp;                // silver lining on thin edges
        // view-dependent forward scattering toward the sun
        vec3 V = normalize(vW - cameraPosition); float fwd = pow(max(dot(V, uSunDir), 0.0), 8.0);
        col += uSunColor*fwd*(1.0 - core)*1.2;
        float dist = length(vW.xz - cameraPosition.xz), fade = smoothstep(26000., 7000., dist);
        col = mix(col, uHorizon*0.9, smoothstep(9000., 24000., dist)*0.6);   // aerial perspective
        col = mix(col, vec3(0.05,0.07,0.13) + uZenith*0.4, uNight*0.8);
        gl_FragColor = vec4(col, cov*fade*0.95);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(50000, 50000, 1, 1).rotateX(Math.PI / 2), this.cloudMat);
    this.clouds.position.y = 1600; this.clouds.renderOrder = 2; scene.add(this.clouds);

    this.sun = new THREE.DirectionalLight(0xffffff, 3); this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x99bbff, 0x554433, 0.6); scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xaabbcc, 0.00011);
    // env
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    const es = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.skyMat); this.envScene.add(es);
    const en = new THREE.Mesh(new THREE.SphereGeometry(45, 16, 8), this.nightMat); this.envScene.add(en);
    this.envGround = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a3a30 })); this.envGround.position.y = -2; this.envScene.add(this.envGround);
    this.envT = -1e9; this.env = null;
    this.hour = 16.8; this.sunDir = new THREE.Vector3(); this.moonDir = new THREE.Vector3();
  }
  // photo sky keyframes (assets/sky): each HDRI is placed at the hour where our sun has the same elevation
  async loadPhotoSky(q) {
    try {
      const meta = await (await fetch(assetURL('assets/sky/skies.json'))).json(), res = q.desktop && !EMBEDDED() ? '4k' : '2k', loader = new THREE.TextureLoader();
      const elev = (h) => { const th = (h - 6) / 12 * Math.PI, x = Math.cos(th), y = Math.sin(th) * 0.93, z = 0.727; return Math.asin(y / Math.hypot(x, y, z)) * 180 / Math.PI; };
      const solve = (el, a, b) => { for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if ((elev(m) - el) * (elev(a) - el) <= 0) b = m; else a = m; } return (a + b) / 2; };
      const K = meta.keys, hours = { night: 21.2, dawn: 5.45, sunrise: solve(K.sunrise.sunEl, 5.5, 12), morning: solve(K.morning.sunEl, 5.5, 12), noon: 12.6,
        afternoon: solve(K.afternoon.sunEl, 12, 18.5), golden: solve(K.golden.sunEl, 12, 18.5), sunset: solve(K.sunset.sunEl, 12, 18.5) };
      hours.dusk = hours.sunset + 0.75; hours.bluehour = hours.dusk + 0.55;
      const load = (k) => new Promise((ok, bad) => loader.load(assetURL(`assets/sky/${res}/${k}.jpg`), (t) => { t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = THREE.RepeatWrapping; ok(t); }, undefined, bad));
      const keys = [];
      for (const k of Object.keys(hours)) keys.push({ k, h: hours[k], tex: await load(k), ...K[k] });
      keys.sort((a, b) => a.h - b.h);
      this.photo = { keys, over: { k: 'overcast', tex: await load('overcast'), ...K.overcast }, elMin: meta.elMin };
      this.skyMat.uniforms.uPhoto.value = 1;
      // the sea and lake reflect the same photo sky
      for (const mat of this.waterMats || []) for (const k of ['uPA', 'uPB', 'uPO', 'uRot', 'uSc', 'uMix', 'uOver', 'uPhoto', 'uElMin']) mat.uniforms[k] = this.skyMat.uniforms[k]; this.skyMat.uniforms.uElMin.value = meta.elMin; this.clouds.visible = false; this.nightMat.uniforms.uStars.value = 0.25;
    } catch (e) { console.warn('photo sky unavailable, using the procedural sky', e); this.photo = null; }
  }
  photoBlend(hour) {
    const ks = this.photo.keys, n = ks.length; let i = n - 1;
    for (let j = 0; j < n; j++) if (ks[j].h <= hour) i = j;
    const A = ks[i], B = ks[(i + 1) % n], hb = B.h + (B.h <= A.h ? 24 : 0), hh = hour + (hour < A.h ? 24 : 0), span = hb - A.h;
    const t = smooth(A.h + span * 0.2, hb - span * 0.2, hh);
    return { A, B, t };
  }
  setShadowQuality(size, range) {
    this.sun.shadow.mapSize.set(size, size);
    const c = this.sun.shadow.camera; c.left = c.bottom = -range; c.right = c.top = range; c.near = 10; c.far = 2400; c.updateProjectionMatrix();
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.range = range;
  }
  update(dt, focus, t, timeScale, baking = false) {
    this.hour = (this.hour + dt * timeScale / 3600 + 24) % 24;
    const th = (this.hour - 6) / 12 * Math.PI;
    this.sunDir.set(Math.cos(th), Math.sin(th) * 0.93, 0.727).normalize();
    // the moon rides a low arc (max ~30 deg) so it hangs big over the skyline instead of straight overhead
    this.moonDir.set(-this.sunDir.x, -this.sunDir.y * 0.5, 0.8).normalize();
    const sy = this.sunDir.y;
    const day = smooth(-0.08, 0.2, sy), night = 1 - smooth(-0.16, 0.04, sy);
    U.uNight.value = night; U.uSunDir.value.copy(this.sunDir);
    this.nightMat.uniforms.uMoon.value.copy(this.moonDir);
    const golden = smooth(0.42, 0.04, sy) * smooth(-0.1, 0.04, sy), twi = smooth(0.04, -0.1, sy) * smooth(-0.32, -0.12, sy), dayK = smooth(0.12, 0.45, sy);
    const sunCol = new THREE.Color(1, 0.95, 0.86).lerp(new THREE.Color(1.0, 0.5, 0.2), golden);
    U.uSunColor.value.copy(sunCol).multiplyScalar(smooth(-0.05, 0.12, sy));
    const C = (r, g, b) => new THREE.Color(r, g, b);
    // zenith / horizon(sun side) / horizon(away) for day, golden hour, twilight, night
    const zen = C(0.07, 0.24, 0.72).lerp(C(0.16, 0.24, 0.55), golden).lerp(C(0.1, 0.09, 0.3), twi).lerp(C(0.006, 0.014, 0.05), night);
    const horS = C(0.55, 0.76, 0.98).lerp(C(1.0, 0.55, 0.22), golden).lerp(C(0.98, 0.42, 0.38), twi).lerp(C(0.03, 0.05, 0.13), night);
    const horA = C(0.6, 0.78, 0.97).lerp(C(0.52, 0.5, 0.66), golden).lerp(C(0.42, 0.28, 0.55), twi).lerp(C(0.02, 0.035, 0.1), night);
    const m = this.skyMat.uniforms; m.uZ.value.copy(zen); m.uH.value.copy(horS); m.uH2.value.copy(horA); m.uSun.value.copy(this.sunDir);
    m.uGlow.value.copy(C(1.0, 0.85, 0.6).lerp(C(1.0, 0.45, 0.15), golden)).multiplyScalar(smooth(-0.12, 0.05, sy) * (0.5 + 0.55 * golden));
    m.uDisc.value.copy(C(1.0, 0.95, 0.85).lerp(C(1.0, 0.55, 0.25), golden)).multiplyScalar(smooth(-0.03, 0.02, sy));
    m.uGround.value.copy(C(0.32, 0.36, 0.38)).multiplyScalar(lerp(0.08, 1, day));
    if (this.photo) {
      const { A, B, t } = this.photoBlend(this.hour), O = this.photo.over, over = clamp(U.uRain.value * 1.6, 0, 1), sAz = Math.atan2(this.sunDir.x, this.sunDir.z);
      const rotOf = (k) => (k.night ? Math.atan2(this.moonDir.x, this.moonDir.z) : sAz) - k.sunU * Math.PI * 2;
      m.uPA.value = A.tex; m.uPB.value = B.tex; m.uPO.value = O.tex; m.uMix.value = t; m.uOver.value = over;
      m.uRot.value.set(rotOf(A), rotOf(B), rotOf(O)); m.uSc.value.set(1, 1, smooth(-0.1, 0.25, sy) * 0.9 + 0.04);
      const pc = (key) => C(...A[key]).lerp(C(...B[key]), t).lerp(C(...O[key]).multiplyScalar(m.uSc.value.z), over);
      zen.copy(pc('zenith')); horS.copy(pc('horS')); horA.copy(pc('horA'));
      m.uZ.value.copy(zen); m.uH.value.copy(horS); m.uH2.value.copy(horA);
      m.uGlow.value.multiplyScalar(0.45);
    }
    const hor = horS.clone().lerp(horA, 0.5);
    U.uZenith.value.copy(zen); U.uHorizon.value.copy(hor);
    // clearer, bluer air than before: aerial perspective tinted by the sky instead of grey
    const fogc = hor.clone().lerp(zen, 0.18 * dayK).lerp(C(0.78, 0.86, 0.95), 0.12 * dayK);
    this.scene.fog.color.copy(fogc); U.uFogColor.value.copy(fogc);
    const amb = new THREE.Color(0.35, 0.42, 0.55).multiplyScalar(lerp(0.12, 1, day)).lerp(new THREE.Color(0.6, 0.4, 0.35), golden * 0.3);
    U.uAmbient.value.copy(amb);
    this.hemi.color.setRGB(0.55, 0.68, 0.9).lerp(new THREE.Color(0.2, 0.25, 0.42), night); this.hemi.groundColor.setRGB(0.42, 0.36, 0.28).lerp(new THREE.Color(0.08, 0.08, 0.1), night);
    this.hemi.intensity = lerp(0.45, 1.0, day) * (golden > 0.3 ? 0.9 : 1);
    const useMoon = sy < -0.04;
    // moonlight comes from higher than the (art-directed, low) moon disc: no grazing shadow acne, softer night shading
    this.moonLight = (this.moonLight || new THREE.Vector3()).set(this.moonDir.x * 0.6, Math.max(this.moonDir.y, 0.2) + 0.55, this.moonDir.z * 0.6).normalize();
    const L = useMoon ? this.moonLight : this.sunDir;
    this.sun.color.copy(useMoon ? new THREE.Color(0.55, 0.65, 1.0) : sunCol);
    this.sun.intensity = useMoon ? 0.5 * smooth(-0.05, 0.2, this.moonDir.y) : 3.2 * smooth(-0.04, 0.15, sy);
    // never toggle castShadow (that recompiles every shader); fade the shadow instead
    this.sun.shadow.intensity = useMoon ? 0.45 * smooth(0.0, 0.25, this.moonDir.y) : smooth(-0.02, 0.08, sy);
    // stable shadow: snap target to texel grid
    const tex = (this.range * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / tex) * tex, fz = Math.round(focus.z / tex) * tex;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + L.x * 1000, focus.y + Math.max(L.y, 0.05) * 1000, fz + L.z * 1000);
    this.cloudMat.uniforms.uCov.value = 0.5 + golden * 0.05;
    this.clouds.position.x = focus.x; this.clouds.position.z = focus.z;
    this.night.position.copy(focus); this.sky.position.copy(focus);
    this.exposure = lerp(0.72, 0.56, day) + night * 0.3 - golden * 0.03;
    this.envGround.material.color.setRGB(0.25, 0.23, 0.18).multiplyScalar(lerp(0.05, 1, day));
    if (!baking) this.updateEnv(this.hour);
    this.scene.environmentIntensity = lerp(0.25, 1, day);
    U.uCrowdLight.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity * 0.85).add(_c.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.32 * smooth(0, 0.3, L.y)));
  }
  // Reflection/ambient environment: baked once per time-of-day keyframe at load instead of every few seconds
  // (PMREM generation causes frame hitches on phones).
  bakeEnv(hours) {
    const keep = this.hour; this.envKeys = []; this.nightMat.uniforms.uMoonK.value = 0.2;   // a dimmer moon in reflections (no glare on wet ground)
    for (const h of hours) { this.hour = h; this.update(0, new THREE.Vector3(), 0, 0, true); this.envKeys.push({ h, rt: this.pmrem.fromScene(this.envScene, 0, 0.1, 200) }); }
    this.hour = keep; this.envKey = null; this.nightMat.uniforms.uMoonK.value = 1;
  }
  updateEnv(hour) {
    if (!this.envKeys) return;
    let best = null, bd = 99;
    for (const k of this.envKeys) { const d = Math.min(Math.abs(k.h - hour), 24 - Math.abs(k.h - hour)); if (d < bd) { bd = d; best = k; } }
    if (best !== this.envKey) { this.envKey = best; this.scene.environment = best.rt.texture; }
  }
}
const _c = new THREE.Color();
