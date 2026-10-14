"""Portable Java selection checks using isolated executable version probes."""

import importlib.util
from pathlib import Path
import tempfile
import unittest

if importlib.util.find_spec("android_java"):
    from android_java import resolve_java21
else:
    resolve_java21 = None


class AndroidJavaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def java_home(self, name, major=21, keytool=True, require_home=False):
        home = self.root / name
        (home / "bin").mkdir(parents=True)
        java = home / "bin/java"
        guard = f'[ "$JAVA_HOME" = "{home}" ] || exit 9\n' if require_home else ""
        java.write_text(
            '#!/bin/sh\n' + guard +
            f'printf \'openjdk version "{major}.0.8"\\n\' >&2\n',
            encoding="utf-8",
        )
        java.chmod(0o755)
        if keytool:
            tool = home / "bin/keytool"
            tool.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            tool.chmod(0o755)
        return home

    def resolve(self, env, fallback_home=None):
        self.assertIsNotNone(resolve_java21, "Portable validated Java 21 resolver is missing")
        return resolve_java21(env, fallback_home=fallback_home)

    def test_temurin_java_home_is_preferred_over_debian_fallback(self):
        temurin = self.java_home("temurin-21")
        debian = self.java_home("debian-21")
        self.assertEqual(self.resolve({"JAVA_HOME": str(temurin), "PATH": ""}, debian), temurin)

    def test_stale_java_home_17_falls_back_to_hosted_java_home_21(self):
        stale = self.java_home("java-17", major=17)
        hosted = self.java_home("hosted-temurin-21", require_home=True)
        self.assertEqual(self.resolve({
            "JAVA_HOME": str(stale), "JAVA_HOME_21_X64": str(hosted), "PATH": "",
        }), hosted)

    def test_java_without_keytool_is_refused(self):
        incomplete = self.java_home("incomplete-21", keytool=False)
        with self.assertRaisesRegex(RuntimeError, "keytool"):
            self.resolve({"JAVA_HOME": str(incomplete), "PATH": ""})

    def test_only_java_17_is_rejected_with_clear_major_requirement(self):
        unsupported = self.java_home("only-17", major=17)
        with self.assertRaisesRegex(RuntimeError, "Java 21 required.*major 17"):
            self.resolve({"JAVA_HOME": str(unsupported), "PATH": ""})

    def test_path_java_symlink_resolves_to_its_real_home(self):
        actual = self.java_home("path-runtime-21", require_home=True)
        wrappers = self.root / "path-bin"
        wrappers.mkdir()
        (wrappers / "java").symlink_to(actual / "bin/java")
        self.assertEqual(self.resolve({"PATH": str(wrappers)}), actual)

    def test_valid_debian_fallback_preserves_existing_cloud_setup(self):
        fallback = self.java_home("debian-cloud-21", require_home=True)
        self.assertEqual(self.resolve({"PATH": ""}, fallback), fallback)


if __name__ == "__main__":
    unittest.main()
