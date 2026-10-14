#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
export ANDROID_SDK_ROOT="$TEMPLE_ENV_ROOT/android/sdk"
export ANDROID_AVD_HOME="$TEMPLE_ENV_ROOT/android/avd"
export ANDROID_EMULATOR_HOME="$ANDROID_USER_HOME"
command -v tesseract >/dev/null || { echo "Tesseract OCR is required for readable Android capture validation"; exit 1; }
python tools/install_emulator.py
if [[ ! -f "$ANDROID_AVD_HOME/TempleRealm_API29.avd/config.ini" ]]; then
 mkdir -p "$ANDROID_AVD_HOME"
 printf 'no\n' | "$ANDROID_SDK_ROOT/cmdline-tools/19/bin/avdmanager" create avd --name TempleRealm_API29 --package 'system-images;android-29;default;x86_64' --path "$ANDROID_AVD_HOME/TempleRealm_API29.avd" --device pixel_2
fi
"$ANDROID_SDK_ROOT/emulator/emulator" -version > artifacts/emulator-version.log 2>&1
"$ANDROID_SDK_ROOT/platform-tools/adb" version
