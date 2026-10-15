"""Validate exact-source real scene pixels and visible native controls, not phone FPS."""

import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageStat

from android_label_ocr import locate_label

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "artifacts/verdant-qa/final-views"
EXPECTED = {
    "wide-powers.png": (1600, 720),
    "compact-powers.png": (960, 540),
    "scholar-interior.png": (1600, 720),
    "fox-shrine.png": (1600, 720),
    "fox-interior.png": (1600, 720),
    "covered-bridge.png": (1600, 720),
    "dragon-spout.png": (1600, 720),
    "residence-exterior.png": (1600, 720),
    "residence-front-room.png": (1600, 720),
    "residence-back-room.png": (1600, 720),
    "traveler-detail.png": (1600, 720),
    "wide-lore.png": (1600, 720),
    "compact-lore.png": (960, 540),
    "wide-journal.png": (1600, 720),
    "compact-journal.png": (960, 540),
    "shrine-bell.png": (1600, 720),
    "water-motion-a.png": (1600, 720),
    "water-motion-b.png": (1600, 720),
    "dragon-motion-a.png": (1600, 720),
    "dragon-motion-b.png": (1600, 720),
    "roof-balanced.png": (1600, 720),
    "roof-high.png": (1600, 720),
}
POWER_LABELS = {
    "power_flight": "FLY",
    "power_leap": "LEAP",
    "power_speed": "SPEED",
    "power_smash": "SMASH",
}


def contains(outer, inner):
    x, y, width, height = inner
    return (x >= outer[0] and y >= outer[1]
            and x + width <= outer[0] + outer[2]
            and y + height <= outer[1] + outer[3])


def native_label(screenshot, label, bounds, prefix):
    """Read a unique label inside the actual hit target; instruction captions may repeat it."""
    x, y, width, height = bounds
    crop = screenshot.crop((round(x), round(y), round(x + width), round(y + height))).convert("L")
    scale = 6
    crop = crop.resize((crop.width * scale, crop.height * scale), Image.Resampling.LANCZOS)
    for threshold in (None, 160, 185):
        readable = crop if threshold is None else crop.point(lambda value: 0 if value > threshold else 255)
        try:
            match = locate_label(readable, label, OUTPUT / "ocr", prefix + f"-target-{threshold}")
        except AssertionError:
            continue
        bx, by, bw, bh = match["bounds"]
        match["bounds"] = [x + bx / scale, y + by / scale, bw / scale, bh / scale]
        match["center"] = [x + match["center"][0] / scale, y + match["center"][1] / scale]
        match["method"] = f"native-target-6x-threshold-{threshold}"
        return match
    raise AssertionError(f"No readable {label} inside its actual native target")


def main():
    report = json.loads((OUTPUT / "verdant-render-metrics.json").read_text())
    assert report["schema_version"] == 1
    assert report["display_server"].lower() != "headless", "Dummy renderer is not visual evidence"
    assert report["checks"] and all(check["passed"] for check in report["checks"])
    for path, captured_hash in report["inputs_sha256"].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == captured_hash, path
    assert len(report["captures"]) == len(EXPECTED)
    assert {Path(view["file"]).name for view in report["captures"]} == set(EXPECTED)
    hashes = set()
    ocr = {}
    for view in report["captures"]:
        filename = Path(view["file"]).name
        size = EXPECTED[filename]
        assert tuple(view["image_size"]) == size, filename
        assert view["save_result"] == 0 and view["draw_calls"] > 0 and view["triangles"] > 0
        if filename == "wide-powers.png":
            assert view["quality_preset"] == "balanced"
            assert view["draw_calls"] <= 800 and view["triangles"] <= 700000, "Wide courtyard budget"
        if filename.startswith("roof-"):
            assert view["quality_preset"] == filename.removeprefix("roof-").removesuffix(".png")
        path = ROOT / view["file"]
        hashes.add(hashlib.sha256(path.read_bytes()).hexdigest())
        with Image.open(path) as screenshot:
            assert screenshot.size == size
            assert max(ImageStat.Stat(screenshot.convert("RGB")).stddev) > 15, filename
            if view["controls_visible"]:
                actions = view["touch_actions"]
                assert set(POWER_LABELS) <= set(actions), f"Missing real power targets: {filename}"
                for action, bounds in actions.items():
                    assert contains([0, 0, *size], bounds), f"Off-canvas native target {action}"
                ocr[filename] = {}
                for action, label in POWER_LABELS.items():
                    bounds = actions[action]
                    assert min(bounds[2:]) >= 48, f"Small power target {action}"
                    match = native_label(screenshot, label, bounds, path.stem + "-" + label.lower())
                    assert contains(bounds, match["bounds"]), f"Visible {label} misses native hit target"
                    center = [bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2]
                    assert math.dist(center, match["center"]) < max(bounds[2:]) / 2
                    ocr[filename][label] = match
            else:
                assert not view["touch_actions"], filename
            if "lore" in filename or "journal" in filename or filename == "shrine-bell.png":
                assert view["dialog_open"] and not view["player_physics"], filename
                assert contains([0, 0, *size], view["dialog_bounds"]), filename
                assert contains(view["dialog_bounds"], view["primary_bounds"]), filename
                assert contains(view["dialog_bounds"], view["text_bounds"]), filename
                if "journal" in filename:
                    assert view["dialog_mode"] == "journal" and view["text_scroll_enabled"]
                else:
                    assert view["text_content_height"] <= view["text_bounds"][3], filename
    assert len(hashes) == len(EXPECTED), "Duplicate scene pixels"
    motion = report["dragon_motion"]
    assert math.dist(motion["before"], motion["after"]) > 0.2
    assert motion["bones_before"] and motion["bones_before"] != motion["bones_after"]
    (OUTPUT / "power-label-verification.json").write_text(json.dumps(ocr, indent=2) + "\n")
    print(f"PASS: {len(EXPECTED)} exact-source real scene/control views and power-label OCR")
    print("These desktop pixels do not establish physical Realme performance or touch ergonomics.")


if __name__ == "__main__":
    main()
