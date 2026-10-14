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
if rg 'android.permission.(INTERNET|CAMERA|RECORD_AUDIO|ACCESS_FINE_LOCATION)' artifacts/apk-permissions.log; then
 echo 'Unexpected sensitive or Internet permission'; exit 1
fi
sha256sum artifacts/TempleRealm-Android-debug.apk > artifacts/apk-sha256.txt
cat artifacts/apk-signature.log
cat artifacts/apk-sha256.txt
echo 'PASS: signed Android arm64 debug APK; physical phone execution remains unverified'
