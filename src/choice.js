// Story choices: a card with two to four options. The game is paused while it is open; tap, click or press 1-4.
import { sfx } from './audio.js';

// spec = { title, text, options: [{ key, label, sub }] }; onPick(option) is called once
export function showChoice(game, spec, onPick) {
  const el = document.createElement('div'); el.dataset.choice = '1';
  el.style.cssText = 'position:fixed;inset:0;z-index:55;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center, rgba(22,8,36,.78), rgba(4,2,8,.92));font-family:system-ui,sans-serif;color:#efe9f7;padding:12px';
  const card = document.createElement('div');
  card.style.cssText = 'max-width:620px;width:100%;max-height:96vh;overflow:auto';
  card.innerHTML = `<div style="font-size:11px;letter-spacing:.3em;opacity:.6">YOUR CHOICE</div>
    <div style="font-size:24px;font-weight:700;margin:4px 0 6px;color:#e9b8ff">${spec.title}</div>
    <div style="font-size:14px;line-height:1.45;opacity:.9;margin-bottom:12px">${spec.text}</div>`;
  let picked = false;
  const pick = (o) => { if (picked) return; picked = true; removeEventListener('keydown', onKey, true); el.remove(); game.paused = false; sfx('choice'); onPick(o); };
  const onKey = (e) => { const i = '1234'.indexOf(e.key); if (i >= 0 && spec.options[i]) { e.preventDefault(); e.stopPropagation(); pick(spec.options[i]); } };
  spec.options.forEach((o, i) => {
    const b = document.createElement('button'); b.dataset.key = o.key;
    b.style.cssText = 'display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border-radius:12px;border:1px solid #6d3fa0;background:rgba(60,24,96,.55);color:#fff;font:inherit;cursor:pointer';
    b.innerHTML = `<div style="font-size:16px;font-weight:700"><span style="opacity:.55;margin-right:8px">${i + 1}</span>${o.label}</div><div style="font-size:13px;opacity:.8;margin-top:3px">${o.sub || ''}</div>`;
    b.onclick = () => pick(o); card.appendChild(b);
  });
  el.appendChild(card); document.body.appendChild(el); addEventListener('keydown', onKey, true);
  game.paused = true; sfx('ui');
  return el;
}
