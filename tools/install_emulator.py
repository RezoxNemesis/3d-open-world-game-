"""Pin official emulator/image archives; preserve TLS and upstream SHA-1 verification."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import zipfile

root = Path(os.environ['TEMPLE_ENV_ROOT'])
sdk = root / 'android/sdk'
lock = json.loads(Path('tools/emulator-lock.json').read_text())
items = [('emulator', sdk / 'emulator', 'emulator', 'Pkg.Revision=37.2.12'),
         ('system_image', sdk / 'system-images/android-29/default/x86_64', 'x86_64', 'Pkg.Revision=8')]
for name, target, prefix, revision in items:
    record = lock[name]
    properties = target / 'source.properties'
    if properties.exists() and revision in properties.read_text().splitlines():
        continue  # Retain the SDK-manager-verified installed package.
    archive = root / 'cache' / record['url'].split('/')[-1]
    if not archive.exists():
        part = archive.with_suffix('.part')
        subprocess.run(['curl', '--fail', '--location', '--retry', '2', '--max-time', '600', '--output', str(part), record['url']], check=True)
        part.replace(archive)
    with archive.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha1').hexdigest() == record['sha1'], name + ' checksum mismatch'
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            relative = Path(member.filename)
            assert relative.parts[0] == prefix and '..' not in relative.parts
            if member.is_dir():
                continue
            out = target.joinpath(*relative.parts[1:])
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(bundle.read(member))
            permissions = (member.external_attr >> 16) & 0o777
            if permissions:
                out.chmod(permissions)
    assert revision in properties.read_text().splitlines()
# adb/console currently hardcode home paths. Create only absent paths; preserve user data.
cache = Path(os.environ['ANDROID_USER_HOME'])
cache.mkdir(parents=True, exist_ok=True)
token = cache / '.emulator_console_auth_token'
if not token.exists():
    token.write_text(secrets.token_hex(32) + '\n')
    token.chmod(0o600)
for name, target in [('.android', cache), ('.emulator_console_auth_token', token)]:
    link = Path.home() / name
    if not link.exists() and not link.is_symlink():
        try:
            link.symlink_to(target, target_is_directory=target.is_dir())
        except OSError as error:
            raise SystemExit(f'Platform-approved initialization needed for {link}; preserve HOME and authentication: {error}')
print('PASS: pinned emulator/image versions and authenticated runtime storage available')
