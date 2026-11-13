import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { U, NOISE } from './shaders.js';
import { smooth, lerp, clamp } from './util.js';

export class SkySystem {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.sky = new Sky(); this.sky.scale.setScalar(45000); this.sky.material.fog = false; scene.add(this.sky);
    const u = this.sky.material.uniforms; u.turbidity.value = 4.5; u.rayleigh.value = 1.7; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    this.nightMat = new THREE.ShaderMaterial({
      uniforms: { uNight: U.uNight, uMoon: { value: new THREE.Vector3() }, uTime: U.uTime }, side: THREE.BackSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }',
      fragmentShader: `uniform float uNight, uTime; uniform vec3 uMoon; varying vec3 vD; ${NOISE}
      void main(){
        vec3 d = normalize(vD);
        vec3 col = mix(vec3(0.012,0.02,0.045), vec3(0.002,0.004,0.014), clamp(d.y*1.5,0.,1.));
        vec3 c = d*220.; vec3 i = floor(c); float h = h31(i);
        float star = step(0.9965, h) * smoothstep(0.42, 0.0, length(fract(c)-0.5)) * (0.6+0.4*sin(uTime*3.+h*100.));
        col += vec3(0.9,0.95,1.)*star*1.6*smoothstep(0.,0.15,d.y);
        float mw = smoothstep(0.35, 0.0, abs(dot(d, normalize(vec3(0.4,0.6,0.7))) )) * fbm2(d.xz*6.)*0.06;
        col += vec3(0.5,0.55,0.7)*mw;
        float md = dot(d, normalize(uMoon));
        float disc = smoothstep(0.99955, 0.99965, md);
        float crat = 0.75 + 0.25*vn(d.xy*900.);
        col += vec3(1.,0.97,0.9)*disc*1.4*crat + vec3(0.5,0.6,0.8)*pow(max(md,0.),300.)*0.35;
        gl_FragColor = vec4(col*uNight, 1.);
      }`,
    });
    this.night = new THREE.Mesh(new THREE.SphereGeometry(40000, 32, 16), this.nightMat); this.night.renderOrder = -1; scene.add(this.night);
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uCov: { value: 0.48 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform float uTime, uNight, uCov; uniform vec3 uSunDir, uSunColor, uHorizon, uZenith, uAmbient; varying vec3 vW; ${NOISE}
      void main(){
        vec2 p = vW.xz*0.00022 + vec2(uTime*0.004, uTime*0.0015);
        float n = fbm2(p) * 0.65 + fbm2(p*3.1+3.)*0.35;
        float cov = smoothstep(uCov, uCov+0.28, n);
        float thick = smoothstep(uCov, uCov+0.5, n);
        float dist = length(vW.xz - cameraPosition.xz);
        float fade = smoothstep(22000., 6000., dist);
        vec3 lit = mix(uSunColor*1.1 + uAmbient*0.6, uHorizon*0.9, 0.3);
        vec3 shade = uAmbient*0.9 + uHorizon*0.15;
        vec3 col = mix(lit, shade, thick*0.75);
        float edge = pow(1.-thick, 3.)*max(uSunDir.y,0.);
        col += uSunColor*edge*0.4;
        col = mix(col, vec3(0.06,0.07,0.1), uNight*0.85);
        gl_FragColor = vec4(col, cov*fade*0.92);
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
    const es = new Sky(); es.material = this.sky.material; es.scale.setScalar(50); this.envScene.add(es);
    const en = new THREE.Mesh(new THREE.SphereGeometry(45, 16, 8), this.nightMat); this.envScene.add(en);
    this.envGround = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a3a30 })); this.envGround.position.y = -2; this.envScene.add(this.envGround);
    this.envT = -1e9; this.env = null;
    this.hour = 16.8; this.sunDir = new THREE.Vector3(); this.moonDir = new THREE.Vector3();
  }
  setShadowQuality(size, range) {
    this.sun.shadow.mapSize.set(size, size);
    const c = this.sun.shadow.camera; c.left = c.bottom = -range; c.right = c.top = range; c.near = 10; c.far = 2400; c.updateProjectionMatrix();
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.range = range;
  }
  update(dt, focus, t, timeScale) {
    this.hour = (this.hour + dt * timeScale / 3600 + 24) % 24;
    const th = (this.hour - 6) / 12 * Math.PI;
    this.sunDir.set(Math.cos(th), Math.sin(th) * 0.93, 0.36).normalize();
    this.moonDir.set(-this.sunDir.x, -this.sunDir.y, 0.3).normalize();
    const sy = this.sunDir.y;
    const day = smooth(-0.08, 0.2, sy), night = 1 - smooth(-0.16, 0.04, sy);
    U.uNight.value = night; U.uSunDir.value.copy(this.sunDir);
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    this.sky.material.uniforms.rayleigh.value = lerp(0.6, 1.8, day);
    this.nightMat.uniforms.uMoon.value.copy(this.moonDir);
    const golden = smooth(0.5, 0.04, sy) * smooth(-0.1, 0.05, sy);
    const sunCol = new THREE.Color(1, 0.96, 0.9).lerp(new THREE.Color(1.0, 0.52, 0.25), golden);
    U.uSunColor.value.copy(sunCol).multiplyScalar(smooth(-0.05, 0.12, sy));
    const zen = new THREE.Color(0.18, 0.38, 0.75).lerp(new THREE.Color(0.01, 0.02, 0.05), night);
    const hor = new THREE.Color(0.68, 0.78, 0.9).lerp(new THREE.Color(0.98, 0.62, 0.42), golden).lerp(new THREE.Color(0.03, 0.04, 0.08), night);
    U.uZenith.value.copy(zen); U.uHorizon.value.copy(hor);
    const fogc = hor.clone().lerp(new THREE.Color(0.75, 0.78, 0.8), 0.2 * day);
    this.scene.fog.color.copy(fogc); U.uFogColor.value.copy(fogc);
    const amb = new THREE.Color(0.35, 0.42, 0.55).multiplyScalar(lerp(0.12, 1, day)).lerp(new THREE.Color(0.6, 0.4, 0.35), golden * 0.3);
    U.uAmbient.value.copy(amb);
    this.hemi.color.setRGB(0.55, 0.68, 0.9).lerp(new THREE.Color(0.08, 0.1, 0.22), night); this.hemi.groundColor.setRGB(0.42, 0.36, 0.28).lerp(new THREE.Color(0.04, 0.04, 0.06), night);
    this.hemi.intensity = lerp(0.45, 1.0, day) * (golden > 0.3 ? 0.9 : 1);
    const useMoon = sy < -0.04;
    const L = useMoon ? this.moonDir : this.sunDir;
    this.sun.color.copy(useMoon ? new THREE.Color(0.55, 0.65, 1.0) : sunCol);
    this.sun.intensity = useMoon ? 0.45 * smooth(0, 0.25, this.moonDir.y) : 3.2 * smooth(-0.04, 0.15, sy);
    // stable shadow: snap target to texel grid
    const tex = (this.range * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / tex) * tex, fz = Math.round(focus.z / tex) * tex;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + L.x * 1000, focus.y + Math.max(L.y, 0.05) * 1000, fz + L.z * 1000);
    this.cloudMat.uniforms.uCov.value = 0.5;
    this.clouds.position.x = focus.x; this.clouds.position.z = focus.z;
    this.night.position.copy(focus); this.sky.position.copy(focus);
    this.exposure = lerp(0.62, 0.5, day) + night * 0.25;
    this.envGround.material.color.setRGB(0.25, 0.23, 0.18).multiplyScalar(lerp(0.05, 1, day));
    if (Math.abs(t - this.envT) > 8 || this.env === null) {
      this.envT = t;
      const old = this.env;
      this.env = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
      this.scene.environment = this.env.texture;
      if (old) old.dispose();
    }
    this.scene.environmentIntensity = lerp(0.25, 1, day);
  }
}
