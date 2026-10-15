#!/usr/bin/env python3
"""Standalone serialized GLB checks; no Blender or Godot imports are needed.

Run: python3 tools/test_verdant_asset_contract.py
"""

from pathlib import Path
from functools import lru_cache
import json
import math
import struct
import unittest


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets/models/verdant"
ASSET_NAMES = (
    "scholar_desk", "scroll_shelf", "lattice_screen", "fox_guardian",
    "fox_shrine", "covered_bridge", "pergola", "dragon_spout",
)
PALETTE = {"Stone", "Timber", "Roof", "Gold", "Jade", "Paper", "Cloth"}
TRIANGLE_CAPS = dict(zip(ASSET_NAMES, (4000, 4000, 3000, 4000, 16000, 10000, 6000, 5000)))
IDENTITY = (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
EPSILON = 0.002


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def multiply(a, b):
    return tuple(sum(a[row * 4 + k] * b[k * 4 + col] for k in range(4))
                 for row in range(4) for col in range(4))


def node_matrix(node):
    if "matrix" in node:
        require(len(node["matrix"]) == 16, "Node matrix must contain 16 values")
        return tuple(node["matrix"][col * 4 + row] for row in range(4) for col in range(4))
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    tx, ty, tz = node.get("translation", [0, 0, 0])
    return ((1 - 2*y*y - 2*z*z)*sx, (2*x*y - 2*z*w)*sy, (2*x*z + 2*y*w)*sz, tx,
            (2*x*y + 2*z*w)*sx, (1 - 2*x*x - 2*z*z)*sy, (2*y*z - 2*x*w)*sz, ty,
            (2*x*z - 2*y*w)*sx, (2*y*z + 2*x*w)*sy, (1 - 2*x*x - 2*y*y)*sz, tz,
            0, 0, 0, 1)


def transform(matrix, point):
    return tuple(sum(matrix[row * 4 + k] * point[k] for k in range(3)) + matrix[row * 4 + 3]
                 for row in range(3))


def cross(a, b):
    return (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])


def subtract(a, b):
    return tuple(x-y for x, y in zip(a, b))


def length_squared(value):
    return sum(component * component for component in value)


class SerializedGLB:
    """Read GLB accessors and apply scene transforms before measuring geometry."""

    def __init__(self, path):
        self.payload = path.read_bytes()
        require(len(self.payload) >= 28, f"{path.name}: truncated GLB")
        magic, version, size = struct.unpack_from("<4sII", self.payload)
        require(magic == b"glTF" and version == 2, f"{path.name}: expected glTF 2 GLB")
        require(size == len(self.payload), f"{path.name}: incorrect GLB byte length")
        chunks = []
        cursor = 12
        while cursor < size:
            require(cursor + 8 <= size, "Truncated GLB chunk header")
            count, kind = struct.unpack_from("<II", self.payload, cursor)
            require(count % 4 == 0 and cursor + 8 + count <= size, "Invalid GLB chunk length")
            chunks.append((kind, self.payload[cursor+8:cursor+8+count]))
            cursor += 8 + count
        require([item[0] for item in chunks] == [0x4E4F534A, 0x004E4942],
                "GLB must have one JSON chunk and one BIN chunk")
        self.gltf = json.loads(chunks[0][1])
        self.binary = chunks[1][1]
        buffers = self.gltf.get("buffers", [])
        require(len(buffers) == 1 and "uri" not in buffers[0], "GLB must be self-contained")
        require(0 <= len(self.binary) - buffers[0]["byteLength"] <= 3, "Incorrect BIN buffer length")
        self.primitives = []
        self.mesh_indices = set()
        scene = self.gltf["scenes"][self.gltf.get("scene", 0)]
        for node in scene.get("nodes", []):
            self._visit(node, IDENTITY, set())
        require(self.primitives, "GLB must contain visible mesh geometry")
        require(self.mesh_indices == set(range(len(self.gltf["meshes"]))),
                "Every serialized mesh must be referenced by the active scene")
        points = [point for primitive in self.primitives for point in primitive["positions"]]
        self.minimum = tuple(min(point[axis] for point in points) for axis in range(3))
        self.maximum = tuple(max(point[axis] for point in points) for axis in range(3))
        self.dimensions = tuple(hi-lo for lo, hi in zip(self.minimum, self.maximum))

    def accessor(self, index):
        accessor = self.gltf["accessors"][index]
        require("sparse" not in accessor, "Sparse accessors are outside this authored asset contract")
        view = self.gltf["bufferViews"][accessor["bufferView"]]
        require(view.get("buffer", 0) == 0, "Accessor references an external buffer")
        dimensions = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
        component = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}[accessor["componentType"]]
        fmt = "<" + component * dimensions
        item_size = struct.calcsize(fmt)
        stride = view.get("byteStride", item_size)
        require(stride >= item_size, "Accessor stride is smaller than an element")
        offset = accessor.get("byteOffset", 0)
        count = accessor["count"]
        require(count > 0 and offset >= 0, "Empty or invalid accessor")
        require(offset + (count-1)*stride + item_size <= view["byteLength"], "Accessor exceeds its view")
        start = view.get("byteOffset", 0) + offset
        require(start >= 0 and start + (count-1)*stride + item_size <= len(self.binary),
                "Accessor exceeds serialized BIN data")
        return [struct.unpack_from(fmt, self.binary, start + item*stride) for item in range(count)]

    def _visit(self, index, parent, ancestors):
        require(index not in ancestors, "Scene graph contains a cycle")
        node = self.gltf["nodes"][index]
        matrix = multiply(parent, node_matrix(node))
        require(all(math.isfinite(value) for value in matrix), "Nonfinite node transform")
        if "mesh" in node:
            self.mesh_indices.add(node["mesh"])
            for primitive in self.gltf["meshes"][node["mesh"]]["primitives"]:
                require(primitive.get("mode", 4) == 4, "Only triangle primitives are allowed")
                attributes = primitive["attributes"]
                require({"POSITION", "NORMAL", "TANGENT", "TEXCOORD_0"} <= set(attributes),
                        "Missing position, normal, tangent or UV attributes")
                values = {name: self.accessor(accessor) for name, accessor in attributes.items()}
                for name, kind in (("POSITION", "VEC3"), ("NORMAL", "VEC3"),
                                   ("TANGENT", "VEC4"), ("TEXCOORD_0", "VEC2")):
                    accessor = self.gltf["accessors"][attributes[name]]
                    require(accessor["componentType"] == 5126 and accessor["type"] == kind,
                            f"{name} must contain float32 {kind} values")
                    require(len(values[name]) == len(values["POSITION"]), "Attribute vertex counts disagree")
                require(all(math.isfinite(number) for rows in values.values() for row in rows for number in row),
                        "Nonfinite serialized vertex attribute")
                require(all(abs(length_squared(normal) - 1) < .01 for normal in values["NORMAL"]),
                        "Serialized normals must be unit length")
                require(all(abs(length_squared(tangent[:3]) - 1) < .01 and abs(abs(tangent[3])-1) < .001
                            for tangent in values["TANGENT"]), "Invalid serialized tangent basis")
                index_accessor = self.gltf["accessors"][primitive["indices"]]
                require(index_accessor["type"] == "SCALAR" and index_accessor["componentType"] in (5121, 5123, 5125),
                        "Triangle indices must use unsigned integer scalars")
                indices = [row[0] for row in self.accessor(primitive["indices"])]
                require(len(indices) % 3 == 0, "Triangle index count is not divisible by three")
                require(all(0 <= item < len(values["POSITION"]) for item in indices), "Triangle index out of range")
                positions = [transform(matrix, point) for point in values["POSITION"]]
                require(all(math.isfinite(number) for point in positions for number in point), "Nonfinite scene geometry")
                triangles = [tuple(positions[indices[offset+i]] for i in range(3)) for offset in range(0, len(indices), 3)]
                require(all(length_squared(cross(subtract(b, a), subtract(c, a))) > 1e-20
                            for a, b, c in triangles), "Serialized triangle has zero area")
                material = self.gltf["materials"][primitive["material"]]["name"]
                self.primitives.append({"positions": positions, "triangles": triangles, "material": material})
        for child in node.get("children", []):
            self._visit(child, matrix, ancestors | {index})

    def horizontal_surface_at(self, x, z, height, material):
        """Barycentric containment on real serialized horizontal floor triangles."""
        for primitive in self.primitives:
            if primitive["material"] != material:
                continue
            for a, b, c in primitive["triangles"]:
                if not all(abs(point[1] - height) < EPSILON for point in (a, b, c)):
                    continue
                denominator = (b[2]-c[2])*(a[0]-c[0]) + (c[0]-b[0])*(a[2]-c[2])
                if abs(denominator) < 1e-12:
                    continue
                u = ((b[2]-c[2])*(x-c[0]) + (c[0]-b[0])*(z-c[2])) / denominator
                v = ((c[2]-a[2])*(x-c[0]) + (a[0]-c[0])*(z-c[2])) / denominator
                if min(u, v, 1-u-v) >= -1e-5:
                    return True
        return False


@lru_cache(maxsize=None)
def load_asset(name):
    path = ASSET_ROOT / f"{name}.glb"
    require(path.is_file(), f"Missing required original Verdant module: {path.name}")
    return SerializedGLB(path)


@lru_cache(maxsize=1)
def load_manifest():
    path = ASSET_ROOT / "manifest.json"
    require(path.is_file(), "Missing Verdant serialized asset manifest")
    return json.loads(path.read_text(encoding="utf-8"))


class VerdantAssetContractTests(unittest.TestCase):
    def assert_vector_close(self, actual, expected):
        self.assertEqual(len(actual), len(expected))
        for value, target in zip(actual, expected):
            self.assertTrue(math.isfinite(value))
            self.assertAlmostEqual(value, target, delta=EPSILON)

    def test_required_original_modules_exist(self):
        for name in ASSET_NAMES:
            with self.subTest(asset=name):
                self.assertTrue((ASSET_ROOT / f"{name}.glb").is_file(),
                                f"Missing required original Verdant module: {name}.glb")
        self.assertTrue((ASSET_ROOT / "manifest.json").is_file(),
                        "Missing Verdant serialized asset manifest")

    def test_serialized_geometry_attributes_and_positive_area(self):
        for name in ASSET_NAMES:
            with self.subTest(asset=name):
                load_asset(name)

    def test_shared_exact_palette_and_no_texture_data(self):
        for name in ASSET_NAMES:
            with self.subTest(asset=name):
                asset = load_asset(name)
                for resource in ("images", "textures", "samplers"):
                    self.assertFalse(asset.gltf.get(resource), f"{name} embeds {resource}")
                materials = [material["name"] for material in asset.gltf["materials"]]
                self.assertTrue(materials)
                self.assertEqual(len(materials), len(set(materials)), "Duplicate material slots")
                self.assertLessEqual(set(materials), PALETTE)
                self.assertEqual({primitive["material"] for primitive in asset.primitives}, set(materials))
                self.assertLessEqual(len(asset.primitives), 7)

    def test_manifest_matches_serialized_counts_bounds_and_budgets(self):
        manifest = load_manifest()
        self.assertEqual(set(manifest["assets"]), set(ASSET_NAMES))
        self.assertEqual(manifest["textures"], [])
        self.assertEqual(manifest["generator"], "tools/generate_verdant_assets.py")
        self.assertIn("MIT", manifest["license"])
        for name in ASSET_NAMES:
            with self.subTest(asset=name):
                asset = load_asset(name)
                entry = manifest["assets"][name]
                triangles = sum(len(item["triangles"]) for item in asset.primitives)
                self.assertEqual(entry["file"], f"{name}.glb")
                self.assertEqual(entry["triangles"], triangles)
                self.assertGreater(triangles, 0)
                self.assertLessEqual(triangles, entry["triangle_budget"])
                self.assertLessEqual(entry["triangle_budget"], TRIANGLE_CAPS[name])
                self.assertEqual(entry["bytes"], len(asset.payload))
                self.assertEqual(entry["draw_call_materials"], len(asset.primitives))
                self.assertEqual(set(entry["material_surfaces"]), {item["material"] for item in asset.primitives})
                self.assert_vector_close(entry["bounds_min_y_up_m"], asset.minimum)
                self.assert_vector_close(entry["bounds_max_y_up_m"], asset.maximum)

    def test_scholar_desk_has_meter_scale_footprint_and_height(self):
        asset = load_asset("scholar_desk")
        self.assert_vector_close(asset.dimensions, [2.3, 1.0, 1.1])
        self.assert_vector_close(asset.minimum, [-1.15, 0, -.55])
        self.assert_vector_close(load_manifest()["assets"]["scholar_desk"]["dimensions_y_up_m"], asset.dimensions)

    def test_covered_bridge_has_eight_meter_local_z_span_and_outer_width(self):
        asset = load_asset("covered_bridge")
        self.assert_vector_close([asset.dimensions[0], asset.dimensions[2]], [5.2, 8.0])
        self.assert_vector_close([asset.minimum[0], asset.minimum[2]], [-2.6, -4.0])
        entry = load_manifest()["assets"]["covered_bridge"]
        self.assert_vector_close(entry["dimensions_y_up_m"], asset.dimensions)
        self.assertEqual(entry["post_centers_xz_m"], [[-2.4, -3.8], [-2.4, 3.8], [2.4, -3.8], [2.4, 3.8]])

    def test_covered_bridge_visible_deck_is_at_zero(self):
        asset = load_asset("covered_bridge")
        self.assertEqual(load_manifest()["assets"]["covered_bridge"]["deck_top_y_m"], 0)
        self.assertLess(asset.minimum[1], 0, "Deck thickness must extend below its zero-height surface")
        for x in (-1.5, 0, 1.5):
            for z in (-3.9, 0, 3.9):
                self.assertTrue(asset.horizontal_surface_at(x, z, 0, "Timber"),
                                f"No actual bridge deck at local ({x},0,{z})")

    def test_fox_shrine_has_ten_by_eight_meter_footprint(self):
        asset = load_asset("fox_shrine")
        self.assert_vector_close([asset.dimensions[0], asset.dimensions[2]], [10, 8])
        self.assert_vector_close([asset.minimum[0], asset.minimum[2]], [-5, -4])
        self.assert_vector_close(load_manifest()["assets"]["fox_shrine"]["footprint_xz_m"], [10, 8])

    def test_fox_shrine_visible_floor_is_at_zero(self):
        asset = load_asset("fox_shrine")
        self.assertEqual(load_manifest()["assets"]["fox_shrine"]["floor_top_y_m"], 0)
        self.assertLess(asset.minimum[1], 0, "Shrine floor thickness must lie below the zero-height surface")
        for x in (-4.5, 0, 4.5):
            for z in (-3.5, 0, 3.5):
                self.assertTrue(asset.horizontal_surface_at(x, z, 0, "Stone"),
                                f"No actual shrine floor at local ({x},0,{z})")

    def test_shrine_floor_has_no_coincident_second_material(self):
        asset = load_asset("fox_shrine")
        other_materials = {item["material"] for item in asset.primitives} - {"Stone"}
        for x in (-3, 0, 3):
            for z in (-2, 0, 2):
                for material in other_materials:
                    self.assertFalse(asset.horizontal_surface_at(x, z, 0, material),
                                     f"{material} overlaps the stone floor at ({x},0,{z})")

    def test_pergola_has_authored_dimensions(self):
        asset = load_asset("pergola")
        self.assert_vector_close(asset.dimensions, [5.6, 3.8, 8.0])
        self.assert_vector_close(asset.minimum, [-2.8, 0, -4])
        self.assert_vector_close(load_manifest()["assets"]["pergola"]["dimensions_y_up_m"], asset.dimensions)


if __name__ == "__main__":
    unittest.main(verbosity=2)
