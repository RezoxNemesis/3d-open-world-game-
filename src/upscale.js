// Spatial upscaling: the 3D scene is rendered at a lower internal resolution and reconstructed at the screen resolution.
// Two filters, both run on any GPU (NVIDIA, AMD, Intel, Adreno, Mali):
//   EASU  edge-adaptive spatial upsampling: a 12-tap, direction-aware Lanczos-like reconstruction
//   RCAS  robust contrast-adaptive sharpening
// The algorithms follow AMD FidelityFX Super Resolution 1.0 (MIT licence, see assets/CREDITS-CODE.md); this is an
// independent GLSL implementation for WebGL2.
import * as THREE from 'three';

export const UPSCALE_MODES = { off: 1, native: 1, uq: 1 / 1.3, q: 1 / 1.5, b: 1 / 1.7, p: 1 / 2 };
export const UPSCALE_NAMES = [['off', 'Off'], ['uq', 'Ultra Quality'], ['q', 'Quality'], ['b', 'Balanced'], ['p', 'Performance']];

const VS = 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }';
const HEAD = /* glsl */`
  uniform sampler2D tSrc; uniform vec2 uSrc;   // size in pixels of the part of tSrc that holds the image
  uniform vec2 uTex;                            // full size of tSrc in pixels
  uniform vec2 uOut;                            // size of the image being written
  vec3 tap(vec2 p){ return texture2D(tSrc, clamp(p, vec2(0.5), uSrc - 0.5)/uTex).rgb; }
  float luma(vec3 c){ return c.g + 0.5*(c.r + c.b); }`;
const EASU = HEAD + /* glsl */`
  void setDir(inout vec2 dir, inout float len, float w, float lA, float lB, float lC, float lD, float lE){
    float lenX = max(abs(lD - lC), abs(lC - lB)); float dirX = lD - lB; dir.x += dirX*w;
    lenX = clamp(abs(dirX)/max(lenX, 1e-5), 0.0, 1.0); len += lenX*lenX*w;
    float lenY = max(abs(lE - lC), abs(lC - lA)); float dirY = lE - lA; dir.y += dirY*w;
    lenY = clamp(abs(dirY)/max(lenY, 1e-5), 0.0, 1.0); len += lenY*lenY*w;
  }
  void acc(inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len, float lob, float clp, vec3 c){
    vec2 v = vec2(off.x*dir.x + off.y*dir.y, off.x*(-dir.y) + off.y*dir.x)*len;
    float d2 = min(dot(v, v), clp);
    float wB = 0.4*d2 - 1.0, wA = lob*d2 - 1.0; wB *= wB; wA *= wA;
    wB = 1.5625*wB - 0.5625; float w = wB*wA;
    aC += c*w; aW += w;
  }
  void main(){
    vec2 pp = gl_FragCoord.xy*(uSrc/uOut) - 0.5, fp = floor(pp); pp -= fp; vec2 p0 = fp + 0.5;
    //    b c
    //  e f g h
    //  i j k l
    //    n o
    vec3 b = tap(p0 + vec2(0., -1.)), c = tap(p0 + vec2(1., -1.));
    vec3 e = tap(p0 + vec2(-1., 0.)), f = tap(p0), g = tap(p0 + vec2(1., 0.)), h = tap(p0 + vec2(2., 0.));
    vec3 i = tap(p0 + vec2(-1., 1.)), j = tap(p0 + vec2(0., 1.)), k = tap(p0 + vec2(1., 1.)), l = tap(p0 + vec2(2., 1.));
    vec3 n = tap(p0 + vec2(0., 2.)), o = tap(p0 + vec2(1., 2.));
    float bL = luma(b), cL = luma(c), eL = luma(e), fL = luma(f), gL = luma(g), hL = luma(h), iL = luma(i), jL = luma(j), kL = luma(k), lL = luma(l), nL = luma(n), oL = luma(o);
    vec2 dir = vec2(0.0); float len = 0.0;
    setDir(dir, len, (1.0 - pp.x)*(1.0 - pp.y), bL, eL, fL, gL, jL);
    setDir(dir, len, pp.x*(1.0 - pp.y), cL, fL, gL, hL, kL);
    setDir(dir, len, (1.0 - pp.x)*pp.y, fL, iL, jL, kL, nL);
    setDir(dir, len, pp.x*pp.y, gL, jL, kL, lL, oL);
    float dirR = dot(dir, dir); bool zro = dirR < 1.0/32768.0;
    dirR = zro ? 1.0 : inversesqrt(dirR); if (zro) dir = vec2(1.0, 0.0); else dir *= dirR;
    len = len*0.5; len *= len;
    float stretch = dot(dir, dir)/max(abs(dir.x), abs(dir.y));
    vec2 len2 = vec2(1.0 + (stretch - 1.0)*len, 1.0 - 0.5*len);
    float lob = 0.5 + (0.21 - 0.5)*len, clp = 1.0/lob;
    vec3 mn = min(min(f, g), min(j, k)), mx = max(max(f, g), max(j, k));
    vec3 aC = vec3(0.0); float aW = 0.0;
    acc(aC, aW, vec2(0., -1.) - pp, dir, len2, lob, clp, b); acc(aC, aW, vec2(1., -1.) - pp, dir, len2, lob, clp, c);
    acc(aC, aW, vec2(-1., 1.) - pp, dir, len2, lob, clp, i); acc(aC, aW, vec2(0., 1.) - pp, dir, len2, lob, clp, j);
    acc(aC, aW, vec2(0., 0.) - pp, dir, len2, lob, clp, f); acc(aC, aW, vec2(-1., 0.) - pp, dir, len2, lob, clp, e);
    acc(aC, aW, vec2(1., 1.) - pp, dir, len2, lob, clp, k); acc(aC, aW, vec2(2., 1.) - pp, dir, len2, lob, clp, l);
    acc(aC, aW, vec2(2., 0.) - pp, dir, len2, lob, clp, h); acc(aC, aW, vec2(1., 0.) - pp, dir, len2, lob, clp, g);
    acc(aC, aW, vec2(1., 2.) - pp, dir, len2, lob, clp, o); acc(aC, aW, vec2(0., 2.) - pp, dir, len2, lob, clp, n);
    gl_FragColor = vec4(min(mx, max(mn, aC/aW)), 1.0);
  }`;
// RCAS; with uSrc != uOut it also works as a one-pass "bilinear + sharpen" (the phone path)
const RCAS = HEAD + /* glsl */`
  uniform float uSharp;
  void main(){
    vec2 s = uSrc/uOut, p = gl_FragCoord.xy*s;
    vec3 b = tap(p + vec2(0., -s.y)), d = tap(p + vec2(-s.x, 0.)), e = tap(p), f = tap(p + vec2(s.x, 0.)), h = tap(p + vec2(0., s.y));
    float bL = luma(b), dL = luma(d), eL = luma(e), fL = luma(f), hL = luma(h);
    float nz = 0.25*(bL + dL + fL + hL) - eL;
    nz = clamp(abs(nz)/max(max(max(bL, dL), max(eL, max(fL, hL))) - min(min(bL, dL), min(eL, min(fL, hL))), 1e-4), 0.0, 1.0);
    nz = 1.0 - 0.5*nz;
    vec3 mn4 = min(min(b, d), min(f, h)), mx4 = max(max(b, d), max(f, h));
    vec3 hitMin = min(mn4, e)/(4.0*mx4 + 1e-4), hitMax = (1.0 - max(mx4, e))/min(4.0*mn4 - 4.0, vec3(-1e-4));
    vec3 lobeRGB = max(-hitMin, hitMax);
    float lobe = max(-0.1875, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0))*uSharp*nz;
    gl_FragColor = vec4((lobe*(b + d + h + f) + e)/(4.0*lobe + 1.0), 1.0);
  }`;

export class Upscaler {
  // opts: mode ('uq' | 'q' | 'b' | 'p' | 'native'), samples (MSAA of the scene target on the direct path), cheap (one-pass phone filter)
  constructor(renderer, opts = {}) {
    this.r = renderer; this.mode = opts.mode || 'q'; this.base = UPSCALE_MODES[this.mode] || 1; this.drs = 1; this.cheap = !!opts.cheap; this.samples = opts.samples || 0;
    this.sharp = opts.sharp ?? 0.8; this.composer = null;
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const mk = (fs, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { tSrc: { value: null }, uSrc: { value: new THREE.Vector2() }, uTex: { value: new THREE.Vector2() }, uOut: { value: new THREE.Vector2() }, ...extra } });
    this.easu = mk(EASU); this.rcas = mk(RCAS, { uSharp: { value: this.sharp } });
    this.quad = new THREE.Mesh(tri, this.easu); this.quad.frustumCulled = false; this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.out = new THREE.Vector2(); this.mid = null; this.scene = null;
    this.resize();
  }
  get scale() { return Math.max(0.4, this.base * this.drs); }
  // the canvas (drawing buffer) size changed
  resize() {
    this.r.getDrawingBufferSize(this.out);
    const w = Math.max(2, this.out.x), h = Math.max(2, this.out.y);
    if (this.mid) this.mid.dispose();
    this.mid = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });   // EASU result, sharpened onto the canvas
    if (!this.composer) {
      // direct path: the scene target is allocated once at the largest internal size; lower internal resolutions only
      // shrink the viewport inside it, so changing the resolution never reallocates anything (no hitch)
      if (this.scene) this.scene.dispose();
      const mw = Math.ceil(w * this.base), mh = Math.ceil(h * this.base);
      this.scene = new THREE.WebGLRenderTarget(mw, mh, { samples: this.samples, depthBuffer: true });
      // let materials tone-map and encode to sRGB straight into this target, exactly as they do for the canvas
      // (explicit RGBA8 so the multisampled buffer and its resolve texture agree: the values written are already encoded)
      this.scene.isXRRenderTarget = true; this.scene.texture.colorSpace = THREE.SRGBColorSpace; this.scene.texture.internalFormat = 'RGBA8';
    }
    this.apply();
  }
  // internal size in pixels for the current scale
  apply() {
    const w = this.out.x, h = this.out.y, s = this.scale;
    this.iw = Math.max(2, Math.round(w * s)); this.ih = Math.max(2, Math.round(h * s));
    if (this.composer) {
      // post-processing path: the composer's own targets are resized (quantised so it happens rarely)
      const pr = this.r.getPixelRatio() * s;
      if (Math.abs(pr - (this.cpr || 0)) > 1e-4) { this.cpr = pr; this.composer.setPixelRatio(pr); }
    } else if (this.scene) {
      this.iw = Math.min(this.iw, this.scene.width); this.ih = Math.min(this.ih, this.scene.height);
      this.scene.viewport.set(0, 0, this.iw, this.ih); this.scene.scissor.set(0, 0, this.iw, this.ih); this.scene.scissorTest = true;
    }
  }
  // dynamic resolution: k in (0, 1] multiplies the mode's scale
  setDrs(k) { const q = this.composer ? Math.round(k * 16) / 16 : k; if (q !== this.drs) { this.drs = q; this.apply(); } }
  useComposer(composer) {
    this.composer = composer; composer.renderToScreen = false; if (this.scene) { this.scene.dispose(); this.scene = null; }
    const sz = this.r.getSize(new THREE.Vector2()); composer.setSize(sz.x, sz.y);     // the composer keeps CSS pixels x its own pixel ratio from here on
    this.cpr = 0; this.apply();
  }
  pass(mat, src, sw, sh, tw, th, target, ow, oh) {
    const u = mat.uniforms; u.tSrc.value = src; u.uSrc.value.set(sw, sh); u.uTex.value.set(tw, th); u.uOut.value.set(ow, oh);
    this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.quad, this.cam);
  }
  render(scene, camera) {
    const r = this.r; let src, sw, sh, tw, th;
    if (this.composer) { this.composer.render(); const rb = this.composer.readBuffer; src = rb.texture; sw = tw = rb.width; sh = th = rb.height; }
    else { r.setRenderTarget(this.scene); r.render(scene, camera); src = this.scene.texture; sw = this.iw; sh = this.ih; tw = this.scene.width; th = this.scene.height; }
    const ow = this.out.x, oh = this.out.y, same = sw === ow && sh === oh;
    this.rcas.uniforms.uSharp.value = this.sharp;
    if (this.cheap || same) this.pass(this.rcas, src, sw, sh, tw, th, null, ow, oh);
    else { this.pass(this.easu, src, sw, sh, tw, th, this.mid, ow, oh); this.pass(this.rcas, this.mid.texture, ow, oh, ow, oh, null, ow, oh); }
  }
  dispose() { if (this.mid) this.mid.dispose(); if (this.scene) this.scene.dispose(); this.easu.dispose(); this.rcas.dispose(); }
}
