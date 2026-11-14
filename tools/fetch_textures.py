#!/usr/bin/env python3
"""Download the CC0 photo-scanned textures used by Daman Duo from Poly Haven and re-encode them.

Writes assets/tex/{2k,1k}/<key>_d.jpg (albedo) and <key>_n.jpg (OpenGL normal map), plus assets/tex/CREDITS.md.
Run once; the results are committed so builds don't depend on the network.
All Poly Haven assets are CC0 (public domain): https://polyhaven.com/license
"""
import io, json, os, sys, urllib.request
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'tex')
# key: (polyhaven id, has normal map, used for)
TEX = {
    'sand':     ('coast_sand_01', True, 'beaches'),
    'grass':    ('leafy_grass', True, 'lawns, fields, open land'),
    'forest':   ('forrest_ground_01', True, 'jungle floor'),
    'soil':     ('red_laterite_soil_stones', True, 'farm fields, dirt tracks (Daman laterite)'),
    'ground':   ('dry_ground_rocks', True, 'urban dirt, road shoulders'),
    'rock':     ('rock_face_03', True, 'cliffs, mountains, caves'),
    'asphalt':  ('asphalt_02', True, 'roads'),
    'pavers':   ('patterned_brick_floor', True, 'sidewalks'),
    'cobble':   ('cobblestone_floor_08', False, 'fort lanes'),
    'fortwall': ('medieval_blocks_03', True, 'Moti and Nani Daman fort walls'),
    'plaster':  ('painted_plaster_wall', True, 'painted building walls'),
    'stained':  ('concrete_wall_003', True, 'weathered building walls'),
    'cracked':  ('cracked_concrete_wall', False, 'old building walls'),
    'brick':    ('red_brick_03', True, 'brick buildings'),
    'rooftile': ('clay_roof_tiles_02', True, 'Mangalore tile roofs'),
    'shutter':  ('rusty_metal_shutter', False, 'shop rolling shutters'),
    'tin':      ('rusty_corrugated_iron', False, 'sheds, slum roofs'),
    'wood':     ('weathered_brown_planks', False, 'doors, boats, stalls'),
    'bark':     ('palm_tree_bark', False, 'palm trunks'),
}

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'DamanDuo-texture-fetch/1.0 (github.com/RezoxNemesis/3d-open-world-game-)'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

def main():
    os.makedirs(os.path.join(ROOT, '2k'), exist_ok=True); os.makedirs(os.path.join(ROOT, '1k'), exist_ok=True)
    credits = ['# Texture credits', '', 'All textures are from [Poly Haven](https://polyhaven.com) and are **CC0** (public domain).', '', '| File | Poly Haven asset | Author(s) | Used for |', '|---|---|---|---|']
    for key, (pid, nor, use) in TEX.items():
        files = json.loads(get(f'https://api.polyhaven.com/files/{pid}'))
        info = json.loads(get(f'https://api.polyhaven.com/info/{pid}'))
        maps = [('d', 'Diffuse')] + ([('n', 'nor_gl')] if nor else [])
        for suf, m in maps:
            src = Image.open(io.BytesIO(get(files[m]['2k']['jpg']['url']))).convert('RGB')
            src.resize((2048, 2048), Image.LANCZOS).save(os.path.join(ROOT, '2k', f'{key}_{suf}.jpg'), quality=82, optimize=True, progressive=True)
            src.resize((1024, 1024), Image.LANCZOS).save(os.path.join(ROOT, '1k', f'{key}_{suf}.jpg'), quality=85, optimize=True, progressive=True)
        credits.append(f'| `{key}` | [{info["name"]}](https://polyhaven.com/a/{pid}) | {", ".join(info.get("authors", {}).keys())} | {use} |')
        print('ok', key, pid, flush=True)
    open(os.path.join(ROOT, 'CREDITS.md'), 'w').write('\n'.join(credits) + '\n')

if __name__ == '__main__':
    main()
