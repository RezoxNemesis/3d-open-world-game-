#!/usr/bin/env python3
"""Original seeded karst runoff, moss and layered-limestone PBR maps.

No image inputs. Pillow smooths seeded random fields at geological scales.
"""
from pathlib import Path
import random

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SIZE = 512


def field(width, height, seed):
    rng = random.Random(seed)
    image = Image.new("L", (width, height))
    image.putdata([rng.randrange(256) for _ in range(width * height)])
    tiled = Image.new("L", (width * 3, height * 3))
    for tile_y in range(3):
        for tile_x in range(3):
            tiled.paste(image, (tile_x * width, tile_y * height))
    seamless = tiled.resize((SIZE * 3, SIZE * 3), Image.Resampling.BICUBIC).crop((SIZE, SIZE, SIZE * 2, SIZE * 2))
    return list(seamless.get_flattened_data())


def clamp(value, low=0.0, high=1.0):
    return max(low, min(high, value))


def generate():
    macro = field(7, 9, 73110)
    runoff = field(43, 7, 73111)
    flecks = field(87, 85, 73112)
    moss_field = field(13, 23, 73113)
    sediment = field(7, 111, 73114)
    colors, heights, roughness = [], [], []
    for index in range(SIZE * SIZE):
        broad = macro[index] / 255.0
        vertical = runoff[index] / 255.0
        grain = flecks[index] / 255.0
        layers = sediment[index] / 255.0
        # Broken dark drainage courses vary over tens of meters, while moss
        # occupies damp pockets instead of uniformly tinting the entire cliff.
        channel = clamp((0.46 - vertical) * 3.0)
        variation = 0.62 + broad * 0.48 + grain * 0.12 + layers * 0.10
        rock = [0.52 * variation, 0.55 * variation, 0.53 * variation]
        moss = clamp((moss_field[index] / 255.0 * 0.55 + broad * 0.25 + channel * 0.35 - 0.48) * 2.8, 0.0, 0.76)
        wet = 1.0 - channel * 0.32
        rgb = [(rock[c] * (1.0 - moss) + (0.20, 0.31, 0.235)[c] * moss) * wet for c in range(3)]
        colors.append(tuple(round(clamp(value) * 255) for value in rgb))
        heights.append(broad * 0.34 + vertical * 0.26 + grain * 0.20 + layers * 0.20 - channel * 0.19)
        value = round((0.76 + grain * 0.16 - channel * 0.14) * 255)
        roughness.append((value, value, value))
    normals = []
    for y in range(SIZE):
        for x in range(SIZE):
            dx = (heights[y * SIZE + (x - 1) % SIZE] - heights[y * SIZE + (x + 1) % SIZE]) * 5.0
            dy = (heights[((y - 1) % SIZE) * SIZE + x] - heights[((y + 1) % SIZE) * SIZE + x]) * 5.0
            inverse_length = (dx * dx + dy * dy + 1.0) ** -0.5
            normals.append(tuple(round(clamp(component * inverse_length * 0.5 + 0.5) * 255) for component in (dx, dy, 1.0)))
    for suffix, pixels in [("", colors), ("_normal", normals), ("_roughness", roughness)]:
        image = Image.new("RGB", (SIZE, SIZE))
        image.putdata(pixels)
        image.save(ROOT / "assets/materials" / f"landscape_karst_original{suffix}.png", optimize=True)
    print("Generated original 512px karst albedo/normal/roughness maps, seeds 73110–73114")


if __name__ == "__main__":
    generate()
