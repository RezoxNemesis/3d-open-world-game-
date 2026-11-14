# Blender: "Rajhans R7" business jet for Daman Duo (fictional design). Same vertex-colour / (paint, emit) pipeline as the cars.
# Game coordinates: x = span, y = up, z = forward (nose at +z).
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
from carbody import *

MATS.update({'navy': ((0.012, 0.03, 0.12), 0, 0), 'gold': ((0.62, 0.42, 0.12), 0, 6), 'belly': ((0.35, 0.36, 0.38), 0, 0), 'nav_r': ((0.8, 0.02, 0.02), 0, 2),
             'nav_g': ((0.02, 0.8, 0.1), 0, 1), 'fan': ((0.18, 0.18, 0.2), 0, 6)})
NAMES[:] = list(MATS); MID.clear(); MID.update({k: i for i, k in enumerate(NAMES)})

R = pchip([(-10.0, 0.16), (-9.3, 0.42), (-8.0, 0.78), (-6.0, 1.08), (-4.0, 1.24), (6.0, 1.26), (7.4, 1.16), (8.6, 0.9), (9.4, 0.55), (9.85, 0.22), (10.0, 0.02)])
YC = pchip([(-10.0, 3.0), (-8.0, 2.62), (-5.0, 2.36), (6.0, 2.3), (8.6, 2.18), (10.0, 2.02)])

def fuselage():
    zs = sorted(set([round(-10 + 20 * k / 220, 4) for k in range(221)] + [round(10 - 0.15 * (1 - math.cos(k / 8 * math.pi / 2)), 4) for k in range(8)]))
    N = 48; bm = bmesh.new(); rings = []
    for z in zs:
        r = R(z); yc = YC(z); ring = []
        for k in range(N):
            a = 2 * math.pi * k / N - math.pi / 2
            c, s = math.cos(a), math.sin(a)
            ring.append(bm.verts.new(G(r * 0.97 * c, yc + r * 1.03 * s, z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(N): bm.faces.new((a[k], a[(k + 1) % N], b[(k + 1) % N], b[k]))
    for ring in (rings[0], rings[-1]):
        c = bm.verts.new(sum((v.co for v in ring), Vector()) / N)
        for k in range(N): bm.faces.new((ring[k], ring[(k + 1) % N], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mid = bm.faces.layers.int.new('mid')
    for f in bm.faces:
        c = f.calc_center_median(); x, y, z = c.x, c.z, -c.y
        rel = (y - YC(z)) / max(R(z), 0.05)
        m = 'paint'
        if rel < -0.55: m = 'belly'
        elif -0.3 < rel < -0.06 and -8.9 < z < 7.6 - 2.0 * max(0.0, rel + 0.3): m = 'navy'          # cheat line
        elif -0.36 < rel < -0.32 and -8.9 < z < 7.4: m = 'gold'
        f[mid] = MID[m]
    return new_obj('fuselage', bm)

def airfoil(chord, t, n=16):
    """closed 2D loop (forward, up) of a cambered section; leading edge at +chord/4"""
    pts = []
    for k in range(n + 1):
        x = 0.5 * (1 - math.cos(math.pi * k / n))
        yt = 5 * t * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4)
        yc = 0.02 * (2 * 0.4 * x - x * x) / 0.16 if x < 0.4 else 0.02 * ((1 - 0.8) + 2 * 0.4 * x - x * x) / 0.36
        pts.append((x, yc + yt, yc - yt))
    up = [(chord * (0.25 - x), chord * yu) for x, yu, yl in pts]
    lo = [(chord * (0.25 - x), chord * yl) for x, yu, yl in reversed(pts[1:-1])]
    return up + lo

def wing_loft(sections, mat='paint', n=16):
    """sections: [(origin game Vector of the quarter-chord, chord, thickness, twist, axis)] where axis 'h' (horizontal wing) or 'v' (fin)"""
    bm = bmesh.new(); rings = []
    for (o, ch, t, tw, ax) in sections:
        loop = airfoil(ch, t, n)
        ring = []
        for f, u in loop:
            if ax == 'h': p = Vector(o) + Vector((0, u, f))
            else: p = Vector(o) + Vector((u, 0, f))
            ring.append(bm.verts.new(G(*p)))
        rings.append(ring)
    K = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for k in range(K): bm.faces.new((a[k], a[(k + 1) % K], b[(k + 1) % K], b[k]))
    for r in (rings[0], rings[-1]): bm.faces.new(r)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return set_mat(new_obj('wing', bm), mat)

def lathe(profile, mat, axis_pos, segs=32, closed=False):
    """profile [(z, r)] revolved around a fore-aft axis through axis_pos (game)"""
    bm = bmesh.new(); rings = []
    for z, r in profile:
        rings.append([bm.verts.new(G(axis_pos[0] + r * math.cos(2 * math.pi * k / segs), axis_pos[1] + r * math.sin(2 * math.pi * k / segs), axis_pos[2] + z)) for k in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for k in range(segs): bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return set_mat(new_obj('lathe', bm), mat)

def decal(target, outline, mat, normal_dir, off=0.006, subdiv=6):
    """flat polygon (game points) projected onto target's surface with a shrinkwrap -> windows, doors, logos"""
    bm = bmesh.new(); vs = [bm.verts.new(G(*p)) for p in outline]; f = bm.faces.new(vs)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=subdiv, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    o = set_mat(new_obj('decal', bm), mat)
    m = o.modifiers.new('sw', 'SHRINKWRAP'); m.target = target; m.wrap_method = 'NEAREST_SURFACEPOINT'; m.offset = off
    apply_all(o)
    return o

def ellipse(cz, cy, rz, ry, x, n=20):
    return [(x, cy + ry * math.sin(2 * math.pi * k / n), cz + rz * math.cos(2 * math.pi * k / n)) for k in range(n)]

def build_plane():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fus = fuselage(); parts = [fus]
    # ---- wings: low, swept, dihedral, winglets
    yw = 2.3 - 0.95
    secs = []
    for k in range(9):
        t = k / 8; span = 0.9 + t * 8.0
        secs.append(((span, yw + t * 8.0 * math.tan(math.radians(3.5)), 0.2 - t * 8.0 * math.tan(math.radians(28))), lerp(3.9, 1.25, t), lerp(0.13, 0.1, t), 0, 'h'))
    for sx in (-1, 1):
        ws = [((sx * o[0], o[1], o[2]), ch, th, tw, ax) for o, ch, th, tw, ax in secs]
        parts.append(wing_loft(ws))
        tip = ws[-1][0]
        parts.append(wing_loft([((tip[0] + sx * 0.02, tip[1], tip[2] - 0.05), 1.15, 0.09, 0, 'v'), ((tip[0] + sx * 0.25, tip[1] + 1.35, tip[2] - 0.75), 0.55, 0.08, 0, 'v')]))
        parts.append(cyl_z('nav_g' if sx > 0 else 'nav_r', (tip[0] + sx * 0.05, tip[1] + 0.1, tip[2] + 0.45), 0.06, 0.14, 12))
        # flap track fairings
        for k in (0.3, 0.55):
            p = secs[int(k * 8)][0]; parts.append(prim('cube', 'belly', (sx * p[0], p[1] - 0.12, p[2] - 1.0), size=(0.12, 0.14, 1.1), bev=0.05))
    # wing-body fairing
    parts.append(prim('uv_sphere', 'belly', (0, 1.35, -0.8), size=(1.2, 0.55, 3.2), segments=24, ring_count=12))
    # ---- T-tail
    fin = [((0, 2.9, -7.6), 3.4, 0.11, 0, 'v'), ((0, 6.2, -10.2), 1.7, 0.1, 0, 'v')]
    parts.append(set_mat(wing_loft(fin), 'navy'))
    for sx in (-1, 1):
        parts.append(set_mat(wing_loft([((0, 6.15, -10.0), 1.9, 0.1, 0, 'h'), ((sx * 3.7, 6.4, -11.4), 0.85, 0.09, 0, 'h')]), 'navy'))
    parts.append(prim('uv_sphere', 'navy', (0, 6.2, -10.1), size=(0.28, 0.24, 1.2), segments=16, ring_count=8))
    for sx in (-1, 1): parts.append(prim('cube', 'gold', (sx * 0.06, 4.6, -9.0), rot=(0.6, 0, 0), size=(0.02, 1.6, 0.12)))
    # ---- rear-mounted engines with pylons
    for sx in (-1, 1):
        cx, cy, cz = sx * 2.05, 2.75, -5.6
        prof = [(1.75, 0.5), (1.85, 0.6), (1.7, 0.66), (0.8, 0.68), (-0.6, 0.64), (-1.4, 0.5), (-1.6, 0.42)]
        parts.append(lathe(prof, 'paint', (cx, cy, cz), 36))
        parts.append(lathe([(1.84, 0.58), (1.6, 0.52), (1.5, 0.0)], 'black', (cx, cy, cz), 36))
        parts.append(lathe([(1.55, 0.5), (1.5, 0.12)], 'fan', (cx, cy, cz), 36))
        parts.append(lathe([(-1.55, 0.4), (-1.6, 0.36), (-2.1, 0.08)], 'satin', (cx, cy, cz), 24))
        parts.append(lathe([(1.8, 0.62), (1.68, 0.66)], 'chrome', (cx, cy, cz), 36))
        parts.append(wing_loft([((sx * 0.9, 2.65, -5.3), 2.2, 0.12, 0, 'h'), ((sx * 1.55, 2.72, -5.4), 1.8, 0.12, 0, 'h')]))
    # ---- windows: cockpit glazing and oval cabin windows wrapped onto the fuselage
    def surf(th, z, grow=1.0):
        th = math.radians(th); r = R(z) * grow
        return (r * 0.97 * math.cos(th), YC(z) + r * 1.03 * math.sin(th), z)
    for sx in (-1, 1):
        def side(th): return th if sx > 0 else 180 - th
        # two-piece windshield and the side cockpit windows, laid on the fuselage surface
        parts.append(decal(fus, [surf(side(84), 8.2, 1.1), surf(side(84), 7.55, 1.1), surf(side(56), 7.3, 1.1), surf(side(50), 7.95, 1.1)], 'rubber', None, 0.004))
        parts.append(decal(fus, [surf(side(82), 8.14, 1.1), surf(side(82), 7.6, 1.1), surf(side(58), 7.38, 1.1), surf(side(53), 7.92, 1.1)], 'glass', None, 0.009))
        parts.append(decal(fus, [surf(side(46), 7.85, 1.1), surf(side(50), 7.25, 1.1), surf(side(40), 6.65, 1.1), surf(side(26), 6.75, 1.1), surf(side(28), 7.6, 1.1)], 'rubber', None, 0.004))
        parts.append(decal(fus, [surf(side(44), 7.79, 1.1), surf(side(48), 7.28, 1.1), surf(side(39), 6.72, 1.1), surf(side(29), 6.81, 1.1), surf(side(30), 7.56, 1.1)], 'glass', None, 0.009))
        for k in range(8):
            z = 5.3 - k * 1.05
            parts.append(decal(fus, ellipse(z, 2.62, 0.2, 0.26, sx * 1.4), 'rubber', None, 0.004, 3))
            parts.append(decal(fus, ellipse(z, 2.62, 0.16, 0.22, sx * 1.4), 'glass', None, 0.008, 3))
    # door outline (gap) + logo band on the fin
    parts.append(decal(fus, [(-1.4, 1.75, 6.55), (-1.4, 1.75, 5.75), (-1.4, 3.35, 5.75), (-1.4, 3.35, 6.55)], 'gap', None, 0.003, 4))
    parts.append(decal(fus, [(-1.4, 1.8, 6.5), (-1.4, 1.8, 5.8), (-1.4, 3.3, 5.8), (-1.4, 3.3, 6.5)], 'paint', None, 0.005, 4))
    # ---- landing gear (wheels are part of the static model)
    def gear(x, z, h, two=True):
        P = [cyl_y('satin', (x, h / 2 + 0.25, z), 0.07, h, 12), cyl_y('chrome', (x, 0.55, z), 0.05, 0.4, 10)]
        for o in ((-0.17, 0.17) if two else (0,)):
            P.append(cyl_x('tire', (x + o, 0.33, z), 0.33, 0.2, 28)); P.append(cyl_x('rim', (x + o + (0.1 if o >= 0 else -0.1) * 0.6, 0.33, z), 0.18, 0.04, 20))
        return P
    parts += gear(0, 7.3, 1.25, True)
    for sx in (-1, 1): parts += gear(sx * 1.55, -1.6, 1.15, True)
    parts.append(prim('cube', 'black', (0, 1.13, -1.6), size=(2.0, 0.04, 1.2)))
    # anti-collision beacons, landing light
    parts.append(prim('uv_sphere', 'nav_r', (0, 3.62, -1.5), size=(0.09, 0.07, 0.09), segments=12, ring_count=6))
    parts.append(prim('uv_sphere', 'nav_r', (0, 1.06, -2.5), size=(0.09, 0.07, 0.09), segments=12, ring_count=6))
    parts.append(cyl_z('head', (0, 1.4, 8.2), 0.08, 0.05, 16))
    plane = join(parts, 'rajhans'); smooth(plane, 35)
    bpy.ops.mesh.primitive_plane_add(size=60); ground = bpy.context.active_object
    bake_and_tag(plane, ao_strength=0.75, dist=1.2)
    bpy.data.objects.remove(ground, do_unlink=True)
    return plane

if __name__ == '__main__':
    OUTP = OUT; os.makedirs(OUTP, exist_ok=True)
    p = build_plane(); print('PLANE tris', tris(p), flush=True)
    export(p, f'{OUTP}/rajhans.glb')
    lo = decimate(p, 0.3); print('LOD', tris(lo)); export(lo, f'{OUTP}/rajhans_lod1.glb')
    if '--render' in sys.argv:
        import cars
        S = dict(W=0, tireW=0, r=0, axles=[], paint=(0.9, 0.9, 0.9))
        cars.wheel_positions = lambda S: []
        dummy = p.copy(); dummy.data = p.data.copy(); link(dummy); dummy.hide_render = True
        bpy.data.objects.remove(lo, do_unlink=True)
        import types
        def shoot():
            co = bpy.context.scene.camera
        cars.render(S, p, dummy, [], hook=None)
        sc = bpy.context.scene; co = sc.camera
        for ang, dist, h in ((35, 34, 5.0), (150, 30, 6.0)):
            a = math.radians(ang); co.location = (math.sin(a) * dist, -math.cos(a) * dist, h)
            tgt = Vector((0, 0, 2.6)); co.rotation_euler = (tgt - co.location).to_track_quat('-Z', 'Y').to_euler()
            sc.render.filepath = f'{OUTP}/rajhans_{ang}.png'; bpy.ops.render.render(write_still=True); print('RENDERED', ang, flush=True)
