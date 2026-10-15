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


def record_foreground_block(root, path, error, window_text, evidence, runtime_log):
    """Demote only a proven stock ANR obscuring the foreground check, never app failures."""
    if not isinstance(error, AssertionError) or not str(error).startswith('Android game is not foreground;'):
        return None
    if any(marker in runtime_log for marker in ['FATAL EXCEPTION', 'Fatal signal', 'SCRIPT ERROR:', 'ERROR:']):
        return None
    try:
        return record_block(root, path, window_text, evidence)
    except ValueError:
        return None


def verify_emulator_build(root, manifest, apk):
    """Do not attribute an old binary's runtime result to changed application sources."""
    current = {}
    for name in ['project.godot', 'scenes', 'scripts', 'assets']:
        path = root / name
        files = [path] if path.is_file() else sorted(p for p in path.rglob('*') if p.is_file())
        current.update({str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files})
    if not current or manifest.get('source_hashes') != current:
        raise ValueError('Emulator APK sources are stale; rebuild before runtime validation')
    preset_hash = hashlib.sha256((root / 'export_presets.cfg').read_bytes()).hexdigest()
    if manifest.get('export_presets_sha256') != preset_hash:
        raise ValueError('Emulator APK export settings are stale; rebuild before runtime validation')
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    if manifest.get('apk_sha256') != digest:
        raise ValueError('Emulator APK does not match its verified build manifest')
    return digest
