#!/usr/bin/env python3
"""Original enterable two-room residence and shell LOD, Blender 4.3.2.

blender --background --factory-startup --python tools/generate_residence_assets.py
Append ``-- --preview`` or ``-- --preview-only`` for isolated DCC studio views.
Meters, front +Z in glTF, floor top Y=0. Shared palette; no image copies.
"""

import importlib.util
import json
import math
import struct
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "assets/models/residence"
SPEC = importlib.util.spec_from_file_location("verdant_geometry", ROOT / "tools/generate_verdant_assets.py")
VERDANT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERDANT)
KIT, BASE, Geometry = VERDANT.KIT, VERDANT.BASE, VERDANT.Geometry
PI = math.pi


def y_up(point):
    return [round(point[0], 5), round(point[2], 5), round(-point[1], 5)]


class Residence:
    def __init__(self, mats, far=False):
        self.mats, self.far = mats, far
        self.groups = {name: Geometry() for name in ("Floor", "Walls", "Posts", "Roof")}
        if not far:
            self.groups.update({"Ceiling": Geometry(), "Furniture": Geometry()})
        self.collision = {name: [] for name in ("floor", "walls", "posts", "ceiling", "furniture")}
        self.roof_collision = {"vertices_y_up_m": [], "triangles": []}

    def box(self, group, material, center, size, name=None, collision=False, bevel=0):
        geo = self.groups[group]
        if bevel:
            geo.board(self.mats[material], center, size, bevel)
        else:
            geo.box(self.mats[material], center, size)
        if collision:
            self.collider(group.lower(), name, center, size)

    def collider(self, group, name, center, size):
        self.collision[group].append({"name": name or group, "center_y_up_m": y_up(center),
                                      "size_y_up_m": [size[0], size[2], size[1]]})

    def append(self, group, geometry, center, yaw=0):
        cosine, sine = math.cos(yaw), math.sin(yaw)
        for mat, data in geometry.parts.items():
            vertices = [(center[0] + x * cosine - y * sine,
                         center[1] + x * sine + y * cosine, center[2] + z)
                        for x, y, z in data["vertices"]]
            self.groups[group].add(mat, vertices, data["faces"], smooth=data["smooth"])


def round_table(mats, radius=.85, height=.83):
    geo = Geometry()
    geo.lathe(mats["timber"], [(radius - .04, height - .13), (radius, height - .09),
                               (radius, height - .035), (radius - .035, height)], 24)
    geo.lathe(mats["gold"], [(radius + .002, height - .075), (radius + .002, height - .052)], 24, caps=False)
    for index in range(4):
        angle = PI / 4 + index * PI / 2
        x, y = .53 * math.cos(angle), .53 * math.sin(angle)
        geo.loft(mats["timber"], [(x * 1.10, y * 1.10, 0, .105, .105),
                                  (x, y, .12, .065, .065), (x * .86, y * .86, height - .22, .075, .075),
                                  (x, y, height - .10, .09, .09)], 8)
    geo.lathe(mats["gold"], [(.52, height - .003), (.53, height - .003)], 24, caps=False)
    # Tea bowl and lidded pot are hollow modeled ceramics, not labels or decals.
    geo.lathe(mats["jade"], [(.09, height), (.11, height + .04), (.13, height + .18),
                             (.11, height + .23), (.095, height + .24)], 12, (.15, .10, 0))
    geo.lathe(mats["gold"], [(.095, height + .24), (.065, height + .28), (.022, height + .30)], 12, (.15, .10, 0))
    for x, y in ((-.30, -.25), (.35, -.23)):
        geo.lathe(mats["jade"], [(.05, height), (.06, height + .025), (.105, height + .11),
                                 (.085, height + .115), (.05, height + .04)], 12, (x, y, 0))
    return geo


def stool(mats):
    geo = Geometry()
    geo.board(mats["timber"], (0, 0, .43), (.64, .62, .12), .03)
    geo.board(mats["cloth"], (0, 0, .51), (.58, .56, .065), .025)
    for x in (-.22, .22):
        for y in (-.21, .21):
            geo.loft(mats["timber"], [(x * 1.12, y * 1.12, 0, .055, .055),
                                      (x, y, .40, .045, .045)], 6)
    return geo


def canopy_bed(mats):
    geo = Geometry()
    # Raised rail frame, carved short feet, layered mattress and folded coverlet.
    geo.board(mats["timber"], (0, 0, .40), (2.55, 3.45, .26), .05)
    geo.board(mats["gold"], (0, 0, .54), (2.48, 3.38, .035), .02)
    geo.board(mats["cream"], (0, 0, .67), (2.32, 3.16, .23), .07)
    geo.board(mats["cloth"], (0, -.38, .81), (2.34, 2.35, .08), .03)
    # Rounded, visibly folded fabric edge and original raised diamond stitching.
    for x in (-1.04, 1.04):
        geo.tube(mats["gold"], [(x, -1.50, .85), (x, -.8, .86), (x, 0, .86), (x, .70, .85)], .011, 5)
    for x in (-.65, 0, .65):
        for y in (-.95, -.25, .45):
            geo.tube(mats["gold"], [(x, y + .22, .857), (x + .22, y, .857),
                                   (x, y - .22, .857), (x - .22, y, .857),
                                   (x, y + .22, .857)], .009, 4)
    for x in (-.61, .61):
        geo.ellipsoid(mats["cream"], (x, 1.05, .86), (.48, .33, .13), 12, 6)
        for y in (.78, 1.32):
            geo.tube(mats["gold"], [(x - .35, y, .91), (x, y + .035, .97), (x + .35, y, .91)], .010, 5)
    for x in (-1.12, 1.12):
        for y in (-1.52, 1.52):
            geo.lathe(mats["timber"], [(.12, 0), (.13, .06), (.085, .17), (.10, .31),
                                      (.085, .50), (.075, 2.65), (.11, 2.75), (.09, 2.84)], 10, (x, y, 0))
            for height in (.30, .55, 2.58, 2.79):
                geo.lathe(mats["gold"], [(.095, height), (.105, height + .035)], 10, (x, y, 0))
            geo.ellipsoid(mats["gold"], (x, y, 2.91), (.11, .11, .12), 10, 5)
    for y in (-1.52, 1.52):
        geo.board(mats["timber"], (0, y, 2.70), (2.40, .14, .16), .025)
        for x in (-.78, -.26, .26, .78):
            VERDANT.cloud(geo, mats["gold"], x, y - .09, 2.68, .42, .08, .015)
    for x in (-1.12, 1.12):
        geo.board(mats["timber"], (x, 0, 2.70), (.14, 3.16, .16), .025)
    geo.board(mats["timber"], (0, 1.55, 1.17), (2.34, .15, .83), .045)
    for x in (-.72, 0, .72):
        VERDANT.diamond(geo, mats["gold"], x, 1.46, 1.19, .51, .55, .021)
    # Pleated textile volumes hang only in the rear corners, leaving bed entry open.
    for sign in (-1, 1):
        for index in range(5):
            x = sign * (1.02 - .07 * index)
            y = 1.40 + .05 * math.sin(index * PI / 2)
            geo.sweep(mats["cloth"], [(x, y, 2.62), (x + sign * .035, y, 2.2),
                                      (x + sign * .025, y, 1.40), (x, y, .88)], [.06, .05, .048, .065], 6)
    return geo


def wardrobe(mats):
    geo = Geometry()
    geo.board(mats["timber"], (0, 0, .10), (2.15, .86, .20), .035)
    geo.board(mats["timber"], (0, 0, 2.47), (2.15, .86, .16), .035)
    for x in (-.96, .96):
        geo.board(mats["timber"], (x, 0, 1.28), (.17, .76, 2.30), .025)
    geo.box(mats["timber"], (0, .34, 1.27), (1.9, .08, 2.27))
    for x in (-.47, .47):
        geo.board(mats["timber"], (x, -.34, 1.27), (.91, .12, 2.22), .025)
        geo.board(mats["jade"], (x, -.409, 1.48), (.67, .035, 1.45), .03)
        for z in (.78, 2.18):
            geo.box(mats["gold"], (x, -.435, z), (.70, .02, .025))
        for z in (1.03, 1.46, 1.89):
            VERDANT.diamond(geo, mats["gold"], x, -.44, z, .49, .34, .014)
        geo.tube(mats["gold"], [(x - math.copysign(.28, x), -.45, 1.16),
                               (x - math.copysign(.28, x), -.49, 1.04),
                               (x - math.copysign(.28, x), -.45, .97)], .022, 6)
    return geo


def window_panel(house, center, width, height=2.25, side=False):
    """A physical paper panel with projecting mortised lattice on both faces."""
    x, y, z = center
    group, mats, geo = "Walls", house.mats, house.groups["Walls"]
    def box(mat, a, b, c, size):
        location = (x + a, y + b, z + c) if not side else (x + b, y + a, z + c)
        dimensions = size if not side else (size[1], size[0], size[2])
        house.box(group, mat, location, dimensions)
    box("cream", 0, 0, 0, (width, .055, height))
    for dx in (-width / 2, width / 2):
        box("timber", dx, 0, 0, (.12, .19, height + .16))
    for dz in (-height / 2, height / 2):
        box("timber", 0, 0, dz, (width + .14, .19, .12))
        box("gold", 0, -.105, dz + .03, (width, .015, .018))
    count = max(3, round(width / (.56 if house.far else .40)))
    for index in range(1, count):
        dx = -width / 2 + index * width / count
        box("timber", dx, -.045, 0, (.045, .12, height))
    for dz in (-height * .31, 0, height * .31):
        box("timber", 0, -.045, dz, (width, .12, .045))
    if not house.far:
        motif = Geometry()
        for index in range(0, count, 2):
            dx = -width / 2 + (index + .5) * width / count
            VERDANT.diamond(motif, mats["gold"], dx, -.115, 0, width / count * .8, height * .37, .012)
        house.append(group, motif, center, PI / 2 if side else 0)


def walls(house):
    # Front facade leaves a real 2 m wide, 2.8 m high opening.
    for sign in (-1, 1):
        x = sign * 3.625
        house.box("Walls", "timber", (x, -5.55, .43), (5.25, .22, .86), collision=True, name=f"front_{sign}_base")
        house.collider("walls", f"front_{sign}_window", (x, -5.55, 2.18), (5.25, .22, 2.64))
        for dx in (-1.30, 1.30):
            window_panel(house, (x + dx, -5.55, 2.17), 2.43, 2.25)
    house.box("Walls", "timber", (0, -5.55, 3.20), (2, .24, .80), collision=True, name="front_lintel", bevel=.025)
    plaque = Geometry()
    plaque.board(house.mats["jade"], (0, -5.70, 3.22), (1.65, .09, .46), .025)
    VERDANT.fox_badge(plaque, house.mats, (0, -5.76, 3.18), .24)
    house.append("Walls", plaque, (0, 0, 0))
    # Sides and rear remain solid paper/timber architecture, with real lattice relief.
    for x in (-6.25, 6.25):
        house.box("Walls", "timber", (x, 0, .43), (.22, 11.1, .86), collision=True, name=f"side_{x}_base")
        house.collider("walls", f"side_{x}_windows", (x, 0, 2.18), (.22, 11.1, 2.64))
        for y in (-4.16, -1.39, 1.39, 4.16):
            window_panel(house, (x, y, 2.17), 2.59, 2.25, side=True)
    house.box("Walls", "timber", (0, 5.55, .43), (12.5, .22, .86), collision=True, name="rear_base")
    house.collider("walls", "rear_windows", (0, 5.55, 2.18), (12.5, .22, 2.64))
    for x in (-4.65, -1.55, 1.55, 4.65):
        window_panel(house, (x, 5.55, 2.17), 2.91, 2.25)
    if house.far:
        return
    for sign in (-1, 1):
        x = sign * 3.525
        house.box("Walls", "timber", (x, 0, .43), (5.25, .18, .86), collision=True, name=f"partition_{sign}_base")
        house.collider("walls", f"partition_{sign}_panel", (x, 0, 2.18), (5.25, .18, 2.64))
        for dx in (-1.30, 1.30):
            window_panel(house, (x + dx, 0, 2.17), 2.43, 2.25)
    house.box("Walls", "timber", (0, 0, 3.15), (1.80, .20, .90), collision=True, name="internal_lintel", bevel=.025)
    for x in (-.97, .97):
        house.box("Walls", "timber", (x, 0, 1.35), (.14, .24, 2.70), collision=True, name="internal_door_jamb", bevel=.025)


def posts_and_joinery(house):
    mats, geo = house.mats, house.groups["Posts"]
    locations = [(x, y) for x in (-6.04, 6.04) for y in (-5.30, -1.77, 1.77, 5.30)]
    locations += [(x, y) for x in (-3.10, 3.10) for y in (-5.30, 5.30)]
    locations += [(x, -5.30) for x in (-1.25, 1.25)]
    for index, (x, y) in enumerate(locations):
        # Modest cross-section sampling concentrates triangles in silhouettes.
        geo.box(mats["stone"], (x, y, .10), (.46, .46, .20))
        geo.cylinder(mats["timber"], (x, y, .18), (x, y, 3.54), .15, 6 if house.far else 10)
        for height in (.28, 3.30):
            geo.cylinder(mats["gold"], (x, y, height), (x, y, height + .045), .159, 6 if house.far else 10)
        for height, length in ((3.31, .52), (3.44, .70)):
            geo.box(mats["timber"], (x, y, height), (length, .17, .12))
            geo.box(mats["timber"], (x, y, height), (.17, length, .12))
            geo.box(mats["gold"], (x, y, height + .055), (length, .18, .012))
        house.collider("posts", f"post_{index}", (x, y, 1.77), (.30, .30, 3.54))
        if not house.far:
            for sign in (-1, 1):
                # Diagonal timber shoulders and raised cloud carving show load paths.
                geo.sweep(mats["timber"], [(x, y, 2.92), (x + sign * .30, y, 3.16),
                                          (x + sign * .62, y, 3.40)], [.075, .065, .055], 8)
            VERDANT.cloud(geo, mats["gold"], x, y - .18, 3.28, .60, .10, .017)
    for y in (-5.30, 0, 5.30):
        house.box("Posts", "timber", (0, y, 3.54), (12.55, .26, .25), bevel=.025, collision=True, name="cross_tie_beam")
        house.box("Posts", "gold", (0, y - .15, 3.50), (12.53, .02, .032))
    for x in (-6.04, 6.04):
        house.box("Posts", "timber", (x, 0, 3.54), (.26, 10.75, .25), bevel=.025, collision=True, name="side_tie_beam")


def curved_roof(house, width, depth, ridge, drop, upper=False):
    """Two curved roof layers with discrete convex ceramic tiles and capped ribs."""
    geo, mats = house.groups["Roof"], house.mats
    for hip in (False, True):
        for end in (-1, 1):
            columns = (6 if hip else 12) if house.far else ((6 if hip else 14) if upper else (10 if hip else 22))
            rows = (3 if house.far else 4) if upper else (4 if house.far else 7)
            point = lambda u, t: BASE.roof_point(u, t, width, depth, ridge, drop, hip, end)
            vertices = [point(-1 + 2 * i / columns, j / rows) for j in range(rows + 1) for i in range(columns + 1)]
            faces = []
            for j in range(rows):
                for i in range(columns):
                    a = j * (columns + 1) + i
                    face = (a, a + 1, a + columns + 2, a + columns + 1)
                    faces.append(tuple(reversed(face)) if ((not hip and end < 0) or (hip and end > 0)) else face)
            geo.add(mats["slate"], vertices, faces, smooth=True)
            geo.add(mats["timber"], [(x, y, z - .08) for x, y, z in vertices],
                    [tuple(reversed(face)) for face in faces], smooth=True)
            # Low relief surfaces form real lapped tile plates, with transverse
            # convex ridges and visible row edges rather than material-only lines.
            for j in range(rows):
                for i in range(columns):
                    u0, u1 = -1 + 2 * i / columns, -1 + 2 * (i + 1) / columns
                    t0, t1 = max(.018, j / rows), min(1, (j + 1.04) / rows)
                    tile = []
                    for t in (t0, t1):
                        for k in range(3):
                            x, y, z = point(u0 + (u1 - u0) * k / 2, t)
                            tile.append((x, y, z + .018 + (.021 if k == 1 else 0)))
                    quads = [(0, 1, 4, 3), (1, 2, 5, 4)]
                    if (not hip and end < 0) or (hip and end > 0):
                        quads = [tuple(reversed(face)) for face in quads]
                    geo.add(mats["slate"], tile, quads, smooth=True)
            for i in range(1, columns, 3 if house.far else 2):
                u = -1 + 2 * i / columns
                points = [point(u, .025 + .975 * j / rows) for j in range(rows + 1)]
                geo.tube(mats["slate"], [(x, y, z + .04) for x, y, z in points], .027, 4)
            eave = [point(-1 + 2 * i / 12, 1) for i in range(13)]
            geo.tube(mats["gold"], eave, .037, 6)
            geo.tube(mats["timber"], [(x, y, z - .13) for x, y, z in eave], .07, 6)
            if not hip:
                for corner in (-1, 1):
                    points = [point(corner, index / 8) for index in range(9)]
                    geo.tube(mats["gold"], [(x, y, z + .07) for x, y, z in points], .042, 6)
                    x, y, z = points[-1]
                    geo.sweep(mats["gold"], [(x, y, z), (x + corner * .17, y + end * .12, z + .08),
                                             (x + corner * .27, y + end * .18, z + .31)], [.05, .045, .018], 6)
            # Collision samples are shared roof surface points, serialized Y-up.
            collision_columns, collision_rows = 6, 5
            offset = len(house.roof_collision["vertices_y_up_m"])
            points = [point(-1 + 2 * i / collision_columns, j / collision_rows)
                      for j in range(collision_rows + 1) for i in range(collision_columns + 1)]
            house.roof_collision["vertices_y_up_m"].extend(y_up(p) for p in points)
            for j in range(collision_rows):
                for i in range(collision_columns):
                    a = offset + j * (collision_columns + 1) + i
                    for face in ((a, a + 1, a + collision_columns + 2), (a, a + collision_columns + 2, a + collision_columns + 1)):
                        if (not hip and end < 0) or (hip and end > 0):
                            face = tuple(reversed(face))
                        # Collapsed ridge/apex cells have zero area and are omitted.
                        p, q, r = (Vector(house.roof_collision["vertices_y_up_m"][index]) for index in face)
                        if (q - p).cross(r - p).length > 1e-8:
                            house.roof_collision["triangles"].append(list(face))
    ridge_half = max(width * .5 - depth * .36, width * .16)
    geo.cylinder(mats["gold"], (-ridge_half, 0, ridge + .10), (ridge_half, 0, ridge + .10), .045, 10)
    for sign in (-1, 1):
        geo.sweep(mats["gold"], [(sign * ridge_half, 0, ridge + .10),
                                 (sign * (ridge_half + .12), 0, ridge + .28),
                                 (sign * (ridge_half + .25), 0, ridge + .35)], [.07, .06, .014], 8)


def ceiling(house):
    house.box("Ceiling", "timber", (0, 0, 3.74), (12.5, 11.1, .18), collision=True, name="ceiling_plane")
    geo, mats = house.groups["Ceiling"], house.mats
    for x in (-5, -2.5, 0, 2.5, 5):
        house.box("Ceiling", "timber", (x, 0, 3.55), (.12, 10.65, .20), bevel=.025, collision=True, name="long_coffer_beam")
        house.box("Ceiling", "gold", (x, 0, 3.445), (.025, 10.63, .015))
    for y in (-4.25, -2.15, 0, 2.15, 4.25):
        house.box("Ceiling", "timber", (0, y, 3.55), (12.12, .12, .20), bevel=.025, collision=True, name="cross_coffer_beam")
        house.box("Ceiling", "gold", (0, y, 3.445), (12.1, .025, .015))
    for x in (-3.75, -1.25, 1.25, 3.75):
        for y in (-3.20, -1.08, 1.08, 3.20):
            geo.lathe(mats["gold"], [(.14, 3.635), (.15, 3.62), (.23, 3.61), (.24, 3.625)], 6, (x, y, 0), caps=False)
    # Two modeled hanging lanterns sit above all door/capsule clearance.
    for y in (-2.65, 2.65):
        geo.cylinder(mats["gold"], (0, y, 3.46), (0, y, 3.23), .018, 6)
        geo.lathe(mats["cream"], [(.15, 2.86), (.19, 2.92), (.19, 3.15), (.15, 3.21)], 12, (0, y, 0))
        for z in (2.88, 3.19):
            geo.lathe(mats["gold"], [(.20, z), (.20, z + .025)], 12, (0, y, 0))
        for index in range(8):
            angle = index * PI / 4
            geo.cylinder(mats["timber"], (.192 * math.cos(angle), y + .192 * math.sin(angle), 2.91),
                         (.192 * math.cos(angle), y + .192 * math.sin(angle), 3.19), .015, 5)


def furnishings(house):
    mats = house.mats
    house.append("Furniture", VERDANT.scholar_desk(mats), (-3.65, -2.60, 0))
    house.collider("furniture", "scholar_desk", (-3.65, -2.60, .50), (2.3, 1.1, 1.0))
    house.append("Furniture", VERDANT.scroll_shelf(mats), (-4.55, -.55, 0))
    house.collider("furniture", "scroll_shelf", (-4.55, -.55, 1.225), (2.1, .70, 2.45))
    house.append("Furniture", round_table(mats), (3.55, -2.65, 0))
    house.collider("furniture", "tea_table", (3.55, -2.65, .415), (1.7, 1.7, .83))
    for x, y in ((2.3, -2.65), (4.80, -2.65), (3.55, -4.0)):
        house.append("Furniture", stool(mats), (x, y, 0))
        house.collider("furniture", "cushioned_stool", (x, y, .275), (.64, .62, .55))
    house.append("Furniture", canopy_bed(mats), (-3.65, 3.25, 0))
    house.collider("furniture", "bed_frame_and_mattress", (-3.65, 3.25, .43), (2.55, 3.45, .86))
    for x in (-4.77, -2.53):
        for y in (1.73, 4.77):
            house.collider("furniture", "bed_canopy_post", (x, y, 1.45), (.24, .24, 2.9))
    house.collider("furniture", "bed_headboard", (-3.65, 4.80, 1.17), (2.34, .15, .83))
    for y in (1.73, 4.77):
        house.collider("furniture", "canopy_cross_beam", (-3.65, y, 2.70), (2.40, .14, .16))
    for x in (-4.77, -2.53):
        house.collider("furniture", "canopy_side_beam", (x, 3.25, 2.70), (.14, 3.16, .16))
    house.append("Furniture", wardrobe(mats), (4.65, 4.68, 0))
    house.collider("furniture", "jade_wardrobe", (4.65, 4.68, 1.275), (2.15, .90, 2.55))
    house.append("Furniture", VERDANT.scholar_desk(mats), (3.70, 1.5, 0))
    house.collider("furniture", "bedroom_writing_table", (3.70, 1.5, .50), (2.3, 1.1, 1.0))
    house.append("Furniture", stool(mats), (3.70, 2.45, 0))
    house.collider("furniture", "writing_stool", (3.70, 2.45, .275), (.64, .62, .55))
    # Low bedside chest with a sculpted jade vessel and bronze handle.
    house.box("Furniture", "timber", (-5.45, 4.22, .37), (.75, .72, .74), collision=True, name="bedside_chest", bevel=.045)
    geo = house.groups["Furniture"]
    geo.lathe(mats["jade"], [(.10, .74), (.13, .80), (.18, 1.02), (.09, 1.17), (.10, 1.24), (.075, 1.24), (.07, 1.15)], 16, (-5.45, 4.22, 0))
    geo.cylinder(mats["gold"], (-5.45, 3.848, .42), (-5.45, 3.81, .42), .045, 8)


def build(mats, far=False):
    house = Residence(mats, far)
    house.box("Floor", "stone", (0, 0, -.15), (14, 12, .30), collision=True, name="residence_floor")
    walls(house)
    posts_and_joinery(house)
    curved_roof(house, 12.8, 10.8, 5.15, 1.22)
    # Clerestory above the lower ridge supports a visibly separate upper tier.
    house.box("Roof", "timber", (0, 0, 5.20), (5.45, 2.25, .45))
    for x in (-2.2, -1.1, 0, 1.1, 2.2):
        house.box("Roof", "cream", (x, -1.14, 5.23), (.80, .035, .23))
        house.box("Roof", "timber", (x, -1.17, 5.23), (.035, .06, .23))
    curved_roof(house, 7.15, 4.20, 6.12, .73, upper=True)
    if not far:
        ceiling(house)
        furnishings(house)
    return house


def export_asset(name, house, budget):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    root = bpy.data.objects.new("ResidenceNear" if not house.far else "ResidenceFar", None)
    bpy.context.collection.objects.link(root)
    objects, group_triangles = [], {}
    for group, geometry in house.groups.items():
        parent = bpy.data.objects.new(group, None)
        bpy.context.collection.objects.link(parent)
        parent.parent = root
        group_triangles[group] = 0
        for obj in geometry.objects(f"{name}_{group}"):
            obj.parent = parent
            modifier = obj.modifiers.new("Explicit tangent triangulation", "TRIANGULATE")
            modifier.keep_custom_normals = True
            depsgraph = bpy.context.evaluated_depsgraph_get()
            evaluated = obj.evaluated_get(depsgraph)
            mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
            obj.modifiers.clear()
            obj.data = mesh
            edit_mesh = bmesh.new()
            edit_mesh.from_mesh(mesh)
            collapsed = [face for face in edit_mesh.faces if face.calc_area() <= 1e-10]
            if collapsed:
                bmesh.ops.delete(edit_mesh, geom=collapsed, context="FACES_ONLY")
                unused = [v for v in edit_mesh.verts if not v.link_faces]
                if unused:
                    bmesh.ops.delete(edit_mesh, geom=unused, context="VERTS")
            edit_mesh.to_mesh(mesh)
            edit_mesh.free()
            mesh.update()
            assert not mesh.validate(clean_customdata=False), obj.name
            mesh.calc_tangents(uvmap="SurfaceMeters")
            assert all(math.isfinite(c) for loop in mesh.loops for c in (*loop.normal, *loop.tangent))
            group_triangles[group] += len(mesh.polygons)
            objects.append(obj)
    triangles = sum(group_triangles.values())
    assert triangles <= budget, f"{name}: {triangles} exceeds {budget}"
    bpy.ops.object.select_all(action="SELECT")
    path = DESTINATION / f"{name}.glb"
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                             export_yup=True, export_apply=True, export_materials="EXPORT",
                             export_texcoords=True, export_normals=True, export_tangents=True,
                             export_cameras=False, export_lights=False)
    payload = path.read_bytes()
    length, kind = struct.unpack_from("<II", payload, 12)
    assert kind == 0x4E4F534A
    gltf = json.loads(payload[20:20 + length])
    assert not gltf.get("images")
    binary = payload[28 + length:]
    actual_triangles = 0
    for mesh in gltf["meshes"]:
        for primitive in mesh["primitives"]:
            actual_triangles += gltf["accessors"][primitive["indices"]]["count"] // 3
            attrs = {key: KIT.accessor_values(gltf, binary, value) for key, value in primitive["attributes"].items()}
            assert {"POSITION", "NORMAL", "TANGENT", "TEXCOORD_0"} <= set(attrs)
            assert all(math.isfinite(c) for values in attrs.values() for row in values for c in row)
    assert actual_triangles == triangles
    all_points = [y_up(vertex.co) for obj in objects for vertex in obj.data.vertices]
    result = {"file": path.name, "triangles": triangles, "triangle_budget": budget,
              "material_surfaces": [mat["name"] for mat in gltf["materials"]],
              "draw_call_surfaces": len(objects), "groups": group_triangles,
              "bounds_min_y_up_m": [min(p[axis] for p in all_points) for axis in range(3)],
              "bounds_max_y_up_m": [max(p[axis] for p in all_points) for axis in range(3)],
              "bytes": len(payload), "verified": "finite geometry/normals/tangents/UVs, serialized groups and counts"}
    print("RESIDENCE_ASSET " + json.dumps(result, sort_keys=True))
    return result


def preview(interior=False, room=False):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(DESTINATION / "residence_near.glb"))
    if interior and not room:
        # Architectural section view exposes both genuinely modeled rooms.
        for obj in list(bpy.data.objects):
            if obj.type == "MESH" and ("_Roof_" in obj.name or "_Ceiling_" in obj.name):
                obj.hide_render = True
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.305))
    bpy.context.object.data.materials.append(BASE.material("Studio ground", (.15, .17, .15), roughness=.85))
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = False
    scene.world.color = (.42, .46, .50)
    for location, energy, size in (((-7, -11, 18), 4200, 12), ((6, 7, 11), 3000, 10)):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy, light.data.size = energy, size
        light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat("-Z", "Y").to_euler()
    if room:
        for x, y in ((-2.0, 2.5), (2.0, -2.5)):
            bpy.ops.object.light_add(type="AREA", location=(x, y, 3.23))
            bpy.context.object.data.energy = 115
            bpy.context.object.data.size = 2.5
    bpy.ops.object.camera_add(location=(.15, 1.05, 1.70) if room else ((15, -20, 19) if interior else (19, -25, 17)))
    camera = bpy.context.object
    target = Vector((-3.6, 3.8, 1.45) if room else (0, 0, 1.2))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type, camera.data.ortho_scale = ("PERSP" if room else "ORTHO"), 19.5 if interior else 22
    if room:
        camera.data.lens = 21
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1200
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    path = ROOT / "artifacts/residence-asset-preview"
    path.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path / ("original-bedroom.png" if room else ("original-interior-section.png" if interior else "original-exterior.png")))
    bpy.ops.render.render(write_still=True)


def main():
    if "--preview-only" in sys.argv:
        preview(False)
        preview(True)
        preview(True, room=True)
        return
    DESTINATION.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    mats = KIT.palette()
    near, far = build(mats), build(mats, far=True)
    assets = {"residence_near": export_asset("residence_near", near, 40000),
              "residence_far": export_asset("residence_far", far, 12000)}
    manifest = {"generator": "tools/generate_residence_assets.py", "generator_version": 1,
                "blender_version": bpy.app.version_string, "license": "MIT (original project geometry)",
                "source": "Original procedural joinery, ceramic tiles, lattice, furniture and fabric; no reference pixels",
                "coordinate_system": "glTF Y-up meters; front +Z; centered floor pivot",
                "textures": [], "palette": "Shared Stone/Timber/Roof/Gold/Jade/Paper/Cloth runtime PBR materials",
                "footprint_xz_m": [14, 12], "floor_top_y_m": 0,
                "door_apertures": {"entrance": {"center_y_up_m": [0, 1.4, 5.55], "width_m": 2.0, "height_m": 2.8},
                                   "internal": {"center_y_up_m": [0, 1.35, 0], "width_m": 1.8, "height_m": 2.7}},
                "rooms": [{"id": "scholar_living", "center_y_up_m": [0, 0, 2.8], "size_xz_m": [12.28, 5.32]},
                          {"id": "canopy_bedroom", "center_y_up_m": [0, 0, -2.8], "size_xz_m": [12.28, 5.32]}],
                "collision_profiles": {**near.collision, "roof": near.roof_collision},
                "lod": {"near": "residence_near.glb", "far": "residence_far.glb", "far_shell_has_interior": False},
                "assets": assets}
    (DESTINATION / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    if "--preview" in sys.argv:
        preview(False)
        preview(True)
        preview(True, room=True)


if __name__ == "__main__":
    main()
