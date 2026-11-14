# Blender (bpy 5.3, headless): turn Poly Haven CC0 photo-scanned rocks into game-ready GLBs.
# For each scan: decimate a copy to a game budget, bake the high-poly surface (incl. its normal map) into a new
# tangent-space normal map on the low-poly, and export GLB (diffuse + baked normal + ARM) at 2K and 1K.
import bpy, sys, os, math, mathutils

OUT = '/home/claude/blendwork/out'
JOBS = [  # name, target tris, normal-map size
    ('boulder_01', 1600, 2048),
    ('coast_land_rocks_03', 7000, 2048),
    ('rock_07', 350, 1024),
    ('coast_rocks_01', 24000, 2048),
    ('coast_rocks_02', 24000, 2048),
]
only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)

def process(name, target, size):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 4
    bpy.ops.import_scene.gltf(filepath=f'/tmp/ph/{name}/{name}_2k.gltf')
    hi = [o for o in sc.objects if o.type == 'MESH'][0]
    bpy.context.view_layer.objects.active = hi; hi.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    n0 = tris(hi)
    lo = hi.copy(); lo.data = hi.data.copy(); lo.name = name + '_lo'; sc.collection.objects.link(lo)
    bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True); bpy.context.view_layer.objects.active = lo
    # glTF splits vertices at UV seams: weld them first or the decimator can't collapse across island borders
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=max(hi.dimensions) * 1e-5); bpy.ops.object.mode_set(mode='OBJECT')
    m = lo.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = min(1.0, target / tris(lo)); m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
    # fresh UVs for the low-poly; every map is re-baked onto them from the scan
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004); bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.shade_smooth()
    src = hi.data.materials[0]; snt = src.node_tree
    tex = {n.image.name: n for n in snt.nodes if n.type == 'TEX_IMAGE' and n.image}
    n_diff = next(n for k, n in tex.items() if 'diff' in k); n_arm = next(n for k, n in tex.items() if 'arm' in k or 'rough' in k)
    def newimg(tag, cs):
        im = bpy.data.images.new(f'{name}_{tag}', size, size, alpha=False); im.colorspace_settings.name = cs; return im
    I = {'diff': newimg('diff', 'sRGB'), 'arm': newimg('arm', 'Non-Color'), 'nor': newimg('nor', 'Non-Color')}
    mat = bpy.data.materials.new(name + '_game'); mat.use_nodes = True; nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
    T = {}
    for k in I: T[k] = nt.nodes.new('ShaderNodeTexImage'); T[k].image = I[k]
    nt.links.new(T['diff'].outputs['Color'], bsdf.inputs['Base Color'])
    sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(T['arm'].outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(T['nor'].outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    lo.data.materials.clear(); lo.data.materials.append(mat)
    ext = max(hi.dimensions) * 0.02
    bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
    bk = sc.render.bake; bk.use_selected_to_active = True; bk.cage_extrusion = ext; bk.max_ray_distance = ext * 3; bk.margin = 12
    out_node = next(n for n in snt.nodes if n.type == 'OUTPUT_MATERIAL'); orig = out_node.inputs['Surface'].links[0].from_socket
    emit = snt.nodes.new('ShaderNodeEmission')
    for k, srcn in (('diff', n_diff), ('arm', n_arm)):
        snt.links.new(srcn.outputs['Color'], emit.inputs['Color']); snt.links.new(emit.outputs['Emission'], out_node.inputs['Surface'])
        nt.nodes.active = T[k]; bpy.ops.object.bake(type='EMIT')
    snt.links.new(orig, out_node.inputs['Surface'])
    nt.nodes.active = T['nor']; bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    os.makedirs(OUT, exist_ok=True)
    for k, im in I.items(): im.filepath_raw = f'{OUT}/{name}_{k}.png'; im.file_format = 'PNG'; im.save()
    diff, arm, img = I['diff'], I['arm'], I['nor']
    # export: keep only the low-poly, origin at the bottom centre
    bpy.data.objects.remove(hi, do_unlink=True)
    bb = [lo.matrix_world @ mathutils.Vector(c) for c in lo.bound_box]
    mn = mathutils.Vector([min(v[i] for v in bb) for i in range(3)]); mx = mathutils.Vector([max(v[i] for v in bb) for i in range(3)])
    off = mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    lo.data.transform(mathutils.Matrix.Translation(-off)); lo.location = (0, 0, 0)
    for res in (2048, 1024):
        for im in (diff, arm, img):
            if im.size[0] > res: im.scale(res, res)
        bpy.ops.export_scene.gltf(filepath=f'{OUT}/{"2k" if res == 2048 else "1k"}/{name}.glb', export_format='GLB', use_selection=False,
                                  export_image_format='JPEG', export_jpeg_quality=88, export_apply=True, export_yup=True, export_tangents=False)
    print(f'DONE {name}: {n0} -> {tris(lo)} tris, size {[round(d, 2) for d in (mx - mn)]}', flush=True)

for name, target, size in JOBS:
    if only and name not in only: continue
    process(name, target, size)
