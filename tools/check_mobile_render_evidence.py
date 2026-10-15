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
    "wide-settings-bottom.png": (1600, 720),
    "compact-gameplay.png": (960, 540),
    "compact-settings.png": (960, 540),
    "compact-settings-bottom.png": (960, 540),
}


def contains(outer, inner):
    x, y, w, h = inner
    return x >= outer[0] and y >= outer[1] and x + w <= outer[0] + outer[2] and y + h <= outer[1] + outer[3]


def intersection(first, second):
    x, y = max(first[0], second[0]), max(first[1], second[1])
    right = min(first[0] + first[2], second[0] + second[2])
    bottom = min(first[1] + first[3], second[1] + second[3])
    return [x, y, right - x, bottom - y] if right > x and bottom > y else [0, 0, 0, 0]


def target_label(screenshot, label, bounds, prefix):
    x, y, width, height = bounds
    crop = screenshot.crop((round(x), round(y), round(x + width), round(y + height)))
    scale = 4
    crop = crop.resize((crop.width * scale, crop.height * scale), Image.Resampling.LANCZOS)
    match = locate_label(crop, label, OUTPUT / "ocr", prefix + "-target")
    bx, by, bw, bh = match["bounds"]
    match["bounds"] = [x + bx / scale, y + by / scale, bw / scale, bh / scale]
    match["center"] = [x + match["center"][0] / scale, y + match["center"][1] / scale]
    match["method"] = "semantic-target-4x-" + match["method"]
    return match


def main():
    report = json.loads((OUTPUT / "mobile-render-metrics.json").read_text())
    assert report["schema_version"] == 2
    assert report["display_server"].lower() != "headless", "Dummy renderer is not pixel evidence"
    assert report["touchscreen_available"] and report["emulate_touch_from_mouse"] and report["emulate_mouse_from_touch"]
    assert report["input_dispatch"] == "Input.parse_input_event with native ScreenTouch/ScreenDrag"
    assert len(report["checks"]) >= 16 and all(check["passed"] for check in report["checks"])
    assert len([event for event in report["native_events"] if "ScreenDrag" in event["kind"]]) >= 4
    for path, expected_hash in report["inputs_sha256"].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected_hash, f"Stale capture: {path}"
    assert len(report["captures"]) == len(EXPECTED)
    assert {Path(view["file"]).name for view in report["captures"]} == set(EXPECTED)
    ocr_report = {}
    covered = {"wide": set(), "compact": set()}
    required_buttons = {}
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
            size_name = filename.split("-")[0]
            required_buttons.setdefault(size_name, set())
            for button in view["settings_buttons"]:
                label = button["label"].lstrip("● ")
                required_buttons[size_name].add(label)
                expected_visible = intersection(button["bounds"], button["clip_bounds"])
                assert all(abs(a-b) < .01 for a, b in zip(expected_visible, button["visible_bounds"])), f"Incorrect clipping: {filename} {label}"
                if button["scroll_content"]:
                    assert button["clip_bounds"] == view["settings_scroll"]["bounds"]
                else:
                    assert contains(view["settings_bounds"], button["bounds"]), f"Pinned button off panel: {filename} {label}"
                    assert contains(button["clip_bounds"], button["bounds"]), f"Pinned button clipped: {filename} {label}"
                if contains(button["clip_bounds"], button["bounds"]):
                    assert contains(view["settings_bounds"], button["bounds"]), f"Shown button off panel: {filename} {label}"
                    assert button["bounds"][3] >= 48, f"Small touch target: {filename} {label}"
                    covered[size_name].add(label)
            if filename.endswith("-bottom.png"):
                for label in ("Sprint at the edge of the movement pad", "RESTORE MOUNTAIN CRAGS"):
                    button = next(button for button in view["settings_buttons"] if button["label"] == label)
                    assert contains(button["clip_bounds"], button["bounds"]), f"Bottom control clipped: {filename} {label}"
                assert view["settings_scroll"]["vertical"] > 0
            else:
                assert view["settings_scroll"]["vertical"] == 0
        else:
            assert set(view["touch_actions"]) == {"jump", "sprint", "toggle_view", "map_game", "settings_game"}
            for action, details in view["touch_actions"].items():
                x, y = details["center"]
                radius = details["radius"]
                assert contains(outer, [x-radius, y-radius, 2*radius, 2*radius]), f"Touch circle off canvas: {filename} {action}"
        required = ["SAVE", "LOAD", "CLOSE", "JOURNAL", "RESET"] if view["settings_open"] else ["SETTINGS", "JUMP"]
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
        if filename.endswith("-bottom.png"):
            for label, word in (("Sprint at the edge of the movement pad", "EDGE"), ("RESTORE MOUNTAIN CRAGS", "RESTORE")):
                button = next(button for button in view["settings_buttons"] if button["label"] == label)
                with Image.open(path) as screenshot:
                    match = target_label(screenshot, word, button["bounds"], path.stem + "-" + word.lower())
                assert contains(button["bounds"], match["bounds"])
                ocr_report[filename][word] = match
    expected_labels = {"Performance", "Balanced", "High", "Sprint at the edge of the movement pad",
                       "RESTORE MOUNTAIN CRAGS", "CLOSE  ×", "SAVE", "LOAD", "JOURNAL", "RESET"}
    for size_name in covered:
        assert required_buttons[size_name] == expected_labels, f"Unexpected/missing settings controls: {size_name}"
        assert covered[size_name] == expected_labels, f"Settings control never fully visible: {size_name}"
    (OUTPUT / "mobile-ocr-verification.json").write_text(json.dumps(ocr_report, indent=2) + "\n")
    print("PASS: 8 current-source wide/compact captures, actual native settings scrolling/taps, complete control coverage and unique OCR labels")
    print("Desktop pixels verify layout and labels; Realme frame rate, thermals and physical safe area remain unverified.")


if __name__ == "__main__":
    main()
