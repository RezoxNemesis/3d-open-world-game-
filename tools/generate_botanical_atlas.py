#!/usr/bin/env python3
"""Original MIT botanical atlas: leaf, plum blossom, pine needles and red maple.

Pillow-only seeded vector painting. No photographs, concept pixels or external assets.
Four512px tiles in a1024px RGBA atlas; coloured transparent gutters prevent dark mips.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "assets/materials/botanical_atlas.png"
SEED = 73109
SCALE = 2
TILE = 512


def point(origin, angle, along, across=0):
    return (origin[0] + math.cos(angle) * along - math.sin(angle) * across,
            origin[1] + math.sin(angle) * along + math.cos(angle) * across)


def leaf(draw, origin, angle, length, width, color):
    outline = [point(origin, angle, length * t, width * w)
               for t, w in [(0, 0), (.25, .65), (.55, 1), (.8, .55), (1, 0),
                            (.8, -.55), (.55, -1), (.25, -.65)]]
    draw.polygon(outline, fill=color)
    vein = tuple(min(255, c + 25) for c in color[:3]) + (230,)
    draw.line([origin, point(origin, angle, length * .9)], fill=vein, width=2 * SCALE)
    for t in [.35, .55, .7]:
        for sign in [-1, 1]:
            draw.line([point(origin, angle, length * t),
                       point(origin, angle, length * (t + .14), width * sign * .6)],
                      fill=vein, width=SCALE)


def tile(kind: int):
    rng = random.Random(SEED + kind)
    backgrounds = [(88, 119, 65, 0), (223, 163, 178, 0), (58, 96, 58, 0), (174, 65, 35, 0)]
    image = Image.new("RGBA", (TILE * SCALE, TILE * SCALE), backgrounds[kind])
    draw = ImageDraw.Draw(image)
    center = (TILE * SCALE * .5, TILE * SCALE * .92)
    if kind == 0:
        # Leafy terminal sprays: slender olive stems disappear among irregular
        # broad leaves instead of forming five dark parallel fans in every card.
        for branch in range(6):
            angle = -math.pi * .5 + (branch - 2.5) * .24
            origin = (center[0] + rng.uniform(-30, 30) * SCALE,
                      center[1] - rng.uniform(0, 65) * SCALE)
            length = rng.uniform(.48, .66) * TILE * SCALE
            bend = rng.uniform(-.24, .24)
            points = [point(origin, angle + bend * t, length * t)
                      for t in [i / 12 for i in range(13)]]
            draw.line(points, fill=(88, 111, 64, 255), width=2 * SCALE)
            for node in range(5):
                progress = .22 + node * .16
                anchor = point(origin, angle + bend * progress, length * progress)
                for side in [-1, 1]:
                    direction = angle + side * rng.uniform(.75, 1.35)
                    size = rng.uniform(38, 55) * SCALE
                    shade = rng.randrange(-12, 22)
                    leaf(draw, anchor, direction, size * 1.7, size * .39,
                         (76 + shade, 119 + shade, 58 + shade, 255))
        return image.resize((TILE, TILE), Image.Resampling.LANCZOS)
    for branch in range(5):
        angle = -math.pi * .5 + (branch - 2) * .29
        length = rng.uniform(.62, .80) * TILE * SCALE
        end = point(center, angle, length)
        draw.line([center, end], fill=(88, 70, 45, 255), width=(3 if kind == 2 else 4) * SCALE)
        for node in range(6):
            distance = length * (.18 + node * .145)
            anchor = point(center, angle, distance)
            for side in [-1, 1]:
                direction = angle + side * rng.uniform(.6, 1.2)
                size = rng.uniform(24, 42) * SCALE
                if kind == 0:
                    shade = rng.randrange(-16, 24)
                    leaf(draw, anchor, direction, size * 1.55, size * .35,
                         (75 + shade, 119 + shade, 56 + shade, 255))
                elif kind == 1:
                    flower = point(anchor, direction, size * .8)
                    draw.line([anchor, flower], fill=(102, 65, 61, 255), width=2 * SCALE)
                    radius = rng.uniform(8, 15) * SCALE
                    for petal in range(5):
                        a = petal * math.tau / 5 + branch * .6
                        p = point(flower, a, radius * .65)
                        blush = rng.randrange(10, 55)
                        draw.ellipse([p[0] - radius * .62, p[1] - radius * .62,
                                      p[0] + radius * .62, p[1] + radius * .62],
                                     fill=(255, 171 + blush, 186 + blush, 255))
                    draw.ellipse([flower[0] - radius * .2, flower[1] - radius * .2,
                                  flower[0] + radius * .2, flower[1] + radius * .2],
                                 fill=(229, 162, 72, 255))
                    if node % 3 == 0:
                        leaf(draw, anchor, direction + .5, size, size * .2, (101, 133, 66, 255))
                elif kind == 2:
                    twig = point(anchor, direction, size * 1.5)
                    draw.line([anchor, twig], fill=(96, 87, 49, 255), width=2 * SCALE)
                    for needle in range(10):
                        p = point(anchor, direction, size * needle / 8)
                        for flank in [-1, 1]:
                            tip = point(p, direction + flank * .5, size * rng.uniform(.5, 1.1))
                            shade = rng.randrange(0, 40)
                            draw.line([p, tip], fill=(48 + shade, 93 + shade, 50 + shade, 255),
                                      width=rng.randrange(2, 4) * SCALE)
                else:
                    center_leaf = point(anchor, direction, size * .7)
                    draw.line([anchor, center_leaf], fill=(126, 53, 37, 255), width=2 * SCALE)
                    outline = []
                    for lobe in range(5):
                        a = direction - math.pi * .75 + lobe * math.pi * .375
                        outline.extend([point(center_leaf, a - .16, size * .35),
                                        point(center_leaf, a, size * rng.uniform(.72, 1.05)),
                                        point(center_leaf, a + .16, size * .4)])
                    shade = rng.randrange(0, 60)
                    draw.polygon(outline, fill=(170 + shade, 48 + shade // 2, 28, 255))
                    for lobe in range(5):
                        a = direction - math.pi * .75 + lobe * math.pi * .375
                        draw.line([center_leaf, point(center_leaf, a, size * .72)],
                                  fill=(226, 129, 54, 230), width=SCALE)
    return image.resize((TILE, TILE), Image.Resampling.LANCZOS)


def main():
    atlas = Image.new("RGBA", (TILE * 2, TILE * 2), (95, 117, 65, 0))
    for kind in range(4):
        atlas.paste(tile(kind), ((kind % 2) * TILE, (kind // 2) * TILE))
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(DESTINATION, optimize=True)
    # Hand-authored stochastic vertical bark grain, in cylinder UV coordinates.
    bark_rng = random.Random(SEED + 51)
    bark = Image.new("RGB", (128, 256))
    pixels = bark.load()
    for y in range(256):
        for x in range(128):
            u, v = x / 128, y / 256
            wave = math.sin(u * math.tau * 17 + math.sin(v * 13) * .7)
            groove = max(0, math.sin(u * math.tau * 31 + math.sin(v * 9))) ** 10
            fine = bark_rng.uniform(-8, 8)
            shade = wave * 9 - groove * 30 + fine
            pixels[x, y] = tuple(max(0, min(255, int(base + shade))) for base in (113, 94, 72))
    bark.save(DESTINATION.with_name("botanical_bark.png"), optimize=True)
    print(f"Original botanical atlas: {DESTINATION}, {DESTINATION.stat().st_size} bytes")


if __name__ == "__main__":
    main()
