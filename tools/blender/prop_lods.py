# Light versions of the heavy instanced props: decimated geometry with the same UV layout, exported without textures
# (the game reuses the full model's material). Usage: python prop_lods.py <repo>
import bpy, sys, os
REPO = sys.argv[-1]
JOBS = { 'boulder_01': 0.16, 'coast_land_rocks_03': 0.13, 'coast_rocks_01': 0.125, 'coast_rocks_02': 0.125, 'tractor': 0.3, 'bullockcart': 0.3, 'farmhouse': 0.45, 'farmhouse_b': 0.45 }
for name, ratio in JOBS.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f'{REPO}/assets/models/1k/{name}.glb')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    before = sum(len(p.vertices) - 2 for p in o.data.polygons)
    m = o.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = ratio; m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
    after = sum(len(p.vertices) - 2 for p in o.data.polygons)
    for p in o.data.polygons: p.use_smooth = True
    for mat in o.data.materials:
        if mat and mat.use_nodes:
            for n in list(mat.node_tree.nodes):
                if n.type == 'TEX_IMAGE': mat.node_tree.nodes.remove(n)
    out = f'{REPO}/assets/models/lod/{name}.glb'
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_image_format='NONE', export_yup=True, export_apply=True, export_texcoords=True, export_normals=True, export_materials='EXPORT')
    print(f'LOD {name}: {before} -> {after} tris, {os.path.getsize(out)//1024} KB', flush=True)
