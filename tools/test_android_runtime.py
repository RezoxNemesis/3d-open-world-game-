"""Run an isolated Android emulator, launch the ABI-matched APK and exercise real input."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from PIL import Image, ImageChops, ImageStat
from android_runtime_cache import record_foreground_block
from android_label_ocr import locate_label

parser = argparse.ArgumentParser()
parser.add_argument('--serial', help='Use an already-running emulator; do not stop it')
parser.add_argument('--gpu', choices=['swangle', 'swiftshader'], default='swangle')
parser.add_argument('--boot-timeout', type=int, default=600)
args = parser.parse_args()
root = Path.cwd()
environment = Path(os.environ['TEMPLE_ENV_ROOT'])
sdk = environment / 'android/sdk'
output = root / 'artifacts/android-runtime'
output.mkdir(parents=True, exist_ok=True)
env = os.environ.copy()
env.update(ANDROID_SDK_ROOT=str(sdk), ANDROID_AVD_HOME=str(environment / 'android/avd'), ANDROID_EMULATOR_HOME=env['ANDROID_USER_HOME'])
serial = args.serial or 'emulator-5558'
port = 5037 if args.serial else 5038
emulator = None
owned_server = False
report = {'gpu_backend': args.gpu, 'status': 'RUNNING', 'abi': 'x86_64', 'api': 29, 'hardware_acceleration': False, 'kvm_device_present': Path('/dev/kvm').exists(), 'checks': [], 'started_unix': time.time()}

def adb(*arguments, timeout=90, binary=False):
    command = [str(sdk / 'platform-tools/adb'), '-P', str(port), '-s', serial, *arguments]
    print('Android operation: ' + ' '.join(arguments[:3]), flush=True)
    result = subprocess.run(command, capture_output=True, timeout=timeout, env=env)
    if result.returncode:
        raise RuntimeError(f'adb {arguments[0]} failed: {result.stderr.decode(errors="replace")[-500:]}')
    return result.stdout if binary else result.stdout.decode(errors='replace').strip()

def screenshot(name):
    windows = adb('shell', 'dumpsys', 'window', 'displays', timeout=90)
    (output / (name + '.window.txt')).write_text(windows)
    focus = [line for line in windows.splitlines() if 'mCurrentFocus=' in line]
    assert focus and 'org.templerealm.prototype' in focus[0], 'Android game is not foreground; inspect emulator system UI/ANR state'
    path = output / name
    path.write_bytes(adb('exec-out', 'screencap', '-p', timeout=90, binary=True))
    image = Image.open(path).convert('RGB')
    assert min(image.size) >= 480 and max(ImageStat.Stat(image).stddev) > 15, 'Blank/invalid Android screenshot'
    ocr = subprocess.run(['tesseract', str(path), 'stdout', '--psm', '11'], capture_output=True, text=True, timeout=45, check=True).stdout.upper()
    assert "RESPONDING" not in ocr, 'Android ANR dialog obscures the game'
    assert 'TEMPLE' in ocr and 'REALM' in ocr, 'Android capture does not show the readable game HUD; wait for stable frames or diagnose rendering'
    return image

def tap_label(name, label):
    """Tap the label actually visible in the Android framebuffer, not old fixed coordinates."""
    image = screenshot(name)
    match = locate_label(image, label, output, name)
    report.setdefault('ui_label_checks', []).append({'label': label, **match})
    adb('shell', 'input', 'tap', *(str(round(value)) for value in match['center']), timeout=60)
    time.sleep(2)

(output / 'result.json').write_text(json.dumps(report, indent=2) + '\n')

try:
    if not args.serial:
        acceleration = subprocess.run([str(sdk / 'emulator/emulator'), '-accel-check'], capture_output=True, env=env, timeout=20).returncode == 0
        report['hardware_acceleration'] = acceleration
        env['ANDROID_ADB_SERVER_PORT'] = str(port)
        subprocess.run([str(sdk / 'platform-tools/adb'), '-P', str(port), 'start-server'], check=True, capture_output=True, env=env)
        owned_server = True
        (output / 'ownership.json').write_text(json.dumps({'port': port, 'started_unix': time.time()}) + '\n')
        log = (output / 'boot.log').open('w')
        emulator = subprocess.Popen([str(sdk / 'emulator/emulator'), '-avd', 'TempleRealm_API29', '-port', '5558', '-no-window', '-no-audio', '-no-boot-anim', '-no-snapshot', '-accel', 'on' if acceleration else 'off', '-gpu', args.gpu, '-feature', '-Vulkan', '-memory', '2048', '-cores', '2'], stdout=log, stderr=subprocess.STDOUT, env=env)
    deadline = time.monotonic() + args.boot_timeout
    while time.monotonic() < deadline:
        if emulator is not None and emulator.poll() is not None:
            raise RuntimeError('Emulator exited; inspect artifacts/android-runtime/boot.log')
        try:
            if adb('shell', 'getprop', 'sys.boot_completed', timeout=8) == '1':
                break
        except (RuntimeError, subprocess.TimeoutExpired):
            pass
        print('Waiting for Android boot...', flush=True)
        time.sleep(5)
    else:
        report['status'] = 'BLOCKED'
        raise RuntimeError('Android boot exceeded the bounded timeout; retain desktop/gameplay evidence separately')
    report['checks'].append('Android boot completed')
    home = adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.HOME', timeout=60).splitlines()[-1]
    launcher = home.split('/')[0]
    if not launcher.startswith('com.android.launcher'):
        launcher = 'com.android.launcher3'  # The pinned AOSP API29 image's stock launcher; resolver can still be warming up.
    adb('shell', 'am', 'force-stop', launcher, timeout=60)
    report['checks'].append('Stopped stock launcher on dedicated software-emulated test device')
    apk = root / 'artifacts/TempleRealm-emulator-x86_64.apk'
    expected = hashlib.sha256(apk.read_bytes()).hexdigest()
    existing = adb('shell', 'pm', 'path', 'org.templerealm.prototype', timeout=60)
    actual = ''
    if existing.startswith('package:'):
        actual = adb('shell', 'sha256sum', existing.splitlines()[0].removeprefix('package:'), timeout=90).split()[0]
    if actual != expected:
        install = adb('install', '--no-streaming', '-r', str(apk), timeout=300)
        assert 'Success' in install, install
    else:
        print('Installed APK matches exact SHA256; reusing verified binary', flush=True)
    report['checks'].append('APK installed successfully')
    adb('shell', 'wm', 'size', '720x1280')
    adb('shell', 'wm', 'density', '240')
    adb('shell', 'wm', 'dismiss-keyguard', timeout=90)
    adb('shell', 'am', 'force-stop', 'org.templerealm.prototype', timeout=60)
    adb('shell', 'logcat', '-c')
    activity = adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', 'org.templerealm.prototype').splitlines()[-1]
    assert activity.startswith('org.templerealm.prototype/'), activity
    launch = adb('shell', 'am', 'start', '-W', '-n', activity, timeout=180)
    (output / 'launch.log').write_text(launch + '\n')
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        logs = adb('logcat', '-d', '-v', 'brief', 'godot:V', 'AndroidRuntime:E', '*:S', timeout=90)
        (output / 'logcat.log').write_text(logs)
        assert 'FATAL EXCEPTION' not in logs, 'Android runtime crash'
        assert not any('E/godot' in line and 'ERROR:' in line for line in logs.splitlines()), 'Godot Android renderer/runtime errors; inspect logcat.log'
        if 'TEMPLE_REALM_READY:' in logs:
            break
        print('Waiting for game ready marker...', flush=True)
        time.sleep(5)
    else:
        raise RuntimeError('Game never emitted its ready marker')
    report['checks'].append('Main scene emitted game ready marker')
    assert adb('shell', 'pidof', 'org.templerealm.prototype'), 'App process disappeared'
    deadline = time.monotonic() + 120
    while True:
        try:
            before = screenshot('before.png')
            break
        except AssertionError:
            if time.monotonic() >= deadline:
                raise
            print('Waiting for stable foreground game pixels...', flush=True)
            time.sleep(5)
    width, height = before.size
    assert width > height, 'Android game is not in landscape orientation'
    report['checks'].append('Landscape game rendered a nonblank Android screenshot')
    # A real Android swipe on the right camera region should change the rendered viewpoint.
    adb('shell', 'input', 'swipe', str(int(width * .70)), str(int(height * .45)), str(int(width * .85)), str(int(height * .48)), '1200', timeout=60)
    time.sleep(5)
    after = screenshot('after-camera.png')
    difference = sum(ImageStat.Stat(ImageChops.difference(before, after)).mean)
    assert difference > 2, f'Camera swipe did not change rendered pixels: {difference}'
    report['checks'].append('Android camera swipe changed the rendered viewpoint')
    # Exercise independent on-screen jump and persistence controls; host tests verify state semantics.
    tap_label('before-jump.png', 'JUMP')
    tap_label('before-settings.png', 'SETTINGS')
    tap_label('before-save.png', 'SAVE')
    saved = adb('shell', 'run-as', 'org.templerealm.prototype', 'find', 'files', '-name', 'save.json', timeout=60)
    assert saved.endswith('save.json'), 'Android SAVE control did not create its app-local save file'
    report['checks'].append('Android SAVE control created an app-local save file')
    tap_label('before-load.png', 'LOAD')
    tap_label('before-close.png', 'CLOSE')
    assert adb('shell', 'pidof', 'org.templerealm.prototype'), 'App crashed after touch interactions'
    screenshot('after-controls.png')
    report['checks'].append('Jump/save/load touch sequence completed without process exit')
    logs = adb('logcat', '-d', '-v', 'brief', 'godot:V', 'AndroidRuntime:E', '*:S', timeout=90)
    (output / 'logcat.log').write_text(logs)
    assert 'FATAL EXCEPTION' not in logs and 'SCRIPT ERROR:' not in logs, 'Runtime or GDScript errors detected'
    report['status'] = 'PASS'
    print('PASS: actual Android runtime, rendering and touch smoke; x86_64 software emulator, not Realme hardware', flush=True)
except Exception as error:
    if report['status'] == 'RUNNING':
        report['status'] = 'BLOCKED' if isinstance(error, subprocess.TimeoutExpired) else 'FAIL'
        window = output / 'before.png.window.txt'
        if window.exists() and window.stat().st_mtime >= report['started_unix']:
            log_path = output / 'logcat.log'
            runtime_log = log_path.read_text() if log_path.exists() else ''
            block = record_foreground_block(root, environment / 'autonomy/android-host-block.json',
                error, window.read_text(), str(window), runtime_log)
            if block:
                report['status'] = 'BLOCKED'
                report['host_limitation'] = block['reason']
                report['evidence'] = block['evidence']
    report['error'] = str(error)
    print(report['status'] + ': ' + str(error), flush=True)
finally:
    report['finished_unix'] = time.time()
    (output / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    if emulator is not None:
        emulator.terminate()
        try:
            emulator.wait(timeout=15)
        except subprocess.TimeoutExpired:
            emulator.kill()
            emulator.wait(timeout=10)
    if owned_server:
        subprocess.run([str(sdk / 'platform-tools/adb'), '-P', str(port), 'kill-server'], env=env, capture_output=True, timeout=15)
raise SystemExit(0 if report['status'] == 'PASS' else 2 if report['status'] == 'BLOCKED' else 1)
