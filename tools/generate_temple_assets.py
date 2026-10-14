#!/usr/bin/env python3
"""Generate Temple Realm's original, meter-scale architectural art kit.

Run with Blender 4.3+: blender --background --factory-startup --python
tools/generate_temple_assets.py. No downloaded models, add-ons or textures.
The visual reference informs the palette and curved roof silhouette only.
"""

import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "assets" / "models"
TEXTURES = ROOT / "assets" / "materials"
PI = math.pi


def surface_sample(kind, u, v):
    """Periodic original surface fields: albedo, meter-scale relief, roughness.

    Integer-frequency harmonics wrap at the UV boundary. Relief is intentionally
    subtle: normals supply grain while the existing silhouette carries detail.
    """
    fine = (math.sin(2 * PI * (43 * u + 37 * v))
            + .65 * math.cos(2 * PI * (71 * u - 29 * v))) * .5
    broad = (math.sin(2 * PI * (3 * u + 2 * v))
             + .55 * math.cos(2 * PI * (7 * u - 5 * v))) * .5
    if kind == "stone":
        mineral = .016 * fine + .026 * broad
        warp = .11 * math.sin(2 * PI * (3 * u + 2 * v))
        vein = abs(math.sin(2 * PI * (2 * u + v + warp))) ** 45
        speckle = max(0.0, fine - .54) ** 2
        color = (.66 + mineral - vein * .044 - speckle * .12,
                 .666 + mineral - vein * .04 - speckle * .105,
                 .627 + mineral - vein * .034 - speckle * .08)
        height = fine * .0011 + broad * .002 - vein * .0016
        roughness = .87 + .035 * broad + vein * .035
    elif kind == "timber":
        flowing = 2 * PI * (19 * u + .11 * math.sin(2 * PI * v)
                            + .038 * math.sin(2 * PI * (3 * u + 2 * v)))
        grain = math.sin(flowing) * .019 + math.cos(2 * flowing) * .009
        wear = .024 * broad + .005 * fine
        color = (.475 + grain + wear, .091 + grain * .34 + wear * .32,
                 .056 + grain * .2 + wear * .19)
        height = math.sin(flowing) * .00065 + fine * .0001
        roughness = .4 + grain * .9 + broad * .055
    else:
        # Flowing ceramic glaze, without a second grid fighting the roof ribs.
        glaze = .024 * broad + .006 * fine
        color = (.216 + glaze * .72, .302 + glaze, .305 + glaze * 1.04)
        height = broad * .0009 + fine * .00012
        roughness = .285 + .037 * broad + .009 * fine
    return tuple(max(.005, min(.99, c)) for c in color), height, roughness


def write_texture(name, size, pixels, data=False):
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    if data:
        image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(TEXTURES / f"{name}.png")
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image


def surface_textures(name, kind):
    """512px albedo, 256px tangent normal, 128px packed roughness/metallic.

    Three small reusable surfaces keep the phone texture budget bounded; no
    photos, external artwork, or additional material draw surfaces are used.
    """
    maps = {}
    for channel, size in (("albedo", 512), ("normal", 256), ("roughness", 128)):
        pixels = []
        for y in range(size):
            for x in range(size):
                u, v = x / size, y / size
                color, _, roughness = surface_sample(kind, u, v)
                if channel == "albedo":
                    value = color
                elif channel == "normal":
                    delta = 1 / size
                    dx = (surface_sample(kind, u + delta, v)[1]
                          - surface_sample(kind, u - delta, v)[1]) / (2 * delta)
                    dy = (surface_sample(kind, u, v + delta)[1]
                          - surface_sample(kind, u, v - delta)[1]) / (2 * delta)
                    normal = Vector((-dx, -dy, 1.0)).normalized()
                    value = tuple(component * .5 + .5 for component in normal)
                else:
                    # glTF uses green for roughness and blue for metallic.
                    value = (1.0, roughness, .08 if kind == "roof" else 0.0)
                pixels.extend((*value, 1.0))
        suffix = "" if channel == "albedo" else f"_{channel}"
        maps[channel] = write_texture(name + suffix, size, pixels, data=channel != "albedo")
    return maps


def material(name, color, metallic=0.0, roughness=0.65, surface=None, glow=False):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if surface:
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = surface["albedo"]
        mat.node_tree.links.new(node.outputs["Color"], shader.inputs["Base Color"])
        normal_texture = mat.node_tree.nodes.new("ShaderNodeTexImage")
        normal_texture.image = surface["normal"]
        normal = mat.node_tree.nodes.new("ShaderNodeNormalMap")
        normal.inputs["Strength"].default_value = .65
        mat.node_tree.links.new(normal_texture.outputs["Color"], normal.inputs["Color"])
        mat.node_tree.links.new(normal.outputs["Normal"], shader.inputs["Normal"])
        packed = mat.node_tree.nodes.new("ShaderNodeTexImage")
        packed.image = surface["roughness"]
        split = mat.node_tree.nodes.new("ShaderNodeSeparateColor")
        mat.node_tree.links.new(packed.outputs["Color"], split.inputs["Color"])
        mat.node_tree.links.new(split.outputs["Green"], shader.inputs["Roughness"])
        mat.node_tree.links.new(split.outputs["Blue"], shader.inputs["Metallic"])
    if glow:
        shader.inputs["Emission Color"].default_value = (*color, 1.0)
        shader.inputs["Emission Strength"].default_value = 0.55
    return mat


class Geometry:
    """A single mesh per material keeps even ornate assets economical to draw."""

    def __init__(self):
        self.parts = {}

    def add(self, mat, vertices, faces, smooth=False):
        data = self.parts.setdefault(mat, {"vertices": [], "faces": [], "smooth": []})
        offset = len(data["vertices"])
        data["vertices"].extend(tuple(v) for v in vertices)
        data["faces"].extend(tuple(offset + i for i in face) for face in faces)
        data["smooth"].extend(smooth if isinstance(smooth, list) else [smooth] * len(faces))

    def box(self, mat, center, size):
        x, y, z = center
        sx, sy, sz = (length * 0.5 for length in size)
        vertices = [
            (x + dx * sx, y + dy * sy, z + dz * sz)
            for dx, dy, dz in (
                (-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1),
            )
        ]
        faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5),
                 (2, 3, 7, 6), (3, 0, 4, 7)]
        self.add(mat, vertices, faces)

    def cylinder(self, mat, start, end, radius, segments=10, upper_radius=None):
        a, b = Vector(start), Vector(end)
        axis = (b - a).normalized()
        helper = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
        first = axis.cross(helper).normalized()
        second = axis.cross(first).normalized()
        vertices = []
        for center, rad in ((a, radius), (b, radius if upper_radius is None else upper_radius)):
            for i in range(segments):
                angle = i * 2 * PI / segments
                vertices.append(center + rad * (math.cos(angle) * first + math.sin(angle) * second))
        faces = [tuple(reversed(range(segments))), tuple(range(segments, segments * 2))]
        faces.extend((i, (i + 1) % segments, (i + 1) % segments + segments, i + segments)
                     for i in range(segments))
        # Flat end caps keep the shaft/coin edge crisp instead of rounding its
        # shading into the cap; only the curved wall interpolates its normals.
        self.add(mat, vertices, faces, smooth=[False, False] + [True] * segments)

    def tube(self, mat, points, radius, segments=6):
        points = [Vector(point) for point in points]
        vertices = []
        for i, point in enumerate(points):
            tangent = (points[min(i + 1, len(points) - 1)] - points[max(0, i - 1)]).normalized()
            helper = Vector((0, 0, 1)) if abs(tangent.z) < 0.9 else Vector((0, 1, 0))
            first = tangent.cross(helper).normalized()
            second = tangent.cross(first).normalized()
            for j in range(segments):
                theta = j * 2 * PI / segments
                vertices.append(point + radius * (math.cos(theta) * first + math.sin(theta) * second))
        faces = [tuple(reversed(range(segments)))]
        for i in range(len(points) - 1):
            for j in range(segments):
                faces.append((i * segments + j, i * segments + (j + 1) % segments,
                              (i + 1) * segments + (j + 1) % segments,
                              (i + 1) * segments + j))
        faces.append(tuple(range((len(points) - 1) * segments, len(points) * segments)))
        self.add(mat, vertices, faces,
                 smooth=[False] + [True] * (len(faces) - 2) + [False])

    def ellipsoid(self, mat, center, radii, segments=10, rings=5):
        vertices = []
        for ring in range(rings + 1):
            phi = PI * ring / rings
            for index in range(segments):
                theta = 2 * PI * index / segments
                vertices.append((center[0] + radii[0] * math.sin(phi) * math.cos(theta),
                                 center[1] + radii[1] * math.sin(phi) * math.sin(theta),
                                 center[2] + radii[2] * math.cos(phi)))
        faces = []
        for ring in range(rings):
            for index in range(segments):
                a = ring * segments + index
                b = ring * segments + (index + 1) % segments
                faces.append((a, b, b + segments, a + segments))
        self.add(mat, vertices, faces, smooth=True)

    def objects(self, prefix):
        result = []
        for mat, data in self.parts.items():
            mesh = bpy.data.meshes.new(f"{prefix}_{mat.name}")
            mesh.from_pydata(data["vertices"], [], data["faces"])
            mesh.materials.append(mat)
            mesh.update()
            assert all(math.isfinite(c) for vertex in mesh.vertices for c in vertex.co)
            uv = mesh.uv_layers.new(name="SurfaceMeters")
            for poly, smooth in zip(mesh.polygons, data["smooth"]):
                poly.use_smooth = smooth
                normal = poly.normal
                projection = max(range(3), key=lambda i: abs(normal[i]))
                axes = ((1, 2), (0, 2), (0, 1))[projection]
                for loop in poly.loop_indices:
                    co = mesh.vertices[mesh.loops[loop].vertex_index].co
                    uv.data[loop].uv = (co[axes[0]] * 0.65, co[axes[1]] * 0.65)
            obj = bpy.data.objects.new(mesh.name, mesh)
            bpy.context.collection.objects.link(obj)
            result.append(obj)
        return result


def roof_point(u, t, width, depth, ridge, drop, hip=False, end=1):
    half_width, half_depth = width * 0.5, depth * 0.5
    ridge_half = max(half_width - half_depth * 0.72, width * 0.16)
    if hip:
        x = end * (ridge_half + (half_width - ridge_half) * t)
        y = half_depth * u * t
    else:
        x = u * (ridge_half + (half_width - ridge_half) * t)
        y = end * half_depth * t
    z = ridge - drop * (1.68 * t - 0.68 * t * t)
    z += 0.52 * (abs(x) / half_width) ** 5 * (abs(y) / half_depth) ** 3
    return x, y, z


def curved_roof(geo, mats, width, depth, ridge, drop, tile_count=22):
    roof, gold, timber, shadow = (mats[key] for key in ("slate", "gold", "timber", "shadow"))
    for hip in (False, True):
        for end in (-1, 1):
            columns, rows = (12, 7) if hip else (tile_count, 9)
            vertices = [roof_point(-1 + 2 * i / columns, j / rows, width, depth, ridge, drop, hip, end)
                        for j in range(rows + 1) for i in range(columns + 1)]
            faces = []
            for j in range(rows):
                for i in range(columns):
                    index = j * (columns + 1) + i
                    face = (index, index + 1, index + columns + 2, index + columns + 1)
                    # Long south and eastern hip parameterizations have opposite winding.
                    faces.append(tuple(reversed(face)) if ((not hip and end < 0) or (hip and end > 0)) else face)
            geo.add(roof, vertices, faces, smooth=True)
            for i in range(1, columns):
                u = -1 + 2 * i / columns
                points = [roof_point(u, 0.025 + 0.975 * j / 8, width, depth, ridge, drop, hip, end)
                          for j in range(9)]
                points = [(x, y, z + 0.016) for x, y, z in points]
                geo.tube(shadow, points, 0.027, segments=4)
            eave = [roof_point(-1 + 2 * i / 16, 1, width, depth, ridge, drop, hip, end) for i in range(17)]
            geo.tube(gold, eave, 0.038, segments=6)
            geo.tube(timber, [(x, y, z - 0.14) for x, y, z in eave], 0.095, segments=6)
            # Raised hip ridges end in a compact ascending ornamental curl.
            if not hip:
                for corner in (-1, 1):
                    hip_points = [roof_point(corner, j / 12, width, depth, ridge, drop, False, end)
                                  for j in range(13)]
                    geo.tube(gold, [(x, y, z + 0.075) for x, y, z in hip_points], 0.046)
                    x, y, z = hip_points[-1]
                    curl = [(x + corner * 0.38 * k / 6,
                             y + end * (0.36 * k / 6 - 0.13 * (k / 6) ** 2),
                             z + 0.48 * (k / 6) ** 1.8) for k in range(7)]
                    geo.tube(gold, curl, 0.052)
    ridge_half = max(width * 0.5 - depth * 0.36, width * 0.16)
    geo.cylinder(roof, (-ridge_half, 0, ridge + 0.02), (ridge_half, 0, ridge + 0.02), 0.12)
    geo.cylinder(gold, (-ridge_half, 0, ridge + 0.12), (ridge_half, 0, ridge + 0.12), 0.035, 8)
    for sign in (-1, 1):
        points = [(sign * (ridge_half + 0.5 * math.sin(t * PI * 0.5)), 0,
                   ridge + 0.08 + 0.5 * t * t) for t in (0, .2, .4, .6, .8, 1)]
        geo.tube(gold, points, 0.075)


def bracket(geo, mats, x, y, z, scale=1.0):
    for i in range(3):
        length = (1.0 + i * 0.23) * scale
        geo.box(mats["timber"], (x, y, z + i * .14 * scale),
                (length, .22 * scale, .13 * scale))
        geo.box(mats["gold"], (x, y, z + i * .14 * scale + .065 * scale),
                (length, .23 * scale, .018 * scale))
        geo.box(mats["timber"], (x, y, z + i * .14 * scale),
                (.22 * scale, length, .13 * scale))


def column(geo, mats, x, y, bottom, top, radius=.2):
    geo.box(mats["stone"], (x, y, bottom + .12), (.64, .64, .24))
    geo.cylinder(mats["stone"], (x, y, bottom + .24), (x, y, bottom + .4), radius * 1.45, 12)
    geo.cylinder(mats["timber"], (x, y, bottom + .38), (x, y, top), radius, 14)
    for z in (bottom + .46, top - .25):
        geo.cylinder(mats["gold"], (x, y, z), (x, y, z + .06), radius * 1.07, 14)
    bracket(geo, mats, x, y, top - .13)


def lattice(geo, mats, x, y, z, width, height, side=False):
    """Sparse double timber lattice with pale inner panel, open upper light."""
    if side:
        geo.box(mats["cream"], (x, y, z), (.09, width, height))
        for index in range(7):
            geo.box(mats["timber"], (x - .07, y - width / 2 + index * width / 6, z),
                    (.09, .055, height))
        for index in range(5):
            geo.box(mats["timber"], (x - .08, y, z - height / 2 + index * height / 4),
                    (.1, width, .055))
    else:
        geo.box(mats["cream"], (x, y, z), (width, .09, height))
        for index in range(7):
            geo.box(mats["timber"], (x - width / 2 + index * width / 6, y - .07, z),
                    (.055, .1, height))
        for index in range(5):
            geo.box(mats["timber"], (x, y - .08, z - height / 2 + index * height / 4),
                    (width, .1, .055))


def medallion(geo, mats, center, size, facing="front"):
    x, y, z = center
    for i in range(8):
        angle = i * PI / 4
        if facing == "front":
            geo.ellipsoid(mats["gold"], (x + size * .34 * math.cos(angle), y,
                                         z + size * .34 * math.sin(angle)),
                          (size * .16, .025, size * .16), 8, 4)
        else:
            geo.ellipsoid(mats["gold"], (x, y + size * .34 * math.cos(angle),
                                         z + size * .34 * math.sin(angle)),
                          (.025, size * .16, size * .16), 8, 4)
    if facing == "front":
        geo.ellipsoid(mats["gold"], center, (size * .09, .03, size * .09), 10, 4)
    else:
        geo.ellipsoid(mats["gold"], center, (.03, size * .09, size * .09), 10, 4)


def pavilion(mats):
    geo = Geometry()
    # Pale stepped plinth, original worn-stone albedo. Front opens towards -Z in glTF.
    for center, size in (((0, 0, .11), (11, 8.2, .22)),
                         ((0, 0, .3), (10.6, 7.8, .18)),
                         ((0, 0, .49), (10.2, 7.4, .2))):
        geo.box(mats["stone"], center, size)
    for step in range(3):
        geo.box(mats["stone"], (0, -4.5 + step * .28, .09 + step * .17),
                (4.0, .58, .18 + step * .17))
    for x in (-4.5, 0, 4.5):
        for y in (-3.05, 3.05):
            if x == 0 and y < 0:
                continue  # Keep the authored front approach and doorway visibly open.
            column(geo, mats, x, y, .59, 3.82)
    for x in (-4.5, 4.5):
        column(geo, mats, x, 0, .59, 3.82)
        lattice(geo, mats, x, 1.5, 1.86, 2.4, 1.65, side=True)
    for x in (-2.25, 2.25):
        lattice(geo, mats, x, 3.1, 1.9, 3.7, 1.7)
    for y in (-3.05, 3.05):
        geo.box(mats["timber"], (0, y, 3.8), (9.6, .3, .28))
        geo.box(mats["gold"], (0, y - .16, 3.86), (9.7, .035, .032))
    for x in (-4.5, 4.5):
        geo.box(mats["timber"], (x, 0, 3.8), (.3, 6.5, .28))
    for x in (-3.4, -1.7, 1.7, 3.4):
        bracket(geo, mats, x, -3.05, 3.65, .65)
    curved_roof(geo, mats, 12, 9, 5.4, 1.32, 26)
    # Smaller upper lantern roof adds an authentic layered silhouette without tall stacks.
    geo.box(mats["timber"], (0, 0, 5.49), (3.3, 1.5, .72))
    for x in (-1.25, -.6, 0, .6, 1.25):
        geo.box(mats["cream"], (x, -.78, 5.52), (.4, .04, .4))
    curved_roof(geo, mats, 5.5, 3.1, 6.36, .7, 13)
    return geo


def gate(mats):
    geo = Geometry()
    for x in (-3.4, 3.4):
        column(geo, mats, x, 0, 0, 4.05, .29)
        # Banners have visible thick sculpted hems rather than transparent textures.
        geo.box(mats["timber"], (x + (-.56 if x < 0 else .56), 0, 2.55), (.66, .11, 2.3))
        geo.box(mats["gold"], (x + (-.56 if x < 0 else .56), -.07, 1.41), (.67, .035, .06))
        medallion(geo, mats, (x + (-.56 if x < 0 else .56), -.07, 2.67), .65)
    geo.box(mats["timber"], (0, 0, 3.83), (7.5, .55, .5))
    geo.box(mats["gold"], (0, -.29, 3.63), (7.6, .04, .055))
    geo.box(mats["shadow"], (0, -.33, 3.86), (2.5, .14, .46))
    medallion(geo, mats, (0, -.42, 3.86), .32)
    for x in (-2.4, -1.2, 1.2, 2.4):
        bracket(geo, mats, x, 0, 3.96, .72)
    curved_roof(geo, mats, 9.2, 3.65, 5.35, 1.02, 22)
    geo.box(mats["timber"], (0, 0, 5.45), (2.5, .85, .49))
    curved_roof(geo, mats, 4.0, 2.3, 6.17, .55, 11)
    return geo


def lantern(mats):
    geo = Geometry()
    geo.box(mats["stone"], (0, 0, .075), (.48, .48, .15))
    geo.cylinder(mats["gold"], (0, 0, .15), (0, 0, .43), .085, 10)
    geo.box(mats["timber"], (0, 0, .48), (.45, .45, .14))
    geo.box(mats["glow"], (0, 0, .805), (.39, .39, .55))
    for x in (-.225, .225):
        for y in (-.225, .225):
            geo.box(mats["shadow"], (x, y, .81), (.045, .045, .62))
    for z in (.53, 1.09):
        geo.box(mats["gold"], (0, 0, z), (.49, .49, .035))
    for i in range(3):
        z = .66 + i * .14
        for y in (-.214, .214):
            geo.box(mats["gold"], (0, y, z), (.44, .02, .022))
        for x in (-.214, .214):
            geo.box(mats["gold"], (x, 0, z), (.02, .44, .022))
    # Compact pyramidal cap with curved edges is appropriately scaled for a prop.
    vertices = [(-.34, -.34, 1.1), (.34, -.34, 1.1), (.34, .34, 1.1),
                (-.34, .34, 1.1), (0, 0, 1.31)]
    geo.add(mats["slate"], vertices, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)])
    for x in (-.34, .34):
        for y in (-.34, .34):
            geo.tube(mats["gold"], [(0, 0, 1.32), (x * .45, y * .45, 1.16),
                                    (x, y, 1.13), (x * 1.08, y * 1.08, 1.2)], .017, 5)
    geo.ellipsoid(mats["gold"], (0, 0, 1.39), (.062, .062, .072), 10, 5)
    geo.cylinder(mats["gold"], (0, 0, 1.44), (0, 0, 1.5), .022, 8, .002)
    return geo


def bridge(mats):
    geo = Geometry()
    geo.box(mats["stone"], (0, 0, -.22), (6, 12, .44))
    for y in (-5.8, 5.8):
        geo.box(mats["stone"], (0, y, -.32), (6.2, .42, .64))
    # Visible deck seams keep pale stone from looking like one blank primitive.
    for y in range(-5, 6):
        geo.box(mats["shadow"], (0, y, .004), (5.8, .018, .008))
    for x in (-1, 1):
        geo.box(mats["shadow"], (x, 0, .005), (.015, 11.8, .009))
    for x in (-2.8, 2.8):
        for y in (-5.6, -2.8, 0, 2.8, 5.6):
            geo.box(mats["stone"], (x, y, .14), (.55, .55, .28))
            geo.box(mats["timber"], (x, y, .72), (.18, .18, 1.15))
            geo.box(mats["gold"], (x, y, 1.27), (.28, .28, .09))
            geo.ellipsoid(mats["gold"], (x, y, 1.36), (.12, .12, .12), 8, 4)
        for z in (.57, 1.1):
            geo.box(mats["timber"], (x, 0, z), (.14, 11.4, .15))
        for y in (-4.2, -1.4, 1.4, 4.2):
            geo.box(mats["timber"], (x, y, .81), (.12, .12, .5))
            geo.box(mats["gold"], (x, y, .8), (.16, .16, .12))
    return geo


def shrine(mats):
    geo = Geometry()
    for z, size in ((.13, (2.1, 1.8, .26)), (.33, (1.85, 1.55, .16))):
        geo.box(mats["stone"], (0, 0, z), size)
    geo.box(mats["timber"], (0, 0, .69), (1.25, 1.02, .57))
    geo.box(mats["gold"], (0, 0, .98), (1.48, 1.2, .12))
    geo.box(mats["shadow"], (0, .24, 1.75), (.93, .12, 1.42))
    medallion(geo, mats, (0, .155, 1.76), .73)
    for x in (-.72, .72):
        column(geo, mats, x, .25, .4, 2.2, .075)
    curved_roof(geo, mats, 2.45, 1.82, 2.85, .55, 10)
    return geo


def export_asset(name, geo, simplify_ratio=None):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    objects = geo.objects(name)
    vertices = [obj.matrix_world @ vertex.co for obj in objects for vertex in obj.data.vertices]
    minimum = [min(vertex[i] for vertex in vertices) for i in range(3)]
    maximum = [max(vertex[i] for vertex in vertices) for i in range(3)]
    if simplify_ratio is not None:
        # Retain the shared materials, UVs and local base pivot. This explicit distant
        # module avoids placing full roof-rib geometry in every skyline building.
        for obj in objects:
            modifier = obj.modifiers.new("Distant architectural simplification", "DECIMATE")
            modifier.ratio = simplify_ratio
            modifier.use_collapse_triangulate = True
            depsgraph = bpy.context.evaluated_depsgraph_get()
            evaluated = obj.evaluated_get(depsgraph)
            simplified = bpy.data.meshes.new_from_object(
                evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
            obj.modifiers.clear()
            obj.data = simplified
        vertices = [vertex.co for obj in objects for vertex in obj.data.vertices]
        reduced_min = [min(vertex[i] for vertex in vertices) for i in range(3)]
        reduced_max = [max(vertex[i] for vertex in vertices) for i in range(3)]
        # Preserve the hero module's exact extents for deterministic placement.
        for vertex in vertices:
            for axis in range(3):
                vertex[axis] = minimum[axis] + (vertex[axis] - reduced_min[axis]) * (
                    maximum[axis] - minimum[axis]) / (reduced_max[axis] - reduced_min[axis])
        for obj in objects:
            # Collapse can leave redundant corner data on the disconnected ornate
            # components. Validate before counting and exporting the final mesh.
            obj.data.validate(clean_customdata=False)
            obj.data.update()
    # Explicit triangles allow Blender to calculate glTF tangent vectors on
    # cylinder caps and mixed polygon sizes. This preserves the triangle budget
    # while exporting a reliable tangent basis for the new normal maps.
    for obj in objects:
        modifier = obj.modifiers.new("Export tangent triangulation", "TRIANGULATE")
        modifier.keep_custom_normals = True
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated = obj.evaluated_get(depsgraph)
        triangulated = bpy.data.meshes.new_from_object(
            evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
        obj.modifiers.clear()
        obj.data = triangulated
    triangles = sum(len(face.vertices) - 2 for obj in objects for face in obj.data.polygons)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=str(DESTINATION / f"{name}.glb"),
                             export_format="GLB", use_selection=True,
                             export_yup=True, export_apply=True,
                             export_materials="EXPORT", export_texcoords=True,
                             export_normals=True, export_tangents=True,
                             export_cameras=False, export_lights=False)
    # Verify the serialized result as well as Blender's source mesh. Missing
    # tangent bases otherwise appear only as an exporter warning and silently
    # discard the intended relief on some runtime importers.
    payload = (DESTINATION / f"{name}.glb").read_bytes()
    json_length, json_kind = struct.unpack_from("<II", payload, 12)
    assert json_kind == 0x4E4F534A
    exported = json.loads(payload[20:20 + json_length])
    normal_materials = {index for index, mat in enumerate(exported["materials"])
                        if "normalTexture" in mat}
    serialized_triangles = 0
    for mesh in exported["meshes"]:
        for primitive in mesh["primitives"]:
            serialized_triangles += exported["accessors"][primitive["indices"]]["count"] // 3
            if primitive["material"] in normal_materials:
                assert {"NORMAL", "TANGENT", "TEXCOORD_0"} <= set(primitive["attributes"])
    assert serialized_triangles == triangles
    assert all("uri" not in image for image in exported["images"])
    # GLTF uses (X, Z, -Y); list extents in the runtime's Y-up coordinates.
    runtime_min = [minimum[0], minimum[2], -maximum[1]]
    runtime_max = [maximum[0], maximum[2], -minimum[1]]
    result = {"file": f"{name}.glb", "triangles": triangles,
              "mesh_count": len(objects), "draw_call_materials": len(objects),
              "bounds_min_y_up_m": [round(x, 4) for x in runtime_min],
              "bounds_max_y_up_m": [round(x, 4) for x in runtime_max],
              "bytes": (DESTINATION / f"{name}.glb").stat().st_size}
    if simplify_ratio is not None:
        result["lod_of"] = "pavilion.glb"
        result["simplification_ratio"] = simplify_ratio
        result["usage"] = "Distant skyline only; hero assets retain authored detail"
    print("TEMPLE_ASSET " + json.dumps(result, sort_keys=True))
    return result


def main():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    TEXTURES.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    stone = surface_textures("temple_stone_original", "stone")
    timber = surface_textures("temple_timber_original", "timber")
    roof = surface_textures("temple_roof_original", "roof")
    mats = {
        "stone": material("Temple_Worn_Pale_Stone", (.66, .666, .627), surface=stone),
        "timber": material("Temple_Red_Timber", (.475, .091, .056), surface=timber),
        "gold": material("Temple_Antique_Gold", (.67, .43, .12), metallic=.72, roughness=.32),
        "slate": material("Temple_Charcoal_Glazed_Tiles", (.216, .302, .305), surface=roof),
        "shadow": material("Temple_Dark_Ridge_and_Iron", (.018, .031, .035), roughness=.65),
        "cream": material("Temple_Warm_Paper", (.74, .66, .49), roughness=.9),
        "glow": material("Temple_Lantern_Warm_Light", (1.0, .59, .13), roughness=.65, glow=True),
    }
    assets = {name: export_asset(name, generator(mats)) for name, generator in (
        ("pavilion", pavilion), ("gate", gate), ("lantern", lantern),
        ("bridge", bridge), ("shrine", shrine))}
    assets["pavilion_far"] = export_asset("pavilion_far", pavilion(mats), simplify_ratio=.14)
    manifest = {"generator": "tools/generate_temple_assets.py",
                "generator_version": 2, "blender_version": bpy.app.version_string,
                "license": "MIT (original project geometry and generated PBR textures)",
                "source": "Original mathematical generation; uploaded references inform composition and palette",
                "coordinate_system": "glTF Y-up, meters, centered base pivots",
                "collision": "Decorative assets; world authors gameplay collision separately",
                "textures": [f"../materials/{image.name}.png"
                             for surface in (stone, timber, roof) for image in surface.values()],
                "surfaces": {name: {"albedo_size": 512, "normal_size": 256,
                                     "roughness_metallic_size": 128,
                                     "normal_strength": .65}
                             for name in ("limestone", "vermilion_lacquer", "teal_ceramic")},
                "assets": assets}
    (DESTINATION / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
