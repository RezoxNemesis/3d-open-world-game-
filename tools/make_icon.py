from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
S = 1024
im = Image.new('RGB', (S, S))
d = ImageDraw.Draw(im)
for y in range(S):
    t = y / S
    top, mid, bot = (40, 20, 70), (255, 120, 60), (255, 200, 110)
    c = [int(top[i] + (mid[i] - top[i]) * min(t / 0.55, 1)) if t < 0.55 else int(mid[i] + (bot[i] - mid[i]) * (t - 0.55) / 0.45) for i in range(3)]
    d.line([(0, y), (S, y)], fill=tuple(c))
d.ellipse([S * 0.33, S * 0.42, S * 0.67, S * 0.76], fill=(255, 225, 150))
d.rectangle([0, S * 0.66, S, S], fill=(25, 50, 80))
for k in range(14):
    y = S * 0.68 + k * 22
    d.line([(S * 0.36 + k * 6, y), (S * 0.64 - k * 6, y)], fill=(255, 190, 120), width=5)
d.polygon([(0, S * 0.66), (S * 0.42, S * 0.66), (S * 0.42, S * 0.58), (S * 0.47, S * 0.58), (S * 0.47, S * 0.7), (S * 0.3, S * 0.78), (0, S * 0.84)], fill=(30, 18, 30))
for x in range(0, int(S * 0.42), 40):
    d.rectangle([x, S * 0.62, x + 22, S * 0.66], fill=(30, 18, 30))
def palm(x, base, h, lean):
    pts = []
    for i in range(30):
        t = i / 29
        pts.append((x + lean * t * t * h * 0.3, base - t * h))
    for i in range(len(pts) - 1):
        d.line([pts[i], pts[i + 1]], fill=(20, 12, 20), width=int(26 - 12 * i / 30))
    tx, ty = pts[-1]
    for a in range(9):
        ang = a / 9 * math.pi * 2
        ex, ey = tx + math.cos(ang) * h * 0.38, ty + math.sin(ang) * h * 0.18 + h * 0.1
        d.line([(tx, ty), ((tx + ex) / 2, ty - h * 0.06), (ex, ey)], fill=(20, 12, 20), width=16, joint='curve')
palm(S * 0.82, S * 0.9, S * 0.62, -1)
palm(S * 0.14, S * 0.95, S * 0.5, 1)
try:
    f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 150)
    f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 110)
except Exception:
    f = f2 = ImageFont.load_default()
for txt, y, ff in (('DAMAN', S * 0.08, f), ('DUO', S * 0.24, f2)):
    w = d.textlength(txt, font=ff)
    d.text(((S - w) / 2 + 6, y + 6), txt, font=ff, fill=(0, 0, 0))
    d.text(((S - w) / 2, y), txt, font=ff, fill=(255, 245, 225))
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S, S], radius=180, fill=255)
out = Image.new('RGBA', (S, S), (0, 0, 0, 0)); out.paste(im, (0, 0), mask)
out.save('build/icon.png')
print('icon ok')
