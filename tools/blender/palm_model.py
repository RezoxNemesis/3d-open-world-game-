# Blender (bpy): build a game-ready coconut palm (Cocos nucifera) on the painted atlas and export GLB.
# Curved, tapering ringed trunk with a flared base; a crown of ~22 V-folded arching fronds (golden-angle spiral,
# young fronds upright, old ones drooping), 5 dried fronds hanging under the crown, frond-base fibre and a coconut
# cluster. One material (alpha-masked atlas) so the game can instance it. Optional Cycles preview render.
import bpy, bmesh, math, random, sys, mathutils
from mathutils import Vector

OUT = '/home/claude/blendwork/out'
random.seed(11)
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
bpy.ops.wm.read_factory_settings(use_empty=True)
LOD = 'lod' in args   # far version: fewer fronds and segments (~600 tris)
NAME = 'palm_coconut_lod' if LOD else 'palm_coconut'

V, UV, F, N = [], [], [], []           # per-face-corner UVs and custom normals
def quad(a, b, c, d, ua, ub, uc, ud, na=None, nb=None, nc=None, nd=None):
    base = len(V); V.extend([a, b, c, d]); F.append((base, base + 1, base + 2, base + 3)); UV.append((ua, ub, uc, ud))
    N.append((na, nb, nc, nd))

# ---------- trunk ----------
H, SIDES, RINGS = 9.6, (6 if LOD else 10), (7 if LOD else 22)
lean = Vector((0.55, 0.15, 0))
def axis(t): return Vector((lean.x * t ** 1.7 + 0.08 * math.sin(t * 5.0), lean.y * t ** 1.4, H * t))
def radius(t): return 0.17 + 0.07 * (1 - t) + 0.12 * math.exp(-t * 28)
def ring(t):
    p, p2 = axis(t), axis(min(t + 0.01, 1)); T = (p2 - p).normalized(); S = T.cross(Vector((0, 1, 0))).normalized(); B = S.cross(T)
    out = []
    for k in range(SIDES + 1):
        a = k / SIDES * 2 * math.pi; n = (S * math.cos(a) + B * math.sin(a)).normalized(); out.append((p + n * radius(t), n))
    return out
prev = ring(0)
for r in range(1, RINGS + 1):
    t = r / RINGS; cur = ring(t)
    for k in range(SIDES):
        # trunk = bottom-left quadrant of the atlas: u around 0..0.5, v height 0..0.5
        u0, u1 = k / SIDES * 0.5, (k + 1) / SIDES * 0.5; v0, v1 = (r - 1) / RINGS * 0.5, t * 0.5
        quad(prev[k][0], cur[k][0], cur[k + 1][0], prev[k + 1][0], (u0, v0), (u0, v1), (u1, v1), (u1, v0), prev[k][1], cur[k][1], cur[k + 1][1], prev[k + 1][1])
    prev = cur
C = axis(1.0) + Vector((0, 0, 0.05))

# ---------- fronds ----------
def frond(az, el0, L, droop, fold, maxw, dry=False):
    d = Vector((math.cos(az), math.sin(az), 0)); seg = 5 if LOD else 12
    pts = []
    for i in range(seg + 1):
        s = i / seg; a = el0 - droop * s ** 1.6
        pts.append(a)
    P = [C.copy()]
    for i in range(1, seg + 1):
        a = pts[i]; step = L / seg
        P.append(P[-1] + (d * math.cos(a) + Vector((0, 0, math.sin(a)))) * step)
    for side in (-1, 1):
        for i in range(seg):
            q = []
            for j in (i, i + 1):
                s = j / seg; p = P[j]; T = (P[min(j + 1, seg)] - P[max(j - 1, 0)]).normalized()
                Sd = T.cross(Vector((0, 0, 1))).normalized() * side; U = Sd.cross(T) * side
                if U.z < 0: U = -U
                w = maxw * (0.0 if s < 0.12 else math.sin(math.pi * min((s - 0.12) / 0.88 * 1.05 + 0.04, 1)) ** 0.5)
                f = fold - (0.6 * s if not dry else 0.3)        # leaflets droop more toward the tip
                e = p + (Sd * math.cos(f) + U * math.sin(f)) * w
                nrm = (U * 0.8 + Sd * 0.25 + Vector((0, 0, 0.6))).normalized()
                if dry: uu, vr, ve = 0.5 + s * 0.5, 0.375, 0.375 + side * 0.125
                else: uu, vr, ve = s, 0.75, 0.75 - side * 0.25
                q.append((p, e, (uu, vr), (uu, ve), nrm))
            (p0, e0, r0, t0, n0), (p1, e1, r1, t1, n1) = q
            if side > 0: quad(p0, p1, e1, e0, r0, r1, t1, t0, n0, n1, n1, n0)
            else: quad(p0, e0, e1, p1, r0, t0, t1, r1, n0, n0, n1, n1)

NF = 15 if LOD else 26
for i in range(NF):
    age = i / (NF - 1)
    az = i * math.radians(137.5) + random.uniform(-0.1, 0.1)
    frond(az, math.radians(68 - 75 * age + random.uniform(-6, 6)), 4.1 + 1.7 * math.sin(math.pi * min(age * 1.15, 1)) + random.uniform(-0.25, 0.25),
          0.45 + 1.25 * age + random.uniform(-0.1, 0.1), math.radians(30 - 22 * age), 1.0 + 0.18 * random.random())
for i in range(2 if LOD else 5):
    frond(i * 1.3 + 0.4, math.radians(-55 - random.uniform(0, 20)), 2.6 + random.uniform(0, 0.6), 0.25, math.radians(-10), 0.45, dry=True)

# ---------- crown fibre (frond bases) + coconuts ----------
bm_extra = []
def blob(center, rx, ry, rz, uvrect, seg=8, rings=5):
    u0, v0, u1, v1 = uvrect
    for r in range(rings):
        for k in range(seg):
            pts = []
            for (rr, kk) in ((r, k), (r + 1, k), (r + 1, k + 1), (r, k + 1)):
                th = rr / rings * math.pi; ph = kk / seg * 2 * math.pi
                n = Vector((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
                pts.append((center + Vector((n.x * rx, n.y * ry, n.z * rz)), n, (u0 + (u1 - u0) * kk / seg, v0 + (v1 - v0) * rr / rings)))
            quad(*[p[0] for p in pts], *[p[2] for p in pts], *[p[1] for p in pts])
blob(C + Vector((0, 0, -0.15)), 0.42, 0.42, 0.55, (0.75, 0.0, 1.0, 0.25), 6 if LOD else 8, 3 if LOD else 5)
for k in range(0 if LOD else 9):
    a = k / 9 * 2 * math.pi + random.uniform(-0.2, 0.2)
    blob(C + Vector((math.cos(a) * 0.32, math.sin(a) * 0.32, -0.55 - random.uniform(0, 0.25))), 0.13, 0.13, 0.15, (0.5, 0.0, 0.75, 0.25), 6, 4)

# ---------- mesh ----------
me = bpy.data.meshes.new('palm'); me.from_pydata([tuple(v) for v in V], [], F); me.update()
uvl = me.uv_layers.new(name='UVMap')
for fi, poly in enumerate(me.polygons):
    for li, loop in zip(poly.loop_indices, range(4)): uvl.data[li].uv = UV[fi][loop]
cn = []
for fi, poly in enumerate(me.polygons):
    for k in range(4):
        n = N[fi][k]; cn.append(tuple(n) if n is not None else tuple(poly.normal))
me.normals_split_custom_set(cn)
ob = bpy.data.objects.new(NAME, me); bpy.context.scene.collection.objects.link(ob)
img = bpy.data.images.load(f'{OUT}/palm_atlas.png')
mat = bpy.data.materials.new('palm'); mat.use_nodes = True; nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img
nt.links.new(tx.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(tx.outputs['Alpha'], bsdf.inputs['Alpha'])
bsdf.inputs['Roughness'].default_value = 0.6
mat.blend_method = 'CLIP' if hasattr(mat, 'blend_method') else None
try: mat.surface_render_method = 'DITHERED'
except Exception: pass
me.materials.append(mat)
print('palm tris', sum(len(p.vertices) - 2 for p in me.polygons))
for res in ('2k', '1k'):
    if res == '1k': img.scale(1024, 1024)
    bpy.ops.export_scene.gltf(filepath=f'{OUT}/{res}/{NAME}.glb', export_format='GLB', export_image_format=('NONE' if LOD else 'AUTO'), export_yup=True, export_normals=True, export_tangents=False)

if 'render' in args:
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.device = 'CPU'
    sc.render.resolution_x, sc.render.resolution_y = 720, 900
    img.reload()
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; wn = w.node_tree
    env = wn.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load('/tmp/hdr/src/kloofendal_48d_partly_cloudy.hdr')
    wn.links.new(env.outputs['Color'], wn.nodes['Background'].inputs['Color'])
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 4; so = bpy.data.objects.new('sun', sun); so.rotation_euler = (math.radians(40), 0, math.radians(30)); sc.collection.objects.link(so)
    gp = bpy.data.meshes.new('g'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30); bm.to_mesh(gp)
    go = bpy.data.objects.new('ground', gp); sc.collection.objects.link(go)
    gm = bpy.data.materials.new('sand'); gm.use_nodes = True; gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.55, 0.47, 0.36, 1); gp.materials.append(gm)
    cam = bpy.data.cameras.new('c'); cam.lens = 30; co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
    co.location = (17, -20, 7.5); co.rotation_euler = (math.radians(80), 0, math.radians(40))
    sc.render.filepath = f'{OUT}/palm_render.png'; bpy.ops.render.render(write_still=True)
    print('render done')
