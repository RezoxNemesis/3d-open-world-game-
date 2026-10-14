"""Bounded repeatable validation with archived evidence and a last-good checkpoint."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time
import uuid
from android_runtime_cache import matching_block

parser = argparse.ArgumentParser()
parser.add_argument('--runtime', choices=['required', 'auto', 'skip'], default='auto')
args = parser.parse_args()
root = Path.cwd()
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:6]
run = root / 'artifacts/cycles' / stamp
run.mkdir(parents=True)
state = Path(os.environ['TEMPLE_ENV_ROOT']) / 'autonomy'
state.mkdir(parents=True, exist_ok=True)
report = {'run': stamp, 'started_unix': time.time(), 'runtime_mode': args.runtime, 'status': 'RUNNING', 'steps': []}

def persist():
    report['updated_unix'] = time.time()
    (run / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    temporary = state / 'latest.json.tmp'
    temporary.write_text(json.dumps(report, indent=2) + '\n')
    temporary.replace(state / 'latest.json')

def step(label, command, timeout):
    record = {'name': label, 'started_unix': time.time(), 'log': str(run / (label + '.log'))}
    report['steps'].append(record)
    print('Running ' + label, flush=True)
    with Path(record['log']).open('w') as log:
        try:
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            returncode = process.wait(timeout=timeout)
            record['exit_code'] = returncode
            record['status'] = 'PASS' if returncode == 0 else 'BLOCKED' if returncode == 2 else 'FAIL'
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=10)
            record['exit_code'] = 124
            record['status'] = 'BLOCKED'
            record['reason'] = 'Bounded step timeout; inspect current log before any retry'
    record['finished_unix'] = time.time()
    persist()
    print(label + ': ' + record['status'], flush=True)
    return record['status']

try:
    for label, command, timeout in [
        ('gameplay', ['tools/validate_environment.sh'], 180),
        ('security', ['tools/security_audit.sh'], 180),
        ('render', ['tools/render_environment.sh'], 180),
        ('phone-apk', ['tools/export_android.sh'], 180),
    ]:
        outcome = step(label, command, timeout)
        if outcome != 'PASS':
            report['status'] = outcome
            raise RuntimeError(label + ' did not pass; diagnose before changing code or retrying')
        if label == 'phone-apk':
            for name in ['TempleRealm-Android-debug.apk', 'apk-sha256.txt']:
                shutil.copy2(root / 'artifacts' / name, run / name)
            report['phone_apk_sha256'] = hashlib.sha256((run / 'TempleRealm-Android-debug.apk').read_bytes()).hexdigest()
            persist()
    if args.runtime == 'skip':
        report['steps'].append({'name': 'android-runtime', 'status': 'SKIPPED', 'reason': 'Explicit host-only cycle; not full Android validation'})
        report['status'] = 'PARTIAL'
    else:
        outcome = step('emulator-setup', ['tools/setup_emulator.sh'], 900)
        if outcome == 'PASS':
            outcome = step('emulator-build', ['python', 'tools/build_emulator_apk.py'], 420)
        if outcome == 'PASS':
            known_block = matching_block(root, state / 'android-host-block.json') if args.runtime == 'auto' else None
            if known_block:
                report['steps'].append({'name': 'android-runtime', 'status': 'BLOCKED', 'reason': known_block['reason'], 'evidence': known_block['evidence'], 'cached_host_observation': True})
                outcome = 'BLOCKED'
                persist()
            else:
                outcome = step('android-runtime', ['python', '-u', 'tools/test_android_runtime.py'], 1500)
        report['status'] = 'PASS' if outcome == 'PASS' else 'PARTIAL' if outcome == 'BLOCKED' and args.runtime == 'auto' else outcome
        if report['status'] == 'PARTIAL':
            report['limitation'] = 'Android runtime is BLOCKED on this host; core checks and signed phone APK passed. Continue independent development without claiming Android runtime success.'
        elif outcome != 'PASS':
            raise RuntimeError('Android runtime remains unresolved; host checks and phone build are archived separately')
    for name in ['TempleRealm-Android-debug.apk', 'apk-sha256.txt', 'temple-courtyard.png', 'emulator-build.json']:
        source = root / 'artifacts' / name
        if source.exists():
            shutil.copy2(source, run / name)
    runtime = root / 'artifacts/android-runtime'
    if args.runtime != 'skip' and runtime.exists():
        shutil.copytree(runtime, run / 'android-runtime', dirs_exist_ok=True)
    if report['status'] == 'PASS':
        last_good = state / 'last-good'
        last_good.mkdir(exist_ok=True)
        apk = run / 'TempleRealm-Android-debug.apk'
        shutil.copy2(apk, last_good / apk.name)
        report['phone_apk_sha256'] = hashlib.sha256(apk.read_bytes()).hexdigest()
        (last_good / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
except Exception as error:
    report['error'] = str(error)
    if report['status'] == 'RUNNING':
        report['status'] = 'FAIL'
finally:
    runtime = root / 'artifacts/android-runtime'
    runtime_steps = [s for s in report['steps'] if s['name'] == 'android-runtime' and 'started_unix' in s]
    if runtime_steps and (runtime / 'result.json').exists():
        current = json.loads((runtime / 'result.json').read_text())
        if current.get('started_unix', 0) >= runtime_steps[-1]['started_unix']:
            shutil.copytree(runtime, run / 'android-runtime', dirs_exist_ok=True)
    report['finished_unix'] = time.time()
    persist()
print(json.dumps({'status': report['status'], 'report': str(run / 'result.json')}), flush=True)
raise SystemExit(0 if report['status'] in ['PASS', 'PARTIAL'] else 2 if report['status'] == 'BLOCKED' else 1)
