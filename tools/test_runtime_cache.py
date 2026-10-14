"""Meaningful safeguards against cached infrastructure failures hiding new game defects."""
from pathlib import Path
import tempfile
import unittest
from android_runtime_cache import matching_block, record_block
import android_runtime_cache as cache


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

    def test_proven_system_overlay_is_recorded_as_an_infrastructure_block(self):
        record = cache.record_foreground_block(self.root, self.cache,
            AssertionError('Android game is not foreground; inspect emulator system UI/ANR state'),
            'mCurrentFocus=Application Not Responding: com.android.systemui', 'display dump',
            'I/godot: TEMPLE_REALM_READY: ready')
        self.assertEqual(record['status'], 'BLOCKED')

    def test_game_crash_is_not_hidden_by_a_system_overlay(self):
        record = cache.record_foreground_block(self.root, self.cache,
            AssertionError('Android game is not foreground; inspect emulator system UI/ANR state'),
            'mCurrentFocus=Application Not Responding: com.android.systemui', 'display dump',
            'FATAL EXCEPTION: Godot app')
        self.assertIsNone(record)
        self.assertFalse(self.cache.exists())

    def test_unrelated_assertion_is_not_demoted_to_a_host_block(self):
        record = cache.record_foreground_block(self.root, self.cache,
            AssertionError('Camera swipe did not change rendered pixels'),
            'mCurrentFocus=Application Not Responding: com.android.systemui', 'display dump', '')
        self.assertIsNone(record)
        self.assertFalse(self.cache.exists())


if __name__ == '__main__':
    unittest.main()
