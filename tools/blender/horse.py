# Blender: realistic horse for Daman Duo. Anatomical lofts (barrel, hindquarters, chest, arched neck, head with jowls,
# muscled legs with knees, hocks, fetlocks and hooves) are unioned with a voxel remesh, smoothed and decimated into one
# skin, weighted to the game's horse skeleton (body, 4 x hip/knee, neck, head, tail) and exported as a skinned glTF.
# Vertex data: COLOR_0 = fixed colour x AO (hooves, eyes, mane, tail), TEXCOORD_0 = (coat mask: 1 coat, 0.5 points, 0 fixed, AO).
# Game coordinates in specs (x right, y up, z forward); Blender = (x, -z, y).
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
from carbody import pchip, lerp, sstep, G, link, new_obj, apply_all

OUT = os.environ.get('DD_OUT') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'horse')

# skeleton (game coords): bone head positions; the game rebuilds exactly these
BODY_Y = 1.416
BONES = {
    'body': ((0, BODY_Y, 0.0), None),
    'hip_fl': ((0.17, 1.13, 0.6), 'body'), 'knee_fl': ((0.18, 0.5, 0.63), 'hip_fl'),
    'hip_fr': ((-0.17, 1.13, 0.6), 'body'), 'knee_fr': ((-0.18, 0.5, 0.63), 'hip_fr'),
    'hip_hl': ((0.2, 1.2, -0.6), 'body'), 'knee_hl': ((0.19, 0.55, -0.76), 'hip_hl'),
    'hip_hr': ((-0.2, 1.2, -0.6), 'body'), 'knee_hr': ((-0.19, 0.55, -0.76), 'hip_hr'),
    'neck': ((0, 1.36, 0.74), 'body'), 'head': ((0, 1.98, 1.08), 'neck'), 'tail': ((0, 1.42, -0.96), 'body'),
}

def ring_loft(centers, radii, N=20, n=2.2, caps=True, name='part'):
    """centers: game points along an axis; radii: (half-width, half-depth, offset-down) per point. Section in the plane
    perpendicular to the axis, 'width' along x, 'depth' in the sagittal plane."""
    bm = bmesh.new(); rings = []
    for i, (c, (hw, hd, od)) in enumerate(zip(centers, radii)):
        c = Vector(c); a = Vector(centers[min(i + 1, len(centers) - 1)]) - Vector(centers[max(i - 1, 0)]); a.normalize()
        side = Vector((1, 0, 0)); up = a.cross(side).normalized()           # in the sagittal plane, perpendicular to the axis
        if up.y < 0: up = -up
        ring = []
        for k in range(N):
            t = 2 * math.pi * k / N; ct, st = math.cos(t), math.sin(t)
            x = hw * math.copysign(abs(ct) ** (2 / n), ct); y = hd * math.copysign(abs(st) ** (2 / n), st)
            p = c + side * x + up * (y - od)
            ring.append(bm.verts.new(G(*p)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(N): bm.faces.new((a[k], a[(k + 1) % N], b[(k + 1) % N], b[k]))
    if caps:
        for r in (rings[0], rings[-1]):
            cc = bm.verts.new(sum((v.co for v in r), Vector()) / N)
            for k in range(N): bm.faces.new((r[k], r[(k + 1) % N], cc))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm)

def torso():
    top = pchip([(-1.0, 1.22), (-0.95, 1.38), (-0.86, 1.48), (-0.72, 1.535), (-0.55, 1.54), (-0.35, 1.5), (-0.1, 1.46), (0.15, 1.47), (0.35, 1.52), (0.5, 1.58), (0.6, 1.6), (0.7, 1.53), (0.8, 1.38), (0.88, 1.22), (0.94, 1.08)])
    bot = pchip([(-1.0, 1.1), (-0.95, 1.0), (-0.86, 0.95), (-0.72, 0.93), (-0.55, 0.9), (-0.35, 0.83), (-0.1, 0.78), (0.15, 0.76), (0.35, 0.77), (0.5, 0.8), (0.6, 0.84), (0.7, 0.88), (0.8, 0.92), (0.88, 0.96), (0.94, 1.0)])
    hw = pchip([(-1.0, 0.1), (-0.95, 0.2), (-0.86, 0.27), (-0.72, 0.3), (-0.55, 0.3), (-0.35, 0.31), (-0.1, 0.33), (0.15, 0.335), (0.35, 0.31), (0.5, 0.27), (0.6, 0.25), (0.7, 0.24), (0.8, 0.21), (0.88, 0.16), (0.94, 0.08)])
    zz = [lerp(-1.0, 0.94, k / 44) for k in range(45)]
    cs = [(0, (top(z) + bot(z)) / 2, z) for z in zz]; rs = [(hw(z), (top(z) - bot(z)) / 2, 0) for z in zz]
    return ring_loft(cs, rs, N=28, n=2.3, name='torso')

def hindquarters():
    P = []
    for sx in (-1, 1):   # rounded gluteal / thigh masses over the hind legs
        cs = [(sx * 0.14, 1.4, -0.84), (sx * 0.17, 1.28, -0.72), (sx * 0.18, 1.12, -0.63), (sx * 0.18, 0.96, -0.6)]
        rs = [(0.1, 0.12, 0), (0.12, 0.18, 0), (0.11, 0.18, 0), (0.08, 0.12, 0)]
        P.append(ring_loft(cs, rs, N=18, n=2.0, name='thigh'))
        cs = [(sx * 0.15, 1.36, 0.6), (sx * 0.17, 1.14, 0.62), (sx * 0.17, 0.96, 0.6)]          # shoulder / triceps
        rs = [(0.08, 0.13, 0), (0.09, 0.15, 0), (0.075, 0.1, 0)]
        P.append(ring_loft(cs, rs, N=18, n=2.0, name='shoulder'))
    return P

def neck_head():
    cs = [(0, 1.22, 0.62), (0, 1.38, 0.78), (0, 1.56, 0.9), (0, 1.74, 0.99), (0, 1.9, 1.05), (0, 2.0, 1.08)]
    rs = [(0.2, 0.34, 0.06), (0.16, 0.28, 0.04), (0.13, 0.22, 0.02), (0.11, 0.17, 0.01), (0.095, 0.14, 0.0), (0.09, 0.12, 0.0)]
    P = [ring_loft(cs, rs, N=22, n=2.1, name='neck')]
    # head: poll -> jowls -> face -> muzzle, pointing forward and down
    ax = Vector((0, -0.72, 0.69)).normalized(); o = Vector((0, 2.02, 1.05))
    pts = [0.0, 0.07, 0.16, 0.27, 0.38, 0.47, 0.54, 0.58]
    rad = [(0.09, 0.1, 0.0), (0.11, 0.15, 0.06), (0.105, 0.155, 0.07), (0.08, 0.1, 0.025), (0.068, 0.08, 0.005), (0.068, 0.078, 0.0), (0.064, 0.07, 0.0), (0.045, 0.048, 0.0)]
    P.append(ring_loft([tuple(o + ax * t) for t in pts], rad, N=22, n=2.2, name='head'))
    return P

def legs():
    P = []
    for sx in (-1, 1):
        x = sx * 0.18
        # fore leg: forearm -> knee -> cannon -> fetlock -> pastern -> hoof
        cs = [(x, 1.0, 0.59), (x, 0.82, 0.6), (x, 0.66, 0.61), (x, 0.52, 0.625), (x, 0.4, 0.63), (x, 0.24, 0.635), (x, 0.15, 0.64), (x, 0.09, 0.66), (x, 0.06, 0.675), (x, 0.0, 0.69)]
        rs = [(0.085, 0.11, 0), (0.07, 0.085, 0), (0.05, 0.06, 0), (0.052, 0.062, 0), (0.038, 0.046, 0), (0.037, 0.044, 0), (0.048, 0.056, 0), (0.038, 0.044, 0), (0.05, 0.055, 0), (0.06, 0.065, 0)]
        P.append(ring_loft(cs, rs, N=16, n=2.2, name='fore'))
        # hind leg: gaskin -> hock (point sticks back) -> cannon -> fetlock -> pastern -> hoof
        cs = [(x, 1.02, -0.58), (x, 0.84, -0.64), (x, 0.68, -0.71), (x, 0.56, -0.76), (x, 0.44, -0.735), (x, 0.28, -0.715), (x, 0.15, -0.69), (x, 0.09, -0.66), (x, 0.06, -0.645), (x, 0.0, -0.63)]
        rs = [(0.09, 0.15, 0), (0.07, 0.1, 0), (0.055, 0.075, 0), (0.048, 0.07, 0), (0.04, 0.05, 0), (0.038, 0.046, 0), (0.048, 0.056, 0), (0.038, 0.044, 0), (0.05, 0.055, 0), (0.06, 0.065, 0)]
        P.append(ring_loft(cs, rs, N=16, n=2.2, name='hind'))
    return P

def tail_dock():
    cs = [(0, 1.4, -0.9), (0, 1.38, -1.02), (0, 1.25, -1.08), (0, 1.1, -1.1)]
    return ring_loft(cs, [(0.05, 0.06, 0), (0.045, 0.05, 0), (0.035, 0.04, 0), (0.02, 0.025, 0)], N=12, name='dock')

def strands(paths, width, name):
    """hair strands: flat ribbons (two-sided via thickness) along game-space polylines"""
    bm = bmesh.new()
    for pts, w in paths:
        prev = None
        for i, p in enumerate(pts):
            p = Vector(p); d = Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)]); d.normalize()
            side = d.cross(Vector((0, 1, 0)))
            if side.length < 0.2: side = Vector((1, 0, 0))
            side.normalize(); ww = w * (1 - 0.7 * i / (len(pts) - 1))
            a, b = bm.verts.new(G(*(p - side * ww))), bm.verts.new(G(*(p + side * ww)))
            if prev: bm.faces.new((prev[0], prev[1], b, a))
            prev = (a, b)
    o = new_obj(name, bm)
    m = o.modifiers.new('s', 'SOLIDIFY'); m.thickness = 0.004; m.offset = 0; apply_all(o)
    return o

def mane_tail():
    import random; rnd = random.Random(7)
    paths = []
    for k in range(90):   # crest mane falling to the off side
        t = k / 89; base = Vector((0, lerp(1.5, 2.03, t), lerp(0.66, 1.05, t)))
        base += Vector((0, 0.13 - 0.04 * t, -0.07))   # on top of the crest
        L = lerp(0.32, 0.18, t) * (0.8 + 0.4 * rnd.random()); sx = 0.05 + 0.03 * rnd.random()
        sx = sx * (1 if k % 3 else -0.6); base += Vector(((rnd.random() - 0.5) * 0.03, 0, 0))
        paths.append(([tuple(base), tuple(base + Vector((sx, -L * 0.45, -0.02))), tuple(base + Vector((sx * 1.6, -L, -0.03)))], 0.012))
    for k in range(9):    # forelock
        b = Vector(((k - 4) * 0.008, 2.07, 1.06)); paths.append(([tuple(b), tuple(b + Vector((0, -0.08, 0.1))), tuple(b + Vector(((k - 4) * 0.01, -0.17, 0.14)))], 0.012))
    mane = strands(paths, 0.03, 'mane')
    paths = []
    for k in range(70):   # tail: long flowing strands from the dock
        ang = rnd.uniform(-0.5, 0.5); spread = rnd.uniform(0.0, 0.08); b = Vector((math.sin(ang) * 0.02, 1.38 - rnd.random() * 0.2, -1.02))
        pts = [b, b + Vector((math.sin(ang) * spread * 0.5, -0.25, -0.12)), b + Vector((math.sin(ang) * spread, -0.55, -0.16)), b + Vector((math.sin(ang) * spread * 1.4, -0.85, -0.12)), b + Vector((math.sin(ang) * spread * 1.6, -1.0, -0.08))]
        paths.append(([tuple(p) for p in pts], 0.014))
    tail = strands(paths, 0.035, 'tailhair')
    return mane, tail

def ears_eyes():
    P = []
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_cone_add(radius1=0.035, radius2=0.004, depth=0.15, vertices=10, location=G(sx * 0.055, 2.12, 1.0), rotation=(0, -sx * 0.25, 0))
        e = bpy.context.active_object; e.data.transform(Matrix.Rotation(-0.25, 4, 'X')); P.append(e)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.022, segments=12, ring_count=8, location=G(sx * 0.1, 1.95, 1.17)); P.append(bpy.context.active_object)
    return P

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join(); o = bpy.context.active_object; o.name = name; return o

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts = [torso()] + hindquarters() + neck_head() + legs() + [tail_dock()]
    skin = join(parts, 'horse')
    r = skin.modifiers.new('r', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = 0.011; apply_all(skin)
    sm = skin.modifiers.new('s', 'CORRECTIVE_SMOOTH'); sm.iterations = 14; sm.factor = 0.6; apply_all(skin)
    lp = skin.modifiers.new('l', 'LAPLACIANSMOOTH'); lp.iterations = 3; lp.lambda_factor = 0.4; apply_all(skin)
    d = skin.modifiers.new('d', 'DECIMATE'); d.ratio = 1.0; n0 = len(skin.data.polygons); d.ratio = min(1.0, 8000 / max(n0, 1)); apply_all(skin)
    bpy.ops.object.select_all(action='DESELECT'); skin.select_set(True); bpy.context.view_layer.objects.active = skin; bpy.ops.object.shade_smooth()
    mane, tail = mane_tail(); ee = ears_eyes()
    return skin, mane, tail, ee

def tag(skin, mane, tail, ee):
    """vertex colour + coat mask; then one mesh"""
    def paint(o, fn):
        me = o.data; col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); uv = me.uv_layers.new(name='CM')
        for p in me.polygons:
            for li, vi in zip(p.loop_indices, p.vertices):
                v = me.vertices[vi].co; c, m = fn(Vector((v.x, v.z, -v.y)))
                col.data[li].color = (*c, 1); uv.data[li].uv = (m, 1.0)
    def skin_fn(p):
        y = p.y
        if y < 0.055: return (0.03, 0.025, 0.02), 0.0                          # hoof
        if y < 0.42 and abs(p.x) > 0.08: return (0.04, 0.03, 0.025), 0.5        # points (lower legs)
        return (1, 1, 1), 1.0
    paint(skin, skin_fn)
    paint(mane, lambda p: ((0.03, 0.022, 0.016), 0.5)); paint(tail, lambda p: ((0.03, 0.022, 0.016), 0.5))
    for i, e in enumerate(ee): paint(e, (lambda p: ((1, 1, 1), 1.0)) if i % 2 == 0 else (lambda p: ((0.01, 0.008, 0.006), 0.0)))
    return join([skin, mane, tail] + ee, 'horse')

def weights(o):
    """deterministic skin weights from the joint layout (robust where heat weighting fails)"""
    J = {k: Vector(v[0]) for k, v in BONES.items()}
    groups = {k: o.vertex_groups.new(name=k) for k in BONES}
    for v in o.data.vertices:
        p = Vector((v.co.x, v.co.z, -v.co.y)); w = {}
        front = p.z > 0; sx = 'l' if p.x > 0 else 'r'; leg = ('f' if front else 'h') + sx
        hip, knee = J['hip_' + leg], J['knee_' + leg]
        legTop = 1.0 if front else 1.05
        inleg = abs(p.x) > 0.06 and p.y < legTop + 0.12 and ((front and 0.4 < p.z < 0.85) or (not front and -0.95 < p.z < -0.45))
        tailw = sstep(-0.92, -1.0, p.z) * (1 - sstep(1.0, 1.25, p.y) * 0) if p.y > 0.3 and abs(p.x) < 0.12 else 0.0
        neckw = sstep(0.66, 0.84, p.z + (p.y - 1.3) * 0.25) if p.y > 1.05 else 0.0
        headw = sstep(1.9, 2.04, p.y + (p.z - 1.06) * 0.6) if p.z > 0.95 else 0.0
        if inleg and p.y < legTop + 0.12:
            wb = sstep(legTop - 0.18, legTop + 0.1, p.y)
            wk = sstep(knee.y + 0.07, knee.y - 0.07, p.y)
            w['body'] = wb; w['hip_' + leg] = (1 - wb) * (1 - wk); w['knee_' + leg] = (1 - wb) * wk
        elif headw > 0:
            w['head'] = headw; w['neck'] = 1 - headw
        elif neckw > 0:
            w['neck'] = neckw; w['body'] = 1 - neckw
        elif tailw > 0 and p.z < -0.9:
            w['tail'] = tailw; w['body'] = 1 - tailw
        else: w['body'] = 1.0
        for k, val in w.items():
            if val > 1e-3: groups[k].add([v.index], val, 'REPLACE')

def armature():
    arm = bpy.data.armatures.new('rig'); ao = link(bpy.data.objects.new('rig', arm))
    bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for k, (pos, par) in BONES.items():
        b = arm.edit_bones.new(k); b.head = G(*pos)
        kids = [kk for kk, (pp, pr) in BONES.items() if pr == k]
        b.tail = G(*BONES[kids[0]][0]) if kids and k != 'body' else b.head + Vector((0, 0, 0.15))
        if (b.tail - b.head).length < 1e-3: b.tail = b.head + Vector((0, 0, 0.1))
        eb[k] = b
    for k, (pos, par) in BONES.items():
        if par: eb[k].parent = eb[par]
    bpy.ops.object.mode_set(mode='OBJECT')
    return ao

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    skin, mane, tail, ee = build()
    print('SKIN tris', sum(len(p.vertices) - 2 for p in skin.data.polygons), flush=True)
    horse = tag(skin, mane, tail, ee)
    # AO into the coat mask's second channel and the colours
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 64; sc.render.bake.target = 'VERTEX_COLORS'
    sc.world = bpy.data.worlds.new('w'); sc.world.light_settings.distance = 0.4
    bpy.ops.mesh.primitive_plane_add(size=8); ground = bpy.context.active_object
    me = horse.data; me.materials.append(bpy.data.materials.new('m'))
    ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT'); me.color_attributes.active_color = ao
    bpy.ops.object.select_all(action='DESELECT'); horse.select_set(True); bpy.context.view_layer.objects.active = horse
    bpy.ops.object.bake(type='AO')
    bpy.data.objects.remove(ground, do_unlink=True)
    me = horse.data; aov = [d.color[0] for d in me.color_attributes['AO'].data]; col = me.color_attributes['Col']; cm = me.uv_layers['CM']
    for p in me.polygons:
        for li, vi in zip(p.loop_indices, p.vertices):
            a = 0.35 + 0.65 * aov[vi]; c = col.data[li].color; col.data[li].color = (c[0] * a, c[1] * a, c[2] * a, 1); cm.data[li].uv = (cm.data[li].uv[0], a)
    me.color_attributes.remove(me.color_attributes['AO'])
    ci = [a.name for a in me.color_attributes].index('Col'); me.color_attributes.active_color_index = ci; me.color_attributes.render_color_index = ci
    while me.uv_layers[0].name != 'CM': me.uv_layers.remove(me.uv_layers[0])
    me.materials.clear()
    weights(horse)
    rig = armature()
    horse.parent = rig; mod = horse.modifiers.new('arm', 'ARMATURE'); mod.object = rig
    bpy.ops.object.select_all(action='DESELECT'); horse.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=f'{OUT}/horse.glb', export_format='GLB', use_selection=True, export_yup=True, export_vertex_color='NAME', export_vertex_color_name='Col',
                              export_texcoords=True, export_normals=True, export_materials='NONE', export_skins=True, export_animations=False, export_apply=False, export_def_bones=False)
    json.dump({k: {'pos': v[0], 'parent': v[1]} for k, v in BONES.items()}, open(f'{OUT}/horse.json', 'w'), indent=1)
    print('HORSE tris', sum(len(p.vertices) - 2 for p in horse.data.polygons), flush=True)
    if '--render' in sys.argv:
        # quick studio check: bay coat
        m = bpy.data.materials.new('coat'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links; bs = N['Principled BSDF']
        at = N.new('ShaderNodeAttribute'); at.attribute_name = 'Col'; uv = N.new('ShaderNodeUVMap'); uv.uv_map = 'CM'; sep = N.new('ShaderNodeSeparateXYZ'); Lk.new(uv.outputs[0], sep.inputs[0])
        coat = N.new('ShaderNodeRGB'); coat.outputs[0].default_value = (0.16, 0.06, 0.025, 1)
        mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY_ADD'; mul.inputs[1].default_value = 2.0; mul.inputs[2].default_value = -1.0; mul.use_clamp = True; Lk.new(sep.outputs[0], mul.inputs[0])
        ca = N.new('ShaderNodeMix'); ca.data_type = 'RGBA'; ca.blend_type = 'MULTIPLY'; ca.inputs['Factor'].default_value = 1.0; Lk.new(coat.outputs[0], ca.inputs[6])
        aoc = N.new('ShaderNodeCombineColor'); Lk.new(sep.outputs[1], aoc.inputs[0]); Lk.new(sep.outputs[1], aoc.inputs[1]); Lk.new(sep.outputs[1], aoc.inputs[2]); Lk.new(aoc.outputs[0], ca.inputs[7])
        mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; Lk.new(mul.outputs[0], mx.inputs['Factor']); Lk.new(at.outputs['Color'], mx.inputs[6]); Lk.new(ca.outputs[2], mx.inputs[7])
        Lk.new(mx.outputs[2], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = 0.6; bs.inputs['Sheen Weight'].default_value = 0.2
        horse.data.materials.append(m)
        bpy.ops.mesh.primitive_plane_add(size=40); g = bpy.context.active_object
        gm = bpy.data.materials.new('g'); gm.use_nodes = True; gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.2, 0.19, 0.17, 1); g.data.materials.append(gm)
        w = sc.world; w.use_nodes = True; sky = w.node_tree.nodes.new('ShaderNodeTexSky')
        try: sky.sky_type = 'MULTIPLE_SCATTERING'
        except Exception: pass
        sky.sun_elevation = math.radians(25); sky.sun_rotation = math.radians(130); w.node_tree.links.new(sky.outputs[0], w.node_tree.nodes['Background'].inputs[0]); w.node_tree.nodes['Background'].inputs[1].default_value = 0.3
        sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3; so = link(bpy.data.objects.new('sun', sun)); so.rotation_euler = (math.radians(60), 0, math.radians(130))
        cam = bpy.data.cameras.new('c'); cam.lens = 50; co = link(bpy.data.objects.new('c', cam)); sc.camera = co
        sc.cycles.samples = 48; sc.render.resolution_x, sc.render.resolution_y = 1280, 720
        try: sc.view_settings.view_transform = 'AgX'
        except Exception: pass
        for ang in (60, 200):
            a = math.radians(ang); co.location = (math.sin(a) * 5.5, -math.cos(a) * 5.5, 1.6)
            tgt = Vector((0, 0, 1.1)); co.rotation_euler = (tgt - co.location).to_track_quat('-Z', 'Y').to_euler()
            sc.render.filepath = f'{OUT}/horse_{ang}.png'; bpy.ops.render.render(write_still=True); print('RENDERED', ang, flush=True)
