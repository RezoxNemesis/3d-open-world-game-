"""Check provenance, real GUI results and quest-capture geometry; not phone performance."""

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "artifacts/celestial-qa"
EXPECTED = {
    "sky-terrace.png": ((1600, 720), 1, False),
    "upper-relic.png": ((1600, 720), 1, False),
    "wide-dialogue.png": ((1600, 720), 0, True),
    "compact-dialogue.png": ((960, 540), 0, True),
    "earned-lantern.png": ((1600, 720), 3, False),
}


def contains(outer, inner):
    x, y, width, height = inner
    return (x >= outer[0] and y >= outer[1]
            and x + width <= outer[0] + outer[2]
            and y + height <= outer[1] + outer[3])


def heading_glyph_verification(probe):
    masks = {}
    dimensions = {}
    for direction in ["north", "east"]:
        with Image.open(ROOT / probe[direction + "_file"]) as image:
            image = image.convert("RGB")
            width, height = image.size
            dimensions[direction] = image.size
            pixels = set()
            for y in range(height // 2 - 11, height // 2 + 12):
                for x in range(width // 2 - 11, width // 2 + 12):
                    color = image.getpixel((x, y))
                    if sum(abs(a-b) for a, b in zip(color, (255, 240, 190))) <= 15:
                        pixels.add((x, y))
            assert len(pixels) >= 25, "Facing glyph is not visibly readable"
            masks[direction] = pixels
    assert dimensions["north"] == dimensions["east"]
    width, height = dimensions["north"]
    assert width == height
    north = masks["north"]
    east = masks["east"]
    north_width = max(x for x, _ in north) - min(x for x, _ in north)
    north_height = max(y for _, y in north) - min(y for _, y in north)
    east_width = max(x for x, _ in east) - min(x for x, _ in east)
    east_height = max(y for _, y in east) - min(y for _, y in east)
    assert north_height > north_width, "North-facing glyph does not point vertically"
    assert east_width > east_height, "East-facing glyph does not point horizontally"
    assert min(y for _, y in north) < height / 2 - 5, "North glyph has no northern tip"
    assert max(x for x, _ in east) > width / 2 + 5, "East glyph has no eastern tip"
    rotated = {(width - 1 - y, x) for x, y in north}
    overlap = len(rotated & east) / len(rotated | east)
    assert overlap >= 0.85, "Visible glyph does not rotate north-to-east with the actual camera"
    return {"north_glyph_pixels": len(north), "east_glyph_pixels": len(east),
            "clockwise_rotation_iou": overlap}


def main():
    report = json.loads((OUTPUT / "celestial-render-metrics.json").read_text())
    assert report["schema_version"] == 1
    assert report["display_server"].lower() != "headless", "Dummy rendering is not visual evidence"
    for path, captured_hash in report["inputs_sha256"].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == captured_hash, path
    assert len(report["captures"]) == len(EXPECTED)
    assert {Path(view["file"]).name for view in report["captures"]} == set(EXPECTED)
    hashes = set()
    for view in report["captures"]:
        filename = Path(view["file"]).name
        size, stage, dialogue = EXPECTED[filename]
        assert tuple(view["image_size"]) == size, filename
        assert view["save_result"] == 0 and view["draw_calls"] > 0 and view["triangles"] > 0
        assert view["quest_stage"] == stage and view["dialog_open"] == dialogue, filename
        assert view["reward_visible"] == (stage == 3), filename
        assert view["relic_visible"] == (stage < 2), filename
        if dialogue:
            assert contains([0, 0, *size], view["dialog_bounds"]), filename
            assert contains(view["dialog_bounds"], view["primary_bounds"]), filename
            assert contains(view["dialog_bounds"], view["dialogue_text_bounds"]), filename
            assert view["dialogue_content_height"] <= view["dialogue_text_bounds"][3], filename
        path = ROOT / view["file"]
        hashes.add(hashlib.sha256(path.read_bytes()).hexdigest())
        with Image.open(path) as image:
            assert image.size == size
            assert max(ImageStat.Stat(image.convert("RGB")).stddev) > 15, filename
    assert len(hashes) == len(EXPECTED), "Duplicate captures"
    assert len(report["gui_assertions"]) >= 10, "Missing actual touch/mouse/heading assertions"
    assert all(item["passed"] for item in report["gui_assertions"]), report["gui_assertions"]
    probe = report["heading_probe"]
    assert probe["north_yaw"] == 0 and probe["east_yaw"] < -1.5
    for key in ["north_file", "east_file"]:
        with Image.open(ROOT / probe[key]) as image:
            assert image.size == tuple(round(value) for value in probe["bounds"][2:])
    glyph_evidence = heading_glyph_verification(probe)
    (OUTPUT / "minimap-glyph-verification.json").write_text(json.dumps(glyph_evidence, indent=2) + "\n")
    print("PASS: 5 current-source celestial views, actual native-touch/mouse GUI and pixel-facing assertions")
    print("Actual desktop pixels verify scenes and controls; physical Realme performance is unverified.")


if __name__ == "__main__":
    main()
