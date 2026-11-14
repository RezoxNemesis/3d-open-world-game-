# Blender: farm + ranch prop kit for Daman Duo. Each prop is modelled with tiled CC0 photo materials (Poly Haven sets
# already shipped in assets/tex) and procedural straw/thatch, then baked to ONE material: albedo x AO + tangent normal map
# on fresh UVs, exported as assets/models/{2k,1k}/<name>.glb (loaded by src/models.js, placed by src/farm.js).
# Blender coordinates: z up, front = -y (glTF +z). Origin at ground centre.
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

TEX = os.environ.get('DD_TEX') or '/home/claude/3d-open-world-game-/assets/tex/2k'
OUT = os.environ.get('DD_OUT') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'farm')
MATS = {}

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True); MATS.clear()
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'

def img(name):
    p = f'{TEX}/{name}.jpg'
    if not os.path.exists(p): return None
    im = bpy.data.images.get(name + '.jpg') or bpy.data.images.load(p)
    if name.endswith('_n'): im.colorspace_settings.name = 'Non-Color'
    return im

def mat(key):
    """material library: (texture or procedural, tint, metres per repeat, roughness)"""
    if key in MATS: return MATS[key]
    spec = {
        'plaster': ('plaster', (1.0, 0.97, 0.9), 2.0, 0.92), 'plaster_ochre': ('plaster', (1.0, 0.78, 0.45), 2.0, 0.92), 'plaster_blue': ('plaster', (0.72, 0.85, 1.0), 2.0, 0.92),
        'plaster_pink': ('plaster', (1.0, 0.8, 0.78), 2.0, 0.92), 'rooftile': ('rooftile', (1.0, 1.0, 1.0), 1.6, 0.8), 'wood': ('wood', (0.9, 0.85, 0.8), 2.0, 0.8),
        'wood_dark': ('wood', (0.45, 0.36, 0.3), 2.0, 0.8), 'wood_green': ('wood', (0.45, 0.75, 0.6), 2.0, 0.75), 'wood_blue': ('wood', (0.5, 0.65, 0.95), 2.0, 0.75),
        'tin': ('tin', (1.0, 1.0, 1.0), 2.0, 0.6), 'brick': ('brick', (1.0, 1.0, 1.0), 1.5, 0.9), 'stone': ('fortwall', (1.0, 1.0, 1.0), 2.0, 0.9),
        'bark': ('bark', (0.95, 0.9, 0.75), 1.0, 0.85), 'soil': ('soil', (1.0, 1.0, 1.0), 2.0, 0.95), 'concrete': ('stained', (1.0, 1.0, 1.0), 2.5, 0.9),
        'white_paint': (None, (0.82, 0.82, 0.8), 0, 0.6), 'red_paint': (None, (0.42, 0.025, 0.02), 0, 0.35), 'black_plastic': (None, (0.015, 0.015, 0.016), 0, 0.45),
        'rubber': (None, (0.018, 0.018, 0.02), 0, 0.9), 'steel': (None, (0.45, 0.46, 0.48), 0, 0.45), 'rust': (None, (0.25, 0.1, 0.05), 0, 0.85),
        'straw': ('STRAW', (0.62, 0.48, 0.2), 0, 0.95), 'thatch': ('THATCH', (0.38, 0.3, 0.18), 0, 0.95), 'hay_green': ('STRAW', (0.45, 0.45, 0.2), 0, 0.95),
        'rope': (None, (0.4, 0.3, 0.16), 0, 0.95), 'glass': (None, (0.02, 0.025, 0.03), 0, 0.1), 'yellow_paint': (None, (0.7, 0.45, 0.02), 0, 0.4),
    }[key]
    tex, tint, rep, rough = spec
    m = bpy.data.materials.new(key); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
    bs = N['Principled BSDF']; bs.inputs['Roughness'].default_value = rough
    if tex in ('STRAW', 'THATCH'):
        tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); L.new(tc.outputs['Object'], mp.inputs[0])
        mp.inputs['Scale'].default_value = (1, 1, 1)
        wv = N.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'Z'; wv.inputs['Scale'].default_value = 14 if tex == 'STRAW' else 9
        wv.inputs['Distortion'].default_value = 3; wv.inputs['Detail'].default_value = 3; L.new(mp.outputs[0], wv.inputs['Vector'])
        nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 8; L.new(mp.outputs[0], nz.inputs['Vector'])
        ramp = N.new('ShaderNodeValToRGB'); L.new(wv.outputs['Fac'], ramp.inputs['Fac'])
        c0 = tint; ramp.color_ramp.elements[0].color = (c0[0] * 0.45, c0[1] * 0.42, c0[2] * 0.4, 1); ramp.color_ramp.elements[1].color = (min(1, c0[0] * 1.25), min(1, c0[1] * 1.22), min(1, c0[2] * 1.2), 1)
        mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 0.5
        L.new(ramp.outputs['Color'], mix.inputs[6]); L.new(nz.outputs['Color'], mix.inputs[7]); L.new(mix.outputs[2], bs.inputs['Base Color'])
        bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.6; L.new(wv.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], bs.inputs['Normal'])
    elif tex:
        tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); L.new(tc.outputs['Object'], mp.inputs[0]); mp.inputs['Scale'].default_value = (1 / rep, 1 / rep, 1 / rep)
        d = N.new('ShaderNodeTexImage'); d.image = img(tex + '_d'); d.projection = 'BOX'; d.projection_blend = 0.25; L.new(mp.outputs[0], d.inputs['Vector'])
        tn = N.new('ShaderNodeRGB'); tn.outputs[0].default_value = (*tint, 1)
        mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
        L.new(d.outputs['Color'], mix.inputs[6]); L.new(tn.outputs[0], mix.inputs[7]); L.new(mix.outputs[2], bs.inputs['Base Color'])
        ni = img(tex + '_n')
        if ni:
            n = N.new('ShaderNodeTexImage'); n.image = ni; n.projection = 'BOX'; n.projection_blend = 0.25; L.new(mp.outputs[0], n.inputs['Vector'])
            nm = N.new('ShaderNodeNormalMap'); L.new(n.outputs['Color'], nm.inputs['Color']); L.new(nm.outputs['Normal'], bs.inputs['Normal'])
    else:
        bs.inputs['Base Color'].default_value = (*tint, 1)
        nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3; nz.inputs['Detail'].default_value = 6
        tn = N.new('ShaderNodeRGB'); tn.outputs[0].default_value = (*tint, 1)
        mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 0.35
        L.new(tn.outputs[0], mix.inputs[6]); L.new(nz.outputs['Color'], mix.inputs[7]); L.new(mix.outputs[2], bs.inputs['Base Color'])
        if key in ('steel', 'red_paint', 'yellow_paint'): bs.inputs['Metallic'].default_value = 0.6 if key == 'steel' else 0.0
    MATS[key] = m; return m

def setm(o, key):
    o.data.materials.clear(); o.data.materials.append(mat(key)); return o

def box(key, size, loc, rot=(0, 0, 0), bev=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot); o = bpy.context.active_object; o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bev:
        m = o.modifiers.new('b', 'BEVEL'); m.width = bev; m.segments = 2; bpy.ops.object.modifier_apply(modifier='b')
    return setm(o, key)

def cyl(key, r, depth, loc, rot=(0, 0, 0), v=16, r2=None, cap=True):
    if r2 is None: bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=v, end_fill_type='NGON' if cap else 'NOTHING')
    else: bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=v, end_fill_type='NGON' if cap else 'NOTHING')
    return setm(bpy.context.active_object, key)

def gable_roof(key, w, d, h, z, ov=0.5, thick=0.08, hip=False, cx=0, cy=0):
    """roof over a w (x) by d (y) footprint, ridge along x, eave height z"""
    W, D = w / 2 + ov, d / 2 + ov
    bm = bmesh.new()
    if hip:
        r = min(W, D) * 0.9
        pts = [(-W, -D, 0), (W, -D, 0), (W, D, 0), (-W, D, 0), (-W + r, 0, h), (W - r, 0, h)]
        vs = [bm.verts.new((cx + x, cy + y, z + zz)) for x, y, zz in pts]
        for f in ((0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)): bm.faces.new([vs[i] for i in f])
    else:
        pts = [(-W, -D, 0), (W, -D, 0), (W, 0, h), (-W, 0, h), (W, D, 0), (-W, D, 0)]
        vs = [bm.verts.new((cx + x, cy + y, z + zz)) for x, y, zz in pts]
        bm.faces.new([vs[i] for i in (0, 1, 2, 3)]); bm.faces.new([vs[i] for i in (3, 2, 4, 5)])
    me = bpy.data.meshes.new('roof'); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('roof', me); bpy.context.scene.collection.objects.link(o)
    m = o.modifiers.new('s', 'SOLIDIFY'); m.thickness = thick; m.offset = 1
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='s')
    return setm(o, key)

def gable_walls(key, w, d, z, h):
    """triangular gable infill at both x ends of a ridge-along-x roof"""
    bm = bmesh.new()
    for sx in (-1, 1):
        vs = [bm.verts.new((sx * w / 2, -d / 2, z)), bm.verts.new((sx * w / 2, d / 2, z)), bm.verts.new((sx * w / 2, 0, z + h))]
        bm.faces.new(vs)
    me = bpy.data.meshes.new('gw'); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('gw', me); bpy.context.scene.collection.objects.link(o)
    m = o.modifiers.new('s', 'SOLIDIFY'); m.thickness = 0.15; bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='s')
    return setm(o, key)

def join(parts, name):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); o = bpy.context.active_object; o.name = name; return o

# ------------------------------------------------------------------ props
def farmhouse(wall='plaster', door='wood_blue'):
    P = []; W, D, H = 10.0, 6.5, 3.0
    P.append(box('stone', (W + 0.3, D + 0.3, 0.55), (0, 0, 0.275)))
    P.append(box(wall, (W, D, H), (0, 0, 0.55 + H / 2)))
    P.append(box('plaster', (W + 0.05, D + 0.05, 0.25), (0, 0, 0.55 + 0.125)))                      # painted dado band
    P.append(gable_roof('rooftile', W, D, 2.0, 0.55 + H, ov=0.55, hip=True))
    # veranda (otla): raised floor, wooden posts, lean-to tiled roof
    P.append(box('stone', (W, 2.4, 0.45), (0, -D / 2 - 1.2, 0.225)))
    for k in range(5): P.append(cyl('wood_dark', 0.09, 2.55, (-W / 2 + 0.3 + k * (W - 0.6) / 4, -D / 2 - 2.2, 0.45 + 1.275), v=10))
    P.append(box('wood_dark', (W, 0.16, 0.18), (0, -D / 2 - 2.2, 3.05)))
    bm = bmesh.new(); y0, y1 = -D / 2, -D / 2 - 2.75; z0, z1 = 0.55 + H - 0.05, 2.95
    vs = [bm.verts.new(p) for p in ((-W / 2 - 0.2, y0, z0), (W / 2 + 0.2, y0, z0), (W / 2 + 0.2, y1, z1), (-W / 2 - 0.2, y1, z1))]; bm.faces.new(vs)
    me = bpy.data.meshes.new('v'); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('v', me); bpy.context.scene.collection.objects.link(o)
    m = o.modifiers.new('s', 'SOLIDIFY'); m.thickness = 0.07; bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='s'); P.append(setm(o, 'rooftile'))
    # door, windows with shutters + bars, steps, gutter-line, bench on the veranda, a TV dish for flavour
    P.append(box(door, (1.1, 0.12, 2.1), (0, -D / 2 - 0.02, 0.55 + 1.05)))
    P.append(box('wood_dark', (1.3, 0.14, 0.12), (0, -D / 2 - 0.03, 0.55 + 2.16)))
    for x in (-3.2, -1.7, 1.7, 3.2):
        P.append(box('black_plastic', (0.9, 0.08, 1.1), (x, -D / 2 - 0.01, 0.55 + 1.55)))
        for sx in (-1, 1): P.append(box(door, (0.45, 0.06, 1.15), (x + sx * 0.68, -D / 2 - 0.05, 0.55 + 1.55), rot=(0, 0, sx * 0.5)))
        for k in range(5): P.append(cyl('steel', 0.012, 1.1, (x - 0.36 + k * 0.18, -D / 2 - 0.04, 0.55 + 1.55), v=6))
        P.append(box('plaster', (1.1, 0.12, 0.1), (x, -D / 2 - 0.05, 0.55 + 2.15)))
    for sx in (-1, 1):
        for y in (-1.2, 1.2): P.append(box('black_plastic', (0.08, 0.8, 1.0), (sx * W / 2 + sx * 0.01, y, 0.55 + 1.6)))
    for k in range(3): P.append(box('stone', (1.4, 0.35, 0.15 * (3 - k)), (0, -D / 2 - 2.6 - k * 0.3, 0.075 * (3 - k))))
    P.append(box('wood_dark', (1.8, 0.45, 0.06), (-3.0, -D / 2 - 0.5, 0.45 + 0.45)))
    for x in (-3.8, -2.2): P.append(box('wood_dark', (0.06, 0.4, 0.45), (x, -D / 2 - 0.5, 0.45 + 0.225)))
    P.append(cyl('white_paint', 0.3, 0.06, (W / 2 - 1.0, 0.5, 0.55 + H + 1.4), rot=(1.1, 0, 0.6), v=20))
    return join(P, 'farmhouse')

def cowshed():
    P = []; W, D = 8.0, 5.0
    P.append(box('concrete', (W, D, 0.15), (0, 0, 0.075)))
    P.append(box('brick', (W, 0.25, 1.4), (0, D / 2 - 0.12, 0.85)))
    for x in (-W / 2, 0, W / 2):
        for y in (-D / 2, D / 2): P.append(cyl('bark', 0.1, 3.2, (x, y, 1.6), v=8))
    P.append(box('wood_dark', (W + 0.3, 0.15, 0.15), (0, -D / 2, 3.1))); P.append(box('wood_dark', (W + 0.3, 0.15, 0.15), (0, D / 2, 3.5)))
    bm = bmesh.new(); vs = [bm.verts.new(p) for p in ((-W / 2 - 0.5, -D / 2 - 0.6, 3.05), (W / 2 + 0.5, -D / 2 - 0.6, 3.05), (W / 2 + 0.5, D / 2 + 0.5, 3.6), (-W / 2 - 0.5, D / 2 + 0.5, 3.6))]; bm.faces.new(vs)
    me = bpy.data.meshes.new('r'); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('r', me); bpy.context.scene.collection.objects.link(o)
    m = o.modifiers.new('s', 'SOLIDIFY'); m.thickness = 0.35; bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='s'); P.append(setm(o, 'thatch'))
    P.append(box('concrete', (W - 0.6, 0.6, 0.45), (0, D / 2 - 0.65, 0.375)))                          # feeding trough
    P.append(box('straw', (W - 0.8, 0.4, 0.12), (0, D / 2 - 0.65, 0.62)))
    return join(P, 'cowshed')

def haystack(kind=0):
    P = []
    if kind == 0:     # conical rice-straw stack around a pole (kunvo)
        bm = bmesh.new()
        prof = [(0.0, 0.0), (1.35, 0.0), (1.55, 0.6), (1.5, 1.4), (1.2, 2.2), (0.7, 2.9), (0.2, 3.3), (0.0, 3.35)]
        vs = [bm.verts.new((r, 0, z)) for r, z in prof]
        for a, b in zip(vs, vs[1:]): bm.edges.new((a, b))
        bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], angle=2 * math.pi, steps=24, axis=(0, 0, 1), cent=(0, 0, 0))
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        for v in bm.verts:
            if v.co.z > 0.05: d = Vector((v.co.x, v.co.y, 0)).normalized() if v.co.xy.length > 1e-3 else Vector(); v.co += d * 0.08 * math.sin(v.co.z * 5 + math.atan2(v.co.y, v.co.x) * 3)
        me = bpy.data.meshes.new('h'); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('h', me); bpy.context.scene.collection.objects.link(o); P.append(setm(o, 'straw'))
        P.append(cyl('bark', 0.05, 1.2, (0, 0, 3.6), v=6))
    else:             # stacked fodder sheaves (kadbi) in a long ridge
        for k in range(5):
            x = -2.0 + k
            P.append(box('hay_green' if k % 2 else 'straw', (1.1, 2.2, 1.2), (x, 0, 0.6), bev=0.25))
        P.append(box('straw', (5.0, 1.6, 0.8), (0, 0, 1.45), bev=0.35))
    return join(P, 'haystack' if kind == 0 else 'fodderstack')

def watertank():
    P = [box('brick', (1.8, 1.8, 2.6), (0, 0, 1.3)), box('concrete', (2.0, 2.0, 0.15), (0, 0, 2.67))]
    t = cyl('black_plastic', 0.75, 1.5, (0, 0, 2.75 + 0.75), v=32); P.append(t)
    for k in range(4): P.append(cyl('black_plastic', 0.77, 0.06, (0, 0, 2.95 + k * 0.33), v=32))
    P.append(cyl('black_plastic', 0.3, 0.12, (0, 0, 4.3), v=20)); P.append(cyl('steel', 0.04, 3.0, (0.8, 0.8, 1.5), v=8))
    return join(P, 'watertank')

def cart():
    P = [box('wood', (1.3, 2.6, 0.08), (0, 0, 0.95))]
    for sx in (-1, 1):
        P.append(box('wood_dark', (0.08, 2.6, 0.35), (sx * 0.65, 0, 1.15)))
        for k in range(6): P.append(cyl('wood_dark', 0.025, 0.45, (sx * 0.65, -1.1 + k * 0.44, 1.2), v=6))
        # spoked wheel
        bpy.ops.mesh.primitive_torus_add(location=(sx * 0.82, 0.2, 0.72), rotation=(0, math.pi / 2, 0), major_radius=0.68, minor_radius=0.05, major_segments=32, minor_segments=6); P.append(setm(bpy.context.active_object, 'wood_dark'))
        P.append(cyl('steel', 0.72, 0.05, (sx * 0.82, 0.2, 0.72), rot=(0, math.pi / 2, 0), v=32, cap=False))
        for k in range(10):
            a = k / 10 * math.pi
            P.append(box('wood_dark', (0.04, 0.05, 1.32), (sx * 0.82, 0.2, 0.72), rot=(a, 0, 0)))
        P.append(cyl('wood_dark', 0.12, 0.2, (sx * 0.82, 0.2, 0.72), rot=(0, math.pi / 2, 0), v=12))
    P.append(cyl('wood_dark', 0.05, 1.9, (0, 0.2, 0.72), rot=(0, math.pi / 2, 0), v=8))
    P.append(box('wood_dark', (0.12, 2.8, 0.12), (0, -2.4, 0.95), rot=(0.12, 0, 0)))                           # shaft
    P.append(cyl('wood_dark', 0.06, 2.2, (0, -3.6, 1.15), rot=(0, math.pi / 2, 0), v=8))                       # yoke
    P.append(box('straw', (1.1, 2.2, 0.35), (0, 0.1, 1.15), bev=0.12))
    return join(P, 'bullockcart')

def tractor():
    P = []
    P.append(box('red_paint', (0.85, 1.7, 0.7), (0, -0.9, 1.25), bev=0.08))                                   # bonnet
    P.append(box('black_plastic', (0.8, 0.06, 0.55), (0, -1.76, 1.22)))                                      # grille
    for k in range(6): P.append(box('steel', (0.72, 0.02, 0.02), (0, -1.79, 1.0 + k * 0.08)))
    for sx in (-1, 1): P.append(cyl('glass', 0.07, 0.04, (sx * 0.3, -1.78, 1.45), rot=(math.pi / 2, 0, 0), v=12))
    P.append(box('red_paint', (0.9, 1.0, 0.5), (0, 0.25, 1.05), bev=0.06))                                    # body
    P.append(box('steel', (0.7, 0.6, 0.45), (0, 0.2, 0.75)))                                                  # gearbox
    for sx in (-1, 1):
        P.append(box('red_paint', (0.5, 1.2, 0.08), (sx * 0.78, 0.55, 1.62), bev=0.03))                       # rear fenders
        P.append(box('red_paint', (0.08, 1.0, 0.5), (sx * 0.55, 0.55, 1.4)))
        P.append(cyl('rubber', 0.78, 0.45, (sx * 0.86, 0.55, 0.78), rot=(0, math.pi / 2, 0), v=28))
        P.append(cyl('yellow_paint', 0.5, 0.47, (sx * 0.86, 0.55, 0.78), rot=(0, math.pi / 2, 0), v=24))
        for k in range(14):
            a = k / 14 * 2 * math.pi
            P.append(box('rubber', (0.47, 0.12, 0.08), (sx * 0.86, 0.55 + math.cos(a) * 0.79, 0.78 + math.sin(a) * 0.79), rot=(-a + 0.3, 0, 0)))
        P.append(cyl('rubber', 0.42, 0.22, (sx * 0.62, -1.15, 0.42), rot=(0, math.pi / 2, 0), v=20))
        P.append(cyl('yellow_paint', 0.25, 0.24, (sx * 0.62, -1.15, 0.42), rot=(0, math.pi / 2, 0), v=16))
    P.append(box('black_plastic', (0.5, 0.45, 0.12), (0, 0.65, 1.55), bev=0.04)); P.append(box('black_plastic', (0.45, 0.08, 0.4), (0, 0.85, 1.75), bev=0.03))
    P.append(cyl('black_plastic', 0.2, 0.03, (0, 0.05, 1.85), rot=(0.7, 0, 0), v=16)); P.append(cyl('steel', 0.02, 0.5, (0, 0.15, 1.6), rot=(0.7, 0, 0), v=6))
    P.append(cyl('steel', 0.05, 1.0, (0.3, -0.5, 1.95), v=8)); P.append(cyl('rust', 0.06, 0.1, (0.3, -0.5, 2.45), v=8))
    P.append(box('steel', (0.9, 0.3, 0.15), (0, 1.2, 0.85)))                                                  # hitch
    return join(P, 'tractor')

def well():
    P = []
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=False, radius=1.0, segments=32)
    me = bpy.data.meshes.new('w'); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('w', me); bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o; bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.extrude_region_move(TRANSFORM_OT_translate={'value': (0, 0, 0.85)}); bpy.ops.object.mode_set(mode='OBJECT')
    m = o.modifiers.new('s', 'SOLIDIFY'); m.thickness = 0.3; bpy.ops.object.modifier_apply(modifier='s'); P.append(setm(o, 'stone'))
    P.append(cyl('black_plastic', 0.95, 0.05, (0, 0, 0.4), v=32))
    for sx in (-1, 1): P.append(box('stone', (0.3, 0.3, 1.6), (sx * 1.05, 0, 1.6)))
    P.append(cyl('wood_dark', 0.06, 2.4, (0, 0, 2.3), rot=(0, math.pi / 2, 0), v=8))
    P.append(cyl('steel', 0.15, 0.06, (0, 0, 2.15), rot=(0, math.pi / 2, 0), v=16))
    P.append(cyl('rope', 0.01, 1.2, (0, 0.15, 1.55), v=4)); P.append(cyl('steel', 0.13, 0.25, (0, 0.15, 0.95), r2=0.16, v=12))
    return join(P, 'well')

def fence_bamboo():
    P = []
    for k in range(13): P.append(cyl('bark', 0.035, 1.5 + (k % 3) * 0.08, (-1.5 + k * 0.25, 0, 0.75), v=6))
    for z in (0.5, 1.1): P.append(cyl('bark', 0.03, 3.1, (0, 0.05, z), rot=(0, math.pi / 2, 0), v=6))
    return join(P, 'fence_bamboo')

def fence_paddock():
    P = []
    for x in (-1.5, 1.5): P.append(box('white_paint', (0.14, 0.14, 1.5), (x, 0, 0.75), bev=0.02))
    for z in (0.45, 0.85, 1.25): P.append(box('white_paint', (3.0, 0.05, 0.14), (0, -0.09, z), bev=0.01))
    return join(P, 'fence_paddock')

def stable():
    P = []; W, D, H = 18.0, 8.0, 3.2
    P.append(box('concrete', (W + 0.4, D + 0.4, 0.2), (0, 0, 0.1)))
    P.append(box('wood', (W, D, H), (0, 0, 0.2 + H / 2)))
    P.append(gable_roof('tin', W, D, 2.2, 0.2 + H, ov=0.6, thick=0.06))
    P.append(gable_walls('wood', W, D, 0.2 + H, 2.2))
    for k in range(8):                                                                                       # stall doors (dutch doors)
        x = -W / 2 + 1.1 + k * (W - 2.2) / 7
        P.append(box('wood_dark', (1.3, 0.1, 1.3), (x, -D / 2 - 0.02, 0.2 + 0.65)))
        P.append(box('white_paint', (1.4, 0.12, 0.08), (x, -D / 2 - 0.03, 0.2 + 1.32)))
        P.append(box('black_plastic', (1.3, 0.05, 1.0), (x, -D / 2 - 0.0, 0.2 + 1.9)))
        for t in (-1, 1): P.append(box('white_paint', (0.1, 0.12, 2.4), (x + t * 0.7, -D / 2 - 0.03, 0.2 + 1.2)))
    P.append(box('white_paint', (W + 0.1, 0.14, 0.12), (0, -D / 2 - 0.04, 0.2 + H - 0.1)))
    P.append(box('wood_dark', (3.0, 0.12, 3.0), (0, D / 2 + 0.02, 1.7)))                                     # rear barn door
    for sx in (-1, 1): P.append(box('wood_dark', (0.12, 2.6, 2.6), (sx * (W / 2 + 0.02), 0, 1.5)))
    P.append(box('tin', (1.2, 1.2, 1.2), (0, 0, 0.2 + H + 2.2 + 0.4)))                                          # cupola
    P.append(gable_roof('tin', 1.2, 1.2, 0.5, 0.2 + H + 2.2 + 1.0, ov=0.15, thick=0.04))
    return join(P, 'stable')

def hay_bales():
    P = []
    for i, (x, y, z) in enumerate(((0, 0, 0.35), (1.2, 0, 0.35), (2.4, 0, 0.35), (0.6, 0, 1.05), (1.8, 0, 1.05), (1.2, 0, 1.75))):
        P.append(box('straw', (1.15, 0.6, 0.7), (x - 1.2, y, z), bev=0.08))
        for sx in (-0.3, 0.3): P.append(box('rope', (0.02, 0.62, 0.72), (x - 1.2 + sx, y, z)))
    return join(P, 'haybales')

def trough():
    P = [box('steel', (2.4, 0.7, 0.55), (0, 0, 0.45), bev=0.05), box('glass', (2.25, 0.55, 0.02), (0, 0, 0.66))]
    for x in (-1.0, 1.0): P.append(box('steel', (0.08, 0.6, 0.2), (x, 0, 0.1)))
    return join(P, 'trough')

PROPS = {'farmhouse': (farmhouse, 2048), 'farmhouse_b': (lambda: farmhouse('plaster_ochre', 'wood_green'), 2048), 'cowshed': (cowshed, 1024), 'haystack': (haystack, 1024),
         'fodderstack': (lambda: haystack(1), 1024), 'watertank': (watertank, 512), 'bullockcart': (cart, 1024), 'tractor': (tractor, 1024), 'well': (well, 512),
         'fence_bamboo': (fence_bamboo, 256), 'fence_paddock': (fence_paddock, 256), 'stable': (stable, 2048), 'haybales': (hay_bales, 512), 'trough': (trough, 256)}

# ------------------------------------------------------------------ bake + export
def bake_export(name, o, size):
    sc = bpy.context.scene; sc.cycles.samples = 16
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    # weld + triangulate-free cleanup, fresh UVs
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=1e-4)
    uv = o.data.uv_layers.new(name='bake'); o.data.uv_layers.active = uv; uv.active_render = True
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.006); bpy.ops.object.mode_set(mode='OBJECT')
    ims = {}
    for k, cs in (('diff', 'sRGB'), ('ao', 'Non-Color'), ('nor', 'Non-Color')):
        im = bpy.data.images.new(f'{name}_{k}', size, size, alpha=False); im.colorspace_settings.name = cs; ims[k] = im
    nodes = []
    for m in o.data.materials:
        nt = m.node_tree; uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'bake'
        t = nt.nodes.new('ShaderNodeTexImage'); nt.links.new(uvn.outputs[0], t.inputs['Vector']); nodes.append((nt, t))
    bk = sc.render.bake; bk.margin = 6; bk.use_selected_to_active = False
    def run(kind, im, **kw):
        for nt, t in nodes: t.image = im; nt.nodes.active = t
        bpy.ops.object.bake(type=kind, **kw)
    bk.use_pass_direct = False; bk.use_pass_indirect = False; bk.use_pass_color = True
    run('DIFFUSE', ims['diff'], pass_filter={'COLOR'})
    sc.world = sc.world or bpy.data.worlds.new('w'); sc.world.light_settings.distance = 1.2; sc.cycles.samples = 32
    run('AO', ims['ao'])
    sc.cycles.samples = 4
    run('NORMAL', ims['nor'], normal_space='TANGENT')
    d = np.array(ims['diff'].pixels[:]).reshape(-1, 4); a = np.array(ims['ao'].pixels[:]).reshape(-1, 4)
    d[:, :3] *= (1 - 0.75 * (1 - a[:, :1])); ims['diff'].pixels[:] = d.ravel()
    # one game material
    gm = bpy.data.materials.new(name); gm.use_nodes = True; nt = gm.node_tree; bs = nt.nodes['Principled BSDF']
    uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'bake'
    td = nt.nodes.new('ShaderNodeTexImage'); td.image = ims['diff']; nt.links.new(uvn.outputs[0], td.inputs['Vector']); nt.links.new(td.outputs['Color'], bs.inputs['Base Color'])
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = ims['nor']; nt.links.new(uvn.outputs[0], tn.inputs['Vector'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.uv_map = 'bake'; nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    bs.inputs['Roughness'].default_value = 0.85
    o.data.materials.clear(); o.data.materials.append(gm)
    while o.data.uv_layers[0].name != 'bake': o.data.uv_layers.remove(o.data.uv_layers[0])
    bpy.ops.object.shade_smooth() if False else None
    for res, tag in ((size, '2k'), (max(256, size // 2), '1k')):
        for k in ('diff', 'nor'):
            if ims[k].size[0] > res: ims[k].scale(res, res)
        os.makedirs(f'{OUT}/{tag}', exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=f'{OUT}/{tag}/{name}.glb', export_format='GLB', use_selection=True, export_image_format='JPEG', export_jpeg_quality=86,
                                  export_apply=True, export_yup=True, export_tangents=False, export_vertex_color='NONE')
    ims['diff'].filepath_raw = f'{OUT}/{name}_diff.png'; ims['diff'].file_format = 'PNG'; ims['diff'].save()

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for name, (fn, size) in PROPS.items():
        if args and name not in args: continue
        reset(); o = fn()
        n = sum(len(p.vertices) - 2 for p in o.data.polygons)
        bake_export(name, o, size)
        dims = [round(v, 2) for v in o.dimensions]
        print(f'PROP {name} tris {n} dims {dims}', flush=True)
