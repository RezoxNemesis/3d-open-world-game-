#!/usr/bin/env python3
"""Independent serialized residence checks; no Blender/Godot runtime needed."""

import importlib.util
import json
import math
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("verdant_serialized_qa", ROOT / "tools/test_verdant_asset_contract.py")
QA = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(QA)
DESTINATION = ROOT / "assets/models/residence"


def segment_triangle(start, end, triangle):
    direction = QA.subtract(end, start)
    a, b, c = triangle
    edge_a, edge_b = QA.subtract(b, a), QA.subtract(c, a)
    p = QA.cross(direction, edge_b)
    determinant = sum(edge_a[i] * p[i] for i in range(3))
    if abs(determinant) < 1e-9:
        return False
    distance = QA.subtract(start, a)
    u = sum(distance[i] * p[i] for i in range(3)) / determinant
    if not 0 <= u <= 1:
        return False
    q = QA.cross(distance, edge_a)
    v = sum(direction[i] * q[i] for i in range(3)) / determinant
    t = sum(edge_b[i] * q[i] for i in range(3)) / determinant
    return 0 <= v and u + v <= 1 and 1e-5 < t < 1 - 1e-5


class ResidenceAssetContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.assets = {}
        for name in ("residence_near", "residence_far"):
            path = DESTINATION / f"{name}.glb"
            if path.exists():
                cls.assets[name] = QA.SerializedGLB(path)
        path = DESTINATION / "manifest.json"
        cls.manifest = json.loads(path.read_text()) if path.exists() else None

    def asset(self, name):
        self.assertIn(name, self.assets, f"Missing original {name}.glb")
        return self.assets[name]

    def test_original_residence_and_useful_shell_lod_exist(self):
        near, far = self.asset("residence_near"), self.asset("residence_far")
        near_count = sum(len(p["triangles"]) for p in near.primitives)
        far_count = sum(len(p["triangles"]) for p in far.primitives)
        self.assertLessEqual(near_count, 40000)
        self.assertGreaterEqual(far_count, 6000)
        self.assertLessEqual(far_count, 12000)
        self.assertLess(far_count, near_count * .6)

    def test_meter_floor_and_footprint_are_actual_geometry(self):
        near = self.asset("residence_near")
        self.assertAlmostEqual(near.dimensions[0], 14, delta=.002)
        self.assertAlmostEqual(near.dimensions[2], 12, delta=.002)
        for x in (-5.5, 0, 5.5):
            for z in (-5.0, 0, 5.0):
                self.assertTrue(near.horizontal_surface_at(x, z, 0, "Stone"))

    def test_front_and_internal_doorways_have_real_clearance(self):
        near = self.asset("residence_near")
        for x in (-.68, 0, .68):
            for height in (.20, 1.0, 2.39):
                hits = [p["material"] for p in near.primitives for triangle in p["triangles"]
                        if segment_triangle((x, height, 6.1), (x, height, -4.8), triangle)]
                self.assertFalse(hits, f"Central doorway path blocked at x{x}, height{height}: {hits[:5]}")

    def test_interior_groups_are_separate_from_roof_and_shell(self):
        near = self.asset("residence_near")
        names = {node.get("name", "") for node in near.gltf["nodes"]}
        self.assertLessEqual({"Floor", "Walls", "Posts", "Roof", "Ceiling", "Furniture"}, names)
        far = self.asset("residence_far")
        self.assertNotIn("Furniture", {node.get("name", "") for node in far.gltf["nodes"]})

    def test_palette_geometry_and_manifest_collision_contract(self):
        self.assertIsNotNone(self.manifest, "Missing residence collision and provenance manifest")
        for name in ("residence_near", "residence_far"):
            asset = self.asset(name)
            entry = self.manifest["assets"][name]
            self.assertFalse(asset.gltf.get("images"))
            self.assertFalse(asset.gltf.get("textures"))
            self.assertLessEqual({p["material"] for p in asset.primitives}, QA.PALETTE)
            self.assertLessEqual(len(asset.gltf["materials"]), 7)
            self.assertEqual(entry["triangles"], sum(len(p["triangles"]) for p in asset.primitives))
            self.assertEqual(entry["bytes"], len(asset.payload))
            self.assertEqual(set(entry["groups"]), {n["name"] for n in asset.gltf["nodes"]
                                                   if n.get("name") in ("Floor", "Walls", "Posts", "Roof", "Ceiling", "Furniture")})
        self.assertEqual(self.manifest["floor_top_y_m"], 0)
        doors = self.manifest["door_apertures"]
        self.assertGreaterEqual(doors["entrance"]["width_m"], 1.5)
        self.assertGreaterEqual(doors["entrance"]["height_m"], 2.4)
        self.assertGreaterEqual(doors["internal"]["width_m"], 1.4)
        profiles = self.manifest["collision_profiles"]
        for group in ("floor", "walls", "posts", "ceiling", "furniture"):
            self.assertTrue(profiles[group], f"Missing {group} physical collision profiles")
            for box in profiles[group]:
                self.assertEqual(len(box["center_y_up_m"]), 3)
                self.assertTrue(all(math.isfinite(value) and value > 0 for value in box["size_y_up_m"]))
        self.assertTrue(profiles["roof"]["vertices_y_up_m"])
        self.assertTrue(profiles["roof"]["triangles"])

    def test_collision_boxes_preserve_central_capsule_lane(self):
        self.assertIsNotNone(self.manifest, "Missing residence collision manifest")
        for group in ("walls", "posts", "ceiling", "furniture"):
            for box in self.manifest["collision_profiles"][group]:
                center, size = box["center_y_up_m"], box["size_y_up_m"]
                lo = [center[i] - size[i] / 2 for i in range(3)]
                hi = [center[i] + size[i] / 2 for i in range(3)]
                overlap = (lo[0] < .32 and hi[0] > -.32 and lo[1] < 2.39 and hi[1] > .01
                           and lo[2] < 5.9 and hi[2] > -4.8)
                self.assertFalse(overlap, f"{group}/{box['name']} blocks the room-to-room capsule lane")

    def test_roof_collision_has_finite_upward_nonzero_faces(self):
        self.assertIsNotNone(self.manifest, "Missing residence collision manifest")
        roof = self.manifest["collision_profiles"]["roof"]
        points = roof["vertices_y_up_m"]
        self.assertTrue(all(math.isfinite(value) for point in points for value in point))
        for indices in roof["triangles"]:
            self.assertEqual(len(indices), 3)
            self.assertTrue(all(type(index) is int and 0 <= index < len(points) for index in indices))
            a, b, c = (points[index] for index in indices)
            normal = QA.cross(QA.subtract(b, a), QA.subtract(c, a))
            self.assertGreater(QA.length_squared(normal), 1e-12)
            self.assertGreater(normal[1], 0, "Roof collision top faces must face a falling/flying capsule")


if __name__ == "__main__":
    unittest.main(verbosity=2)
