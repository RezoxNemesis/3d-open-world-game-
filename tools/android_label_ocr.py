"""Locate real visible UI labels for Android input and desktop capture verification."""

import csv
import io
from pathlib import Path
import subprocess

from PIL import Image


def _read_label(path: Path, label: str, offset=(0, 0), scale=1):
    result = subprocess.run(
        ["tesseract", str(path), "stdout", "--psm", "11", "tsv"],
        capture_output=True, text=True, timeout=45, check=True,
    )
    matches = []
    for word in csv.DictReader(io.StringIO(result.stdout), delimiter="\t"):
        confidence = float(word["conf"])
        if word["text"].strip().upper() != label or confidence <= 20:
            continue
        x = offset[0] + int(word["left"]) / scale
        y = offset[1] + int(word["top"]) / scale
        width = int(word["width"]) / scale
        height = int(word["height"]) / scale
        matches.append({"center": [x + width / 2, y + height / 2],
                        "bounds": [x, y, width, height], "confidence": confidence})
    assert len(matches) <= 1, f"Ambiguous visible {label} controls: {len(matches)}"
    return matches[0] if matches else None


def locate_label(image: Image.Image, label: str, output: Path, prefix: str) -> dict:
    """Require a unique readable label, retaining exact source-pixel coordinates."""
    output.mkdir(parents=True, exist_ok=True)
    path = output / (prefix + ".labels-full.png")
    image.save(path)
    match = _read_label(path, label)
    if match:
        return {**match, "method": "full-frame"}
    width, height = image.size
    if label in {"SETTINGS", "CLOSE"}:
        bounds = (int(width * .65), 0, width, int(height * .30))
    elif label == "JUMP":
        bounds = (int(width * .72), int(height * .55), width, height)
    else:
        bounds = (0, int(height * .50), width, height)
    crop = image.crop(bounds).convert("L")
    scale = 4
    crop = crop.resize((crop.width * scale, crop.height * scale), Image.Resampling.LANCZOS)
    for threshold in (185, 210):
        readable = crop.point(lambda value: 0 if value > threshold else 255)
        path = output / (prefix + f".labels-{threshold}.png")
        readable.save(path)
        match = _read_label(path, label, offset=bounds[:2], scale=scale)
        if match:
            return {**match, "method": f"cropped-4x-threshold-{threshold}"}
    raise AssertionError(f"No unique readable {label} control in actual captured pixels")
