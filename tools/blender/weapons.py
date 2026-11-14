# Daman Duo weapons (original designs, no real-world branding): Vajra carbine and Naag service pistol.
# Game convention: origin in the firing hand (top of the pistol grip), +Z along the barrel, +Y up, +X to the shooter's left.
# Output: <repo>/assets/models/weapons/{rifle,pistol}.glb (+ _lod), vertex colours = albedo x AO, TEXCOORD_0 = (paint, emit code)
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import carbody as C
from carbody import prim, cyl_x, cyl_y, cyl_z, join, smooth, bake_and_tag, export, tris, decimate, MATS, G

for n, v in {'gunmetal': ((0.055, 0.057, 0.063), 0, 6), 'steel': ((0.2, 0.2, 0.215), 0, 6), 'polymer': ((0.02, 0.02, 0.022), 0, 7), 'tan': ((0.16, 0.125, 0.08), 0, 7),
             'park': ((0.034, 0.035, 0.038), 0, 0), 'pad': ((0.012, 0.012, 0.013), 0, 7), 'lens': ((0.02, 0.05, 0.06), 0, 6), 'brass': ((0.55, 0.38, 0.12), 0, 6)}.items():
    MATS[n] = v; C.NAMES.append(n); C.MID[n] = len(C.NAMES) - 1
REPO = os.environ.get('DD_REPO') or '/home/claude/3d-open-world-game-'
OUT = REPO + '/assets/models/weapons'
RX = lambda a: (a, 0, 0)          # tilt in the game's Y/Z plane

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def box(mat, loc, size, bev=0.0, rot=(0, 0, 0)):
    return prim('cube', mat, loc, rot=rot, size=size, bev=bev, seg=2)

def rifle():
    P = []; a = P.append
    by = 0.043                                                         # bore axis height
    # receivers
    a(box('park', (0, 0.046, 0.045), (0.042, 0.05, 0.25), 0.004))
    a(box('park', (0, 0.004, 0.02), (0.036, 0.04, 0.18), 0.003))
    a(box('park', (0, -0.022, 0.09), (0.034, 0.05, 0.064), 0.003))     # magazine well
    # magazine: three canted sections for the curve
    a(box('tan', (0, -0.075, 0.094), (0.025, 0.07, 0.052), 0.003, RX(-0.06)))
    a(box('tan', (0, -0.136, 0.104), (0.025, 0.066, 0.051), 0.003, RX(-0.2)))
    a(box('tan', (0, -0.19, 0.121), (0.025, 0.052, 0.05), 0.003, RX(-0.36)))
    a(box('polymer', (0, -0.217, 0.134), (0.028, 0.008, 0.056), 0.0, RX(-0.36)))
    # pistol grip, trigger group
    a(box('polymer', (0, -0.058, -0.016), (0.031, 0.108, 0.044), 0.008, RX(0.3)))
    a(box('park', (0, -0.04, 0.042), (0.012, 0.004, 0.066)))
    a(box('park', (0, -0.021, 0.076), (0.012, 0.04, 0.004)))
    a(box('steel', (0, -0.02, 0.036), (0.006, 0.028, 0.007), 0.0, RX(-0.25)))
    # handguard: octagonal, with cooling slots on the flats
    a(cyl_z('polymer', (0, by, 0.285), 0.03, 0.25, v=8))
    for k in range(6):
        z = 0.19 + k * 0.038
        for sx in (-1, 1):
            a(box('gap', (sx * 0.0282, by, z), (0.0025, 0.013, 0.024)))
            a(box('gap', (sx * 0.0202, by - 0.0202, z), (0.0025, 0.013, 0.024), 0.0, (0, 0, 0)))
    a(cyl_z('gunmetal', (0, by, 0.412), 0.031, 0.008, v=8))
    # barrel, gas block, front sight, muzzle brake
    a(cyl_z('gunmetal', (0, by, 0.445), 0.0095, 0.08, v=12))
    a(box('gunmetal', (0, by + 0.006, 0.43), (0.026, 0.034, 0.026), 0.003))
    a(box('gunmetal', (0, by + 0.04, 0.43), (0.005, 0.04, 0.012)))
    for sx in (-1, 1): a(box('gunmetal', (sx * 0.011, by + 0.045, 0.43), (0.003, 0.03, 0.02)))
    a(cyl_z('gunmetal', (0, by, 0.505), 0.0145, 0.052, v=12))
    for k in range(3):
        for sx in (-1, 1): a(box('gap', (sx * 0.0142, by, 0.49 + k * 0.014), (0.002, 0.012, 0.007)))
    a(cyl_z('gap', (0, by, 0.5312), 0.0062, 0.001, v=10))
    # top rail with teeth
    a(box('park', (0, 0.0735, 0.165), (0.019, 0.006, 0.47)))
    for k in range(17): a(box('gunmetal', (0, 0.078, -0.055 + k * 0.0275), (0.021, 0.004, 0.011)))
    # buffer tube and stock
    a(cyl_z('gunmetal', (0, by, -0.165), 0.0145, 0.19, v=12))
    a(box('polymer', (0, 0.03, -0.235), (0.037, 0.07, 0.13), 0.007))
    a(box('polymer', (0, -0.028, -0.262), (0.03, 0.062, 0.07), 0.006, RX(0.35)))
    a(box('polymer', (0, 0.07, -0.215), (0.03, 0.012, 0.1), 0.003))
    a(box('pad', (0, 0.008, -0.303), (0.041, 0.128, 0.012), 0.004))
    # controls and details
    a(box('gunmetal', (0, 0.064, -0.086), (0.052, 0.009, 0.018), 0.002))            # charging handle
    a(box('gap', (-0.0214, 0.05, 0.05), (0.002, 0.018, 0.055)))                      # ejection port
    a(box('gunmetal', (-0.0225, 0.038, 0.05), (0.003, 0.006, 0.06)))                 # dust cover
    a(cyl_x('gunmetal', (-0.026, 0.046, -0.035), 0.007, 0.014, v=10))                # forward assist
    a(cyl_x('steel', (0.02, 0.012, -0.022), 0.0065, 0.006, v=10)); a(box('steel', (0.0235, 0.012, -0.012), (0.003, 0.005, 0.022)))   # selector
    a(box('steel', (-0.0185, 0.004, 0.062), (0.004, 0.012, 0.014)))                  # magazine release
    a(cyl_x('steel', (0, 0.002, 0.105), 0.004, 0.04, v=8)); a(cyl_x('steel', (0, 0.002, -0.05), 0.004, 0.04, v=8))   # take-down pins
    # reflex sight
    a(box('polymer', (0, 0.087, 0.03), (0.03, 0.014, 0.056), 0.003))
    a(cyl_z('polymer', (0, 0.114, 0.03), 0.021, 0.06, v=14))
    a(cyl_z('lens', (0, 0.114, 0.0606), 0.0175, 0.001, v=14)); a(cyl_z('lens', (0, 0.114, -0.0006), 0.0175, 0.001, v=14))
    a(cyl_y('gunmetal', (0, 0.139, 0.03), 0.006, 0.01, v=8)); a(cyl_x('gunmetal', (-0.024, 0.114, 0.03), 0.006, 0.01, v=8))
    return join(P, 'rifle')

def pistol():
    P = []; a = P.append
    # slide with rear serrations, barrel, sights
    a(box('gunmetal', (0, 0.033, 0.042), (0.027, 0.03, 0.186), 0.0035))
    for k in range(6):
        for sx in (-1, 1): a(box('gap', (sx * 0.0137, 0.034, -0.04 + k * 0.007), (0.0012, 0.022, 0.003)))
    a(cyl_z('steel', (0, 0.031, 0.1355), 0.0065, 0.004, v=10)); a(cyl_z('gap', (0, 0.031, 0.1378), 0.0042, 0.0006, v=10))
    a(box('gap', (-0.0136, 0.04, 0.03), (0.0012, 0.012, 0.04))); a(box('steel', (0, 0.0482, 0.03), (0.014, 0.0012, 0.04)))     # ejection port, barrel hood
    a(box('gunmetal', (0, 0.051, 0.125), (0.004, 0.006, 0.01))); a(box('gunmetal', (0, 0.051, -0.042), (0.017, 0.006, 0.008)))
    # frame, rail, trigger guard
    a(box('polymer', (0, 0.009, 0.045), (0.026, 0.02, 0.165), 0.003))
    for k in range(3): a(box('gap', (0, -0.0014, 0.085 + k * 0.012), (0.027, 0.002, 0.004)))
    a(box('polymer', (0, -0.031, 0.045), (0.011, 0.004, 0.058))); a(box('polymer', (0, -0.016, 0.0745), (0.011, 0.034, 0.004), 0.0, RX(-0.2)))
    a(box('steel', (0, -0.012, 0.033), (0.006, 0.024, 0.006), 0.0, RX(-0.3)))
    # grip with a magazine base plate, beavertail, controls
    a(box('polymer', (0, -0.052, -0.012), (0.029, 0.112, 0.05), 0.008, RX(0.28)))
    a(box('tan', (0, -0.1115, -0.03), (0.03, 0.009, 0.056), 0.002, RX(0.28)))
    a(box('polymer', (0, 0.012, -0.05), (0.022, 0.014, 0.022), 0.004))
    a(box('steel', (0.0142, 0.014, -0.012), (0.002, 0.005, 0.03))); a(cyl_x('steel', (0.0145, -0.008, 0.012), 0.004, 0.003, v=8))
    return join(P, 'pistol')

def shot(o, name):
    # quick clay-with-colours render for checking the shape (workbench)
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'VERTEX'; sc.display.shading.show_cavity = True
    sc.render.resolution_x = 1100; sc.render.resolution_y = 520; sc.render.film_transparent = False
    if not sc.world: sc.world = bpy.data.worlds.new('w')
    sc.world.color = (0.32, 0.34, 0.37)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 85
    from mathutils import Vector
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]; ctr = sum(bb, Vector()) / 8; size = max((b - ctr).length for b in bb)
    for tag, d in (('a', Vector((1.0, -0.25, 0.28))), ('b', Vector((-0.75, 0.65, 0.4)))):
        cam.location = ctr + d.normalized() * size * 5.2
        cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'/tmp/out/weapon_{name}_{tag}.png'; bpy.ops.render.render(write_still=True)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, fn, lod in (('rifle', rifle, 0.32), ('pistol', pistol, 0.4)):
        clear(); o = fn(); smooth(o, 38)
        print(name.upper(), 'tris', tris(o), flush=True)
        bake_and_tag(o, ao_strength=0.75, dist=0.05)
        export(o, f'{OUT}/{name}.glb')
        lo = decimate(o, lod); print(name, 'lod', tris(lo), flush=True); export(lo, f'{OUT}/{name}_lod.glb')
        if '--shots' in sys.argv: shot(o, name)
