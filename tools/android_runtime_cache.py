"""Cache a demonstrated stock-system ANR only for unchanged app inputs and host resources."""
import hashlib
import json
import os
from pathlib import Path
import time


def fingerprint(root):
    files = []
    for name in ['project.godot', 'export_presets.cfg', 'scenes', 'scripts', 'assets', 'tools/engine-lock.json', 'tools/emulator-lock.json']:
        p = root / name
        files.extend([p] if p.is_file() else sorted(x for x in p.rglob('*') if x.is_file()) if p.is_dir() else [])
    contents = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    cpu = Path('/sys/fs/cgroup/cpu.max')
    data = {'files': contents, 'kvm': Path('/dev/kvm').exists(), 'kernel': os.uname().release, 'cpu_quota': cpu.read_text().strip() if cpu.exists() else None, 'profile': 'api29-x86_64-swangle-2048mb-2cores'}
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def record_block(root, path, window_text, evidence):
    focus = next((line for line in window_text.splitlines() if 'mCurrentFocus=' in line), '')
    if 'Application Not Responding:' not in focus or not any(name in focus for name in ['com.android.systemui', 'com.android.launcher3']):
        raise ValueError('Only a demonstrated stock Android system/launcher ANR qualifies; never cache a game failure')
    record = {'status': 'BLOCKED', 'fingerprint': fingerprint(root), 'observed_unix': time.time(), 'reason': 'Stock Android System UI/launcher ANR on the software-emulated host; interactive game validation unresolved', 'evidence': evidence}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, indent=2) + '\n')
    return record


def matching_block(root, path):
    if not path.exists():
        return None
    record = json.loads(path.read_text())
    age = time.time() - record.get('observed_unix', 0)
    if record.get('status') == 'BLOCKED' and 0 <= age <= 3600 and record.get('fingerprint') == fingerprint(root):
        return record
    return None
