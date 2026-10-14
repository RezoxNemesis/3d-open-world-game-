"""User-local extraction of pinned, authenticated Debian Xvfb; no system install."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

root = Path(os.environ["TEMPLE_ENV_ROOT"])
(root / "cache").mkdir(parents=True, exist_ok=True)
(root / "bin").mkdir(parents=True, exist_ok=True)
lock = json.loads(Path("tools/xvfb-lock.json").read_text())
archive = root / "cache" / lock["filename"]
if not archive.exists():
    part = archive.with_suffix(".part")
    subprocess.run(["curl", "--fail", "--location", "--retry", "2", "--max-time", "120", "--output", str(part), lock["url"]], check=True)
    part.replace(archive)
assert hashlib.file_digest(archive.open("rb"), "sha256").hexdigest() == lock["sha256"], "Xvfb checksum mismatch"
subprocess.run(["dpkg-deb", "--extract", str(archive), str(root / "x11")], check=True)
print("PASS: pinned Debian Xvfb SHA256")
