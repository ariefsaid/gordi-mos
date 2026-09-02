#!/usr/bin/env python3
"""Cheap pre-flight for scripts/factory-run.sh: catch a brief that targets a
builder-barred path BEFORE the factory spends a full build on it — the actual
gate is adws/adw_modules/permissions.py::enforce(), which only fires after the
build finishes and rolls the change back.

Heuristic by design: this greps prose for path-looking tokens, so it misses
anything phrased obliquely (false negative — enforce() still backstops it) and
can flag a path that is only MENTIONED, not touched (false positive — rerun
with --allow-barred). Never hard-fail on a parsing surprise: if the barred
list or the brief can't be read, proceed and let enforce() do its job.

The barred list is never duplicated here. It is read from whichever of the
two vendored sources actually holds it: adws/adw_sssf_config/sssf.config.yaml
(defaults.protected_files, the roster's live config) falling back to
adws/adw_modules/data_types.py (ConfigDefaults' built-in default, used only
when a config omits the key). No YAML/pydantic dependency: adws/** is
vendored and this parser only needs to survive ITS current shape, not
general YAML.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

KNOWN_EXTENSIONS = (
    ".py", ".sh", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".json", ".yaml", ".yml", ".md", ".sql", ".toml", ".css",
)
TOKEN_RE = re.compile(r"[A-Za-z0-9_./-]+")
BACKTICK_RE = re.compile(r"`([^`\n]+)`")


def _yaml_list(text: str, key: str) -> list[str] | None:
    """Pull a top-level-ish `key:` block's `- item` list out of simple YAML.

    Not a YAML parser — just enough structure-sniffing for this repo's own
    config shape (a `key:` line followed by more-indented `- pattern` lines).
    """
    lines = text.split("\n")
    key_indent = None
    items: list[str] = []
    in_block = False
    for line in lines:
        if not in_block:
            if re.match(rf"^\s*{re.escape(key)}:\s*(#.*)?$", line):
                key_indent = len(line) - len(line.lstrip(" "))
                in_block = True
            continue
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if indent <= key_indent:
            break
        if not stripped.startswith("- "):
            break
        item = stripped[2:].split(" #", 1)[0].strip().strip('"').strip("'")
        if item:
            items.append(item)
    return items or None


def _data_types_default(text: str) -> list[str] | None:
    """The ConfigDefaults fallback list, for a config that omits the key."""
    match = re.search(
        r"protected_files:\s*list\[str\]\s*=\s*Field\(default_factory=lambda:\s*\[(.*?)\]",
        text, re.DOTALL,
    )
    if not match:
        return None
    return re.findall(r'"([^"]+)"', match.group(1)) or None


def load_barred_globs(top: Path) -> list[str]:
    yaml_path = top / "adws/adw_sssf_config/sssf.config.yaml"
    try:
        found = _yaml_list(yaml_path.read_text(encoding="utf-8"), "protected_files")
        if found:
            return found
    except OSError:
        pass
    data_types_path = top / "adws/adw_modules/data_types.py"
    try:
        found = _data_types_default(data_types_path.read_text(encoding="utf-8"))
        if found:
            return found
    except OSError:
        pass
    return []


def read_brief(brief_arg: str) -> str:
    """Mirrors adw_modules/utils.py resolve_prompt: a real file's contents,
    else the argument is itself inline prompt text."""
    try:
        path = Path(brief_arg)
        if path.is_file():
            return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        pass
    return brief_arg


def extract_tokens(text: str) -> set[str]:
    tokens: set[str] = set()
    for match in TOKEN_RE.finditer(text):
        token = match.group(0).rstrip(".")
        if "/" in token or token.endswith(KNOWN_EXTENSIONS):
            tokens.add(token)
    for match in BACKTICK_RE.finditer(text):
        span = match.group(1).strip()
        if span:
            tokens.add(span)
    return tokens


def _glob(pattern: str) -> re.Pattern:
    """`*` stops at `/`, `**` crosses — mirrors permissions.py::_glob."""
    out: list[str] = []
    i = 0
    while i < len(pattern):
        if pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif pattern[i] == "*":
            out.append("[^/]*")
            i += 1
        elif pattern[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(pattern[i]))
            i += 1
    return re.compile("".join(out))


def matches_barred(path: str, pattern: str) -> bool:
    """Mirrors permissions.py::_matches."""
    if pattern.endswith("/"):
        return path.startswith(pattern)
    if "*" in pattern or "?" in pattern:
        return _glob(pattern).fullmatch(path) is not None
    return path == pattern


def find_hits(tokens: set[str], globs: list[str]) -> list[tuple[str, str]]:
    hits = []
    for token in tokens:
        normalized = token[2:] if token.startswith("./") else token
        for pattern in globs:
            if matches_barred(normalized, pattern):
                hits.append((token, pattern))
                break
    return sorted(hits)


def main(argv: list[str]) -> int:
    if len(argv) < 1:
        return 0  # nothing to check — fail open
    top = Path(argv[0])
    brief_arg = argv[1] if len(argv) > 1 else ""
    if not brief_arg:
        return 0

    try:
        globs = load_barred_globs(top)
        if not globs:
            return 0
        tokens = extract_tokens(read_brief(brief_arg))
        hits = find_hits(tokens, globs)
    except Exception as error:  # never block the factory on a parser bug
        print(f"⚠ factory-preflight: skipping barred-path check ({error})", file=sys.stderr)
        return 0

    if not hits:
        return 0

    lines = "\n".join(f"  - {path} (matches {pattern})" for path, pattern in hits)
    print(
        "✗ factory-run: brief targets builder-barred path(s):\n"
        f"{lines}\n"
        "A build against these fails at adw_modules/permissions.py::enforce() and rolls "
        "back, after the full build cost.\n"
        "Route the real change through the Director lane instead: scripts/lane-exempt.sh, "
        "then a pi/subagent dispatch — not the factory.\n"
        "If this is only a MENTION of the path, not an edit (e.g. \"do not touch "
        "scripts/pre-pr-verify.sh\"), rerun with --allow-barred.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
