#!/usr/bin/env python3
"""Create original, reproducible garden ambience without samples or dependencies."""

import argparse
import array
import json
import math
from pathlib import Path
import random
import subprocess
import sys
import wave


RATE = 22050
DURATION = 20.0
SEED = 73109
ROOT = Path(__file__).resolve().parents[1]


def add_chirp(channels, start, length, frequency, sweep, pan):
    """Small rounded chirps, synthesized from a changing sine frequency."""
    first = int(start * RATE)
    count = int(length * RATE)
    gains = (math.sqrt((1 - pan) / 2), math.sqrt((1 + pan) / 2))
    for index in range(count):
        time = index / RATE
        fraction = index / count
        envelope = math.sin(math.pi * fraction) ** 2
        phase = math.tau * (frequency * time + 0.5 * sweep * time * time)
        value = 0.018 * envelope * (
            math.sin(phase) + 0.12 * math.sin(phase * 2)
        )
        for channel, gain in zip(channels, gains):
            channel[first + index] += value * gain


def add_bell(channels, start):
    """A quiet distant metal bell with independently decaying partials."""
    first = int(start * RATE)
    count = int(6.0 * RATE)
    partials = ((290, 0.7, 2.3), (576, 0.2, 1.6), (863, 0.08, 1.1))
    for index in range(count):
        time = index / RATE
        attack = 1 - math.exp(-time / 0.035)
        value = 0.026 * attack * sum(
            strength * math.exp(-time / decay) * math.sin(math.tau * freq * time)
            for freq, strength, decay in partials
        )
        channels[0][first + index] += value * 0.75
        channels[1][first + index] += value * 0.9


def smooth_loop(channel):
    """A smooth value correction joins the ends without amplifying noise slopes."""
    count = int(0.5 * RATE)
    first = len(channel) - count
    value_delta = channel[0] - channel[-1]
    for index in range(count):
        fraction = index / (count - 1)
        value_basis = -2 * fraction**3 + 3 * fraction**2
        channel[first + index] += value_delta * value_basis
    # The joins are exact after PCM quantization, with a normal neighboring slope.
    channel[-1] = channel[0]
    channel[-2] = channel[0] - (channel[1] - channel[0])
    # Tiny cosine cushions prevent Vorbis window transients at the loop boundary.
    fade_count = int(0.025 * RATE)
    for index in range(fade_count):
        gain = math.sin(math.pi * index / (2 * (fade_count - 1))) ** 2
        channel[index] *= gain
        channel[-index - 1] *= gain


def statistics(channels):
    sample_count = sum(len(channel) for channel in channels)
    rms = math.sqrt(
        sum(value * value for channel in channels for value in channel) / sample_count
    )
    peak = max(abs(value) for channel in channels for value in channel)
    return {
        "peak": peak,
        "rms": rms,
        "peak_dbfs": 20 * math.log10(max(peak, 1e-12)),
        "rms_dbfs": 20 * math.log10(max(rms, 1e-12)),
        "endpoint_mismatch": [abs(channel[0] - channel[-1]) for channel in channels],
    }


def generate(output):
    rng = random.Random(SEED)
    count = int(DURATION * RATE)
    channels = [array.array("f", [0.0]) * count for _ in range(2)]
    wind = 0.0
    water_fast = [0.0, 0.0]
    water_slow = [0.0, 0.0]
    for index in range(count):
        time = index / RATE
        wind += 0.024 * (rng.uniform(-1, 1) - wind)
        breeze = 0.84 + 0.16 * math.sin(math.tau * time * 2 / DURATION)
        for side in range(2):
            noise = rng.uniform(-1, 1)
            water_fast[side] += 0.19 * (noise - water_fast[side])
            water_slow[side] += 0.04 * (noise - water_slow[side])
            water = water_fast[side] - water_slow[side]
            channels[side][index] = 0.22 * breeze * wind + 0.032 * water
    for start, pan in ((3.2, -0.55), (9.1, 0.6), (14.3, -0.25)):
        add_chirp(channels, start, 0.19, 1550, 2200, pan)
        add_chirp(channels, start + 0.27, 0.16, 1950, -1800, pan)
    add_bell(channels, 6.4)
    for channel in channels:
        smooth_loop(channel)
    initial = statistics(channels)
    gain = min(0.075 / initial["rms"], 0.65 / initial["peak"])
    for channel in channels:
        for index in range(count):
            channel[index] *= gain
    measured = statistics(channels)
    assert measured["peak"] < 0.99, "Clipping in generated ambience"
    assert max(measured["endpoint_mismatch"]) < 1e-6, "Discontinuous loop endpoint"
    artifacts = ROOT / "artifacts"
    artifacts.mkdir(exist_ok=True)
    wav_path = artifacts / "garden-source.wav"
    pcm = array.array("h")
    for frame in zip(*channels):
        pcm.extend(round(value * 32767) for value in frame)
    if sys.byteorder != "little":
        pcm.byteswap()
    with wave.open(str(wav_path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(pcm.tobytes())
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path),
            "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact",
            "-serial_offset", str(SEED), "-c:a", "libvorbis", "-q:a", "3", str(output),
        ],
        check=True,
    )
    assert output.stat().st_size < 200_000, "Mobile ambience exceeds budget"
    decoded = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(output),
            "-f", "s16le", "-acodec", "pcm_s16le", "-",
        ],
        check=True, capture_output=True,
    ).stdout
    values = array.array("h")
    values.frombytes(decoded)
    if sys.byteorder != "little":
        values.byteswap()
    decoded_channels = [[value / 32768 for value in values[side::2]] for side in range(2)]
    decoded_stats = statistics(decoded_channels)
    assert decoded_stats["peak"] < 0.99, "Clipping after Vorbis encoding"
    assert max(decoded_stats["endpoint_mismatch"]) < 0.003, "Vorbis loop discontinuity"
    report = {
        "origin": "Original mathematical synthesis; no third-party audio samples",
        "seed": SEED,
        "sample_rate": RATE,
        "seconds": DURATION,
        "channels": 2,
        "vorbis_quality": 3,
        "bytes": output.stat().st_size,
        "source": measured,
        "decoded": decoded_stats,
        "listening_review": "UNVERIFIED: no audio listening tool in this workspace",
    }
    (artifacts / "garden-audio-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "assets/audio/garden.ogg")
    generate(parser.parse_args().output.resolve())
