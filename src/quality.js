// Graphics presets. Mobile (Android) and Desktop (Electron) share everything else.
export const PRESETS = {
  mobile: { name: 'Mobile', desktop: false, terrainN: 1024, splatSize: 1024, detailTex: 512, terrainLod: [650, 1600, 3600], treeDensity: 0.45, treeFar: 1700, treeLod: 230, treeShadows: false,
    grassR: 26, grassSp: 0.95, shadowMap: 2048, shadowRange: 80, pixelRatio: 1.25, bloom: false, ao: false, far: 16000, crowd: 100000, crowdNear: 110, crowdFar: 420, traffic: 600, msaa: 0, fog: 1.2 },
  high: { name: 'High', desktop: true, terrainN: 2048, splatSize: 1024, detailTex: 1024, terrainLod: [800, 2000, 4600], treeDensity: 0.75, treeFar: 2600, treeLod: 380, treeShadows: true,
    grassR: 50, grassSp: 0.7, shadowMap: 4096, shadowRange: 140, pixelRatio: 1.5, bloom: true, ao: false, far: 30000, crowd: 200000, crowdNear: 180, crowdFar: 650, traffic: 1200, msaa: 4, fog: 1 },
  ultra: { name: 'Ultra', desktop: true, terrainN: 2048, splatSize: 1024, detailTex: 1024, terrainLod: [1000, 2600, 6000], treeDensity: 1, treeFar: 3400, treeLod: 500, treeShadows: true,
    grassR: 72, grassSp: 0.55, shadowMap: 4096, shadowRange: 190, pixelRatio: 2, bloom: true, ao: true, far: 40000, crowd: 300000, crowdNear: 240, crowdFar: 900, traffic: 2000, msaa: 4, fog: 0.9 },
  low: { name: 'Low', desktop: false, terrainN: 1024, splatSize: 512, detailTex: 512, terrainLod: [500, 1200, 2800], treeDensity: 0.25, treeFar: 1100, treeLod: 160, treeShadows: false,
    grassR: 0, grassSp: 1, shadowMap: 1024, shadowRange: 60, pixelRatio: 1, bloom: false, ao: false, far: 12000, crowd: 40000, crowdNear: 80, crowdFar: 300, traffic: 300, msaa: 0, fog: 1.4 },
};
export function detectPlatform() {
  const qs = new URLSearchParams(location.search);
  if (qs.get('platform') === 'desktop' || /Electron/i.test(navigator.userAgent)) return 'desktop';
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return 'android';
  if (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100)) return 'mobile-web';
  return 'web';
}
export function defaultPreset(platform) { return platform === 'desktop' ? 'ultra' : platform === 'web' ? 'high' : 'mobile'; }
