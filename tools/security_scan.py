"""Bounded source scan; this is not a malware or comprehensive secret detector."""
from pathlib import Path
import hashlib
import json
import re

patterns = [re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"), re.compile(r"\bgh[pousr]_" + r"[A-Za-z0-9]{30,}\b"), re.compile(r"\bAKIA" + r"[A-Z0-9]{16}\b")]
root = Path.cwd().resolve()
inventory = []
for p in sorted(root.rglob("*")):
    relative = p.relative_to(root)
    if any(part in {".git", ".godot", "artifacts", "__pycache__"} for part in relative.parts):
        continue
    if p.is_symlink():
        assert p.resolve().is_relative_to(root), f"External source symlink: {relative}"
    if not p.is_file():
        continue
    data = p.read_bytes()
    text = data.decode("utf-8", errors="replace")
    for pattern in patterns:
        assert not pattern.search(text), f"Potential credential in {relative}; inspect without printing value"
    assert p.stat().st_mode & 0o6000 == 0, f"Setuid/setgid file: {relative}"
    inventory.append({"path": str(relative), "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
Path("artifacts/source-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")
print(f"PASS: scanned {len(inventory)} source/configuration files; no matching credential patterns, escaping symlinks or setuid bits")
