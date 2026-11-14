// Seasons + weather: summer haze, monsoon storms (rain, lightning, wet surfaces), winter fog, post-monsoon green.
import * as THREE from 'three';
import { U } from './shaders.js';
import { clamp, lerp, damp } from './util.js';
import { sfx } from './audio.js';

export const SEASONS = {
  summer: { name: 'Summer', lush: 0.0, dry: 0.85, rainChance: 0.0, fog: 1.15, clouds: 0.62, snow: 0, tint: [1.0, 0.97, 0.9] },
  monsoon: { name: 'Monsoon', lush: 1.0, dry: 0.0, rainChance: 0.75, fog: 1.6, clouds: 0.3, snow: 0, tint: [0.9, 0.95, 1.0] },
  postmonsoon: { name: 'Post-Monsoon', lush: 0.85, dry: 0.1, rainChance: 0.08, fog: 0.9, clouds: 0.45, snow: 0, tint: [1, 1, 1] },
  winter: { name: 'Winter', lush: 0.4, dry: 0.35, rainChance: 0.0, fog: 1.7, clouds: 0.55, snow: 1, tint: [0.95, 0.97, 1.03] },
};
export class Weather {
  constructor(game) { this.game = game; this.season = 'postmonsoon'; this.rain = 0; this.targetRain = 0; this.timer = 0; this.flash = 0; this.auto = true; this.storm = false; this.fogBoost = 0; }
  setSeason(s) { this.season = s; this.timer = 0; this.decide(); }
  decide() { const S = SEASONS[this.season]; this.storm = Math.random() < S.rainChance; this.targetRain = this.storm ? 0.5 + Math.random() * 0.5 : 0; this.timer = 90 + Math.random() * 150; }
  update(dt, sky, hour) {
    const S = SEASONS[this.season];
    this.timer -= dt; if (this.timer < 0) this.decide();
    this.rain = damp(this.rain, this.targetRain, 0.25, dt);
    U.uRain.value = this.rain; U.uWet.value = damp(U.uWet.value, this.rain > 0.1 ? 1 : 0, this.rain > 0.1 ? 0.15 : 0.03, dt);
    const s4 = U.uSeason.value; s4.x = damp(s4.x, S.lush, 0.5, dt); s4.y = damp(s4.y, S.dry, 0.5, dt); s4.z = this.rain; s4.w = damp(s4.w, S.snow, 0.5, dt);
    // fog: winter mornings are foggy; rain thickens
    const morning = Math.max(0, 1 - Math.abs(hour - 7) / 3);
    const fog = S.fog * (1 + morning * (this.season === 'winter' ? 1.4 : 0.4) + this.rain * 2.5);
    U.uFogDensity.value = 0.000078 * fog * this.game.q.fog;
    this.game.scene.fog.density = U.uFogDensity.value;
    sky.cloudMat.uniforms.uCov.value = lerp(S.clouds, 0.18, this.rain);
    sky.sun.intensity *= 1 - this.rain * 0.75;
    sky.hemi.intensity *= 1 - this.rain * 0.3;
    if (this.season === 'winter' && morning > 0) { const mist = new THREE.Color(0.72, 0.76, 0.82); this.game.scene.fog.color.lerp(mist, morning * 0.6); U.uFogColor.value.copy(this.game.scene.fog.color); }
    if (this.rain > 0.1) { const grey = new THREE.Color(0.32, 0.35, 0.4); this.game.scene.fog.color.lerp(grey, this.rain * 0.7); U.uFogColor.value.copy(this.game.scene.fog.color); U.uHorizon.value.lerp(grey, this.rain * 0.6); U.uZenith.value.lerp(new THREE.Color(0.2, 0.22, 0.26), this.rain * 0.7); }
    // lightning
    if (this.rain > 0.6 && Math.random() < dt * 0.06) { this.flash = 1; setTimeout(() => sfx('thunder', 0.9), 400 + Math.random() * 2500); }
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 4); sky.hemi.intensity += this.flash * 3; }
  }
}
