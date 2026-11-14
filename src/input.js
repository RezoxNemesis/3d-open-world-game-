// Unified input: keyboard + mouse (desktop), virtual joystick + buttons (touch), gamepad.
export const input = {
  mx: 0, my: 0, lookX: 0, lookY: 0, held: new Set(), pressed: new Set(), released: new Set(), touch: false, locked: false,
  sens: 1, invertY: false, mode: 'foot', usingPad: false,
};
// Main scheme (desktop): WASD / arrows move, mouse looks, wheel-forward walks, LMB click = attack/use, LMB drag = free look,
// RMB = aim (then LMB fires the selected weapon or power), Tab = next weapon/power, Shift = sprint (tap = dodge roll),
// Space = jump / glide / parachute, Enter = interact, Esc = menu.
// The older single-letter keys still work as hidden extras.
const KEYMAP = {
  Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint', Enter: 'interact', NumpadEnter: 'interact', Tab: 'weapon', Escape: 'pause', KeyM: 'map',
  KeyE: 'kick', KeyF: 'interact', KeyR: 'web', KeyC: 'down', ControlLeft: 'down', KeyX: 'roll',
  KeyH: 'horn', KeyV: 'camera', KeyG: 'chute', KeyT: 'wait', KeyN: 'nitro', KeyB: 'brake', KeyZ: 'yawL', KeyY: 'yawR',
  Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', Digit4: 'w4', KeyP: 'photo',
};
const ARROWS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
let lmb = null, shiftAt = 0, wheelAt = 0;
const keys = new Set();
function press(a) { if (!input.held.has(a)) input.pressed.add(a); input.held.add(a); }
function release(a) { if (input.held.has(a)) input.released.add(a); input.held.delete(a); }
export function initInput(canvas, hud) {
  addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (!keys.has(e.code) && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) shiftAt = performance.now();
    keys.add(e.code); const a = KEYMAP[e.code]; if (a) { press(a); if (e.code === 'Tab' || e.code === 'Space' || e.code === 'Enter') e.preventDefault(); }
    if (ARROWS[e.code]) e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    keys.delete(e.code); const a = KEYMAP[e.code]; if (a) release(a);
    // a quick tap of Shift while moving = dodge roll
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && performance.now() - shiftAt < 190) input.pressed.add('roll');
  });
  addEventListener('blur', () => { keys.clear(); for (const a of [...input.held]) release(a); });
  canvas.addEventListener('mousedown', (e) => {
    if (input.touch) return;
    if (!input.locked && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) {} }
    if (e.button === 0) { lmb = { t: performance.now(), dist: 0 }; press('lmb'); if (input.held.has('aim')) press('attack'); }
    if (e.button === 2) press('aim');
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      // short click without dragging = attack / use; a drag was free-look
      if (lmb && !input.held.has('aim') && lmb.dist < 10 && performance.now() - lmb.t < 450) input.pressed.add('click');
      lmb = null; input.freeLook = false; release('lmb'); release('attack');
    }
    if (e.button === 2) release('aim');
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('wheel', (e) => {
    // rolling the wheel forward walks forward (each notch ~0.45 s), backward walks back
    const d = -Math.sign(e.deltaY); if (!d) return;
    input.wheelWalk = d > 0 ? Math.min(1.4, Math.max(0, input.wheelWalk || 0) + 0.45) : Math.max(-1.4, Math.min(0, input.wheelWalk || 0) - 0.45);
    input.wheel = (input.wheel || 0) + Math.sign(e.deltaY);
  }, { passive: true });
  document.addEventListener('pointerlockchange', () => { input.locked = document.pointerLockElement === canvas; });
  addEventListener('mousemove', (e) => {
    const dx = e.movementX || 0, dy = e.movementY || 0;
    if (lmb) { lmb.dist += Math.abs(dx) + Math.abs(dy); if (lmb.dist >= 10 && !input.held.has('aim')) input.freeLook = true; }
    if (input.locked || lmb) { input.lookX += dx * 0.0022 * input.sens; input.lookY += dy * 0.0022 * input.sens * (input.invertY ? -1 : 1); input.mouseMoved = (input.mouseMoved || 0) + Math.abs(dx); }
  });
  // touch look on the right half (anything not on a control)
  const looks = new Map();
  canvas.addEventListener('touchstart', (e) => {
    input.touch = true; hud && hud.showTouch(true);
    for (const t of e.changedTouches) looks.set(t.identifier, { x: t.clientX, y: t.clientY });
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) { const l = looks.get(t.identifier); if (!l) continue; input.lookX += (t.clientX - l.x) * 0.0055 * input.sens; input.lookY += (t.clientY - l.y) * 0.0045 * input.sens * (input.invertY ? -1 : 1); l.x = t.clientX; l.y = t.clientY; }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) looks.delete(t.identifier); };
  canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
}
// virtual stick + buttons are created by the HUD and call these
export const touchApi = {
  stick(x, y) { input.tx = x; input.ty = y; },
  down(a) { press(a); }, up(a) { release(a); },
  toggle(a) { if (input.held.has(a)) release(a); else press(a); },
};
export function pollInput() {
  let x = 0, y = 0;
  const now = performance.now(), dtw = Math.min(0.1, (now - (wheelAt || now)) / 1000); wheelAt = now;
  if (input.wheelWalk) { const w = input.wheelWalk; input.wheelWalk = w > 0 ? Math.max(0, w - dtw) : Math.min(0, w + dtw); y += Math.sign(w); }
  input.arrows = { x: (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), y: (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0) };
  input.wasd = { x: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), y: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) };
  input.shiftHeld = keys.has('ShiftLeft') || keys.has('ShiftRight') ? (now - shiftAt) / 1000 : 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y = 1; if (keys.has('KeyS') || keys.has('ArrowDown')) y = -1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (x || y) { if (keys.has('KeyW') || keys.has('KeyS') || keys.has('ArrowUp') || keys.has('ArrowDown')) input.wheelWalk = 0; }
  if (input.tx !== undefined && (Math.abs(input.tx) > 0.02 || Math.abs(input.ty) > 0.02)) { x = input.tx; y = input.ty; }
  // gamepad
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p || !p.connected) continue;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    const ax = dz(p.axes[0]), ay = dz(p.axes[1]);
    if (ax || ay) { x = ax; y = -ay; input.usingPad = true; }
    input.lookX += dz(p.axes[2]) * 0.05 * input.sens; input.lookY += dz(p.axes[3]) * 0.04 * input.sens;
    const map = [['jump', 0], ['kick', 1], ['attack', 2], ['interact', 3], ['switch', 4], ['web', 5], ['aim', 6], ['fire', 7], ['weapon', 8], ['pause', 9], ['sprint', 10], ['camera', 11], ['map', 12]];
    for (const [a, i] of map) { const b = p.buttons[i]; if (!b) continue; const on = b.pressed || b.value > 0.5; const k = 'pad_' + a; if (on && !input[k]) press(a); if (!on && input[k]) release(a); input[k] = on; }
    break;
  }
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  input.mx = x; input.my = y;
}
export function endFrame() { input.pressed.clear(); input.released.clear(); input.lookX = 0; input.lookY = 0; input.wheel = 0; input.mouseMoved = 0; }
export const isDown = (a) => input.held.has(a);
export const wasPressed = (a) => input.pressed.has(a);
