"""Check fresh actual mobile-layout pixels and OCR used by the native input tester."""

import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageStat
from android_label_ocr import locate_label

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "artifacts/upgrade-qa"
EXPECTED = {
    "wide-performance.png": (1600, 720),
    "wide-balanced.png": (1600, 720),
    "wide-high.png": (1600, 720),
    "wide-settings.png": (1600, 720),
    "compact-gameplay.png": (960, 540),
    "compact-settings.png": (960, 540),
}


def contains(outer, inner):
    x, y, w, h = inner
    return x >= outer[0] and y >= outer[1] and x + w <= outer[0] + outer[2] and y + h <= outer[1] + outer[3]


def main():
    report = json.loads((OUTPUT / "mobile-render-metrics.json").read_text())
    assert report["schema_version"] == 1
    assert report["display_server"].lower() != "headless", "Dummy renderer is not pixel evidence"
    for path, expected_hash in report["inputs_sha256"].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected_hash, f"Stale capture: {path}"
    assert len(report["captures"]) == len(EXPECTED)
    assert {Path(view["file"]).name for view in report["captures"]} == set(EXPECTED)
    ocr_report = {}
    for view in report["captures"]:
        filename = Path(view["file"]).name
        expected_size = EXPECTED[filename]
        path = ROOT / view["file"]
        assert tuple(view["image_size"]) == expected_size, filename
        assert tuple(view["canvas_size"]) == expected_size, filename
        assert view["save_result"] == 0 and view["draw_calls"] > 0 and view["triangles"] > 0
        with Image.open(path) as screenshot:
            assert screenshot.size == expected_size
            assert max(ImageStat.Stat(screenshot.convert("RGB")).stddev) > 15, filename
        outer = [0, 0, *expected_size]
        assert contains(outer, view["hud_bounds"]), f"HUD exceeds canvas: {filename}"
        if view["settings_open"]:
            assert not view["touch_actions"], f"Hidden touch controls remain active: {filename}"
            assert contains(outer, view["settings_bounds"]), f"Settings exceed canvas: {filename}"
            for button in view["settings_buttons"]:
                assert contains(view["settings_bounds"], button["bounds"]), f"Settings button off panel: {filename} {button['label']}"
                assert button["visible_bounds"][2:] == button["bounds"][2:], f"Settings button clipped: {filename} {button['label']}"
        else:
            assert set(view["touch_actions"]) == {"jump", "sprint", "toggle_view", "map_game", "settings_game"}
            for action, details in view["touch_actions"].items():
                x, y = details["center"]
                radius = details["radius"]
                assert contains(outer, [x-radius, y-radius, 2*radius, 2*radius]), f"Touch circle off canvas: {filename} {action}"
        required = ["SAVE", "LOAD", "CLOSE"] if view["settings_open"] else ["SETTINGS", "JUMP"]
        ocr_report[filename] = {}
        for label in required:
            with Image.open(path) as screenshot:
                match = locate_label(screenshot, label, OUTPUT / "ocr", path.stem + "-" + label.lower())
            if view["settings_open"]:
                buttons = [button for button in view["settings_buttons"] if button["label"].split()[0] == label]
                assert len(buttons) == 1, f"Semantic label is ambiguous: {label}"
                assert contains(buttons[0]["bounds"], match["bounds"]), f"OCR label misses real button: {label}"
            else:
                action = "settings_game" if label == "SETTINGS" else "jump"
                control = view["touch_actions"][action]
                assert math.dist(match["center"], control["center"]) < control["radius"], f"OCR tap misses actual touch button: {label}"
            ocr_report[filename][label] = match
    (OUTPUT / "mobile-ocr-verification.json").write_text(json.dumps(ocr_report, indent=2) + "\n")
    print("PASS: 6 current-source wide/compact captures, in-bounds controls and unique native-test OCR labels")
    print("Desktop pixels verify layout and labels; Realme frame rate, thermals and physical safe area remain unverified.")


if __name__ == "__main__":
    main()
