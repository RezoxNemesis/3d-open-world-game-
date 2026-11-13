// Temporary bootstrap (world preview) — replaced by the full game loop.
import * as THREE from 'three';
import { buildWorld, world, updateWorld, updateTrees } from './world.js';
import { SkySystem } from './sky.js';
import { U } from './shaders.js';
import { nextFrame } from './util.js';
(async function () {
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 60000);
  const sky = new SkySystem(scene, renderer); sky.setShadowQuality(2048, 150);
  await buildWorld(scene, async () => nextFrame());
  let t = 0;
  const frame = () => { t += 1 / 60; cam.position.set(-2600 + Math.sin(t * 0.05) * 400, 120, -900); cam.lookAt(-2700, 0, -200); sky.update(1 / 60, cam.position, t, 60); U.uTime.value = t; renderer.toneMappingExposure = sky.exposure; updateWorld(t, U.uNight.value); updateTrees(cam.position, { treeFar: 2500, treeLod: 700 }); renderer.render(scene, cam); };
  renderer.setAnimationLoop(frame);
  window.__TEST = { ready: true, scenarios: ['overview'], run: async () => { for (let i = 0; i < 3; i++) frame(); return { ok: true }; }, stats: () => world.stats };
})();
