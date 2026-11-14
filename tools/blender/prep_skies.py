# Prepare Poly Haven CC0 pure-sky HDRIs for the game's photo sky (run with bpy available).
# Per sky: find the sun/moon, normalise exposure to a per-time-of-day target, soften the clipped sun core,
# crop to the upper hemisphere (+6 deg below the horizon), and store it Reinhard+gamma encoded in an 8-bit JPEG
# (x = L/(1-L), L = c^2.2) at 4K (desktop) and 2K (phones). Writes skies.json with the sun direction + palette.
import bpy, numpy as np, json, math, os
from PIL import Image

SRC, OUT = '/tmp/hdr/src', '/home/claude/3d-open-world-game-/assets/sky'
# key: (file, target mean sky luminance, is night)
KEYS = [
    ('night', 'kloppenheim_02', 0.012, True),
    ('dawn', 'qwantani_dawn', 0.09, False),
    ('sunrise', 'qwantani_sunrise', 0.2, False),
    ('morning', 'kloofendal_38d_partly_cloudy', 0.34, False),
    ('noon', 'kloofendal_48d_partly_cloudy', 0.36, False),
    ('afternoon', 'evening_road_01', 0.31, False),
    ('golden', 'wasteland_clouds', 0.27, False),
    ('sunset', 'kloppenheim_06', 0.22, False),
    ('dusk', 'qwantani_dusk_2', 0.1, False),
    ('bluehour', 'qwantani_moonrise', 0.03, True),
    ('overcast', 'kloofendal_overcast', 0.3, False),
]
EL_MIN = -6.0
os.makedirs(f'{OUT}/4k', exist_ok=True); os.makedirs(f'{OUT}/2k', exist_ok=True)
meta = {}
for key, name, target, night in KEYS:
    img = bpy.data.images.load(f'{SRC}/{name}.hdr'); W, H = img.size
    px = np.empty(W * H * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(H, W, 4)[:, :, :3]   # row 0 = bottom (el -90)
    bpy.data.images.remove(img)
    lum = px @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    el = (np.arange(H) + 0.5) / H * 180 - 90
    up = el > 2
    # sun (or moon): brightest blob in the sky
    L2 = np.where(up[:, None], lum, 0); iy, ix = np.unravel_index(np.argmax(L2), L2.shape)
    sun_u, sun_el = (ix + 0.5) / W, el[iy]
    # angular distance of every pixel to the sun
    az = (np.arange(W) + 0.5) / W * 2 * math.pi; elr = np.radians(el)
    D = np.stack([np.cos(elr)[:, None] * np.sin(az)[None, :], np.repeat(np.sin(elr)[:, None], W, 1), np.cos(elr)[:, None] * np.cos(az)[None, :]], -1)
    s = D[iy, ix]; ang = np.degrees(np.arccos(np.clip(D @ s, -1, 1)))
    ring = (ang > 2.5) & (ang < 4.5); core = ang < 2.5
    ringC = px[ring].mean(0); ringL = lum[ring].mean()
    sunC = px[ang < 0.6].mean(0)
    # soften the clipped core: our own sun/moon disc is drawn on top in the shader
    k = np.clip((lum / max(ringL, 1e-6)), 1, None)[..., None]
    fade = np.clip((ang - 0.5) / 2.0, 0, 1)[..., None]
    px = np.where(core[..., None], px * 0 + (px / k) * (1 + 0.6 * (1 - fade)), px)
    lum = px @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    sky = up[:, None] & (ang > 8)
    mean = float(np.average(lum[sky], weights=np.repeat(np.cos(elr)[:, None], W, 1)[sky]))
    scale = target / max(mean, 1e-6); px *= scale
    # palette: zenith, horizon toward / away from the sun, sun colour
    hz = (el > 0) & (el < 6)
    azd = ((az - az[ix] + math.pi) % (2 * math.pi)) - math.pi
    tow = np.abs(azd) < math.radians(35); away = np.abs(azd) > math.radians(145)
    pal = {
        'zenith': px[el > 70].reshape(-1, 3).mean(0).tolist(),
        'horS': px[hz][:, tow].reshape(-1, 3).mean(0).tolist(),
        'horA': px[hz][:, away].reshape(-1, 3).mean(0).tolist(),
        'sun': (sunC * scale / max(sunC.max() * scale, 1e-6)).tolist(),
    }
    meta[key] = {'src': name, 'sunU': sun_u, 'sunEl': float(sun_el), 'night': night, 'scale': scale, **pal}
    # crop + encode
    r0 = int(round((EL_MIN + 90) / 180 * H)); crop = px[r0:][::-1]          # top row = zenith
    Lr = crop / (1 + crop); enc = np.clip(Lr, 0, 1) ** (1 / 2.2)
    im = Image.fromarray((enc * 255 + 0.5).astype(np.uint8))
    im.save(f'{OUT}/4k/{key}.jpg', quality=93, subsampling=0)
    im.resize((W // 2, crop.shape[0] // 2), Image.LANCZOS).save(f'{OUT}/2k/{key}.jpg', quality=92, subsampling=0)
    print('SKY', key, name, 'sun u %.3f el %.1f' % (sun_u, sun_el), 'scale %.3g' % scale, 'zen', np.round(pal['zenith'], 3), flush=True)
json.dump({'elMin': EL_MIN, 'keys': meta}, open(f'{OUT}/skies.json', 'w'), indent=1)
