// Audio: synthesized SFX, ambient beds, generative raga soundtrack, TTS voices.
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { clamp, lerp } from './util.js';

export const audio = { ctx: null, on: false, musicVol: 0.55, sfxVol: 0.9, voiceOn: true, mood: 'title', subtitle: null };
let ctx, master, musicBus, sfxBus, ambBus, noiseBuf, plucks = new Map(), drums = {};
const R = Math.random;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  audio.ctx = ctx; audio.on = true;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
  musicBus = ctx.createGain(); musicBus.gain.value = audio.musicVol; musicBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = audio.sfxVol; sfxBus.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = 0.7; ambBus.connect(sfxBus);
  // reverb for music
  const rev = ctx.createConvolver(), len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / len, 3); }
  rev.buffer = ir; const rg = ctx.createGain(); rg.gain.value = 0.32; rev.connect(rg); rg.connect(master);
  audio.rev = rev;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = R() * 2 - 1;
  buildDrums();
  initAmbience();
  musicStart();
  if ('speechSynthesis' in window) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; }
}
export function setVolumes(m, s) { audio.musicVol = m; audio.sfxVol = s; if (musicBus) { musicBus.gain.value = m; sfxBus.gain.value = s; } }

// ---------- sample synthesis ----------
function ks(freq, dur = 1.8, bright = 0.5, buzz = 0.25) {
  const sr = ctx.sampleRate, n = Math.floor(sr * dur), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  const N = Math.max(2, Math.round(sr / freq)), line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = (R() * 2 - 1) * (i < N * bright ? 1 : 0.4);
  let p = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const v = line[p], nx = line[(p + 1) % N];
    let o = 0.5 * (v + nx) * 0.996;
    o += buzz * 0.02 * Math.sign(o) * Math.min(1, Math.abs(o) * 8); // jawari buzz
    line[p] = o; p = (p + 1) % N;
    last = last * 0.2 + v * 0.8; d[i] = last * Math.min(1, i / 40);
  }
  return buf;
}
function pluck(freq) { const k = Math.round(freq * 4); if (!plucks.has(k)) plucks.set(k, ks(freq)); return plucks.get(k); }
function makeBuf(dur, fn) { const sr = ctx.sampleRate, n = Math.floor(sr * dur), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = fn(i / sr, i); return b; }
function buildDrums() {
  drums.dha = makeBuf(0.7, (t) => { const f = 70 + 90 * Math.exp(-t * 18); return (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 6) + (R() * 2 - 1) * Math.exp(-t * 60) * 0.3) * 0.9; });
  drums.na = makeBuf(0.5, (t) => (Math.sin(2 * Math.PI * 520 * t) * 0.7 + Math.sin(2 * Math.PI * 1310 * t) * 0.3) * Math.exp(-t * 14) * 0.6 + (R() * 2 - 1) * Math.exp(-t * 90) * 0.25);
  drums.tin = makeBuf(0.4, (t) => Math.sin(2 * Math.PI * 690 * t) * Math.exp(-t * 22) * 0.5);
  drums.ge = makeBuf(0.8, (t) => { const f = 95 + 50 * Math.sin(t * 9); return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 4) * 0.8; });
  drums.dhol = makeBuf(0.6, (t) => { const f = 55 + 120 * Math.exp(-t * 25); return Math.tanh(Math.sin(2 * Math.PI * f * t) * 2.5) * Math.exp(-t * 7) * 0.9; });
  drums.dholHi = makeBuf(0.25, (t) => ((R() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * 330 * t) * 0.5) * Math.exp(-t * 28));
  drums.kick = makeBuf(0.5, (t) => Math.sin(2 * Math.PI * (45 + 120 * Math.exp(-t * 30)) * t) * Math.exp(-t * 7));
  drums.snare = makeBuf(0.3, (t) => ((R() * 2 - 1) * 0.8 + Math.sin(2 * Math.PI * 190 * t) * 0.3) * Math.exp(-t * 18) * 0.6);
  drums.hat = makeBuf(0.08, (t) => (R() * 2 - 1) * Math.exp(-t * 70) * 0.35);
}
function playBuf(buf, when, gain, bus, rate = 1, toRev = 0) {
  const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(bus);
  if (toRev) { const r = ctx.createGain(); r.gain.value = toRev; g.connect(r); r.connect(audio.rev); }
  s.start(when); return s;
}

// ---------- generative music ----------
const RAGA = { bilawal: [0, 2, 4, 5, 7, 9, 11], yaman: [0, 2, 4, 6, 7, 9, 11], bhairav: [0, 1, 4, 5, 7, 8, 11], malkauns: [0, 3, 5, 8, 10], kafi: [0, 2, 3, 5, 7, 9, 10], bhairavi: [0, 1, 3, 5, 7, 8, 10], desh: [0, 2, 5, 7, 9, 11] };
const SA = 146.83;
const MOODS = {
  title: { raga: 'yaman', bpm: 72, perc: 'tabla', lead: 'sitar', density: 0.5, drone: 1, pad: 0.3 },
  day: { raga: 'bilawal', bpm: 92, perc: 'tabla', lead: 'sitar', density: 0.55, drone: 0.8, pad: 0 },
  morning: { raga: 'bhairav', bpm: 76, perc: 'tabla', lead: 'flute', density: 0.45, drone: 1, pad: 0 },
  evening: { raga: 'yaman', bpm: 84, perc: 'tabla', lead: 'flute', density: 0.5, drone: 1, pad: 0.25 },
  night: { raga: 'malkauns', bpm: 60, perc: null, lead: 'flute', density: 0.3, drone: 0.9, pad: 0.6 },
  jungle: { raga: 'desh', bpm: 64, perc: null, lead: 'flute', density: 0.28, drone: 0.7, pad: 0.4 },
  drive: { raga: 'kafi', bpm: 112, perc: 'electro', lead: 'sitar', density: 0.6, drone: 0.3, pad: 0.5, bass: 1 },
  fly: { raga: 'yaman', bpm: 100, perc: 'electro', lead: 'flute', density: 0.45, drone: 0.4, pad: 0.8, bass: 1 },
  combat: { raga: 'kafi', bpm: 138, perc: 'dhol', lead: 'sitar', density: 0.7, drone: 0.5, pad: 0.6, bass: 1 },
  boss: { raga: 'bhairavi', bpm: 120, perc: 'dhol', lead: 'flute', density: 0.6, drone: 0.8, pad: 1, bass: 1 },
  interior: { raga: 'desh', bpm: 70, perc: 'tabla', lead: 'sitar', density: 0.35, drone: 0.6, pad: 0 },
};
const M = { step: 0, next: 0, deg: 0, phrase: [], cur: null, drone: null, pad: null };
function freqOf(deg, raga, oct = 0) { const sc = RAGA[raga], n = sc.length, o = Math.floor(deg / n), i = ((deg % n) + n) % n; return SA * Math.pow(2, (sc[i] + 12 * (o + oct)) / 12); }
function musicStart() {
  M.next = ctx.currentTime + 0.3; M.cur = MOODS.title;
  // drone: tanpura-like sustained saws
  const dg = ctx.createGain(); dg.gain.value = 0; dg.connect(musicBus);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 3; lp.connect(dg);
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 500; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  for (const [f, v] of [[SA / 2, 0.18], [SA * 0.75, 0.12], [SA, 0.14], [SA * 1.003, 0.1]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = v * 0.18; o.connect(g); g.connect(lp); o.start(); }
  M.drone = dg;
  const pg = ctx.createGain(); pg.gain.value = 0; const plp = ctx.createBiquadFilter(); plp.type = 'lowpass'; plp.frequency.value = 1400; plp.connect(pg); pg.connect(musicBus); const pr = ctx.createGain(); pr.gain.value = 0.5; pg.connect(pr); pr.connect(audio.rev);
  M.padOsc = [];
  for (let k = 0; k < 6; k++) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = SA; o.detune.value = (k - 2.5) * 7; const g = ctx.createGain(); g.gain.value = 0.035; o.connect(g); g.connect(plp); o.start(); M.padOsc.push(o); }
  M.pad = pg;
  setInterval(schedule, 60);
}
export function setMood(name) {
  if (!ctx || !MOODS[name] || audio.mood === name) return;
  audio.mood = name; M.cur = MOODS[name]; M.deg = 0; M.phrase = [];
}
function flute(f, t, dur, gain) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
  o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = f * 2; o2.frequency.value = f * 2;
  vib.frequency.value = 5.2; vg.gain.value = f * 0.012; vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
  const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(g); o.connect(g);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.08); g.gain.setValueAtTime(gain * 0.85, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
  if (R() < 0.3) o.frequency.setValueAtTime(f * 2 * 0.944, t), o.frequency.exponentialRampToValueAtTime(f * 2, t + 0.12);
  const rg = ctx.createGain(); rg.gain.value = 0.6; g.connect(musicBus); g.connect(rg); rg.connect(audio.rev);
  for (const x of [o, o2, vib]) { x.start(t); x.stop(t + dur + 0.05); }
}
function bass(f, t, dur, gain) {
  const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f / 2;
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(180, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(lp); lp.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.02);
}
const TEENTAAL = ['dha', 'dha', 'tin', 'dha', 'dha', 'dha', 'tin', 'dha', 'dha', 'tin', 'tin', 'na', 'na', 'dha', 'dha', 'ge'];
function schedule() {
  if (!ctx || ctx.state !== 'running') return;
  const mood = M.cur, spb = 60 / mood.bpm / 2; // eighth notes
  const now = ctx.currentTime;
  M.drone.gain.setTargetAtTime(mood.drone * 0.5, now, 1.5);
  M.pad.gain.setTargetAtTime(mood.pad * 0.5, now, 2);
  while (M.next < now + 0.25) {
    const t = M.next, s = M.step;
    // percussion
    if (mood.perc === 'tabla' && s % 2 === 0) { const b = TEENTAAL[(s / 2) % 16]; playBuf(drums[b], t, 0.42, musicBus, 1 + (R() - 0.5) * 0.02); if (R() < 0.18) playBuf(drums.na, t + spb, 0.2, musicBus); }
    if (mood.perc === 'dhol') { if (s % 4 === 0) playBuf(drums.dhol, t, 0.7, musicBus); if (s % 4 === 2 || s % 8 === 7) playBuf(drums.dholHi, t, 0.5, musicBus); if (s % 2 === 1 && R() < 0.4) playBuf(drums.dholHi, t, 0.25, musicBus); }
    if (mood.perc === 'electro') { if (s % 4 === 0) playBuf(drums.kick, t, 0.75, musicBus); if (s % 8 === 4) playBuf(drums.snare, t, 0.5, musicBus, 1, 0.2); playBuf(drums.hat, t, s % 2 ? 0.25 : 0.4, musicBus); if (s % 16 === 14) playBuf(drums.na, t, 0.3, musicBus); }
    if (mood.bass && s % 2 === 0) { const pat = [0, 0, 4, 0, 5, 0, 3, 2]; bass(freqOf(pat[(s / 2) % 8], mood.raga, -1), t, spb * 1.8, 0.22); }
    // melody
    if (!M.phrase.length) {
      const L = 6 + Math.floor(R() * 6); let d = M.deg; const ph = [];
      for (let i = 0; i < L; i++) { d += Math.round((R() - 0.5) * 3.2); d = clamp(d, -2, 9); ph.push(R() < 0.18 ? null : d); }
      if (R() < 0.5) ph.push(...ph.slice(0, 3)); ph.push(0, null, null);
      M.phrase = ph; M.deg = d;
    }
    if (R() < mood.density + 0.25) {
      const d = M.phrase.shift();
      if (d !== null && d !== undefined) {
        const f = freqOf(d, mood.raga, 1);
        if (mood.lead === 'sitar') { playBuf(pluck(f), t, 0.36, musicBus, 1, 0.35); if (R() < 0.25) playBuf(pluck(f * 2), t + spb * 0.5, 0.15, musicBus, 1, 0.3); }
        else flute(f / 2, t, spb * (1.5 + R() * 2), 0.11);
      }
    }
    if (s % 32 === 0) { const root = freqOf([0, 3, 4, 0][(s / 32) % 4], mood.raga, -1); M.padOsc.forEach((o, k) => o.frequency.setTargetAtTime(root * [1, 1, 1.5, 1.5, 2, 2][k], t, 0.5)); }
    if (s % 16 === 0 && mood.drone > 0.5) playBuf(pluck(SA / 2), t, 0.12, musicBus, 1, 0.4);
    M.step++; M.next += spb * (s % 2 === 0 ? 1.04 : 0.96);
  }
}

// ---------- SFX ----------
function noise(t, dur, f0, f1, gain, type = 'bandpass', q = 1, bus = sfxBus) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(bus); s.start(t, R()); s.stop(t + dur + 0.05);
}
function tone(t, dur, f0, f1, gain, type = 'sine') {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
}
export function sfx(name, vol = 1, dist = 0) {
  if (!ctx || ctx.state !== 'running') return;
  const v = vol * clamp(1 - dist / 220, 0, 1); if (v <= 0.01) return;
  const t = ctx.currentTime;
  switch (name) {
    case 'step': noise(t, 0.08, 900, 300, 0.12 * v, 'lowpass'); break;
    case 'punch': tone(t, 0.12, 160, 50, 0.7 * v); noise(t, 0.06, 2500, 400, 0.4 * v); break;
    case 'whoosh': noise(t, 0.22, 600, 2400, 0.18 * v, 'bandpass', 2); break;
    case 'pistol': noise(t, 0.18, 3000, 200, 0.9 * v, 'lowpass'); tone(t, 0.1, 220, 60, 0.5 * v, 'square'); break;
    case 'rifle': noise(t, 0.14, 4000, 300, 0.75 * v, 'lowpass'); tone(t, 0.07, 160, 50, 0.45 * v, 'square'); break;
    case 'cannon': noise(t, 0.09, 5000, 600, 0.5 * v, 'lowpass'); break;
    case 'boom': noise(t, 1.6, 600, 30, 1.2 * v, 'lowpass'); tone(t, 1.0, 70, 25, 0.9 * v); break;
    case 'thunder': noise(t, 3.5, 300, 30, 1.0 * v, 'lowpass'); noise(t + 0.15, 2.5, 900, 60, 0.4 * v, 'lowpass'); break;
    case 'splash': noise(t, 0.6, 2000, 300, 0.5 * v, 'bandpass', 0.7); break;
    case 'web': noise(t, 0.12, 4000, 1200, 0.25 * v, 'highpass'); tone(t, 0.08, 1800, 900, 0.08 * v, 'triangle'); break;
    case 'hit': tone(t, 0.09, 900, 200, 0.18 * v, 'square'); break;
    case 'crash': noise(t, 0.5, 1800, 200, 0.9 * v, 'lowpass'); tone(t, 0.3, 120, 40, 0.5 * v); break;
    case 'horn': tone(t, 0.4, 440, 438, 0.25 * v, 'square'); tone(t, 0.4, 554, 552, 0.2 * v, 'square'); break;
    case 'roar': noise(t, 2.6, 180, 60, 1.2 * v, 'lowpass', 4); tone(t, 2.4, 55, 35, 0.8 * v, 'sawtooth'); break;
    case 'hiss': noise(t, 1.4, 6000, 2500, 0.5 * v, 'highpass'); break;
    case 'pour': noise(t, 1.5, 1200, 800, 0.15 * v, 'bandpass', 3); break;
    case 'coin': tone(t, 0.08, 1320, 1320, 0.2 * v, 'square'); tone(t + 0.08, 0.2, 1760, 1760, 0.2 * v, 'square'); break;
    case 'ui': tone(t, 0.05, 880, 1200, 0.12 * v, 'triangle'); break;
    case 'mission': [0, 4, 7, 12].forEach((k, i) => tone(t + i * 0.12, 0.5, 440 * Math.pow(2, k / 12), 440 * Math.pow(2, k / 12), 0.18 * v, 'triangle')); break;
    case 'neigh': tone(t, 0.9, 700, 350, 0.25 * v, 'sawtooth'); break;
    case 'moo': tone(t, 1.2, 140, 110, 0.35 * v, 'sawtooth'); break;
    case 'bark': noise(t, 0.12, 900, 500, 0.5 * v, 'bandpass', 4); tone(t, 0.12, 420, 300, 0.3 * v, 'sawtooth'); break;
    case 'trumpet': tone(t, 1.3, 330, 520, 0.4 * v, 'sawtooth'); break;
    case 'hoof': noise(t, 0.05, 600, 200, 0.3 * v, 'lowpass'); break;
    case 'missile': noise(t, 1.0, 900, 3000, 0.4 * v, 'bandpass'); break;
    case 'door': tone(t, 0.25, 180, 120, 0.3 * v, 'triangle'); noise(t, 0.2, 400, 200, 0.2 * v, 'lowpass'); break;
  }
}

// ---------- loops (engines, ambience) ----------
class Loop {
  constructor(kind) {
    this.kind = kind; this.g = ctx.createGain(); this.g.gain.value = 0; this.g.connect(kind === 'amb' ? ambBus : sfxBus); this.nodes = [];
  }
}
export function engineLoop(type) {
  if (!ctx) return null;
  const L = new Loop('sfx');
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; lp.connect(L.g);
  if (type === 'heli') {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 400; s.connect(bp);
    const am = ctx.createGain(); bp.connect(am); am.connect(lp); const lfo = ctx.createOscillator(); lfo.frequency.value = 18; const lg = ctx.createGain(); lg.gain.value = 0.8; lfo.connect(lg); lg.connect(am.gain); s.start(); lfo.start();
    L.nodes = [s, lfo]; L.rate = lfo.frequency;
  } else if (type === 'jet') {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6; s.connect(bp); bp.connect(lp);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 300; const og = ctx.createGain(); og.gain.value = 0.05; o.connect(og); og.connect(lp); s.start(); o.start();
    L.nodes = [s, o]; L.osc = o; L.bp = bp;
  } else {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.35; o1.connect(lp); o2.connect(g2); g2.connect(lp); o1.start(); o2.start();
    L.nodes = [o1, o2]; L.osc = o1; L.osc2 = o2;
  }
  L.lp = lp; L.type = type; return L;
}
export function updateEngine(L, rpm, load, vol) {
  if (!L) return; const t = ctx.currentTime;
  L.g.gain.setTargetAtTime(vol, t, 0.05);
  if (L.type === 'heli') L.rate.setTargetAtTime(10 + rpm * 14, t, 0.1);
  else if (L.type === 'jet') { L.osc.frequency.setTargetAtTime(200 + rpm * 900, t, 0.1); L.bp.frequency.setTargetAtTime(500 + rpm * 2500, t, 0.1); }
  else { const f = (L.type === 'auto' ? 70 : L.type === 'super' ? 55 : 40) + rpm * (L.type === 'super' ? 260 : 170); L.osc.frequency.setTargetAtTime(f, t, 0.04); L.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.04); L.lp.frequency.setTargetAtTime(500 + load * 2500 + rpm * 800, t, 0.05); }
}
export function stopLoop(L) { if (!L) return; L.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); setTimeout(() => { for (const n of L.nodes) try { n.stop(); } catch (e) {} L.g.disconnect(); }, 600); }
const amb = {};
function initAmbience() {
  const mk = (type, f, q) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(ambBus); s.start(); return { g, fl }; };
  amb.ocean = mk('lowpass', 500, 0.7); amb.wind = mk('bandpass', 700, 0.5); amb.rain = mk('highpass', 2500, 0.3); amb.crowd = mk('bandpass', 900, 1.5); amb.falls = mk('lowpass', 800, 0.5); amb.traffic = mk('lowpass', 250, 0.8);
  amb.t = 0;
}
export function updateAmbience(dt, s) {
  if (!ctx || !amb.ocean) return;
  const t = ctx.currentTime; amb.t += dt;
  const wave = 0.55 + 0.45 * Math.sin(amb.t * 0.7) * Math.sin(amb.t * 0.23);
  amb.ocean.g.gain.setTargetAtTime(s.ocean * 0.35 * wave, t, 0.3);
  amb.wind.g.gain.setTargetAtTime(s.wind * 0.4, t, 0.2); amb.wind.fl.frequency.setTargetAtTime(400 + s.wind * 1400, t, 0.3);
  amb.rain.g.gain.setTargetAtTime(s.rain * 0.3, t, 0.5);
  amb.crowd.g.gain.setTargetAtTime(s.crowd * 0.12 * (0.7 + 0.3 * Math.sin(amb.t * 1.7)), t, 0.4);
  amb.falls.g.gain.setTargetAtTime(s.falls * 0.6, t, 0.3);
  amb.traffic.g.gain.setTargetAtTime(s.traffic * 0.18, t, 0.5);
  // birds by day, crickets at night
  if (s.birds > 0 && R() < dt * 1.5 * s.birds) { const f = 2500 + R() * 2500; tone(t, 0.08, f, f * 1.3, 0.04 * s.birds, 'sine'); tone(t + 0.1, 0.06, f * 1.1, f * 0.9, 0.03 * s.birds, 'sine'); }
  if (s.crickets > 0 && R() < dt * 3 * s.crickets) { for (let k = 0; k < 3; k++) tone(t + k * 0.05, 0.03, 4800, 4700, 0.015 * s.crickets, 'square'); }
  if (s.horns > 0 && R() < dt * 0.15 * s.horns) sfx('horn', 0.25);
}

// ---------- voices (TTS) + subtitles ----------
let speaking = false; const queue = [];
const VOICE = { Veer: { pitch: 0.92, rate: 1.02 }, Mira: { pitch: 1.18, rate: 1.04 }, Narrator: { pitch: 1, rate: 0.98 }, NPC: { pitch: 1.05, rate: 1.08 }, Gang: { pitch: 0.75, rate: 1.0 }, Naag: { pitch: 0.4, rate: 0.75 } };
export function say(who, text, onDone) { queue.push({ who, text, onDone }); if (!speaking) nextLine(); }
async function nextLine() {
  const l = queue.shift(); if (!l) { speaking = false; audio.subtitle = null; return; }
  speaking = true; audio.subtitle = { who: l.who, text: l.text, t: performance.now() };
  const v = VOICE[l.who] || VOICE.NPC, minT = 1200 + l.text.length * 55;
  const t0 = performance.now();
  const finish = () => { const wait = Math.max(0, minT - (performance.now() - t0)); setTimeout(() => { l.onDone && l.onDone(); nextLine(); }, wait); };
  if (!audio.voiceOn) return finish();
  try {
    await Promise.race([TextToSpeech.speak({ text: l.text, lang: 'en-IN', rate: v.rate, pitch: v.pitch, volume: 1.0, category: 'playback' }), new Promise((r) => setTimeout(r, 9000))]);
  } catch (e) { /* no TTS available: subtitles only */ }
  finish();
}
export function stopVoices() { queue.length = 0; try { TextToSpeech.stop(); } catch (e) {} }
