"""Meaningful safeguards against cached infrastructure failures hiding new game defects."""
from pathlib import Path
import tempfile
import unittest
from android_runtime_cache import matching_block, record_block


class RuntimeCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'scenes').mkdir()
        (self.root / 'scenes/main.tscn').write_text('original scene')
        self.cache = self.root / 'state/block.json'

    def test_unchanged_host_and_app_can_reuse_demonstrated_system_block(self):
        record_block(self.root, self.cache, 'mCurrentFocus=Application Not Responding: com.android.systemui', 'display dump')
        self.assertEqual(matching_block(self.root, self.cache)['status'], 'BLOCKED')

    def test_game_change_invalidates_cached_host_limitation(self):
        record_block(self.root, self.cache, 'mCurrentFocus=Application Not Responding: com.android.systemui', 'display dump')
        (self.root / 'scenes/main.tscn').write_text('changed scene')
        self.assertIsNone(matching_block(self.root, self.cache))

    def test_game_anr_cannot_be_demoted_to_a_cached_host_block(self):
        with self.assertRaises(ValueError):
            record_block(self.root, self.cache, 'mCurrentFocus=Application Not Responding: org.templerealm.prototype', 'display dump')
        self.assertFalse(self.cache.exists())


if __name__ == '__main__':
    unittest.main()
