# Blender (bpy): modular facade kit for Daman's buildings -> assets/models/kit_facades.glb
# Every module is one 3.3 m bay of one storey (3.3 m), facade plane at y=0, outward = -Y (glTF: +Z), x across the bay.
# Styles: Portuguese-colonial (moulded arched windows, louvred shutters, iron balconies, arched doors), Indian town
# (grilled windows with concrete chajjas, shops with rolling shutters and sign bands, parapets), seafront hotel
# (floor-to-ceiling glazing, deep balconies with glass rails). Trims: cornice, parapet, string course, plinth, pilaster.
# Each vertex carries UV0 = metre coordinates (for tiling textures/patterns) and UV1 = (material id, recess depth).
#   ids: 0 wall  1 trim  2 painted wood (shutters/doors)  3 glass  4 iron railing  5 rolling shutter  6 signboard
#        7 plinth stone  8 concrete  9 glass railing  10 window grill
import bpy, bmesh, math, sys
from mathutils import Vector

W, HS = 3.3, 3.3
LOD = '--' in sys.argv and 'lod' in sys.argv[sys.argv.index('--') + 1:]   # mid-distance kit: no bevels, coarse arches
bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene

def obj_from_bm(bm, name):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new(name, me); SC.collection.objects.link(o); return o

def tag(o, mid, uvnorm=None):
    o['mid'] = mid
    if uvnorm: o['uvnorm'] = uvnorm
    return o

def box(x0, x1, y0, y1, z0, z1, mid, name='b'):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector(((x0 + x1) / 2 + v.co.x * (x1 - x0), (y0 + y1) / 2 + v.co.y * (y1 - y0), (z0 + z1) / 2 + v.co.z * (z1 - z0)))
    return tag(obj_from_bm(bm, name), mid)

def prism(outline, y0, y1, mid, name='p'):
    """outline: list of (x, z) counter-clockwise seen from the front; extruded from y0 to y1"""
    bm = bmesh.new(); vs = [bm.verts.new((x, y0, z)) for x, z in outline]; f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f]); nv = [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]
    for v in nv: v.co.y = y1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return tag(obj_from_bm(bm, name), mid)

def arch_outline(w, z0, z1, rise, n=10, grow=0.0):
    n = 4 if LOD else n
    """rectangle with a segmental arch on top (rise 0 -> flat), counter-clockwise seen from the front"""
    hw, zb, zt = w / 2 + grow, z0 - grow, z1 + grow
    if rise < 0.001: return [(-hw, zb), (hw, zb), (hw, zt), (-hw, zt)]
    zs = zt - rise; R = (hw * hw + rise * rise) / (2 * rise); cz = zt - R; a0 = math.asin(hw / R)
    pts = [(-hw, zb), (hw, zb), (hw, zs)]
    for i in range(1, n): a = a0 - 2 * a0 * i / n; pts.append((R * math.sin(a), cz + R * math.cos(a)))
    pts.append((-hw, zs)); return pts

def diff(a, b):
    m = a.modifiers.new('bool', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = b; m.solver = 'EXACT'
    bpy.context.view_layer.objects.active = a; bpy.ops.object.modifier_apply(modifier='bool'); bpy.data.objects.remove(b, do_unlink=True); return a

def bevel(o, w=0.012, seg=2):
    if LOD: return o
    m = o.modifiers.new('bev', 'BEVEL'); m.width = w; m.segments = seg; m.limit_method = 'ANGLE'
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='bev'); return o

def wall_with(opening, mid=0, depth=0.3):
    w = box(-W / 2, W / 2, 0, depth, 0, HS, mid, 'wall')
    cut = prism(opening, -0.5, depth + 0.5, 0, 'cut'); return diff(w, cut)

def surround(opening_fn, grow, proud, mid=1):
    outer = prism(opening_fn(grow), -proud, 0.02, mid, 'sur'); inner = prism(opening_fn(0.0), -proud - 0.5, 0.5, 0, 'cut')
    return bevel(diff(outer, inner), 0.012, 1)

def glass(opening, y=0.2):
    return prism(opening, y, y + 0.01, 3, 'glass')

def railing(x0, x1, y, z0, z1, mid=4):
    """vertical plane; UV0 = (metres along, normalised height) for the procedural baluster pattern"""
    bm = bmesh.new(); vs = [bm.verts.new(p) for p in ((x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1))]; bm.faces.new(vs)
    o = obj_from_bm(bm, 'rail'); tag(o, mid, uvnorm=(x0, x1, z0, z1)); return o

def side_railing(x, y0, y1, z0, z1, mid=4):
    bm = bmesh.new(); vs = [bm.verts.new(p) for p in ((x, y0, z0), (x, y1, z0), (x, y1, z1), (x, y0, z1))]; bm.faces.new(vs)
    o = obj_from_bm(bm, 'rail'); tag(o, mid); o['uvside'] = (y0, y1, z0, z1); return o

MODULES = {}
def finish(name, parts):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        me = p.data
        uv0 = me.uv_layers.new(name='UVMap'); uv1 = me.uv_layers.new(name='MAT')
        un = p.get('uvnorm'); us = p.get('uvside')
        for poly in me.polygons:
            n = poly.normal
            for li in poly.loop_indices:
                co = p.matrix_world @ me.vertices[me.loops[li].vertex_index].co
                if us: u, v = (co.y - us[0]), (co.z - us[2]) / (us[3] - us[2])
                elif un: u, v = (co.x - un[0]), (co.z - un[2]) / (un[3] - un[2])
                elif abs(n.z) > 0.7: u, v = co.x, co.y
                elif abs(n.x) > 0.7: u, v = co.y, co.z
                else: u, v = co.x, co.z
                uv0.data[li].uv = (u, v)
                uv1.data[li].uv = (p['mid'] + 0.5, max(co.y, 0.0))
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = name
    MODULES[name] = o; return o

# ---------------- Portuguese colonial ----------------
def col_window(name, balcony=False):
    ow, z0, z1, rise = (1.15, 0.0 if balcony else 0.85, 2.75, 0.22)
    op = lambda g=0.0: arch_outline(ow, z0 + (0.15 if balcony else 0.0), z1, rise, 7, g)
    parts = [wall_with(op()), surround(op, 0.14, 0.05)]
    parts.append(glass(op(), 0.22))
    # window frame mullion + transom
    parts += [box(-0.03, 0.03, 0.18, 0.22, z0, z1, 1, 'mull'), box(-ow / 2, ow / 2, 0.18, 0.22, z1 - rise - 0.45, z1 - rise - 0.4, 1, 'tr')]
    if not balcony: parts.append(bevel(box(-0.78, 0.78, -0.12, 0.05, z0 - 0.09, z0, 1, 'sill'), 0.01, 1))
    parts.append(box(-0.09, 0.09, -0.07, 0.0, z1 - 0.05, z1 + 0.14, 1, 'key'))
    # louvred shutters folded back against the wall
    for s in (-1, 1): parts.append(box(s * 0.74, s * 1.3, -0.075, -0.035, z0 + (0.15 if balcony else 0), z1 - rise, 2, 'shut'))
    if balcony:
        parts.append(bevel(box(-1.2, 1.2, -0.95, 0.0, 0.0, 0.16, 1, 'slab'), 0.02, 2))
        for s in (-1, 1): parts.append(prism([(s * 0.95 - 0.08, -0.45), (s * 0.95 + 0.08, -0.45), (s * 0.95 + 0.08, 0.0), (s * 0.95 - 0.08, 0.0)], -0.6, 0.0, 1, 'brk'))
        parts += [railing(-1.15, 1.15, -0.9, 0.16, 1.15), side_railing(-1.15, -0.9, 0.0, 0.16, 1.15), side_railing(1.15, -0.9, 0.0, 0.16, 1.15)]
    finish(name, parts)

def col_door(name):
    op = lambda g=0.0: arch_outline(1.5, 0.0, 2.95, 0.3, 8, g)
    parts = [wall_with(op()), surround(op, 0.16, 0.06)]
    parts.append(glass(arch_outline(1.5, 2.25, 2.95, 0.3), 0.2))                     # fanlight
    parts.append(box(-0.75, 0.75, 0.15, 0.2, 0.0, 2.25, 2, 'doors'))                 # panelled double doors
    parts.append(box(-0.75, 0.75, 0.15, 0.2, 2.22, 2.28, 1, 'tr'))
    parts.append(bevel(box(-1.0, 1.0, -0.35, 0.0, -0.17, 0.0, 7, 'step'), 0.01, 1))
    finish(name, parts)

# ---------------- Indian town ----------------
def town_window(name, ac=False):
    op = arch_outline(1.35, 0.9, 2.3, 0.0)
    parts = [wall_with(op), glass(op, 0.2), railing(-0.67, 0.67, 0.06, 0.9, 2.3, 4)]
    parts[-1]['mid'] = 10
    parts.append(bevel(box(-1.0, 1.0, -0.55, 0.0, 2.48, 2.58, 8, 'chajja'), 0.01, 1))
    parts.append(box(-0.75, 0.75, -0.06, 0.0, 0.82, 0.9, 8, 'sill'))
    if ac: parts += [bevel(box(0.55, 1.4, -0.32, -0.02, 0.35, 0.92, 1, 'ac'), 0.02, 2), box(0.6, 1.35, -0.33, -0.31, 0.42, 0.85, 4, 'acgrill')]
    finish(name, parts)

def town_balcony(name):
    op = arch_outline(1.1, 0.15, 2.35, 0.0)
    parts = [wall_with(op), glass(op, 0.2), box(-0.55, 0.55, 0.16, 0.2, 0.15, 2.35, 2, 'door')]
    parts.append(bevel(box(-1.5, 1.5, -1.0, 0.0, 0.0, 0.15, 8, 'slab'), 0.01, 1))
    parts += [box(-1.5, 1.5, -1.0, -0.88, 0.15, 1.0, 0, 'para'), box(-1.5, -1.38, -1.0, 0.0, 0.15, 1.0, 0, 'pl'), box(1.38, 1.5, -1.0, 0.0, 0.15, 1.0, 0, 'pr')]
    parts.append(box(-1.55, 1.55, -1.05, 0.03, 1.0, 1.07, 1, 'cap'))
    parts.append(bevel(box(-1.6, 1.6, -1.1, 0.0, 2.55, 2.65, 8, 'chajja'), 0.01, 1))
    finish(name, parts)

def town_shop(name):
    op = arch_outline(3.0, 0.0, 2.65, 0.0)
    parts = [wall_with(op), glass(op, 0.29)]
    parts.append(box(-1.5, 1.5, 0.05, 0.1, 1.55, 2.65, 5, 'rshut'))                     # rolling shutter, half raised
    parts.append(box(-1.62, 1.62, -0.08, 0.0, 2.72, 3.22, 6, 'sign'))
    parts.append(bevel(box(-1.65, 1.65, -0.75, 0.0, 3.22, 3.3, 8, 'chajja'), 0.01, 1))
    parts.append(box(-1.5, 1.5, 0.0, 1.2, -0.02, 0.02, 7, 'floor'))
    finish(name, parts)

# ---------------- seafront hotel ----------------
def hotel_bay(name):
    op = arch_outline(3.1, 0.2, 2.95, 0.0)
    parts = [wall_with(op, 0, 0.25), glass(op, 0.12)]
    for x in (-0.78, 0.0, 0.78): parts.append(box(x - 0.025, x + 0.025, 0.08, 0.12, 0.2, 2.95, 4, 'mull'))
    parts.append(box(-1.55, 1.55, 0.08, 0.12, 2.42, 2.47, 4, 'tran'))
    parts.append(bevel(box(-1.65, 1.65, -1.35, 0.0, 0.0, 0.2, 8, 'slab'), 0.015, 2))
    parts += [railing(-1.62, 1.62, -1.3, 0.2, 1.15, 9), box(-1.64, 1.64, -1.34, -1.26, 1.13, 1.18, 4, 'toprail')]
    finish(name, parts)

def hotel_lobby(name):
    op = arch_outline(3.2, 0.0, 3.0, 0.0)
    parts = [wall_with(op, 0, 0.25), glass(op, 0.12)]
    for x in (-1.6, 0.0): parts.append(box(x - 0.03, x + 0.03, 0.08, 0.12, 0.0, 3.0, 4, 'mull'))
    parts.append(bevel(box(-1.65, 1.65, -2.2, 0.0, 3.0, 3.14, 8, 'canopy'), 0.01, 1))
    finish(name, parts)

def plain_wall(name, mid=0): finish(name, [box(-W / 2, W / 2, 0, 0.3, 0, HS, mid, 'w')])

# ---------------- trims ----------------
def cornice(name):
    prof = [(0, 0), (0.06, 0), (0.06, 0.1), (0.1, 0.12), (0.14, 0.2), (0.24, 0.27), (0.3, 0.3), (0.3, 0.4), (0, 0.4)]
    bm = bmesh.new(); vs = [bm.verts.new((-W / 2, -y, z)) for y, z in prof]; f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f]); [setattr(v.co, 'x', W / 2) for v in r['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = tag(obj_from_bm(bm, 'cor'), 1); finish(name, [o, box(-W / 2, W / 2, 0, 0.3, 0.4, 1.0, 0, 'att'), box(-W / 2, W / 2, -0.06, 0.32, 1.0, 1.08, 1, 'cap')])

def parapet(name):
    finish(name, [box(-W / 2, W / 2, -0.02, 0.22, 0.0, 0.95, 0, 'par'), bevel(box(-W / 2, W / 2, -0.07, 0.27, 0.95, 1.03, 8, 'cap'), 0.01, 1), box(-W / 2, W / 2, -0.04, 0.0, -0.12, 0.0, 1, 'band')])

def band(name): finish(name, [bevel(box(-W / 2, W / 2, -0.08, 0.0, -0.09, 0.09, 1, 'band'), 0.01, 1)])
def plinth(name): finish(name, [bevel(box(-W / 2, W / 2, -0.06, 0.3, 0.0, 0.6, 7, 'pl'), 0.01, 1)])
def pilaster(name): finish(name, [box(-0.25, 0.25, -0.08, 0.0, 0.0, HS, 1, 'pil'), bevel(box(-0.3, 0.3, -0.12, 0.0, HS - 0.22, HS, 1, 'cap'), 0.01, 1)])

col_window('col_win'); col_window('col_bal', balcony=True); col_door('col_door')
town_window('town_win'); town_window('town_win_ac', ac=True); town_balcony('town_bal'); town_shop('town_shop')
hotel_bay('hotel_bay'); hotel_lobby('hotel_lobby'); plain_wall('wall')
cornice('cornice'); parapet('parapet'); band('band'); plinth('plinth'); pilaster('pilaster')

mat = bpy.data.materials.new('kit')
for o in MODULES.values():
    o.data.materials.clear(); o.data.materials.append(mat)
    o.location = (0, 0, 0)
    print('MOD', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons))
bpy.ops.export_scene.gltf(filepath='/home/claude/blendwork/out/kit_facades' + ('_lod' if LOD else '') + '.glb', export_format='GLB', export_yup=True, export_normals=True, export_texcoords=True, export_materials='PLACEHOLDER')
print('EXPORTED')
