# Blender (bpy) hero-car generator for Daman Duo.
# All car specs are written in GAME coordinates (x = width, y = up, z = forward); geometry is created in Blender
# coordinates (x, -z, y) so the glTF export (Y-up) lands back in game coordinates.
# Each face carries a material id ('mid') -> baked to COLOR_0 (albedo x baked AO, linear) + TEXCOORD_1 (paint, emit)
# for the game's vehicleMaterial: emit 0 plain, 1 head lamp, 2 tail lamp, 5 glass, 6 chrome/metal; paint 1 = car colour.
import bpy, bmesh, math, sys, json, os
from mathutils import Vector

OUT = os.environ.get('DD_OUT') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'cars')
MATS = {  # name: (albedo linear, paint, emit)
    'paint': ((0.92, 0.92, 0.92), 1, 0), 'glass': ((0.012, 0.016, 0.02), 0, 5), 'chrome': ((0.9, 0.9, 0.9), 0, 6), 'black': ((0.012, 0.012, 0.013), 0, 7),
    'trim': ((0.03, 0.03, 0.033), 0, 7), 'rubber': ((0.02, 0.02, 0.021), 0, 7), 'head': ((0.95, 0.95, 0.92), 0, 1), 'tail': ((0.55, 0.012, 0.01), 0, 2),
    'amber': ((0.9, 0.35, 0.01), 0, 2), 'interior': ((0.025, 0.022, 0.02), 0, 7), 'tire': ((0.014, 0.014, 0.015), 0, 7), 'rim': ((0.62, 0.62, 0.64), 0, 6),
    'darkrim': ((0.05, 0.05, 0.055), 0, 6), 'badge': ((0.85, 0.66, 0.25), 0, 6), 'grille': ((0.008, 0.008, 0.009), 0, 7), 'plate': ((0.85, 0.85, 0.82), 0, 0),
    'plate_txt': ((0.01, 0.01, 0.01), 0, 0), 'disc': ((0.25, 0.25, 0.26), 0, 6), 'caliper': ((0.45, 0.02, 0.02), 0, 0), 'reflector': ((0.8, 0.8, 0.82), 0, 6),
    'gap': ((0.004, 0.004, 0.004), 0, 0), 'satin': ((0.35, 0.35, 0.37), 0, 6),
}
NAMES = list(MATS); MID = {k: i for i, k in enumerate(NAMES)}

def G(x, y, z): return Vector((x, -z, y))          # game -> blender

# ---------------------------------------------------------------- helpers
def pchip(pts):
    """monotone cubic through (x, y) control points (Fritsch-Carlson); clamps outside"""
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]; d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n; m[0] = d[0]; m[-1] = d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0: m[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    def f(x):
        if x <= xs[0]: return ys[0]
        if x >= xs[-1]: return ys[-1]
        i = 0
        while xs[i + 1] < x: i += 1
        t = (x - xs[i]) / h[i]; t2, t3 = t * t, t * t * t
        return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1]
    return f

def lerp(a, b, t): return a + (b - a) * t
def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

def link(o): bpy.context.scene.collection.objects.link(o); return o
def new_obj(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); return link(bpy.data.objects.new(name, me))

def set_mat(o, mat):
    a = o.data.attributes.get('mid') or o.data.attributes.new('mid', 'INT', 'FACE')
    for i in range(len(o.data.polygons)): a.data[i].value = MID[mat]
    return o

def apply_all(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    return o

def boolean(o, cutter, op='DIFFERENCE'):
    m = o.modifiers.new('b', 'BOOLEAN'); m.operation = op; m.object = cutter; m.solver = 'EXACT'
    apply_all(o); bpy.data.objects.remove(cutter, do_unlink=True); return o

def prim(kind, mat, loc=(0, 0, 0), rot=(0, 0, 0), size=(1, 1, 1), bev=0.0, seg=2, **kw):
    """primitive at GAME location/size (size = full extents for cubes); rot = blender euler applied before placing"""
    getattr(bpy.ops.mesh, 'primitive_' + kind + '_add')(**kw)
    o = bpy.context.active_object
    if kind == 'cube': o.scale = (size[0] / 2, size[2] / 2, size[1] / 2)
    else: o.scale = (size[0], size[2], size[1])
    o.rotation_euler = rot; bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.location = G(*loc); bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    if bev > 0:
        m = o.modifiers.new('bv', 'BEVEL'); m.width = bev; m.segments = seg; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(35); apply_all(o)
    return set_mat(o, mat)

def cyl_x(mat, loc, r, d, v=24, **kw):   # cylinder with its axis along game X
    return prim('cylinder', mat, loc, rot=(0, math.pi / 2, 0), size=(1, 1, 1), radius=r, depth=d, vertices=v, **kw)
def cyl_z(mat, loc, r, d, v=24, **kw):   # axis along game Z (forward)
    return prim('cylinder', mat, loc, rot=(math.pi / 2, 0, 0), size=(1, 1, 1), radius=r, depth=d, vertices=v, **kw)
def cyl_y(mat, loc, r, d, v=24, **kw):   # axis along game Y (up)
    return prim('cylinder', mat, loc, size=(1, 1, 1), radius=r, depth=d, vertices=v, **kw)

def sweep(path, prof, mat, closed=False, cap=True):
    """path: game-space points; prof: closed 2D loop [(side, up)] in the path's (outward normal, world up) frame"""
    bm = bmesh.new(); rings = []
    n = len(path)
    for i, p in enumerate(path):
        p = Vector(p); a = Vector(path[max(0, i - 1)]); b = Vector(path[min(n - 1, i + 1)])
        if closed: a = Vector(path[(i - 1) % n]); b = Vector(path[(i + 1) % n])
        t = (b - a); t.y = 0; t.normalize(); up = Vector((0, 1, 0)); side = t.cross(up).normalized()
        rings.append([bm.verts.new(G(*(p + side * s + up * u))) for s, u in prof])
    K = len(prof); seq = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for r0, r1 in seq:
        for k in range(K): bm.faces.new((r0[k], r0[(k + 1) % K], r1[(k + 1) % K], r1[k]))
    if cap and not closed:
        for r in (rings[0], rings[-1]): bm.faces.new(r)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return set_mat(new_obj('sweep', bm), mat)

def sweep_frames(path, frames, prof, mat, cap=True):
    """path: game points; frames: [(u, v)] game vectors per point; prof: [(a, b)] -> p + u*a + v*b"""
    bm = bmesh.new(); rings = []
    for p, (u, v) in zip(path, frames):
        p, u, v = Vector(p), Vector(u), Vector(v)
        rings.append([bm.verts.new(G(*(p + u * a + v * b))) for a, b in prof])
    K = len(prof)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(K): bm.faces.new((r0[k], r0[(k + 1) % K], r1[(k + 1) % K], r1[k]))
    if cap:
        for r in (rings[0], rings[-1]): bm.faces.new(r)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return set_mat(new_obj('sweepf', bm), mat)

def arch_flare(sx, zc, yc, rad, x, prof, mat, a0=-8, a1=188, n=28):
    """flare / lip following a wheel arch on side sx at body side x"""
    path, frames = [], []
    for k in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * k / n)
        path.append((x, yc + rad * math.sin(a), zc + rad * math.cos(a)))
        frames.append(((sx, 0, 0), (0, math.sin(a), math.cos(a))))
    return sweep_frames(path, frames, prof, mat)

# ---- surface snapping: ray-cast the body and seat details on it, oriented to the surface normal
C3 = None
def hit(obj, origin, direction):
    o = G(*origin); d = G(*direction); d.normalize()
    ok, loc, nrm, idx = obj.ray_cast(o, d)
    if not ok: return None, None
    return Vector((loc.x, loc.z, -loc.y)), Vector((nrm.x, nrm.z, -nrm.y))

def place(o, point, normal, up=(0, 1, 0), out=0.0, roll=0.0):
    """o was built at the origin in the game frame (x across, y up, z out of the surface); seat it on point/normal"""
    from mathutils import Matrix
    z = Vector(normal).normalized(); u = Vector(up)
    x = u.cross(z)
    if x.length < 1e-4: x = Vector((1, 0, 0))
    x.normalize(); y = z.cross(x)
    if roll: x, y = x * math.cos(roll) + y * math.sin(roll), y * math.cos(roll) - x * math.sin(roll)
    R = Matrix(((x.x, y.x, z.x), (x.y, y.y, z.y), (x.z, y.z, z.z)))
    Cg = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))           # game -> blender
    M = (Cg @ R @ Cg.inverted()).to_4x4()
    p = Vector(point) + z * out
    o.data.transform(Matrix.Translation(G(*p)) @ M)
    return o

def snap(body, mat, kind, origin, direction, size=(1, 1, 1), out=0.0, up=(0, 1, 0), roll=0.0, bev=0.0, seg=2, **kw):
    pt, n = hit(body, origin, direction)
    if pt is None: print('snap miss', mat, origin); return None
    o = prim(kind, mat, (0, 0, 0), size=size, bev=bev, seg=seg, **kw)
    return place(o, pt, n, up, out, roll)

def rrect(w, h, r, n=3):
    """rounded rectangle loop (side, up) centred at 0, w across, h tall"""
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n); pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

def join(parts, name):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); o = bpy.context.active_object; o.name = name
    return o

# ---------------------------------------------------------------- body loft
class Body:
    def __init__(s, S):
        s.S = S; s.L = S['L']; s.top = pchip(S['top']); s.bot0 = pchip(S['bot']); s.belt = pchip(S['belt']); s.hw = pchip(S['hw'])
        s.roofw = pchip(S['roofw']); s.ar = S['r'] + S['arch']; s.ayc = S['r'] + S.get('archLift', 0.02)
    def bot(s, z):
        b = s.bot0(z)
        for zc in s.S['axles']:
            d = z - zc
            if abs(d) < s.ar: b = max(b, s.ayc + math.sqrt(s.ar * s.ar - d * d))
        return b
    def endoff(s, z):
        er = s.S['er']; d = min(s.L / 2 - z, z + s.L / 2)
        return 0.0 if d >= er else er - math.sqrt(max(0.0, er * er - (er - d) ** 2))
    def ring(s, z):
        S = s.S; w = s.hw(z); top = s.top(z); bot = s.bot(z); off = s.endoff(z)
        belt = min(s.belt(z), top - 0.004); belt = max(belt, bot + 0.1)
        rb = min(S.get('sillR', 0.07), (belt - bot) * 0.3)
        bulge = S.get('bulge', 0.012)
        half = [(0.0, bot), (w * 0.55, bot), (w - rb, bot + 0.002)]
        for k in (1, 2): a = k / 3 * math.pi / 2; half.append((w - rb + rb * math.sin(a), bot + rb - rb * math.cos(a)))
        half.append((w, bot + rb))
        for k in range(1, 6):   # lower side, slight outward bulge, crease at the belt
            t = k / 6; half.append((w * (1 + bulge * math.sin(math.pi * t ** 0.8)), lerp(bot + rb, belt, t)))
        xb = w * (1 + S.get('crease', 0.006)); half.append((xb, belt))
        # upper quarter: shoulder -> side glass (tumblehome) -> roof edge -> crown centre (or hood / deck crown);
        # sampled densely then resampled by arc length so glass, pillars and roof all get even resolution
        H = max(top - belt, 0.004); xr = min(s.roofw(z), xb * 0.98)
        n = lerp(S.get('nHood', 2.6), S.get('nCab', 6.0), sstep(0.04, 0.3, H))
        sh = S.get('shoulder', 0.02); cab = sstep(0.03, 0.15, H)
        x0 = xb - sh * 0.5; xtop = lerp(xb * 0.97, xr, cab)
        dense = []
        for k in range(161):
            th = (k / 160) * math.pi / 2; c, sn = math.cos(th), math.sin(th)
            cx = c ** (2 / n); sy = sn ** (2 / n)
            xw = lerp(x0, xtop, sy)
            dense.append((xw * cx, belt + H * sy + S.get('crown', 0.015) * (1 - cx * cx) * sy))
        acc = [0.0]
        for a, b in zip(dense, dense[1:]): acc.append(acc[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        NQ = 18; j = 0
        for k in range(NQ + 1):
            t = acc[-1] * k / NQ
            while j < len(acc) - 2 and acc[j + 1] < t: j += 1
            f = (t - acc[j]) / max(acc[j + 1] - acc[j], 1e-9)
            half.append((lerp(dense[j][0], dense[j + 1][0], f), lerp(dense[j][1], dense[j + 1][1], f)))
        half[-1] = (0.0, half[-1][1])
        for z0, z1, bw, bh in S.get('bulges', []):
            fz = sstep(z0, z0 + 0.15, z) * (1 - sstep(z1 - 0.15, z1, z))
            if fz > 0: half = [(x, y + bh * fz * sstep(0.0, 1.0, 1 - abs(x) / bw) if y > belt + 0.002 else y) for x, y in half]
        # end rounding: shrink toward the ring middle
        if off > 0:
            mid = (bot + top) / 2; hh = max((top - bot) / 2, 1e-3)
            half = [(x * max(0.0, (w - off)) / w, mid + (y - mid) * max(0.05, (hh - off * S.get('erY', 0.6))) / hh) for x, y in half]
        loop = half + [(-x, y) for x, y in reversed(half[1:-1])]
        return loop, dict(w=w, top=top, bot=bot, belt=belt, xb=xb, xr=xr, H=H)

def build_body(S):
    B = Body(S); L = S['L']
    zs = [-L / 2 + L * k / 150 for k in range(151)]
    er = S['er']
    for e in (-1, 1):
        for k in range(1, 9): zs.append(e * (L / 2 - er * (1 - math.cos(k / 9 * math.pi / 2))))
    for zc in S['axles']:
        for sgn in (-1, 1):
            for dd in (0.003, -0.003, -0.02, -0.06): zs.append(zc + sgn * (B.ar + dd))
    for z in S.get('seams', []): zs += [z - 0.005, z + 0.005]
    zs = sorted(set(round(z, 4) for z in zs if -L / 2 <= z <= L / 2))
    bm = bmesh.new(); rings = []; info = []
    for z in zs:
        loop, inf = B.ring(z); info.append(inf)
        rings.append([bm.verts.new(G(x, y, z)) for x, y in loop])
    K = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for k in range(K): bm.faces.new((a[k], a[(k + 1) % K], b[(k + 1) % K], b[k]))
    caps = []
    for ring, dz in ((rings[0], -1), (rings[-1], 1)):
        c = bm.verts.new(sum((v.co for v in ring), Vector()) / K)
        for k in range(K): caps.append(bm.faces.new((ring[k], ring[(k + 1) % K], c)))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.faces.ensure_lookup_table()
    mid = bm.faces.layers.int.new('mid')
    # ---- exact window cuts: bisect along each window edge (outer = opening, inner = glass), then classify by polygon
    gl = S['glass']; fw = S.get('frame', 0.022)
    def ccw(poly):
        a2 = sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(poly, poly[1:] + poly[:1]))
        return poly if a2 > 0 else poly[::-1]
    def shrink(poly, d):
        out = []; n = len(poly)
        lines = []
        for i in range(n):
            p, q = Vector(poly[i]), Vector(poly[(i + 1) % n]); e = (q - p).normalized(); nrm = Vector((-e.y, e.x))
            lines.append((p + nrm * d, e))
        for i in range(n):
            (p1, e1), (p2, e2) = lines[i - 1], lines[i]
            den = e1.x * e2.y - e1.y * e2.x
            t = ((p2 - p1).x * e2.y - (p2 - p1).y * e2.x) / den if abs(den) > 1e-9 else 0
            out.append(tuple(p1 + e1 * t))
        return out
    def inside(poly, pt, eps=1e-4):
        for p, q in zip(poly, poly[1:] + poly[:1]):
            if (q[0] - p[0]) * (pt[1] - p[1]) - (q[1] - p[1]) * (pt[0] - p[0]) < -eps: return False
        return True
    wins = []   # (kind, sign, outer, inner)
    for poly in gl['side']:
        po = ccw(list(poly))
        for sg in (1, -1): wins.append(('side', sg, po, shrink(po, fw)))
    for kind in ('front', 'rear'):
        if gl.get(kind): po = ccw(list(gl[kind])); wins.append((kind, 0, po, shrink(po, fw)))
    for kind, sg, po, pi in wins:
        for poly in (po, pi):
            for p, q in zip(poly, poly[1:] + poly[:1]):
                bm.faces.ensure_lookup_table()
                lo = [min(c[0] for c in po) - 0.06, min(c[1] for c in po) - 0.06]; hi = [max(c[0] for c in po) + 0.06, max(c[1] for c in po) + 0.06]
                sel = []
                for f in bm.faces:
                    c = f.calc_center_median(); x, y, z = c.x, c.z, -c.y
                    if kind == 'side':
                        if x * sg > 0.2 and lo[0] < z < hi[0] and lo[1] < y < hi[1]: sel.append(f)
                    elif lo[0] < x < hi[0] and lo[1] < z < hi[1] and y > 0.75: sel.append(f)
                if not sel: continue
                geom = list(set(sel)) + list(set(e for f in sel for e in f.edges)) + list(set(v for f in sel for v in f.verts))
                dx, dy = q[0] - p[0], q[1] - p[1]
                if kind == 'side': co = G(0, p[1], p[0]); no = Vector((0, -dy, -dx))       # line in (z, y)
                else: co = G(p[0], 0, p[1]); no = Vector((dy, dx, 0))                       # line in (x, z)
                bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=co, plane_no=no)
    bm.faces.ensure_lookup_table(); bm.normal_update()
    glass_f = []
    for f in bm.faces:
        c = f.calc_center_median(); x, y, z = c.x, c.z, -c.y; n = f.normal; nx, ny, nz = n.x, n.z, -n.y
        m = 'paint'
        w = B.hw(z); bt = B.bot(z); belt = min(B.belt(z), B.top(z) - 0.004); top = B.top(z)
        if y < bt + 0.012 and abs(x) < w * 0.9: m = 'black'                           # underbody / arch tunnels
        if f in caps: m = 'paint'
        for zc in S['axles']:
            if abs(abs(z - zc) - B.ar) < 0.012 and abs(nz) > 0.5 and y < belt - 0.03: m = 'black'
        if m == 'paint' and y < belt - 0.012 and y > bt + 0.05:
            for sz in S.get('seams', []):
                if abs(z - sz) < 0.005: m = 'gap'
        if m == 'paint' and y > belt:
            for kind, sg, po, pi in wins:
                if kind == 'side':
                    if x * sg > 0 and abs(nx) > 0.25 and inside(po, (z, y)): m = 'glass' if inside(pi, (z, y)) else S.get('frameMat', 'rubber')
                elif abs(nx) < 0.55 and inside(po, (x, z)): m = 'glass' if inside(pi, (x, z)) else S.get('frameMat', 'rubber')
                if m != 'paint': break
        if m == 'paint' and S.get('pillarMat') and y > belt + 0.03 and abs(nx) > 0.45 and S['pillarZ'][0] < z < S['pillarZ'][1] and y < S.get('pillarTop', lambda zz: top - 0.06)(z):
            m = S['pillarMat']
        if m == 'glass': glass_f.append(f)
        f[mid] = MID[m]
    # sink the glass into its frame
    vs = set(v for f in glass_f for v in f.verts); nrm = {v: v.normal.copy() for v in vs}
    for v in vs: v.co -= nrm[v] * S.get('recess', 0.014)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    o = new_obj('body', bm)
    o.data.attributes['mid'].name  # (int face layer becomes attribute 'mid')
    return o, B

# ---------------------------------------------------------------- wheels
def build_wheel(S):
    r, w = S['r'], S['tireW']; rr = S['rimR'] * r
    bm = bmesh.new()
    # tyre profile in (radius, axial) from the inner bead around the tread to the outer bead
    prof = [(rr * 0.98, -w * 0.42), (rr * 1.06, -w * 0.5), (lerp(rr, r, 0.55), -w * 0.53), (r * 0.965, -w * 0.5), (r * 0.995, -w * 0.44)]
    for k in range(9):   # tread with 4 circumferential grooves
        a = -w * 0.44 + w * 0.88 * k / 8
        prof.append((r - (0.008 if k in (2, 6) else 0.0) - (0.006 if k == 4 else 0), a))
    prof += [(r * 0.995, w * 0.44), (r * 0.965, w * 0.5), (lerp(rr, r, 0.55), w * 0.53), (rr * 1.06, w * 0.5), (rr * 0.98, w * 0.42)]
    vs = [bm.verts.new((ax, rad, 0)) for rad, ax in prof]
    for a, b in zip(vs, vs[1:]): bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], angle=2 * math.pi, steps=48, axis=(1, 0, 0), cent=(0, 0, 0))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    tire = set_mat(new_obj('tire', bm), 'tire')
    for p in tire.data.polygons: p.use_smooth = True
    parts = [tire]
    rim = S.get('rimMat', 'rim'); fx = w * S.get('rimOff', 0.3)
    # rim barrel + lip, dish, hub
    bm = bmesh.new()
    rp = [(rr * 0.97, -w * 0.45), (rr, -w * 0.42), (rr * 0.98, fx - 0.03), (rr * 1.02, fx - 0.005), (rr * 1.01, fx + 0.006), (rr * 0.93, fx + 0.004), (rr * 0.9, fx - 0.012)]
    vs = [bm.verts.new((ax, rad, 0)) for rad, ax in rp]
    for a, b in zip(vs, vs[1:]): bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], angle=2 * math.pi, steps=48, axis=(1, 0, 0), cent=(0, 0, 0))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    barrel = set_mat(new_obj('barrel', bm), rim); parts.append(barrel)
    parts.append(set_mat(cyl_x('black', (fx - 0.06, 0, 0), rr * 0.92, 0.01, 48), 'black'))       # dark well behind the spokes
    parts.append(cyl_x('disc', (fx - 0.1, 0, 0), rr * 0.78, 0.025, 36))                           # brake disc
    hub = cyl_x(rim, (fx - 0.01, 0, 0), rr * S.get('hubR', 0.25), 0.05, 24); parts.append(hub)
    parts.append(cyl_x(S.get('capMat', 'chrome'), (fx + 0.018, 0, 0), rr * S.get('hubR', 0.25) * 0.6, 0.012, 20))
    ns = S['spokes']; from mathutils import Matrix
    sp_n = S.get('spokeSplit', 1)
    for k in range(ns):
        a = 2 * math.pi * k / ns
        for j in range(sp_n):
            aa = a + (j - (sp_n - 1) / 2) * S.get('splitA', 0.12)
            sp = prim('cube', rim, (0, 0, 0), size=(S.get('spokeT', 0.03), rr * 0.74, S['spokeW']), bev=0.008)
            sp.data.transform(Matrix.Translation((fx - 0.012, 0, 0)) @ Matrix.Rotation(aa, 4, 'X') @ Matrix.Translation((0, 0, rr * 0.5)) @ Matrix.Rotation(S.get('spokeTwist', 0.0), 4, 'Z'))
            parts.append(sp)
    for k in range(5 if ns % 5 == 0 else 4):  # lug nuts
        a = 2 * math.pi * (k + 0.5) / (5 if ns % 5 == 0 else 4); ro = rr * S.get('hubR', 0.25) * 0.75
        parts.append(cyl_x('chrome', (fx + 0.02, math.cos(a) * ro, math.sin(a) * ro), 0.011, 0.016, 6))
    return join(parts, 'wheel')

# ---------------------------------------------------------------- AO bake + attributes
def bake_and_tag(o, extra=(), ao_strength=0.85, dist=0.45):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 96; sc.cycles.device = 'CPU'
    sc.render.bake.target = 'VERTEX_COLORS'
    if not sc.world: sc.world = bpy.data.worlds.new('w')
    sc.world.light_settings.distance = dist
    me = o.data
    if not me.materials: me.materials.append(bpy.data.materials.new('m'))
    ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT'); me.color_attributes.active_color = ao
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type='AO')
    me = o.data; ao = me.color_attributes['AO']; mid = me.attributes['mid']
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); pe = me.uv_layers.new(name='PE')
    aov = [d.color[0] for d in ao.data]
    for p in me.polygons:
        a, paint, emit = MATS[NAMES[mid.data[p.index].value]]
        for li, vi in zip(p.loop_indices, p.vertices):
            k = 1 - ao_strength * (1 - aov[vi]) if emit not in (1, 2) else 1.0
            col.data[li].color = (a[0] * k, a[1] * k, a[2] * k, 1); pe.data[li].uv = (paint, emit)
    me.color_attributes.remove(me.color_attributes['AO'])
    ci = [a.name for a in me.color_attributes].index('Col')
    me.color_attributes.active_color_index = ci; me.color_attributes.render_color_index = ci
    while len(me.uv_layers) > 1 and me.uv_layers[0].name != 'PE': me.uv_layers.remove(me.uv_layers[0])

def export(o, path):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_vertex_color='NAME', export_vertex_color_name='Col', export_all_vertex_colors=False,
                              export_texcoords=True, export_normals=True, export_materials='NONE', export_apply=True)

def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)

def smooth(o, angle=32):
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    try: bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
    except Exception:
        bpy.ops.object.shade_smooth()
    # bake the auto-smooth node into real split normals so the glTF export keeps the hard edges
    apply_all(o)

def decimate(o, ratio):
    c = o.copy(); c.data = o.data.copy(); link(c)
    m = c.modifiers.new('d', 'DECIMATE'); m.ratio = ratio; apply_all(c); return c
