"""Install only the pinned official archive after checksum validation; no root writes."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile

root = Path(os.environ["TEMPLE_ENV_ROOT"])
(root / "cache").mkdir(parents=True, exist_ok=True)
(root / "bin").mkdir(parents=True, exist_ok=True)
lock = json.loads(Path("tools/engine-lock.json").read_text())
base = "https://github.com/godotengine/godot-builds/releases/download/" + lock["release"]

def download(name):
    target = root / "cache" / name
    if not target.exists():
        part = target.with_suffix(target.suffix + ".part")
        subprocess.run(["curl", "--fail", "--location", "--retry", "2", "--connect-timeout", "20", "--max-time", "600", "--output", str(part), base + "/" + name], check=True)
        part.replace(target)
    return target

archive = download(lock["archive"])
assert hashlib.file_digest(archive.open("rb"), "sha512").hexdigest() == lock["sha512"], "Godot checksum mismatch; remove cached archive and retry"
with zipfile.ZipFile(archive) as bundle:
    binary = root / "bin" / "godot"
    content = bundle.read(lock["binary"])
    if not binary.exists() or hashlib.sha512(binary.read_bytes()).digest() != hashlib.sha512(content).digest():
        temporary = binary.with_suffix(".new")
        temporary.write_bytes(content)
        temporary.chmod(0o755)
        temporary.replace(binary)
print("PASS: pinned official Godot SHA-512")
if os.environ.get("WITH_EXPORT_TEMPLATES") == "1":
    name = lock["templates_archive"]
    sums = download("SHA512-SUMS.txt")
    expected = next(line.split()[0] for line in sums.read_text().splitlines() if line.split()[-1].lstrip("*") == name)
    assert expected == lock["templates_sha512"], "Published template checksum differs from pin"
    templates = download(name)
    assert hashlib.file_digest(templates.open("rb"), "sha512").hexdigest() == expected, "Export template checksum mismatch"
    target = Path(os.environ["XDG_DATA_HOME"]) / "godot" / "export_templates" / (lock["version"] + ".stable")
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(templates) as bundle:
        for member in bundle.namelist():
            relative = Path(member)
            assert relative.parts[0] == "templates" and ".." not in relative.parts
            if member.endswith("/"):
                continue
            out = target.joinpath(*relative.parts[1:])
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(bundle.read(member))
            if out.name.startswith("linux_"):
                out.chmod(0o755)
    print("PASS: matching export templates SHA-512")
