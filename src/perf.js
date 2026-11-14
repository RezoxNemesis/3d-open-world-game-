// Performance governor: frame-rate cap, dynamic resolution scaling (DRS) and GPU-tier detection.
// Works like the "render resolution / frame rate" options of big mobile games: the game keeps the chosen
// frame rate by lowering the internal resolution when the GPU falls behind, and raises it again when there is headroom.

export function gpuInfo(gl) {
  let vendor = '', renderer = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch (e) {}
  const r = String(renderer), lr = r.toLowerCase();
  let tier = 2; // 1 weak, 2 mid, 3 strong, 4 very strong
  const num = (re) => { const m = r.match(re); return m ? parseInt(m[1], 10) : 0; };
  if (/adreno/i.test(r)) { const n = num(/Adreno[^0-9]*(\d{3})/i); tier = n >= 740 ? 4 : n >= 650 ? 3 : n >= 610 ? 2 : 1; }
  else if (/mali/i.test(r)) { const n = num(/Mali-G(\d+)/i); const mc = num(/MC(\d+)/i) || num(/MP(\d+)/i); tier = n >= 710 && mc >= 7 ? 4 : n >= 610 && mc >= 4 ? 3 : n >= 57 ? 2 : 1; }
  else if (/immortalis|xclipse/i.test(r)) tier = 4;
  else if (/powervr/i.test(r)) tier = 1;
  else if (/apple/i.test(r)) tier = 3;
  else if (/nvidia|geforce|rtx|gtx|quadro/i.test(lr)) tier = /gtx (6|7|9)\d\d|mx\s?\d/i.test(r) ? 3 : 4;
  else if (/radeon|amd/i.test(lr)) tier = /vega [368]\b|radeon\(tm\) graphics|r[57] /i.test(r) ? 3 : 4;
  else if (/intel/i.test(lr)) tier = /arc|iris xe/i.test(r) ? 3 : 2;
  else if (/swiftshader|llvmpipe|software/i.test(lr)) tier = 1;
  return { vendor: String(vendor), renderer: r, tier };
}

// Map platform + GPU tier to a preset (the player can still override it on the title screen).
export function autoPreset(platform, tier) {
  if (platform === 'desktop' || platform === 'web') return tier >= 4 ? 'ultra' : tier >= 3 ? 'high' : tier >= 2 ? 'mobile' : 'low';
  return tier >= 4 ? 'high' : tier >= 2 ? 'mobile' : 'low';
}

export class Governor {
  constructor(opts) {
    this.cap = opts.cap || 60;          // target frame rate
    this.base = opts.basePR || 1;       // preset pixel ratio (already clamped to the device)
    this.min = opts.minScale ?? 0.6;    // never go below this fraction of base
    this.scale = opts.startScale ?? 1;
    this.onScale = opts.onScale || (() => {});
    this.enabled = opts.drs !== false;
    this.last = 0; this.win = []; this.goodWindows = 0; this.cool = 0; this.upFails = 0; this.lastUp = -1e9;
  }
  get pixelRatio() { return this.base * this.scale; }
  // returns true when this rAF tick should render (frame cap)
  tick(now) {
    const interval = 1000 / this.cap;
    if (this.last && now - this.last < interval - 2.5) return false;
    const dt = this.last ? now - this.last : interval; this.last = now;
    if (this.enabled) this.sample(dt, now);
    return true;
  }
  sample(dt, now) {
    if (dt > 250) { this.win.length = 0; return; } // tab switch / loading hitch: ignore
    this.win.push(dt);
    if (this.win.length < Math.max(20, this.cap * 0.75)) return;
    const s = this.win.slice().sort((a, b) => a - b); this.win.length = 0;
    const p50 = s[s.length >> 1], p90 = s[Math.floor(s.length * 0.9)], target = 1000 / this.cap;
    if (this.cool > 0) { this.cool--; return; }
    if (p50 > target * 1.18 || p90 > target * 1.7) {
      // falling behind: drop resolution in proportion to the overload
      const over = Math.min(1.6, p50 / target);
      const ns = Math.max(this.min, this.scale / Math.sqrt(over) - 0.02);
      if (now - this.lastUp < 4000) this.upFails++;
      this.goodWindows = 0;
      if (ns < this.scale - 0.01) { this.scale = ns; this.onScale(this.scale); this.cool = 1; }
    } else if (p50 < target * 1.06 && p90 < target * 1.3) {
      if (++this.goodWindows >= 3 + this.upFails * 3 && this.scale < 1) {
        this.scale = Math.min(1, this.scale + 0.06); this.onScale(this.scale); this.goodWindows = 0; this.lastUp = now; this.cool = 1;
      }
    } else this.goodWindows = 0;
  }
}
