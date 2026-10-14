#!/usr/bin/env python3
"""Generate original MIT karst PBR textures without imported images.

Seeded periodic limestone grain, bent strata, irregular vertical faults and
localized moss match natural cliffs rather than architectural paving. Run
inside the prepared Python environment; Pillow is already hash locked.
"""

import hashlib
import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "assets" / "materials"
SEED = 73109
TAU = math.tau


def corner(x, y, columns, rows, seed):
    value = ((x % columns) * 73856093) ^ ((y % rows) * 19349663) ^ seed
    value = ((value ^ (value >> 13)) * 1274126177) & 0xFFFFFFFF
    return (value ^ (value >> 16)) / 0xFFFFFFFF


def noise(u, v, columns, rows, seed):
    x, y = u * columns, v * rows
    ix, iy = math.floor(x), math.floor(y)
    tx, ty = x - ix, y - iy
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    a = corner(ix, iy, columns, rows, seed)
    b = corner(ix + 1, iy, columns, rows, seed)
    c = corner(ix, iy + 1, columns, rows, seed)
    d = corner(ix + 1, iy + 1, columns, rows, seed)
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty


def sample(u, v):
    broad = noise(u, v, 5, 4, SEED)
    mids = noise(u, v, 17, 13, SEED + 1)
    grain = noise(u, v, 59, 61, SEED + 2)
    warp = noise(u, v, 7, 9, SEED + 3)
    # Vertical breaks bend and disappear with height; they do not form slab
    # joints. Bent sediment lines vary in width, depth and exposure.
    fault = abs(math.sin(TAU * (4 * u + .22 * warp + .055 * mids
                              + .06 * math.sin(TAU * v))))
    fracture = max(0.0, 1 - fault * 5) ** 2 * max(0.0, (mids - .22) * 1.4)
    layer = math.sin(TAU * (8 * v + .22 * broad + .075 * math.sin(TAU * 3 * u)))
    stratum = max(0.0, layer - .56) ** 2
    worn = (broad - .5) * .14 + (mids - .5) * .085 + (grain - .5) * .04
    moss = max(0.0, noise(u, v, 9, 6, SEED + 4) - .6) * 1.05
    shade = worn - .13 * fracture - .047 * stratum
    rgb = (.575 + shade - moss * .25,
           .567 + shade - moss * .13,
           .527 + shade - moss * .27)
    height = ((broad - .5) * .026 + (mids - .5) * .006
              + (grain - .5) * .0016 - fracture * .008 - stratum * .003)
    roughness = .855 + (mids - .5) * .10 + fracture * .045 + moss * .14
    return tuple(max(.01, min(.99, color)) for color in rgb), height, min(.99, roughness)


def check_periodicity():
    checks = 0
    for u, v in ((0, 0), (.1, .7), (.991, .993), (.45, .31), (.37, .92)):
        a, b, c = sample(u, v), sample(u + 1, v), sample(u, v + 1)
        flat = lambda item: (*item[0], item[1], item[2])
        assert all(abs(x - y) < 1e-11 for x, y in zip(flat(a), flat(b)))
        assert all(abs(x - y) < 1e-11 for x, y in zip(flat(a), flat(c)))
        assert all(0 < x < 1 for x in a[0]) and 0 < a[2] <= 1
        assert abs(a[1]) < .03
        checks += 4
    return checks


def main():
    assertions = check_periodicity()
    DESTINATION.mkdir(parents=True, exist_ok=True)
    output = {}
    for channel, size in (("albedo", 512), ("normal", 256), ("roughness", 128)):
        pixels = []
        for y in range(size):
            for x in range(size):
                u, v = x / size, y / size
                color, _, roughness = sample(u, v)
                if channel == "albedo":
                    value = color
                elif channel == "normal":
                    delta = 1 / size
                    dx = (sample(u + delta, v)[1] - sample(u - delta, v)[1]) / (2 * delta)
                    dy = (sample(u, v + delta)[1] - sample(u, v - delta)[1]) / (2 * delta)
                    length = math.sqrt(dx * dx + dy * dy + 1)
                    value = (-dx / length * .5 + .5, -dy / length * .5 + .5,
                             1 / length * .5 + .5)
                else:
                    value = (1.0, roughness, 0.0)
                pixels.append(tuple(round(255 * component) for component in value))
        suffix = "" if channel == "albedo" else "_" + channel
        path = DESTINATION / ("karst_rock_original" + suffix + ".png")
        image = Image.new("RGB", (size, size))
        image.putdata(pixels)
        image.save(path, optimize=True)
        assert Image.open(path).size == (size, size)
        assertions += 1
        output[path.name] = {"dimensions": [size, size], "bytes": path.stat().st_size,
                             "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    print(json.dumps({"status": "PASS", "assertions": assertions, "seed": SEED,
                      "license": "MIT original mathematical texture generation",
                      "textures": output}, indent=2))


if __name__ == "__main__":
    main()
