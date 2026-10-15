#!/usr/bin/env python3
"""Original MIT eastern serpent dragon; Blender 4.3.2, no downloaded assets.

Run: blender --background --factory-startup --python tools/generate_celestial_dragon.py
The 20-joint skin, six-second swimming cycle, horns, whiskers, flame mane,
segmented belly and four three-toed paws are modeled mathematical geometry.
Both explicit LODs use six material surfaces, with no image textures/collision.
Blender +Y is forward; the exported meter-scale creature faces Godot -Z.
"""

import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "assets/models/dragon"
TAU = math.tau
SPINE_COUNT = 16
LENGTH = 28.0
SPACING = LENGTH / (SPINE_COUNT - 1)
MATERIAL_NAMES = ("DragonJade", "DragonBelly", "DragonMane", "DragonIvory", "DragonInk", "DragonAmber")


def center(distance):
    """An authored, gently rising neck and long, naturally tapered rest pose."""
    return Vector((1.80 * math.sin(distance * .27), -distance,
                   2.45 * math.sin(distance * .28) + .48 * math.exp(-distance * .23)))


def body_radius(distance):
    if distance < 3:
        return .73 + distance * .15
    return max(.055, 1.18 * (1 - (distance - 3) / 25) ** .75)


def skin_weights(point):
    distance = min(LENGTH, max(0, -point[1])) / SPACING
    a = min(SPINE_COUNT - 1, int(distance))
    b = min(SPINE_COUNT - 1, a + 1)
    weight = distance - a
    return {a: 1 - weight, b: weight} if a != b else {a: 1}


class Sculpt:
    def __init__(self, low=False):
        self.low = low
        self.vertices, self.faces, self.materials, self.weights, self.uvs = [], [], [], [], []

    def add(self, vertices, faces, material, weights=None, uvs=None):
        start = len(self.vertices)
        self.vertices.extend(vertices)
        self.weights.extend(weights or [skin_weights(point) for point in vertices])
        self.uvs.extend(uvs or [(point[0] * .12, point[1] * .12 + point[2] * .04) for point in vertices])
        self.faces.extend(tuple(start + i for i in face) for face in faces)
        self.materials.extend([material] * len(faces))

    def ellipsoid(self, material, location, radii, segments=12, rings=7, bone=None):
        if self.low:
            segments, rings = max(7, segments - 4), max(4, rings - 2)
        location = Vector(location)
        vertices = [location + Vector((0, 0, radii[2]))]
        for ring in range(1, rings):
            phi = math.pi * ring / rings
            for i in range(segments):
                theta = TAU * i / segments
                vertices.append(location + Vector((radii[0] * math.sin(phi) * math.cos(theta),
                                                   radii[1] * math.sin(phi) * math.sin(theta),
                                                   radii[2] * math.cos(phi))))
        bottom = len(vertices)
        vertices.append(location - Vector((0, 0, radii[2])))
        faces = [(0, 1 + i, 1 + (i + 1) % segments) for i in range(segments)]
        for ring in range(rings - 2):
            for i in range(segments):
                a, b = 1 + ring * segments + i, 1 + ring * segments + (i + 1) % segments
                faces.append((a, a + segments, b + segments, b))
        last = 1 + (rings - 2) * segments
        faces.extend((last + i, bottom, last + (i + 1) % segments) for i in range(segments))
        weights = [{bone: 1} for _ in vertices] if bone is not None else None
        self.add(vertices, faces, material, weights)

    def tube(self, material, points, radii, sides=7, bone=None):
        if self.low:
            sides = max(4, sides - 2)
        points = [Vector(point) for point in points]
        vertices = []
        for ring, point in enumerate(points):
            tangent = (points[min(ring + 1, len(points) - 1)] - points[max(0, ring - 1)]).normalized()
            axis = Vector((0, 0, 1)) if abs(tangent.z) < .9 else Vector((1, 0, 0))
            u = tangent.cross(axis).normalized()
            v = tangent.cross(u).normalized()
            for i in range(sides):
                theta = TAU * i / sides
                vertices.append(point + radii[ring] * (u * math.cos(theta) + v * math.sin(theta)))
        faces = [tuple(reversed(range(sides)))]
        for ring in range(len(points) - 1):
            for i in range(sides):
                a, b = ring * sides + i, ring * sides + (i + 1) % sides
                faces.append((a, b, b + sides, a + sides))
        faces.append(tuple(range((len(points) - 1) * sides, len(points) * sides)))
        weights = [{bone: 1} for _ in vertices] if bone is not None else None
        self.add(vertices, faces, material, weights)

    def flame(self, root, tip, width, bone=None, material=2):
        """A thick curved lance-shaped fin; real closed geometry rather than cards."""
        a, b = Vector(root), Vector(tip)
        middle = a.lerp(b, .48) + Vector((0, -.19, .12))
        side = Vector((width, 0, 0))
        depth = Vector((0, .07, 0))
        vertices = [a - side * .5, a + side * .5, middle + side, b,
                    middle - side, middle + depth, middle - depth]
        faces = [(0, 1, 5), (1, 2, 5), (2, 3, 5), (3, 4, 5), (4, 0, 5),
                 (1, 0, 6), (2, 1, 6), (3, 2, 6), (4, 3, 6), (0, 4, 6)]
        weights = [{bone: 1} for _ in vertices] if bone is not None else None
        self.add(vertices, faces, material, weights)

    def body(self):
        rings, sides = (43, 12) if self.low else (65, 18)
        vertices, uvs = [], []
        for ring in range(rings):
            distance = LENGTH * ring / (rings - 1)
            location, radius = center(distance), body_radius(distance)
            for i in range(sides + 1):
                theta = TAU * i / sides
                vertices.append(location + Vector((radius * math.cos(theta), 0, radius * math.sin(theta) * .91)))
                uvs.append((i / sides, distance / 5))
        faces, materials = [], []
        for ring in range(rings - 1):
            for i in range(sides):
                a = ring * (sides + 1) + i
                faces.append((a, a + 1, a + sides + 2, a + sides + 1))
                # Alternating raised belly scutes continue into the tapered tail.
                material = 1 if math.sin(TAU * (i + .5) / sides) < -.42 else 0
                materials.append(material)
        start = len(self.faces)
        self.add(vertices, faces, 0, uvs=uvs)
        self.materials[start:] = materials
        for distance in [1.2 + i * (1.12 if self.low else .88) for i in range(23 if self.low else 30)]:
            if distance > 27:
                continue
            point = center(distance)
            radius = body_radius(distance)
            height = (.70 if distance < 7 else .42) * max(.35, radius)
            self.flame(point + Vector((0, 0, radius * .86)),
                       point + Vector((0, -.95, radius * .86 + height)), .18 * radius)
        # The final tail splits into swept physical streamers.
        for sign in (-1, 1):
            point = center(25.7)
            self.flame(point, center(28) + Vector((sign * .95, -.7, .45)), .26, material=2)
        # Raised transverse ventral scutes wrap around the underside. These are
        # actual curved volumes so the belly reads beyond a flat color stripe.
        for i in range(13 if self.low else 22):
            distance = 1.2 + i * (1.95 if self.low else 1.18)
            point, radius = center(distance), body_radius(distance)
            angles = [math.pi * (1.17 + j * .165) for j in range(5)]
            points = [point + Vector((radius * math.cos(a), 0, radius * math.sin(a) * .92))
                      for a in angles]
            self.tube(3, points, [max(.025, radius * .045)] * len(points), 5)
        if not self.low:
            # Small ridged armor plates along each flank share the body skin.
            for i in range(13):
                distance = 2.6 + i * 1.65
                point, radius = center(distance), body_radius(distance)
                for sign in (-1, 1):
                    root = point + Vector((sign * radius * .89, .12, radius * .39))
                    vertices = [root + Vector((0, .36, 0)), root + Vector((0, 0, .26)),
                                root + Vector((0, -.50, 0)), root + Vector((0, 0, -.21)),
                                root + Vector((sign * .09, -.05, .02))]
                    self.add(vertices, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], 0)

    def head(self):
        # Long brow, angular cheeks and elongated snarling muzzle establish the
        # silhouette; dark mouth sits between distinct upper and lower jaws.
        self.ellipsoid(0, (0, .60, .64), (.96, 1.44, .86), 14, 8, 0)
        self.ellipsoid(0, (0, 1.85, .30), (.68, 1.32, .43), 12, 6, 0)
        self.ellipsoid(4, (0, 2.06, .05), (.65, 1.15, .11), 12, 5, 0)
        self.ellipsoid(1, (0, 1.85, -.08), (.56, 1.23, .22), 12, 5, 0)
        self.ellipsoid(0, (0, 2.9, .40), (.61, .39, .36), 10, 5, 0)
        for sign in (-1, 1):
            self.ellipsoid(4, (sign * .39, 3.10, .55), (.15, .11, .07), 8, 4, 0)
            self.ellipsoid(0, (sign * .73, .52, .40), (.45, .74, .61), 10, 6, 0)
            self.ellipsoid(4, (sign * .80, 1.10, .82), (.19, .38, .25), 10, 5, 0)
            self.ellipsoid(5, (sign * .91, 1.19, .87), (.11, .23, .16), 10, 5, 0)
            self.ellipsoid(4, (sign * 1.005, 1.24, .88), (.025, .07, .12), 7, 4, 0)
            self.tube(0, [(sign * .78, 1.61, .96), (sign * .98, 1.23, 1.18),
                          (sign * .88, .59, 1.24)], [.15, .21, .19], 7, 0)
            # Two branching antlers arch back from the brow.
            self.tube(3, [(sign * .56, .12, 1.13), (sign * .91, -.48, 2.0),
                          (sign * 1.12, -1.25, 2.68), (sign * 1.04, -2.0, 2.94)],
                      [.25, .20, .13, .018], 8, 0)
            self.tube(3, [(sign * .93, -.62, 2.12), (sign * 1.50, -.50, 2.46),
                          (sign * 1.70, -.95, 2.83)], [.135, .09, .012], 7, 0)
            self.tube(3, [(sign * .63, .30, 1.19), (sign * .80, .14, 1.91),
                          (sign * .67, -.16, 2.22)], [.16, .095, .012], 7, 0)
            # Cheek fins and wind-swept mane continue behind the skull.
            for index in range(4 if self.low else 6):
                y = .65 - index * .29
                self.flame((sign * .66, y, .91),
                           (sign * (1.50 + .11 * index), y - 1.20, 1.38 - index * .13),
                           .24, 0)
            self.tube(3, [(sign * .52, 2.55, .15), (sign * 1.27, 2.74, .27),
                          (sign * 2.03, 2.18, .61), (sign * 2.20, 1.05, .76)],
                      [.075, .061, .037, .009], 6, 0)
            # Four visible tusks give the mouth a true open profile.
            for y in (1.72, 2.60):
                self.tube(3, [(sign * .49, y, .17), (sign * .55, y + .05, -.13),
                              (sign * .44, y + .20, -.23)], [.11, .065, .012], 6, 0)
        for index in range(3):
            self.flame((0, 1.35 - index * .58, 1.30),
                       (0, .80 - index * .88, 2.10 - index * .14), .28, 0)
        for sign in (-1, 1):
            self.tube(2, [(sign * .23, 1.30, -.18), (sign * .38, .61, -.83),
                          (sign * .31, -.23, -1.03)], [.16, .13, .013], 7, 0)

    def limbs(self):
        for pair, distance in enumerate((4.2, 15.0)):
            point = center(distance)
            for side, sign in enumerate((-1, 1)):
                bone = SPINE_COUNT + pair * 2 + side
                shoulder = point + Vector((sign * .78, 0, -.15))
                elbow = shoulder + Vector((sign * .80, -.66, -.80))
                wrist = shoulder + Vector((sign * 1.10, .20, -1.45))
                palm = wrist + Vector((sign * .18, .28, -.12))
                self.ellipsoid(0, shoulder, (.45, .76, .46), 10, 5, bone)
                self.tube(0, [shoulder, shoulder.lerp(elbow, .6), elbow,
                              elbow.lerp(wrist, .55), wrist, palm],
                          [.42, .39, .32, .28, .23, .24], 8, bone)
                self.ellipsoid(0, palm, (.40, .43, .22), 10, 5, bone)
                for toe in range(3):
                    toe_root = palm + Vector(((toe - 1) * .27, .16, -.05))
                    toe_end = toe_root + Vector(((toe - 1) * .17, .66, -.10))
                    self.tube(0, [toe_root, toe_root.lerp(toe_end, .65), toe_end], [.13, .105, .07], 6, bone)
                    self.tube(3, [toe_end, toe_end + Vector((0, .28, -.12)),
                                  toe_end + Vector((0, .31, -.34))], [.095, .065, .008], 6, bone)
                self.flame(elbow + Vector((0, -.1, .12)), elbow + Vector((sign * .2, -1.0, .65)), .25, bone)

    def object(self, name, materials):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        for material in materials:
            mesh.materials.append(material)
        for polygon, material in zip(mesh.polygons, self.materials):
            polygon.material_index = material
            polygon.use_smooth = True
        uv = mesh.uv_layers.new(name="DragonMeters")
        for loop in mesh.loops:
            uv.data[loop.index].uv = self.uvs[loop.vertex_index]
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        names = [f"Spine_{i:02}" for i in range(SPINE_COUNT)] + ["Fore_L", "Fore_R", "Hind_L", "Hind_R"]
        for name in names:
            obj.vertex_groups.new(name=name)
        for vertex, weights in enumerate(self.weights):
            for bone, weight in weights.items():
                if weight > 1e-6:
                    obj.vertex_groups[bone].add([vertex], weight, "REPLACE")
        # Export topology is explicit; skin weights are preserved by the modifier.
        modifier = obj.modifiers.new("ExplicitTriangulation", "TRIANGULATE")
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        assert not mesh.validate(clean_customdata=False)
        return obj


def palette():
    entries = [((.075, .20, .145), .16, .48), ((.52, .37, .15), .15, .52),
               ((.36, .050, .027), .15, .49), ((.66, .48, .23), .22, .40),
               ((.023, .038, .032), .1, .40), ((1.0, .57, .08), .3, .28)]
    materials = []
    for name, (color, metallic, roughness) in zip(MATERIAL_NAMES, entries):
        material = bpy.data.materials.new(name)
        material.diffuse_color = (*color, 1)
        material.use_nodes = True
        shader = material.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = (*color, 1)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        materials.append(material)
    return materials


def rig(obj):
    bpy.ops.object.select_all(action="DESELECT")
    armature = bpy.data.armatures.new("CelestialDragonSkeleton")
    skeleton = bpy.data.objects.new("CelestialDragonRig", armature)
    bpy.context.collection.objects.link(skeleton)
    bpy.context.view_layer.objects.active = skeleton
    skeleton.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for i in range(SPINE_COUNT):
        bone = armature.edit_bones.new(f"Spine_{i:02}")
        bone.head = center(i * SPACING)
        bone.tail = center(min(LENGTH + .6, (i + 1) * SPACING))
        if i == SPINE_COUNT - 1:
            bone.tail = bone.head + Vector((0, -.7, 0))
        if i:
            bone.parent = armature.edit_bones[f"Spine_{i - 1:02}"]
            bone.use_connect = True
    for pair, distance in enumerate((4.2, 15.0)):
        for side, sign in enumerate((-1, 1)):
            name = ("Fore_" if pair == 0 else "Hind_") + ("L" if side == 0 else "R")
            bone = armature.edit_bones.new(name)
            bone.head = center(distance) + Vector((sign * .78, 0, -.15))
            bone.tail = bone.head + Vector((sign * .80, -.66, -.80))
            bone.parent = armature.edit_bones[f"Spine_{int(distance / SPACING):02}"]
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.parent = skeleton
    modifier = obj.modifiers.new("LivingDragonSkin", "ARMATURE")
    modifier.object = skeleton
    skeleton.animation_data_create()
    action = bpy.data.actions.new("CelestialSwim")
    skeleton.animation_data.action = action
    for frame in range(1, 182, 6):
        phase = TAU * (frame - 1) / 180
        for i in range(SPINE_COUNT):
            bone = skeleton.pose.bones[f"Spine_{i:02}"]
            bone.rotation_mode = "XYZ"
            amplitude = .062 + .070 * i / (SPINE_COUNT - 1)
            bone.rotation_euler = (math.sin(phase - i * .57) * amplitude,
                                   math.sin(phase - i * .50) * .025,
                                   math.sin(phase - i * .57 + .4) * amplitude * 1.12)
            bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone.name)
        for i, name in enumerate(("Fore_L", "Fore_R", "Hind_L", "Hind_R")):
            bone = skeleton.pose.bones[name]
            bone.rotation_mode = "XYZ"
            bone.rotation_euler = (math.sin(phase + i * 1.1) * .13, 0, math.cos(phase + i) * .10)
            bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)
    for curve in action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = "BEZIER"
        curve.modifiers.new(type="CYCLES")
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 181
    bpy.context.scene.render.fps = 30
    bpy.context.scene.frame_set(1)
    return skeleton


def read_glb(path):
    payload = path.read_bytes()
    length, kind = struct.unpack_from("<II", payload, 12)
    assert kind == 0x4E4F534A
    document = json.loads(payload[20:20 + length])
    binary_length, binary_kind = struct.unpack_from("<II", payload, 20 + length)
    assert binary_kind == 0x004E4942
    return document, payload[28 + length:28 + length + binary_length]


def values(document, binary, index):
    item = document["accessors"][index]
    view = document["bufferViews"][item["bufferView"]]
    size = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[item["type"]]
    dtype = {5126: "f", 5125: "I", 5123: "H", 5121: "B"}[item["componentType"]]
    fmt = "<" + dtype * size
    stride = view.get("byteStride", struct.calcsize(fmt))
    start = view.get("byteOffset", 0) + item.get("byteOffset", 0)
    return [struct.unpack_from(fmt, binary, start + i * stride) for i in range(item["count"])]


def verify(path):
    document, binary = read_glb(path)
    assert len(document["skins"]) == 1 and len(document["skins"][0]["joints"]) == 20
    assert len(document["materials"]) == 6 and not document.get("images")
    assert len(document["animations"]) == 1
    animation = document["animations"][0]
    assert len(animation["channels"]) >= 20
    triangles, smooth_weights, vertices, extrema = 0, 0, 0, []
    for mesh in document["meshes"]:
        assert len(mesh["primitives"]) <= 6
        for primitive in mesh["primitives"]:
            attrs = primitive["attributes"]
            assert {"POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"} <= set(attrs)
            positions = values(document, binary, attrs["POSITION"])
            normals = values(document, binary, attrs["NORMAL"])
            weights = values(document, binary, attrs["WEIGHTS_0"])
            assert all(math.isfinite(v) for point in positions for v in point)
            assert all(abs(sum(v * v for v in normal) - 1) < .02 for normal in normals)
            assert all(abs(sum(weight) - 1) < .001 for weight in weights)
            smooth_weights += sum(sum(v > .001 for v in weight) > 1 for weight in weights)
            vertices += len(positions)
            extrema.extend(positions)
            indices = [row[0] for row in values(document, binary, primitive["indices"])]
            triangles += len(indices) // 3
            for i in range(0, len(indices), 3):
                a, b, c = (Vector(positions[indices[i + j]]) for j in range(3))
                assert (b - a).cross(c - a).length > 1e-10, "Degenerate exported triangle"
    for sampler in animation["samplers"]:
        times = values(document, binary, sampler["input"])
        assert abs(times[-1][0] - times[0][0] - 6) < .01
        outputs = values(document, binary, sampler["output"])
        assert max(abs(a - b) for a, b in zip(outputs[0], outputs[-1])) < .0001
    assert 2000 <= triangles < 8000
    assert smooth_weights > 400
    return {"file": path.name, "triangles": triangles, "surfaces": 6, "bones": 20,
            "smooth_weight_vertices": smooth_weights, "exported_vertices": vertices,
            "animation": animation["name"], "loop_seconds": 6,
            "bounds_min_m": [round(min(p[i] for p in extrema), 3) for i in range(3)],
            "bounds_max_m": [round(max(p[i] for p in extrema), 3) for i in range(3)],
            "bytes": path.stat().st_size,
            "verified": "Finite unit normals/UV/weights, positive-area triangles, normalized smooth skin, closed 20-joint animation"}


def main():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1
    materials = palette()
    records = []
    for low in (False, True):
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        for action in list(bpy.data.actions):
            bpy.data.actions.remove(action)
        sculpt = Sculpt(low)
        sculpt.body()
        sculpt.head()
        sculpt.limbs()
        name = "celestial_dragon_far" if low else "celestial_dragon"
        obj = sculpt.object(name, materials)
        skeleton = rig(obj)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        skeleton.select_set(True)
        bpy.context.view_layer.objects.active = skeleton
        path = DESTINATION / f"{name}.glb"
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                                 export_yup=True, export_apply=False, export_materials="EXPORT",
                                 export_texcoords=True, export_normals=True, export_tangents=False,
                                 export_cameras=False, export_lights=False, export_animations=True,
                                 export_frame_range=True, export_force_sampling=True,
                                 export_animation_mode="ACTIONS", export_def_bones=True)
        records.append(verify(path))
        print("ORIGINAL_DRAGON " + json.dumps(records[-1], sort_keys=True))
    assert records[1]["triangles"] < records[0]["triangles"] * .7
    manifest = {"generator": "tools/generate_celestial_dragon.py", "version": 1,
                "authoring_tool": "Blender 4.3.2", "license": "MIT — original Temple Realm project geometry/rig/animation",
                "source": "Mathematical geometry only; no external models, images or reference pixels",
                "units": "meters", "forward": "-Z", "assets": records}
    (DESTINATION / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
