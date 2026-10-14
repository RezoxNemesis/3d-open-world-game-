"""Validate capture coverage/provenance, not subjective artwork quality or phone speed."""

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageStat


ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    "artifacts/district-player.png",
    "artifacts/district-sanctuary.png",
    "artifacts/district-lotus.png",
    "artifacts/district-gate.png",
    "artifacts/temple-courtyard.png",
}


def main():
    report = json.loads((ROOT / "artifacts/district-render-metrics.json").read_text())
    assert report["schema_version"] == 1
    assert report["viewport"] == [1280, 720]
    assert report["display_server"].lower() != "headless", "Dummy renderer is not visual evidence"
    assert {capture["file"] for capture in report["captures"]} == EXPECTED
    assert len(report["captures"]) == len(EXPECTED), "Missing or duplicate views"
    for path, captured_hash in report["inputs_sha256"].items():
        current_hash = hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
        assert current_hash == captured_hash, f"Stale evidence after source change: {path}"
    hashes = set()
    for capture in report["captures"]:
        assert capture["save_result"] == 0, capture["file"]
        assert capture["image_size"] == [1280, 720], capture["file"]
        path = ROOT / capture["file"]
        with Image.open(path) as image:
            assert image.size == (1280, 720), path
            assert max(ImageStat.Stat(image.convert("RGB")).stddev) > 15, f"Uniform image: {path}"
        hashes.add(hashlib.sha256(path.read_bytes()).hexdigest())
        assert capture["ui_visible"] == (capture["file"] == "artifacts/district-player.png")
        assert capture["rendering_server"]["draw_calls_in_frame"] > 0, "No recorded rendering"
        assert capture["rendering_server"]["triangles_in_frame"] > 0, "No recorded geometry"
    assert len(hashes) == len(EXPECTED), "Camera captures are identical"
    print(f"PASS: {len(EXPECTED)} distinct current-source 1280x720 views from {report['renderer']}")
    print("Capture coverage verified; visual fidelity and sustained phone performance need separate review.")


if __name__ == "__main__":
    main()
