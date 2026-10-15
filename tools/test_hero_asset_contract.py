"""Read shipped hero geometry independently of Blender and engine imports."""
from pathlib import Path
import json
import unittest
from test_verdant_asset_contract import SerializedGLB

ROOT = Path(__file__).resolve().parents[1] / 'assets/models/heroes'


class HeroAssetContract(unittest.TestCase):
    def test_serialized_geometry_and_mobile_budgets(self):
        manifest = json.loads((ROOT / 'manifest.json').read_text())
        for item in manifest['assets']:
            with self.subTest(asset=item['file']):
                asset = SerializedGLB(ROOT / item['file'])
                triangles = sum(len(p['triangles']) for p in asset.primitives)
                self.assertEqual(triangles, item['triangles'])
                self.assertEqual(len(asset.primitives), item['surfaces'])
                self.assertLessEqual(triangles, 18000 if 'sentinel' in item['file'] else 4800)
                self.assertFalse(asset.gltf.get('images'))
                self.assertEqual(len(asset.payload), item['bytes'])

    def test_guardian_rig_and_meter_scale(self):
        asset = SerializedGLB(ROOT / 'jade_sentinel.glb')
        nodes = {n.get('name'): n for n in asset.gltf['nodes']}
        for name, pivot in [('Head', (0, 3, 1.3)), ('Foreleg0', (-.94, 2.1, 1.1)), ('Foreleg1', (.94, 2.1, 1.1))]:
            self.assertIn(name, nodes)
            for value, target in zip(nodes[name]['translation'], pivot):
                self.assertAlmostEqual(value, target, places=4)
        self.assertGreater(asset.dimensions[1], 5)
        self.assertLess(asset.dimensions[1], 6)


if __name__ == '__main__':
    unittest.main()
