#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
python tools/security_scan.py
python -m pip check
# Direct PyPI advisories use inherited TLS/proxy trust. Audit errors remain failures.
pip-audit --vulnerability-service pypi --timeout 30 --format json --output artifacts/dependency-audit.json
printf 'PASS: source scan and Python dependency advisory audit\n'
