# Paint the coconut-palm texture atlas (2048x2048 RGBA):
#   top half      - green frond: rachis along x (v = 0.75), leaflets up (left half) and down (right half)
#   bottom-left   - trunk bark with leaf-scar rings
#   bottom-right  - upper: dried brown frond; lower-left: coconut husk; lower-right: frond-base fibre
import numpy as np, math, random
from PIL import Image, ImageDraw, ImageFilter

S = 2  # supersampling
W = 2048
random.seed(7); rng = np.random.default_rng(7)

def frond(w, h, dry=False, density=1.0):
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    mid = h * S / 2
    x0 = int(w * S * 0.13)
    step = int(13 * S / density)
    for x in range(x0, w * S - 6 * S, step):
        t = (x - x0) / (w * S - x0)                      # 0 at the first leaflet, 1 at the tip
        for side in (-1, 1):
            if random.random() < (0.12 if dry else 0.04): continue          # gaps / torn leaflets
            L = (mid - 4 * S) * (0.82 + 0.16 * random.random()) * (0.55 + 0.45 * math.sin(math.pi * min(t * 1.05 + 0.05, 1)) ** 0.5)
            ang = math.radians(48 + 18 * random.random() + (12 if dry else 0))     # leaflets sweep toward the tip
            wid = (9 + 5 * random.random()) * S * (0.7 if dry else 1)
            bend = (random.random() - 0.3) * 0.25
            cl, nl = [], []
            for k in range(13):
                u = k / 12; a = ang + bend * u
                cx, cy = x + math.cos(a) * L * u * 0.55, mid + side * math.sin(a) * L * u
                ww = wid * (math.sin(math.pi * min(u * 1.15 + 0.04, 1)) ** 0.7) * (1 - u * 0.35)
                tx, ty = math.cos(a) * 0.55, side * math.sin(a); tl = math.hypot(tx, ty); tx, ty = tx / tl, ty / tl
                cl.append((cx, cy)); nl.append((-ty * ww * 0.5, tx * ww * 0.5))
            poly = [(c[0] + n[0], c[1] + n[1]) for c, n in zip(cl, nl)] + [(c[0] - n[0], c[1] - n[1]) for c, n in zip(cl, nl)][::-1]
            pts_l = cl
            if dry:
                base = np.array([150, 112, 62]) * (0.7 + 0.45 * random.random())
            else:
                g = 0.65 + 0.5 * random.random()
                base = np.array([58, 112, 30]) * g + np.array([30, 25, -5]) * t * random.random()
            col = tuple(int(c) for c in np.clip(base, 0, 255)) + (255,)
            d.polygon(poly, fill=col)
            # midrib highlight and a dry tip now and then
            d.line([pts_l[1], pts_l[-2]], fill=tuple(int(min(255, c * 1.25)) for c in col[:3]) + (255,), width=max(1, S))
            if not dry and random.random() < 0.18:
                tip = pts_l[-4:]; d.line(tip, fill=(140, 120, 60, 255), width=int(wid * 0.5))
    # rachis
    for x in range(0, w * S, S):
        t = x / (w * S); th = (16 - 12 * t) * S * (1.2 if dry else 1)
        c = (int(150 - 40 * t), int(140 - 20 * t), 70) if not dry else (120, 92, 55)
        d.line([(x, mid - th / 2), (x, mid + th / 2)], fill=c + (255,), width=S)
    return im.resize((w, h), Image.LANCZOS)

def bark(w, h):
    y = np.arange(h)[:, None]; x = np.arange(w)[None, :]
    n = rng.normal(0, 1, (h, w)); n = np.array(Image.fromarray(((n * 20) + 128).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255 - 0.5
    ringp = 11.0; ph = (y + 3 * np.sin(x / w * 2 * math.pi * 2 + y * 0.05)) % ringp / ringp
    ring = np.exp(-((ph - 0.15) ** 2) / 0.004)
    fiss = (np.array(Image.fromarray((rng.random((h // 8, w)) * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR), np.float32) / 255)
    fiss = np.clip((fiss - 0.82) * 6, 0, 1)
    base = np.array([118, 106, 92], np.float32)
    v = 1 + n * 0.5 - ring * 0.42 - fiss * 0.3 + 0.08 * np.sin(y / h * 40)
    img = (base[None, None, :] * v[..., None]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(img).convert('RGBA')

def swatch(w, h, c0, c1, scale):
    n = np.array(Image.fromarray((rng.random((h // scale, w // scale)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
    img = (np.array(c0)[None, None, :] * (1 - n[..., None]) + np.array(c1)[None, None, :] * n[..., None]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(img).convert('RGBA')

atlas = Image.new('RGBA', (W, W), (0, 0, 0, 0))
atlas.paste(frond(2048, 1024, density=1.35), (0, 0))
atlas.paste(bark(1024, 1024), (0, 1024))
atlas.paste(frond(1024, 512, dry=True, density=0.8), (1024, 1024))
atlas.paste(swatch(512, 512, (70, 110, 30), (150, 140, 50), 16), (1024, 1536))
atlas.paste(swatch(512, 512, (60, 42, 26), (120, 92, 60), 4), (1536, 1536))
# dilate colour into the transparent areas so mip-mapped leaf edges stay green instead of fading to black
a = np.array(atlas, np.float32); rgb, al = a[..., :3], a[..., 3:] / 255
acc, wt = rgb * al, al.copy()
for r in (2, 6, 16, 40):
    b1 = np.array(Image.fromarray((acc).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), np.float32)
    b2 = np.array(Image.fromarray((wt[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), np.float32)[..., None] / 255
    fill = b1 / np.maximum(b2, 1e-3)
    rgb = np.where(al > 0.5, rgb, np.where(b2 > 0.02, fill, rgb))
out = np.concatenate([rgb.clip(0, 255), a[..., 3:]], -1).astype(np.uint8)
Image.fromarray(out).save('/home/claude/blendwork/out/palm_atlas.png')
print('atlas ok')
