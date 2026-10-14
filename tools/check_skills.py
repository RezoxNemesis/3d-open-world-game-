"""Validate repository skill discovery, names, descriptions and executable paths."""
from pathlib import Path
import re
import yaml

expected = {"godot-engineering", "open-world-generation", "advanced-3d-art", "cinematic-environment", "performance-optimization", "autonomous-qa-security"}
files = list(Path(".agents/skills").glob("*/SKILL.md"))
assert {p.parent.name for p in files} == expected
for path in files:
    text = path.read_text()
    assert text.startswith("---\n"), path
    header = yaml.safe_load(text.split("---", 2)[1])
    assert header["name"] == path.parent.name
    assert header["description"].startswith("Use when ")
    assert "## Verification" in text
    for command in re.findall(r"tools/[a-z_]+\.(?:sh|py)", text):
        assert Path(command).is_file(), (path, command)
print("PASS: 6 discoverable skills with valid frontmatter and local command references")
