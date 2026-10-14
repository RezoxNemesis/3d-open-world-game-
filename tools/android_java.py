"""Find and validate a Java 21 runtime across cloud and hosted Linux runners."""

from collections.abc import Mapping
import os
from pathlib import Path
import re
import shutil
import subprocess

DEBIAN_JAVA21 = Path("/usr/lib/jvm/java-21-openjdk-amd64")


def resolve_java21(
    env: Mapping[str, str] | None = None,
    *,
    fallback_home: Path | None = DEBIAN_JAVA21,
) -> Path:
    """Return a canonical home only after probing Java 21 and finding keytool.

    The caller can pass this path as JAVA_HOME to SDK subprocesses and to Godot's
    Android export settings. No global environment or home-directory change occurs.
    """
    environment = dict(os.environ if env is None else env)
    candidates = []
    for variable in ("JAVA_HOME", "JAVA_HOME_21_X64"):
        if environment.get(variable):
            candidates.append((variable, Path(environment[variable])))
    path_java = shutil.which("java", path=environment.get("PATH", ""))
    if path_java:
        candidates.append(("PATH", Path(path_java).resolve().parent.parent))
    if fallback_home is not None:
        candidates.append(("Debian fallback", Path(fallback_home)))

    rejected = []
    seen = set()
    for source, candidate in candidates:
        home = candidate.resolve()
        if home in seen:
            continue
        seen.add(home)
        missing = [name for name in ("java", "keytool")
                   if not (home / "bin" / name).is_file()
                   or not os.access(home / "bin" / name, os.X_OK)]
        if missing:
            rejected.append(f"{source}: missing executable {' and '.join(missing)}")
            continue
        probe_environment = environment.copy()
        probe_environment["JAVA_HOME"] = str(home)
        try:
            probe = subprocess.run(
                [str(home / "bin/java"), "-version"],
                env=probe_environment,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=10,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            rejected.append(f"{source}: Java version probe failed")
            continue
        version = re.search(r'(?:openjdk|java) version "(\d+)(?:[.\-+"]|$)',
                            probe.stderr + "\n" + probe.stdout)
        if probe.returncode != 0 or version is None:
            rejected.append(f"{source}: Java version probe failed")
            continue
        major = int(version.group(1))
        if major != 21:
            rejected.append(f"{source}: Java major {major}")
            continue
        return home

    details = "; ".join(rejected) or "no Java home or PATH runtime configured"
    raise RuntimeError(
        "Java 21 required with executable java and keytool. "
        "Configure JAVA_HOME or install/setup Java 21. " + details
    )
