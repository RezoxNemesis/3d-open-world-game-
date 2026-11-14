# Mira's tactical look from the Rocketbox Military_Female_01 avatar (MIT): the ACU camo becomes black/charcoal tactical
# fabric, the plate carrier and pouches go dark olive-black, boots and gloves black leather; the face gets a warm Indian
# skin tone, dark brown hair and brown eyes. Regions come from the mesh itself (UV triangles rasterised by body part).
import bpy, bmesh, os, sys, math
import numpy as np
from mathutils import Vector

SRC = '/home/claude/microsoft/microsoft-rocketbox/Assets/Avatars/Professions/Military_Female_01'
OUT = os.environ.get('DD_OUT') or '/home/claude/blendwork/out/mira'
os.makedirs(OUT, exist_ok=True)

def load(name):
    im = bpy.data.images.load(f'{SRC}/Textures/{name}.tga'); w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, :3]; return a, w, h

def save(a, name, size=1024, q=90):
    from PIL import Image
    img = Image.fromarray((np.clip(a[::-1], 0, 1) * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
    img.save(f'{OUT}/{name}', quality=q)

def raster(mesh, mat_index, w, h, pred):
    """mask of texels whose triangle (by its vertices' positions) satisfies pred(centroid, verts)"""
    from PIL import Image, ImageDraw
    m = Image.new('L', (w, h), 0); d = ImageDraw.Draw(m)
    uv = mesh.uv_layers.active.data
    for p in mesh.polygons:
        if p.material_index != mat_index: continue
        vs = [mesh.vertices[v].co for v in p.vertices]; c = sum(vs, Vector()) / len(vs)
        if not pred(c, vs): continue
        pts = [(uv[li].uv[0] * w, (1 - uv[li].uv[1]) * h) for li in p.loop_indices]
        d.polygon(pts, fill=255)
    a = np.array(m, dtype=np.float32)[::-1] / 255.0      # flip to Blender's bottom-up pixel order
    return a

def blur(a, r=3):
    from PIL import Image, ImageFilter
    img = Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)); return np.array(img, dtype=np.float32) / 255.0

def lum(a): return a[:, :, 0] * 0.3 + a[:, :, 1] * 0.59 + a[:, :, 2] * 0.11

def fabric(a, mask, base, contrast=0.9):
    L = lum(a); mL = max(1e-3, float((L * mask).sum() / max(mask.sum(), 1)))
    k = np.clip((L / mL) ** contrast, 0.35, 2.2)[:, :, None]
    out = np.array(base, dtype=np.float32)[None, None, :] * k
    return a * (1 - mask[:, :, None]) + out * mask[:, :, None]

def skin_tone(a, mask, target):
    m = mask[:, :, None]; mean = (a * m).reshape(-1, 3).sum(0) / max(mask.sum(), 1)
    k = np.array(target, dtype=np.float32) / np.maximum(mean, 1e-3)
    return a * (1 - m) + np.clip(a * k, 0, 1) * m

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=f'{SRC}/Export/Military_Female_01.fbx')
ob = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
ob.data.transform(ob.matrix_world); ob.matrix_world.identity()   # work in world space (z up, ~1.77 m tall)
me = ob.data; mats = [m.name for m in me.materials]
MI = {k: next(i for i, n in enumerate(mats) if k in n) for k in ('body', 'head', 'equipment')}
zs = [v.co.z for v in me.vertices]; top = max(zs)
hv = [me.vertices[v].co for p in me.polygons if p.material_index == MI['head'] for v in p.vertices]
hcy = sum(v.y for v in hv) / len(hv); hz0 = min(v.z for v in hv); hz1 = max(v.z for v in hv)
print('top', round(top, 3), 'head z', round(hz0, 3), round(hz1, 3), 'cy', round(hcy, 3), flush=True)

# ---- body: black jacket, charcoal trousers, black boots and gloves; keep the skin at the neck
body, w, h = load('sf003_body_color_acu')
skin_b = raster(me, MI['body'], w, h, lambda c, vs: c.z > 1.36 and abs(c.x) < 0.12)
hsvsat = (body.max(2) - body.min(2)) / np.maximum(body.max(2), 1e-3)
skinlike = ((body[:, :, 0] > body[:, :, 2] * 1.15) & (hsvsat > 0.18) & (body.max(2) > 0.25)).astype(np.float32)
skin_b = blur(skin_b * skinlike, 1.5)
lower = raster(me, MI['body'], w, h, lambda c, vs: c.z < 0.98)
boots = raster(me, MI['body'], w, h, lambda c, vs: c.z < 0.2)
hands = raster(me, MI['body'], w, h, lambda c, vs: abs(c.x) > 0.5)
cloth = np.clip(1 - skin_b, 0, 1)
out = fabric(body, cloth * (1 - lower) * (1 - hands), (0.052, 0.054, 0.058))
out = fabric(out, cloth * lower * (1 - boots), (0.1, 0.098, 0.092), 0.95)
out = fabric(out, cloth * boots, (0.035, 0.032, 0.03), 1.1)
out = fabric(out, cloth * hands * (1 - lower), (0.04, 0.04, 0.042), 1.0)
out = skin_tone(out, skin_b, (0.5, 0.33, 0.24))
save(out, 'body_c.jpg')

# ---- equipment (plate carrier, pouches, radio, knee pads): dark olive-black
eq, w2, h2 = load('sf003_equipment_color_acu')
allm = np.ones((h2, w2), dtype=np.float32)
save(fabric(eq, allm, (0.07, 0.072, 0.06), 1.0), 'equip_c.jpg')

# ---- head: warm skin, dark hair (painted on the scalp), brown eyes
hd, w3, h3 = load('sf003_head_color')
yy, xx = np.mgrid[0:h3, 0:w3]; ytop = (h3 - 1 - yy) / h3; xn = xx / w3          # ytop: 0 at the top of the image
parts = ((xn < 0.37) & (ytop > 0.6)).astype(np.float32)                      # eyeballs, teeth, tongue live in the bottom-left corner
core = raster(me, MI['head'], w3, h3, lambda c, vs: c.z > hz1 - 0.074 or (c.y > hcy + 0.025 and c.z > hz0 + 0.135))
broad = raster(me, MI['head'], w3, h3, lambda c, vs: c.z > hz1 - 0.088)
br = hd[:, :, 2] / np.maximum(hd[:, :, 0], 1e-3)
hairish = np.clip((0.66 - br) / 0.1, 0, 1)                                   # blonde hair is yellower than skin
hairm = blur(np.clip(blur(core, 7) * 1.15, 0, 1) * (1 - parts), 2)
hsat = (hd.max(2) - hd.min(2)) / np.maximum(hd.max(2), 1e-3)
skin_h = ((hd[:, :, 0] > hd[:, :, 2] * 1.1) & (hsat > 0.12)).astype(np.float32) * (1 - parts)
hd2 = skin_tone(hd, blur(skin_h, 2) * (1 - hairm), (0.5, 0.33, 0.24))
Lh = lum(hd); hair = np.stack([Lh * 0.3 + 0.012, Lh * 0.2 + 0.008, Lh * 0.15 + 0.006], 2)
hd2 = hd2 * (1 - hairm[:, :, None]) + hair * hairm[:, :, None]
# iris: the bluish/grey disc inside the eye texture -> warm dark brown
iris = ((hd[:, :, 2] > hd[:, :, 0] * 1.0) & (hd.max(2) > 0.12)).astype(np.float32) * parts
Lb = lum(hd); brown = np.stack([Lb * 0.7 + 0.03, Lb * 0.42 + 0.015, Lb * 0.22 + 0.01], 2)
bm_ = blur(iris, 1)[:, :, None]
hd2 = hd2 * (1 - bm_) + brown * bm_
save(hd2, 'head_c.jpg')

# normal / specular maps pass straight through (resized)
for src, dst in (('sf003_body_normal', 'body_n.jpg'), ('sf003_body_specular', 'body_s.jpg'), ('sf003_head_normal', 'head_n.jpg'), ('sf003_head_specular', 'head_s.jpg'), ('sf003_equipment_normal', 'equip_n.jpg')):
    a, _, _ = load(src); save(a, dst, 1024 if 'normal' in src or dst.startswith('equip') else 512)
print('DONE', flush=True)
