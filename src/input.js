// Unified input: keyboard + mouse (desktop), virtual joystick + buttons (touch), gamepad.
export const input = {
  mx: 0, my: 0, lookX: 0, lookY: 0, held: new Set(), pressed: new Set(), released: new Set(), touch: false, locked: false,
  sens: 1, invertY: false, mode: 'foot', usingPad: false,
};
const KEYMAP = {
  Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyE: 'kick', KeyF: 'interact', KeyQ: 'switch', KeyR: 'web', KeyC: 'down', ControlLeft: 'down', KeyX: 'roll',
  KeyM: 'map', Escape: 'pause', KeyH: 'horn', KeyV: 'camera', KeyG: 'chute', Tab: 'weapon', KeyT: 'wait', KeyN: 'nitro', KeyB: 'brake', KeyZ: 'yawL', KeyY: 'yawR',
  Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', Digit4: 'w4', KeyP: 'photo',
};
const keys = new Set();
function press(a) { if (!input.held.has(a)) input.pressed.add(a); input.held.add(a); }
function release(a) { if (input.held.has(a)) input.released.add(a); input.held.delete(a); }
export function initInput(canvas, hud) {
  addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys.add(e.code); const a = KEYMAP[e.code]; if (a) { press(a); if (e.code === 'Tab' || e.code === 'Space') e.preventDefault(); }
  });
  addEventListener('keyup', (e) => { keys.delete(e.code); const a = KEYMAP[e.code]; if (a) release(a); });
  addEventListener('blur', () => { keys.clear(); for (const a of [...input.held]) release(a); });
  canvas.addEventListener('mousedown', (e) => {
    if (input.touch) return;
    if (!input.locked && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) {} }
    if (e.button === 0) press('attack'); if (e.button === 2) press('aim');
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) release('attack'); if (e.button === 2) release('aim'); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('wheel', (e) => { input.wheel = (input.wheel || 0) + Math.sign(e.deltaY); }, { passive: true });
  document.addEventListener('pointerlockchange', () => { input.locked = document.pointerLockElement === canvas; });
  addEventListener('mousemove', (e) => { if (input.locked) { input.lookX += e.movementX * 0.0022 * input.sens; input.lookY += e.movementY * 0.0022 * input.sens * (input.invertY ? -1 : 1); } });
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
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
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
export function endFrame() { input.pressed.clear(); input.released.clear(); input.lookX = 0; input.lookY = 0; input.wheel = 0; }
export const isDown = (a) => input.held.has(a);
export const wasPressed = (a) => input.pressed.has(a);
