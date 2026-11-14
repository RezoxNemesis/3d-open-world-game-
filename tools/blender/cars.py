# Build hero cars with carbody.py, bake AO, export GLBs (+ low LOD) and render a Cycles preview.
# usage: python3 cars.py -- bison [shera gajraj] [--render] [--angle 35]
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector, Matrix
from carbody import *
from mathutils import Vector

def mirror_x(fn):
    out = []
    for sx in (-1, 1): out += fn(sx)
    return out

# ================================================================ BISON 69 (1960s fastback muscle car)
BISON = dict(key='bison', L=4.62, W=1.80, r=0.335, tireW=0.215, arch=0.06, axles=[1.45, -1.29], er=0.06, erY=0.5,
    top=[(-2.31, 0.90), (-2.27, 0.972), (-2.18, 0.985), (-1.95, 0.975), (-1.62, 0.985), (-1.3, 1.06), (-0.9, 1.18), (-0.55, 1.265), (-0.3, 1.295),
         (0.0, 1.293), (0.12, 1.278), (0.35, 1.13), (0.6, 0.928), (0.72, 0.898), (1.2, 0.878), (1.9, 0.862), (2.2, 0.846), (2.31, 0.80)],
    bot=[(-2.31, 0.42), (-2.2, 0.27), (-2.0, 0.2), (1.95, 0.19), (2.2, 0.25), (2.31, 0.34)],
    belt=[(-2.31, 0.86), (-2.0, 0.9), (-1.6, 0.915), (-1.1, 0.9), (-0.4, 0.865), (0.6, 0.85), (1.6, 0.83), (2.31, 0.79)],
    hw=[(-2.31, 0.83), (-2.2, 0.87), (-1.7, 0.9), (-1.2, 0.9), (-0.6, 0.875), (0.6, 0.87), (1.45, 0.885), (2.1, 0.87), (2.31, 0.84)],
    roofw=[(-2.31, 0.72), (-1.6, 0.68), (-0.8, 0.6), (0.0, 0.6), (0.6, 0.7), (2.31, 0.72)],
    nCab=5.0, nHood=2.4, crown=0.016, shoulder=0.035, bulge=0.012, crease=0.006, sillR=0.06,
    seams=[0.64, -0.5], glass=dict(side=[[(0.6, 0.885), (-0.33, 0.885), (-0.33, 1.232), (0.06, 1.242)], [(-0.38, 0.9), (-0.38, 1.222), (-0.9, 1.06)]],
               front=[(-0.66, 0.6), (0.66, 0.6), (0.54, 0.1), (-0.54, 0.1)], rear=[(-0.5, -0.45), (0.5, -0.45), (0.56, -1.45), (-0.56, -1.45)]),
    frame=0.02, frameMat='chrome', roofEdge=0.045, bulges=[(1.0, 2.25, 0.32, 0.03)],
    rimR=0.6, spokes=5, spokeW=0.075, spokeT=0.028, hubR=0.28, rimMat='rim', capMat='chrome', rimOff=0.28,
    paint=(0.22, 0.006, 0.005))

def bison_details(S, B):
    P = []; L = S['L']; zf, zb = L / 2, -L / 2
    # --- front: recessed grille with egg-crate, round lamps in chrome bezels, centre emblem, chrome blade bumper
    P.append(prim('cube', 'grille', (0, 0.6, zf - 0.03), size=(1.22, 0.25, 0.1), bev=0.02))
    P.append(sweep([(-0.62, 0.6, zf + 0.025), (0.62, 0.6, zf + 0.025)], rrect(0.02, 0.27, 0.008), 'chrome'))
    for i in range(4): P.append(prim('cube', 'trim', (0, 0.525 + i * 0.05, zf + 0.022), size=(1.18, 0.01, 0.014)))
    for i in range(11): P.append(prim('cube', 'trim', (-0.5 + i * 0.1, 0.6, zf + 0.021), size=(0.01, 0.22, 0.014)))
    P.append(cyl_z('black', (0, 0.6, zf + 0.03), 0.075, 0.03, 32))
    P.append(cyl_z('chrome', (0, 0.6, zf + 0.048), 0.062, 0.012, 32))
    P.append(prim('cube', 'badge', (0, 0.6, zf + 0.056), size=(0.08, 0.045, 0.01), bev=0.006))
    for sx in (-1, 1):
        x = sx * 0.7
        P.append(cyl_z('black', (x, 0.61, zf - 0.005), 0.112, 0.05, 32))
        P.append(prim('torus', 'chrome', (x, 0.61, zf + 0.02), rot=(math.pi / 2, 0, 0), major_radius=0.105, minor_radius=0.014, major_segments=40, minor_segments=8))
        lens = prim('uv_sphere', 'head', (x, 0.61, zf + 0.0), size=(0.092, 0.092, 0.035), segments=32, ring_count=12); P.append(lens)
        P.append(cyl_z('reflector', (x, 0.61, zf + 0.004), 0.06, 0.01, 24))
        P.append(prim('cube', 'amber', (sx * 0.5, 0.36, zf + 0.0), size=(0.16, 0.05, 0.04), bev=0.01))  # parking lamps in the valance
    bump = [(-0.88, 0.44, 1.98), (-0.86, 0.44, 2.18), (-0.7, 0.44, 2.33), (-0.3, 0.44, 2.37), (0.3, 0.44, 2.37), (0.7, 0.44, 2.33), (0.86, 0.44, 2.18), (0.88, 0.44, 1.98)]
    P.append(sweep(bump, rrect(0.06, 0.11, 0.025), 'chrome'))
    for sx in (-1, 1): P.append(prim('cube', 'rubber', (sx * 0.32, 0.43, 2.4), size=(0.07, 0.07, 0.04), bev=0.012))
    # --- rear: concave tail panel, tri-bar lamps in chrome surrounds, centre filler cap, bumper, exhausts
    P.append(prim('cube', 'black', (0, 0.7, zb + 0.02), size=(1.5, 0.22, 0.08), bev=0.015))
    P.append(sweep([(0.76, 0.81, zb - 0.025), (-0.76, 0.81, zb - 0.025)], rrect(0.02, 0.012, 0.004), 'chrome'))
    P.append(sweep([(0.76, 0.59, zb - 0.025), (-0.76, 0.59, zb - 0.025)], rrect(0.02, 0.012, 0.004), 'chrome'))
    for sx in (-1, 1):
        for k in range(3):
            x = sx * (0.24 + k * 0.17)
            P.append(prim('cube', 'chrome', (x, 0.7, zb - 0.02), size=(0.13, 0.2, 0.02), bev=0.008))
            P.append(prim('cube', 'tail', (x, 0.7, zb - 0.028), size=(0.1, 0.17, 0.02), bev=0.012))
    P.append(cyl_z('chrome', (0, 0.7, zb - 0.03), 0.07, 0.02, 32)); P.append(prim('cube', 'badge', (0, 0.7, zb - 0.042), size=(0.08, 0.045, 0.01), bev=0.006))
    rb = [(0.88, 0.47, -1.98), (0.86, 0.47, -2.18), (0.7, 0.47, -2.33), (0.3, 0.47, -2.37), (-0.3, 0.47, -2.37), (-0.7, 0.47, -2.33), (-0.86, 0.47, -2.18), (-0.88, 0.47, -1.98)]
    P.append(sweep(rb, rrect(0.06, 0.1, 0.025), 'chrome'))
    P.append(prim('cube', 'plate', (0, 0.32, 2.34), size=(0.5, 0.12, 0.01), bev=0.004)); P.append(prim('cube', 'plate', (0, 0.36, -2.33), size=(0.5, 0.12, 0.01), bev=0.004))
    for zz, dz in ((2.346, 1), (-2.337, -1)):
        yy = 0.32 if dz > 0 else 0.36
        for k in range(8): P.append(prim('cube', 'plate_txt', (-0.19 + k * 0.054 + (0.02 if k > 3 else 0), yy, zz), size=(0.032, 0.07, 0.004)))
    for sx in (-1, 1): P.append(cyl_z('chrome', (sx * 0.5, 0.27, -2.3), 0.04, 0.18, 16)); P.append(cyl_z('black', (sx * 0.5, 0.27, -2.392), 0.03, 0.01, 16))
    # --- sides: quarter scoops, rocker chrome, bullet mirrors, handles, fender badges, wipers, hood scoop, antenna
    for sx in (-1, 1):
        z = -0.74; x = sx * (B.hw(z) * 1.01 + 0.004)
        P.append(prim('cube', 'black', (x, 0.67, z), size=(0.03, 0.13, 0.26), bev=0.012))
        for j in range(3): P.append(prim('cube', 'chrome', (x + sx * 0.01, 0.625 + j * 0.045, z), size=(0.012, 0.012, 0.24)))
        P.append(sweep([(sx * (B.hw(zz) * 1.012 + 0.003), 0.235, zz) for zz in (-0.85, -0.3, 0.3, 0.98)], rrect(0.01, 0.03, 0.004), 'chrome', cap=True))
        mz = 0.5; my = B.belt(mz) + 0.05; mx = sx * (B.hw(mz) + 0.07)
        P.append(prim('cylinder', 'chrome', (sx * (B.hw(mz) + 0.025), my - 0.02, mz), size=(1, 1, 1), radius=0.012, depth=0.07, vertices=8))
        P.append(prim('uv_sphere', 'chrome', (mx, my + 0.02, mz), size=(0.055, 0.05, 0.085), segments=16, ring_count=10))
        P.append(prim('cube', 'chrome', (sx * (B.hw(-0.05) * 1.012 + 0.008), 0.8, -0.05), size=(0.014, 0.024, 0.14), bev=0.005))
        P.append(prim('cube', 'chrome', (sx * (B.hw(1.75) * 1.012 + 0.004), 0.74, 1.75), size=(0.01, 0.035, 0.16), bev=0.004))
        P.append(prim('cube', 'black', (sx * 0.28, B.top(0.69) + 0.012, 0.68), rot=(0, 0, sx * 0.05), size=(0.55, 0.012, 0.02)))
    P.append(prim('cylinder', 'chrome', (0.8, 0.98, 1.95), size=(1, 1, 1), radius=0.004, depth=0.4, vertices=6))
    # interior silhouette behind the glass (seat backs, head rests, dash, wheel)
    P.append(prim('cube', 'interior', (0, 0.85, 0.15), size=(1.35, 0.25, 0.5)))
    for sx in (-1, 1):
        P.append(prim('cube', 'interior', (sx * 0.36, 0.93, -0.28), rot=(0.25, 0, 0), size=(0.46, 0.5, 0.12), bev=0.04))
        P.append(prim('cube', 'interior', (sx * 0.36, 1.18, -0.36), size=(0.22, 0.14, 0.08), bev=0.03))
    P.append(prim('torus', 'black', (-0.36, 1.0, 0.18), rot=(math.radians(65), 0, 0), major_radius=0.18, minor_radius=0.014, major_segments=24, minor_segments=6))
    P.append(prim('cube', 'interior', (0, 0.75, -0.75), size=(1.4, 0.3, 0.6)))
    return P

CARS = {'bison': (BISON, bison_details)}

def interior(S, B, zseat, zdash, yfloor, xs=0.37):
    P = []
    P.append(prim('cube', 'interior', (0, yfloor + 0.32, zdash), size=(B.hw(zdash) * 1.6, 0.26, 0.5)))
    for sx in (-1, 1):
        P.append(prim('cube', 'interior', (sx * xs, yfloor + 0.38, zseat), rot=(0.22, 0, 0), size=(0.48, 0.55, 0.13), bev=0.04))
        P.append(prim('cube', 'interior', (sx * xs, yfloor + 0.1, zseat + 0.25), size=(0.48, 0.12, 0.5), bev=0.04))
        P.append(prim('cube', 'interior', (sx * xs, yfloor + 0.7, zseat - 0.07), size=(0.24, 0.16, 0.09), bev=0.035))
    P.append(prim('torus', 'black', (-xs, yfloor + 0.47, zdash - 0.2), rot=(math.radians(62), 0, 0), major_radius=0.18, minor_radius=0.016, major_segments=28, minor_segments=6))
    P.append(prim('cube', 'interior', (0, yfloor + 0.2, zseat - 0.75), size=(B.hw(zseat - 0.75) * 1.6, 0.3, 0.6)))
    return P

def calipers(S, col='caliper'):
    P = []
    for x, y, z in wheel_positions(S):
        sx = 1 if x > 0 else -1
        P.append(prim('cube', col, (x - sx * S['tireW'] * 0.12, y + S['r'] * 0.32, z - S['r'] * 0.18), rot=(0.5, 0, 0), size=(0.06, S['r'] * 0.32, S['r'] * 0.36), bev=0.015))
    return P

def plates(zf, yf, zr, yr):
    P = [prim('cube', 'plate', (0, yf, zf), size=(0.5, 0.12, 0.012), bev=0.004), prim('cube', 'plate', (0, yr, zr), size=(0.5, 0.12, 0.012), bev=0.004)]
    for zz, yy, dz in ((zf + 0.007, yf, 1), (zr - 0.007, yr, -1)):
        for k in range(8): P.append(prim('cube', 'plate_txt', (-0.19 + k * 0.054 + (0.02 if k > 3 else 0), yy, zz), size=(0.032, 0.07, 0.004)))
    return P

# ================================================================ SHERA S9 (modern twin-turbo sports coupe)
SHERA = dict(key='shera', L=4.72, W=1.88, r=0.345, tireW=0.26, arch=0.045, axles=[1.42, -1.43], er=0.07, erY=0.5,
    top=[(-2.36, 0.78), (-2.31, 0.93), (-2.2, 0.98), (-1.95, 0.99), (-1.72, 1.01), (-1.3, 1.17), (-0.95, 1.3), (-0.6, 1.365), (-0.2, 1.385), (0.15, 1.37),
         (0.45, 1.2), (0.78, 0.99), (0.92, 0.955), (1.3, 0.93), (1.8, 0.885), (2.1, 0.835), (2.26, 0.77), (2.33, 0.69), (2.36, 0.62)],
    bot=[(-2.36, 0.32), (-2.25, 0.2), (-1.9, 0.15), (1.95, 0.14), (2.2, 0.17), (2.36, 0.24)],
    belt=[(-2.36, 0.8), (-2.0, 0.93), (-1.5, 0.97), (-0.8, 0.955), (0.0, 0.925), (0.8, 0.895), (1.5, 0.86), (2.1, 0.8), (2.36, 0.66)],
    hw=[(-2.36, 0.8), (-2.2, 0.9), (-1.5, 0.94), (-0.5, 0.915), (0.5, 0.91), (1.4, 0.935), (2.1, 0.9), (2.36, 0.82)],
    roofw=[(-2.36, 0.72), (-1.6, 0.66), (-0.8, 0.64), (0.0, 0.66), (0.8, 0.74), (2.36, 0.78)],
    nCab=7.0, nHood=2.8, crown=0.02, shoulder=0.05, bulge=0.008, crease=0.008, sillR=0.05,
    seams=[0.82, -0.62],
    glass=dict(side=[[(0.8, 0.94), (-0.6, 0.975), (-0.58, 1.325), (0.18, 1.335)], [(-0.66, 0.98), (-1.0, 1.0), (-1.1, 1.15), (-0.66, 1.33)]],
               front=[(-0.72, 0.9), (0.72, 0.9), (0.6, 0.18), (-0.6, 0.18)], rear=[(-0.58, -0.62), (0.58, -0.62), (0.62, -1.66), (-0.62, -1.66)]),
    frame=0.02, frameMat='trim', recess=0.012, bulges=[(1.1, 2.15, 0.22, 0.022)], pillarMat='trim', pillarZ=(-0.66, -0.6),
    rimR=0.72, spokes=5, spokeSplit=2, splitA=0.17, spokeW=0.04, spokeT=0.03, hubR=0.2, rimMat='darkrim', capMat='darkrim', rimOff=0.3,
    paint=(0.01, 0.06, 0.32))

def shera_details(S, B):
    P = []; L = S['L']; zf, zb = L / 2, -L / 2; Bo = B.obj
    def add(o):
        if o is not None: P.append(o)
        return o
    F, R = (0, 0, -1), (0, 0, 1)
    for sx in (-1, 1):
        # twin upright grilles: dark recess, satin surround, vertical slats
        x = sx * 0.16
        add(snap(Bo, 'grille', 'cube', (x, 0.52, 5), F, size=(0.22, 0.25, 0.08), out=-0.02, bev=0.05, seg=4))
        add(snap(Bo, 'satin', 'cube', (x, 0.52, 5), F, size=(0.24, 0.27, 0.03), out=-0.012, bev=0.06, seg=4))
        for k in range(6): add(snap(Bo, 'satin', 'cube', (x - 0.0625 + k * 0.025, 0.52, 5), F, size=(0.008, 0.21, 0.03), out=0.012))
        # head lamps at the corners where the hood turns into the fascia
        add(snap(Bo, 'black', 'cube', (sx * 0.6, 0.665, 5), F, size=(0.42, 0.13, 0.05), out=-0.012, roll=-sx * 0.12, bev=0.03, seg=3))
        add(snap(Bo, 'head', 'cube', (sx * 0.6, 0.675, 5), F, size=(0.34, 0.035, 0.04), out=0.004, roll=-sx * 0.12, bev=0.012))
        add(snap(Bo, 'head', 'cube', (sx * 0.56, 0.635, 5), F, size=(0.2, 0.012, 0.03), out=0.008, roll=-sx * 0.12))
        add(snap(Bo, 'chrome', 'cylinder', (sx * 0.7, 0.66, 5), F, out=0.0, radius=0.035, depth=0.03, vertices=16))
        # lower intakes with mesh, fog slot
        add(snap(Bo, 'grille', 'cube', (sx * 0.58, 0.36, 5), F, size=(0.34, 0.14, 0.06), out=-0.015, bev=0.035, seg=3))
        for k in range(4): add(snap(Bo, 'black', 'cube', (sx * 0.58, 0.315 + k * 0.03, 5), F, size=(0.3, 0.006, 0.03), out=0.005))
        # side: gills behind the front wheels, mirrors, flush handles, skirts
        add(snap(Bo, 'black', 'cube', (5 * sx, 0.68, 0.92), (-sx, 0, 0), size=(0.2, 0.08, 0.03), out=-0.005, bev=0.012))
        for k in range(3): add(snap(Bo, 'satin', 'cube', (5 * sx, 0.655 + k * 0.025, 0.92), (-sx, 0, 0), size=(0.18, 0.006, 0.02), out=0.006))
        mz = 0.7; my = B.belt(mz) + 0.07
        pt, n = hit(Bo, (5 * sx, my, mz), (-sx, 0, 0))
        if pt is not None:
            add(place(prim('cube', 'trim', size=(0.05, 0.03, 0.09), bev=0.01), pt, n, out=0.04))
            add(place(prim('cube', 'paint', size=(0.19, 0.1, 0.08), bev=0.035, seg=3), pt + Vector((0, 0.025, -0.03)), n, out=0.12))
            add(place(prim('cube', 'glass', size=(0.15, 0.07, 0.01), bev=0.02, seg=2), pt + Vector((0, 0.025, -0.072)), (0, 0, -1), out=0.0)) if False else None
            add(place(prim('cube', 'glass', size=(0.16, 0.08, 0.01), bev=0.01), pt + Vector((0, 0.02, -0.11)), (0, 0, -1), out=0.0) if False else None)
        add(snap(Bo, 'satin', 'cube', (5 * sx, 0.885, -0.3), (-sx, 0, 0), size=(0.16, 0.022, 0.012), out=0.003, bev=0.004))
        P.append(sweep([(sx * (B.hw(zz) * 1.01 + 0.012), 0.2, zz) for zz in (-1.0, -0.4, 0.4, 0.98)], rrect(0.03, 0.06, 0.012), 'trim'))
        # LED tail lamps: centre section + a piece wrapping round the corner
        add(snap(Bo, 'black', 'cube', (sx * 0.56, 0.8, -5), R, size=(0.42, 0.1, 0.04), out=-0.01, roll=sx * 0.05, bev=0.02))
        add(snap(Bo, 'tail', 'cube', (sx * 0.56, 0.805, -5), R, size=(0.38, 0.06, 0.03), out=0.002, roll=sx * 0.05, bev=0.015))
        add(snap(Bo, 'tail', 'cube', (sx * 0.56, 0.79, -5), R, size=(0.36, 0.01, 0.02), out=0.01, roll=sx * 0.05))
        d = Vector((sx * 0.8, 0, -0.6)).normalized()
        add(snap(Bo, 'tail', 'cube', (sx * 0.88 + d.x * 4, 0.8, -2.2 + d.z * 4), tuple(-d), size=(0.18, 0.06, 0.03), out=0.0, bev=0.012))
        # quad exhausts in the diffuser
        for k in (-1, 1):
            P.append(cyl_z('satin', (sx * (0.45 + k * 0.1), 0.27, zb - 0.02), 0.05, 0.16, 20)); P.append(cyl_z('black', (sx * (0.45 + k * 0.1), 0.27, zb - 0.1), 0.038, 0.01, 16))
    add(snap(Bo, 'grille', 'cube', (0, 0.3, 5), F, size=(0.55, 0.08, 0.06), out=-0.015, bev=0.025))
    P.append(prim('cube', 'black', (0, 0.205, 2.31), size=(1.5, 0.02, 0.07), bev=0.008))                    # splitter lip
    P.append(prim('cube', 'black', (0, 0.3, zb + 0.03), size=(1.45, 0.14, 0.12), bev=0.02))                 # diffuser
    for k in range(5): P.append(prim('cube', 'black', (-0.3 + k * 0.15, 0.25, zb - 0.02), size=(0.012, 0.1, 0.1)))
    add(snap(Bo, 'black', 'cube', (0, 5, -0.85), (0, -1, 0), size=(0.045, 0.14, 0.05), up=(0, 0, 1), out=0.02, bev=0.02))   # shark fin
    add(snap(Bo, 'badge', 'cylinder', (0, 5, 2.2), (0, -1, 0), up=(0, 0, 1), out=0.005, radius=0.035, depth=0.02, vertices=24))
    add(snap(Bo, 'badge', 'cylinder', (0, 0.62, -5), R, out=0.005, radius=0.035, depth=0.02, vertices=24))
    for sx in (-1, 1): add(snap(Bo, 'black', 'cube', (sx * 0.3, 5, 0.97), (0, -1, 0), up=(0, 0, 1), roll=sx * 0.06, size=(0.6, 0.02, 0.012), out=0.008))
    P += plates(2.35, 0.36, zb + 0.005, 0.5)
    P += interior(S, B, -0.45, 0.45, 0.25)
    P += calipers(S)
    return P

# ================================================================ GAJRAJ G6 (boxy luxury off-roader)
GAJRAJ = dict(key='gajraj', L=4.66, W=1.98, r=0.43, tireW=0.29, arch=0.07, axles=[1.45, -1.44], er=0.045, erY=0.4, archLift=0.03,
    top=[(-2.33, 1.9), (-2.27, 1.955), (-2.15, 1.968), (-1.0, 1.972), (0.2, 1.965), (0.3, 1.945), (0.62, 1.31), (0.72, 1.275), (1.6, 1.255), (2.2, 1.228), (2.33, 1.17)],
    bot=[(-2.33, 0.62), (-2.25, 0.5), (-2.0, 0.46), (2.0, 0.46), (2.25, 0.5), (2.33, 0.6)],
    belt=[(-2.33, 1.27), (-1.0, 1.29), (0.5, 1.26), (1.6, 1.225), (2.33, 1.18)],
    hw=[(-2.33, 0.925), (-2.25, 0.935), (2.25, 0.935), (2.33, 0.925)],
    roofw=[(-2.33, 0.88), (0.3, 0.88), (2.33, 0.88)],
    nCab=16.0, nHood=7.0, crown=0.008, shoulder=0.03, bulge=0.0, crease=0.012, sillR=0.03,
    seams=[0.6, -0.42, -1.27],
    glass=dict(side=[[(0.56, 1.33), (-0.36, 1.33), (-0.36, 1.885), (0.34, 1.885)], [(-0.48, 1.33), (-1.2, 1.33), (-1.2, 1.885), (-0.48, 1.885)], [(-1.34, 1.33), (-2.12, 1.33), (-2.12, 1.885), (-1.34, 1.885)]],
               front=[(-0.8, 0.6), (0.8, 0.6), (0.8, 0.33), (-0.8, 0.33)], rear=None),
    frame=0.025, frameMat='rubber', recess=0.01, pillarMat='black', pillarZ=(-2.2, 0.35), pillarTop=lambda z: 1.9,
    rimR=0.66, spokes=6, spokeSplit=2, splitA=0.13, spokeW=0.045, spokeT=0.035, hubR=0.22, rimMat='rim', capMat='chrome', rimOff=0.28,
    paint=(0.01, 0.01, 0.011))

def gajraj_details(S, B):
    P = []; L = S['L']; zf, zb = L / 2, -L / 2; ar = B.ar
    # body-colour fender flares around every arch
    for zc in S['axles']:
        for sx in (-1, 1):
            P.append(arch_flare(sx, zc, B.ayc, ar + 0.035, sx * 0.94, [(0.0, -0.05), (0.055, -0.04), (0.06, 0.04), (0.0, 0.05)], 'paint'))
    # upright grille with vertical slats, round lamps with LED rings, fender-top indicators, black bumpers
    P.append(prim('cube', 'grille', (0, 1.0, zf + 0.0), size=(0.86, 0.34, 0.06), bev=0.012))
    P.append(sweep_frames([(-0.44, 1.0, zf + 0.03), (0.44, 1.0, zf + 0.03)], [((0, 0, 1), (0, 1, 0))] * 2, rrect(0.02, 0.36, 0.01), 'chrome'))
    for k in range(13): P.append(prim('cube', 'chrome', (-0.39 + k * 0.065, 1.0, zf + 0.035), size=(0.016, 0.3, 0.02)))
    P.append(cyl_z('chrome', (0, 1.0, zf + 0.05), 0.085, 0.02, 32)); P.append(cyl_z('badge', (0, 1.0, zf + 0.062), 0.06, 0.01, 32))
    for sx in (-1, 1):
        x = sx * 0.69
        P.append(cyl_z('black', (x, 1.0, zf - 0.01), 0.13, 0.06, 32))
        P.append(prim('torus', 'chrome', (x, 1.0, zf + 0.025), rot=(math.pi / 2, 0, 0), major_radius=0.125, minor_radius=0.012, major_segments=40, minor_segments=6))
        P.append(prim('torus', 'head', (x, 1.0, zf + 0.022), rot=(math.pi / 2, 0, 0), major_radius=0.1, minor_radius=0.009, major_segments=40, minor_segments=6))
        P.append(prim('uv_sphere', 'head', (x, 1.0, zf + 0.005), size=(0.085, 0.085, 0.03), segments=32, ring_count=12))
        P.append(prim('cube', 'amber', (sx * 0.78, B.top(2.05) + 0.02, 2.05), size=(0.16, 0.05, 0.1), bev=0.015))
        P.append(prim('cube', 'black', (sx * 0.6, 0.62, zf + 0.12), size=(0.12, 0.08, 0.06), bev=0.015))
        P.append(cyl_z('head', (sx * 0.7, 0.62, zf + 0.13), 0.04, 0.02, 16))
        # side: exposed door hinges, chrome handles, rub strip, side pipes, steps, big mirrors
        for zz in (0.56, -0.44):
            for yy in (1.0, 1.2): P.append(prim('cube', 'black', (sx * (B.hw(zz) * 1.012 + 0.012), yy, zz), size=(0.025, 0.08, 0.045), bev=0.008))
        for zz in (0.0, -1.05): P.append(prim('cube', 'chrome', (sx * (B.hw(zz) * 1.012 + 0.01), 1.17, zz), size=(0.02, 0.035, 0.16), bev=0.008))
        P.append(sweep([(sx * (B.hw(zz) * 1.012 + 0.01), 0.96, zz) for zz in (-2.2, -1.9, -1.0, 0.0, 1.0, 1.9, 2.2)], rrect(0.025, 0.05, 0.01), 'black'))
        for k in (-1, 1): P.append(cyl_z('satin', (sx * (B.hw(-0.8) + 0.02), 0.5 + k * 0.045, -0.8), 0.04, 0.22, 16))
        P.append(prim('cube', 'black', (sx * (B.hw(0.0) + 0.06), 0.43, 0.0), size=(0.14, 0.03, 1.55), bev=0.01))
        P.append(prim('cube', 'black', (sx * (B.hw(0.48) + 0.1), 1.43, 0.48), size=(0.05, 0.2, 0.28), bev=0.02))
        P.append(prim('cube', 'black', (sx * (B.hw(0.48) + 0.03), 1.38, 0.5), size=(0.06, 0.04, 0.06)))
        P.append(prim('cube', 'tail', (sx * 0.83, 1.06, zb - 0.02), size=(0.14, 0.32, 0.05), bev=0.015))
        P.append(prim('cube', 'black', (sx * 0.6, B.top(-1.0) + 0.028, -1.0), size=(0.03, 0.035, 2.2), bev=0.01))  # roof rails
        for zz in (-2.0, -1.0, 0.0): P.append(prim('cube', 'black', (sx * 0.6, B.top(zz) + 0.008, zz), size=(0.04, 0.03, 0.08), bev=0.008))
    P.append(prim('cube', 'black', (0, 0.6, zf + 0.06), size=(1.92, 0.22, 0.2), bev=0.04))
    P.append(prim('cube', 'black', (0, 0.62, zb - 0.06), size=(1.92, 0.22, 0.2), bev=0.04))
    # rear door: window with frame, spare wheel with body-colour cover, plate
    P.append(prim('cube', 'rubber', (0, 1.62, zb - 0.008), size=(1.5, 0.5, 0.02), bev=0.01))
    P.append(prim('cube', 'glass', (0, 1.62, zb - 0.018), size=(1.44, 0.44, 0.012), bev=0.006))
    P.append(cyl_z('tire', (0.15, 1.12, zb - 0.16), S['r'] * 0.95, 0.27, 40))
    P.append(cyl_z('paint', (0.15, 1.12, zb - 0.3), S['r'] * 0.9, 0.03, 40)); P.append(cyl_z('chrome', (0.15, 1.12, zb - 0.318), 0.07, 0.01, 24))
    for sx in (-1, 1): P.append(prim('cube', 'black', (sx * 0.3, B.top(0.5) - 0.015, 0.52), rot=(0, 0, sx * 0.04), size=(0.6, 0.012, 0.02)))
    P += plates(zf + 0.17, 0.72, zb - 0.17, 0.75)
    P += interior(S, B, -0.35, 0.55, 0.62, xs=0.4)
    P += calipers(S)
    return P

CARS['shera'] = (SHERA, shera_details)
CARS['gajraj'] = (GAJRAJ, gajraj_details)

# ================================================================ pipeline
def wheel_positions(S):
    tr = S['W'] / 2 - S['tireW'] / 2 - 0.035
    return [(sx * tr, S['r'], zc) for zc in S['axles'] for sx in (1, -1)]

def place_wheel(wheel, x, y, z):
    c = wheel.copy(); link(c)
    c.matrix_world = Matrix.Translation(G(x, y, z)) @ (Matrix.Scale(-1, 4, (1, 0, 0)) if x < 0 else Matrix.Identity(4))
    return c

def build(key):
    S, details = CARS[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body, B = build_body(S); B.obj = body
    parts = [body] + details(S, B)
    car = join(parts, key); smooth(car, 30)
    wheel = build_wheel(S); smooth(wheel, 40)
    # AO: body with its wheels and a ground plane in place, wheel on its own
    temps = [place_wheel(wheel, *p) for p in wheel_positions(S)]
    bpy.ops.mesh.primitive_plane_add(size=12); ground = bpy.context.active_object; temps.append(ground)
    bake_and_tag(car, ao_strength=0.8, dist=0.5)
    for t in temps: bpy.data.objects.remove(t, do_unlink=True)
    bake_and_tag(wheel, ao_strength=0.7, dist=0.15)
    return S, car, wheel

def render(S, car, wheel, shots, paint=None, hdri=None, hook=None):
    sc = bpy.context.scene
    def mat(o):
        m = bpy.data.materials.new('car'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links
        bs = N['Principled BSDF']
        col = N.new('ShaderNodeAttribute'); col.attribute_name = 'Col'
        uv = N.new('ShaderNodeUVMap'); uv.uv_map = 'PE'
        sep = N.new('ShaderNodeSeparateXYZ'); Lk.new(uv.outputs[0], sep.inputs[0])
        pc = N.new('ShaderNodeRGB'); pc.outputs[0].default_value = (*(paint or S['paint']), 1)
        tint = N.new('ShaderNodeMix'); tint.data_type = 'RGBA'; tint.blend_type = 'MULTIPLY'
        Lk.new(sep.outputs[0], tint.inputs['Factor']); Lk.new(col.outputs['Color'], tint.inputs[6]); Lk.new(pc.outputs[0], tint.inputs[7])
        # paint faces carry AO in grey: col * paint
        Lk.new(tint.outputs[2], bs.inputs['Base Color'])
        def eq(v):
            a = N.new('ShaderNodeMath'); a.operation = 'COMPARE'; a.inputs[1].default_value = v; a.inputs[2].default_value = 0.4; Lk.new(sep.outputs[1], a.inputs[0]); return a.outputs[0]
        chrome, glass, head, tail = eq(6), eq(5), eq(1), eq(2)
        r1 = N.new('ShaderNodeMath'); r1.operation = 'MULTIPLY_ADD'; r1.inputs[1].default_value = -0.42; r1.inputs[2].default_value = 0.74; Lk.new(sep.outputs[0], r1.inputs[0])
        r2 = N.new('ShaderNodeMath'); r2.operation = 'MULTIPLY_ADD'; r2.inputs[1].default_value = -0.48; Lk.new(chrome, r2.inputs[0]); Lk.new(r1.outputs[0], r2.inputs[2])
        r3 = N.new('ShaderNodeMath'); r3.operation = 'MULTIPLY_ADD'; r3.inputs[1].default_value = -0.55; Lk.new(glass, r3.inputs[0]); Lk.new(r2.outputs[0], r3.inputs[2])
        r4 = N.new('ShaderNodeMath'); r4.operation = 'MULTIPLY_ADD'; r4.inputs[1].default_value = 0.24; Lk.new(eq(7), r4.inputs[0]); Lk.new(r3.outputs[0], r4.inputs[2])
        Lk.new(r4.outputs[0], bs.inputs['Roughness']); Lk.new(chrome, bs.inputs['Metallic'])
        sp = N.new('ShaderNodeMath'); sp.operation = 'MULTIPLY_ADD'; sp.inputs[1].default_value = -0.35; sp.inputs[2].default_value = 0.5; Lk.new(eq(7), sp.inputs[0]); Lk.new(sp.outputs[0], bs.inputs['Specular IOR Level'])
        Lk.new(sep.outputs[0], bs.inputs['Coat Weight']); bs.inputs['Coat Roughness'].default_value = 0.02
        em = N.new('ShaderNodeMath'); em.operation = 'ADD'; Lk.new(head, em.inputs[0]); Lk.new(tail, em.inputs[1])
        emm = N.new('ShaderNodeMath'); emm.operation = 'MULTIPLY'; emm.inputs[1].default_value = 1.5; Lk.new(em.outputs[0], emm.inputs[0])
        Lk.new(col.outputs['Color'], bs.inputs['Emission Color']); Lk.new(emm.outputs[0], bs.inputs['Emission Strength'])
        o.data.materials.clear(); o.data.materials.append(m)
    mat(car); mat(wheel)
    ws = [place_wheel(wheel, *p) for p in wheel_positions(S)]
    wheel.hide_render = True
    bpy.ops.mesh.primitive_plane_add(size=80); g = bpy.context.active_object
    gm = bpy.data.materials.new('g'); gm.use_nodes = True; gb = gm.node_tree.nodes['Principled BSDF']; gb.inputs['Base Color'].default_value = (0.2, 0.19, 0.18, 1); gb.inputs['Roughness'].default_value = 0.6
    g.data.materials.append(gm)
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']
    if hdri and os.path.exists(hdri):
        env = w.node_tree.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(hdri); w.node_tree.links.new(env.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 1.0
    else:
        sky = w.node_tree.nodes.new('ShaderNodeTexSky')
        try: sky.sky_type = 'MULTIPLE_SCATTERING'
        except Exception: pass
        sky.sun_elevation = math.radians(14); sky.sun_rotation = math.radians(120)
        w.node_tree.links.new(sky.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 0.25
        sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.0; sun.angle = math.radians(1.0); so = link(bpy.data.objects.new('sun', sun))
        so.rotation_euler = (math.radians(74), 0, math.radians(120))
    cam = bpy.data.cameras.new('c'); cam.lens = 60; co = link(bpy.data.objects.new('c', cam)); sc.camera = co
    sc.cycles.samples = 64; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    try: sc.view_settings.view_transform = 'AgX'
    except Exception: pass
    if hook: hook()
    for ang, out in shots:
        a = math.radians(ang); d = 9.0
        co.location = (math.sin(a) * d, -math.cos(a) * d, 1.7)
        tgt = Vector((0, 0, 0.6)); co.rotation_euler = (tgt - co.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = out; bpy.ops.render.render(write_still=True); print('RENDERED', out, flush=True)
    for o in ws: bpy.data.objects.remove(o, do_unlink=True)
    wheel.hide_render = False

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    keys = [a for a in args if a in CARS] or list(CARS)
    angs = [float(a) for a in args[args.index('--angle') + 1].split(',')] if '--angle' in args else [35]
    os.makedirs(OUT, exist_ok=True)
    meta = json.load(open(f'{OUT}/meta.json')) if os.path.exists(f'{OUT}/meta.json') else {}
    for key in keys:
        S, car, wheel = build(key)
        print('CAR', key, 'body tris', tris(car), 'wheel tris', tris(wheel), flush=True)
        export(car, f'{OUT}/{key}.glb'); export(wheel, f'{OUT}/{key}_wheel.glb')
        for tag, rb, rw in (('lod1', 0.3, 0.3), ('lod2', 0.07, 0.08)):
            lb, lw = decimate(car, rb), decimate(wheel, rw)
            print('LOD', tag, tris(lb), tris(lw), flush=True)
            export(lb, f'{OUT}/{key}_{tag}.glb'); export(lw, f'{OUT}/{key}_wheel_{tag}.glb')
            bpy.data.objects.remove(lb, do_unlink=True); bpy.data.objects.remove(lw, do_unlink=True)
        meta[key] = dict(L=S['L'], W=S['W'], r=S['r'], wheels=[list(p) for p in wheel_positions(S)])
        if '--render' in args:
            render(S, car, wheel, [(a, f'{OUT}/{key}_{int(a)}.png') for a in angs], hdri=args[args.index('--hdri') + 1] if '--hdri' in args else None)
    json.dump(meta, open(f'{OUT}/meta.json', 'w'), indent=1)
