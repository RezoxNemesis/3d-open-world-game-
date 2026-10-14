#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
[[ "$(godot --version)" == 4.7.2.stable.official.* ]] || { echo "Run tools/setup_environment.sh first"; exit 1; }
case "${1:-smoke}" in
 smoke) checked_godot startup --headless --quit-after 180 ;;
 editor) exec godot --editor --path "$TEMPLE_ROOT" ;;
 game) exec godot --path "$TEMPLE_ROOT" ;;
 *) echo 'Usage: tools/start_environment.sh [smoke|editor|game]'; exit 2 ;;
esac
