"""Official Google SDK installation and local debug signing only; no release secrets."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile

root = Path(os.environ['TEMPLE_ENV_ROOT'])
lock = json.loads(Path('tools/android-sdk-lock.json').read_text())
archive = root / 'cache' / lock['archive']
if not archive.exists():
    part = archive.with_suffix('.part')
    subprocess.run(['curl', '--fail', '--location', '--retry', '2', '--max-time', '600', '--output', str(part), 'https://dl.google.com/android/repository/' + lock['archive']], check=True)
    part.replace(archive)
assert hashlib.file_digest(archive.open('rb'), 'sha1').hexdigest() == lock['sha1'], 'Google SDK archive checksum mismatch'
sdk = root / 'android' / 'sdk'
manager = sdk / 'cmdline-tools' / lock['revision'] / 'bin' / 'sdkmanager'
if not manager.exists():
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.namelist():
            relative = Path(member)
            assert relative.parts[0] == 'cmdline-tools' and '..' not in relative.parts
            if member.endswith('/'):
                continue
            out = sdk / 'cmdline-tools' / lock['revision'] / Path(*relative.parts[1:])
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(bundle.read(member))
            if 'bin' in relative.parts:
                out.chmod(0o755)
sdk_env = os.environ.copy()
sdk_env['ANDROID_USER_HOME'] = str(root / 'android' / 'user')
Path(sdk_env['ANDROID_USER_HOME']).mkdir(parents=True, exist_ok=True)
subprocess.run([str(manager), '--sdk_root=' + str(sdk), '--licenses'], env=sdk_env, input='y\n' * 100, text=True, check=True)
subprocess.run([str(manager), '--sdk_root=' + str(sdk), 'platform-tools', 'platforms;android-36', 'build-tools;36.0.0'], env=sdk_env, check=True)
java = Path('/usr/lib/jvm/java-21-openjdk-amd64')
assert (java / 'bin' / 'java').exists(), 'Java 21 runtime required'
# Conventional, replaceable debug-only key. Never use it for store distribution.
key = root / 'android' / 'debug.keystore'
if not key.exists():
    subprocess.run([str(java / 'bin' / 'keytool'), '-genkeypair', '-keystore', str(key), '-storepass', 'android', '-keypass', 'android', '-alias', 'androiddebugkey', '-dname', 'CN=Android Debug,O=Temple Realm,C=US', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000'], check=True)
settings = Path(os.environ['XDG_CONFIG_HOME']) / 'godot' / 'editor_settings-4.7.tres'
text = settings.read_text()
values = {'export/android/java_sdk_path': str(java), 'export/android/android_sdk_path': str(sdk), 'export/android/debug_keystore': str(key)}
for name, value in values.items():
    lines = [line for line in text.splitlines() if not line.startswith(name + ' = ')]
    text = '\n'.join(lines) + '\n' + name + ' = ' + json.dumps(value) + '\n'
settings.write_text(text)
print('PASS: official SDK archive checksum, Android 36 tools and local debug signing configuration')
