"""Verify actual recorded frames, input/physics telemetry and encoded video provenance."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys

from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[1]


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "traversal"
    assert mode in {"traversal", "abilities"}
    output = ROOT / "artifacts/verdant-qa/motion" / mode
    report = json.loads((output / "motion-provenance.json").read_text())
    assert report["schema_version"] == 1 and report["mode"] == mode
    assert report["display_server"].lower() != "headless", "Dummy frames are not gameplay footage"
    assert report["checks"] and all(check["passed"] for check in report["checks"])
    for path, captured_hash in report["inputs_sha256"].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == captured_hash, path
    fps = report["playback_fps"]
    assert report["quality_preset"] in {"balanced", "performance"}
    count = report["frame_count"]
    assert fps == 20 and count >= 15 * fps
    assert len(report["frames"]) == count
    files = sorted(output.glob("frame-*.png"))
    assert len(files) == count and [p.name for p in files] == [f"frame-{i:05d}.png" for i in range(count)]
    assert len(report["native_events"]) >= 2, "Missing real native input events"
    images = []
    for index in [0, count // 2, count - 1]:
        image = Image.open(files[index]).convert("RGB")
        assert image.size == (960, 540)
        assert max(ImageStat.Stat(image).stddev) > 15, "Blank recorded frame"
        images.append(image)
    assert any(max(ImageStat.Stat(ImageChops.difference(images[0], image)).mean) > 3 for image in images[1:]), "Static footage"
    positions = [frame["position"] for frame in report["frames"]]
    assert max(p[2] for p in positions) - min(p[2] for p in positions) > 35
    if mode == "traversal":
        assert max(p[1] for p in positions) > 5.9 and min(p[1] for p in positions) > -0.1
        assert report["frames"][-1]["grounded"], "Return did not end on actual floor"
    video = output / "gameplay.mp4"
    probe = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames:format=duration",
        "-of", "json", str(video)
    ], text=True))
    stream = probe["streams"][0]
    assert (stream["width"], stream["height"]) == (960, 540)
    assert stream["r_frame_rate"] == "20/1" and int(stream["nb_read_frames"]) == count
    assert abs(float(probe["format"]["duration"]) - count / fps) < 0.06
    evidence = {
        "mode": mode, "source_provenance": "motion-provenance.json",
        "video": "gameplay.mp4", "video_sha256": hashlib.sha256(video.read_bytes()).hexdigest(),
        "frame_count": count, "playback_fps": fps, "playback_seconds": count / fps,
        "quality_preset": report["quality_preset"],
        "software_recording_wall_seconds": report["recording_wall_seconds"],
        "coverage": "Real fixed-time game physics and native desktop touch; no phone FPS claim.",
        "encoded_video_probe": probe,
    }
    (output / "video-verification.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(f"PASS: {mode}, {count} real frames, {count / fps:.1f}s video, exact-source/native-input/physics provenance")
    print("Playback timing is authored fixed-time capture. Physical Realme speed and thermals remain unverified.")


if __name__ == "__main__":
    main()
