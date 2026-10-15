"""Create an ABI-only emulator export in an isolated validation copy of the project."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

root = Path.cwd()
environment = Path(os.environ['TEMPLE_ENV_ROOT'])
staging = environment / 'android' / 'validation-project'
staging.mkdir(parents=True, exist_ok=True)
source_hashes = {}
for name in ['project.godot', 'scenes', 'scripts', 'assets']:
    source = root / name
    target = staging / name
    if source.is_dir():
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target)
        files = list(source.rglob('*'))
    else:
        shutil.copy2(source, target)
        files = [source]
    for path in files:
        if path.is_file():
            relative = path.relative_to(root)
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            assert hashlib.sha256((staging / relative).read_bytes()).hexdigest() == digest
            source_hashes[str(relative)] = digest
preset = (root / 'export_presets.cfg').read_text()
preset = preset.replace('architectures/arm64-v8a=true', 'architectures/arm64-v8a=false')
preset = preset.replace('architectures/x86_64=false', 'architectures/x86_64=true')
(staging / 'export_presets.cfg').write_text(preset)
output = root / 'artifacts' / 'TempleRealm-emulator-x86_64.apk'
for label, args in [('import', ['--editor', '--import']), ('export', ['--export-debug', 'Android', str(output)])]:
    log = root / 'artifacts' / ('emulator-' + label + '.log')
    with log.open('w') as handle:
        result = subprocess.run(['godot', '--headless', '--path', str(staging), *args], stdout=handle, stderr=subprocess.STDOUT, timeout=180)
    text = log.read_text()
    assert result.returncode == 0 and 'ERROR:' not in text, f'{label} failed; see {log}'
assert output.exists()
manifest = {'created_unix': time.time(), 'architecture': 'x86_64', 'export_presets_sha256': hashlib.sha256((root / 'export_presets.cfg').read_bytes()).hexdigest(), 'source_hashes': source_hashes, 'apk_sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'limitation': 'Same application sources; different native ABI from the ARM64 phone APK.'}
(root / 'artifacts' / 'emulator-build.json').write_text(json.dumps(manifest, indent=2) + '\n')
sdk = environment / 'android' / 'sdk'
subprocess.run([str(sdk / 'build-tools/36.0.0/apksigner'), 'verify', str(output)], check=True)
print('PASS: signed emulator APK with source hashes matching the phone project; x86_64 ABI only')
