"""gdtoolkit 4.5.0 adapter: direct its legacy home cache into writable XDG cache."""
import os
import sys
from pathlib import Path
from gdtoolkit.parser import parser

# This pinned release ignores XDG_CACHE_HOME. Keep library files unmodified.
parser._cache_dirpath = str(Path(os.environ["XDG_CACHE_HOME"]) / "gdtoolkit")
mode = sys.argv.pop(1)
if mode == "lint":
    from gdtoolkit.linter.__main__ import main
elif mode == "format":
    from gdtoolkit.formatter.__main__ import main
else:
    raise SystemExit("Usage: gdtools.py lint|format [arguments]")
main()
