#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
checked_godot android-export --headless --export-debug Android artifacts/TempleRealm-Android-debug.apk
SDK="$TEMPLE_ENV_ROOT/android/sdk"
"$SDK/build-tools/36.0.0/apksigner" verify --verbose artifacts/TempleRealm-Android-debug.apk > artifacts/apk-signature.log
"$SDK/build-tools/36.0.0/aapt" dump badging artifacts/TempleRealm-Android-debug.apk > artifacts/apk-badging.log
"$SDK/build-tools/36.0.0/aapt" dump permissions artifacts/TempleRealm-Android-debug.apk > artifacts/apk-permissions.log
rg -q "package: name='org.templerealm.prototype'" artifacts/apk-badging.log
rg -q "native-code: 'arm64-v8a'" artifacts/apk-badging.log
python - <<'VERIFY'
import json
from pathlib import Path
from zipfile import ZipFile

manifest_path = Path('assets/models/residence/manifest.json')
with ZipFile('artifacts/TempleRealm-Android-debug.apk') as apk:
    packed = apk.read('assets/' + manifest_path.as_posix())
assert packed == manifest_path.read_bytes(), 'APK collision manifest differs from authored source'
assert json.loads(packed)['collision_profiles']['roof']['triangles'], 'Missing actual house collision'
print('PASS: APK includes exact authored residence collision manifest')
VERIFY
if rg 'android.permission.(INTERNET|CAMERA|RECORD_AUDIO|ACCESS_FINE_LOCATION)' artifacts/apk-permissions.log; then
 echo 'Unexpected sensitive or Internet permission'; exit 1
fi
sha256sum artifacts/TempleRealm-Android-debug.apk > artifacts/apk-sha256.txt
cat artifacts/apk-signature.log
cat artifacts/apk-sha256.txt
echo 'PASS: signed Android arm64 debug APK; physical phone execution remains unverified'
