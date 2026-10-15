"""Check actual expedition pixels, source provenance and conservative render budgets."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageStat

root = Path(__file__).resolve().parent.parent
folder = root / 'artifacts/expedition-qa'
report = json.loads((folder / 'render-evidence.json').read_text())
assert len(report['captures']) == 13, 'Thirteen distinct expedition views required'
assert 'dummy' not in report['renderer'].lower(), 'Actual renderer required'
for name, expected in report['inputs_sha256'].items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, name
for capture in report['captures']:
    image = Image.open(folder / capture['file']).convert('RGB')
    assert image.size == (1600, 720)
    assert max(ImageStat.Stat(image).stddev) > 15, capture['file']
    assert 0 < capture['draws'] < 500, capture['file']
    assert 0 < capture['triangles'] < 400000, capture['file']
print('PASS: thirteen actual source-matched expedition views within desktop counter budgets')
