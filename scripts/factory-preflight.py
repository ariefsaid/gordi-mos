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
two vendored sources actually holds it: the config named by --config (or the
default path) at defaults.protected_files, the roster's live config, falling
back to adws/adw_modules/data_types.py (ConfigDefaults' built-in default, used
only when a config omits the key or can't be parsed — announced on stderr,
since a silent narrowing to the 3-pattern default would otherwise look like a
clean pass). No YAML/pydantic dependency: adws/** is vendored and this parser
only needs to survive ITS current shape, not general YAML.

Mirrors permissions.py::always_writable() too: defaults.data_dir (granted to
every agent regardless of its writes list) is excluded from matching BEFORE
protected_files, same precedence enforce() applies — otherwise a
findings-rerun brief citing its own adw_data/<id>/raw_output.jsonl would
refuse here while the real gate would have allowed it.
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


def _yaml_list(text: str, key: str, *, key_indent: int | None = None) -> list[str] | None:
    """Pull a top-level-ish `key:` block's `- item` list out of simple YAML.

    Not a YAML parser — just enough structure-sniffing for this repo's own
    config shape (a `key:` line followed by more-indented `- pattern` lines).
    Assumes the config nests `defaults:` keys two spaces deeper.
    """
    lines = text.split("\n")
    items: list[str] = []
    in_block = False
    in_defaults = key_indent is None
    section_indent = key_indent - 2 if key_indent is not None else None
    for line in lines:
        indent = len(line) - len(line.lstrip(" "))
        if key_indent is not None and not in_defaults:
            if re.match(r"^\s*defaults:\s*(#.*)?$", line) and indent == section_indent:
                in_defaults = True
            continue
        if (key_indent is not None and indent <= section_indent and line.strip()
                and not line.lstrip().startswith("#")):
            break
        if not in_block:
            if key_indent is not None and indent != key_indent:
                continue
            if re.match(rf"^\s*{re.escape(key)}:\s*\[\s*\]\s*(#.*)?$", line):
                return []
            if re.match(rf"^\s*{re.escape(key)}:\s*(#.*)?$", line):
                key_indent = indent
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


def _yaml_scalar(text: str, key: str) -> str | None:
    """Pull a top-level-ish `key: value` scalar out of simple YAML."""
    match = re.search(rf"^\s*{re.escape(key)}:\s*(\S.*?)\s*(#.*)?$", text, re.MULTILINE)
    if not match:
        return None
    return match.group(1).strip().strip('"').strip("'") or None


def _data_types_default(text: str) -> list[str] | None:
    """The ConfigDefaults fallback list, for a config that omits the key."""
    match = re.search(
        r"protected_files:\s*list\[str\]\s*=\s*Field\(default_factory=lambda:\s*\[(.*?)\]",
        text, re.DOTALL,
    )
    if not match:
        return None
    return re.findall(r'"([^"]+)"', match.group(1)) or None


def _data_types_data_dir(text: str) -> str | None:
    """The ConfigDefaults fallback data_dir, for a config that omits the key."""
    match = re.search(r'data_dir:\s*str\s*=\s*"([^"]+)"', text)
    return match.group(1) if match else None


def default_config_path(top: Path) -> Path:
    return top / "adws/adw_sssf_config/sssf.config.yaml"


def load_config(top: Path, config_path: Path) -> tuple[list[str], str]:
    """Returns (protected_files globs, data_dir), read with the same
    precedence permissions.py applies at build time: the config named by
    --config first, data_types.py's ConfigDefaults only for whichever of the
    two keys the config doesn't yield.

    `data_dir` quietly defaulting when a config just doesn't set it is
    routine (the real roster config always sets it; a minimal fixture
    usually doesn't). `protected_files` is different: a config that EXISTS
    but fails to yield the list — flow style, anchors, block scalars,
    anything past this parser's simple-YAML sniffing — silently narrows the
    check to the 3-pattern built-in default, which would otherwise look like
    a clean pass. That one gets a stderr line.
    """
    text = None
    try:
        text = config_path.read_text(encoding="utf-8")
    except OSError:
        pass

    defaults_indent = None
    if text is not None:
        defaults = re.search(r"^([ ]*)defaults:\s*(#.*)?$", text, re.MULTILINE)
        if defaults:
            defaults_indent = len(defaults.group(1)) + 2
    globs = (_yaml_list(text, "protected_files", key_indent=defaults_indent)
             if text is not None and defaults_indent is not None else None)
    data_dir = _yaml_scalar(text, "data_dir") if text is not None else None

    if text is not None and globs is None:
        print(
            f"pre-flight: protected_files is null/unreadable in {config_path}; "
            "using the built-in default list",
            file=sys.stderr,
        )

    if globs is None or data_dir is None:
        data_types_path = top / "adws/adw_modules/data_types.py"
        try:
            dt_text = data_types_path.read_text(encoding="utf-8")
        except OSError:
            dt_text = ""
        if globs is None:
            globs = _data_types_default(dt_text) or []
        if data_dir is None:
            data_dir = _data_types_data_dir(dt_text) or "adws/adw_data"

    return globs, data_dir


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


def is_always_writable(path: str, data_dir: str) -> bool:
    """Mirrors permissions.py::always_writable — the session runtime, granted
    to every agent and checked BEFORE protected_files. A findings-rerun brief
    that names its own adw_data/<id>/raw_output.jsonl must pass here exactly
    as enforce() would let it pass at build time."""
    return path.startswith(data_dir.rstrip("/") + "/")


def find_hits(tokens: set[str], globs: list[str], data_dir: str) -> list[tuple[str, str]]:
    hits = []
    for token in tokens:
        normalized = token[2:] if token.startswith("./") else token
        if is_always_writable(normalized, data_dir):
            continue
        for pattern in globs:
            if matches_barred(normalized, pattern):
                hits.append((token, pattern))
                break
    return sorted(hits)


def config_path_from_argv(top: Path, argv: list[str]) -> Path:
    """The ADW's own --config resolution, so the pre-flight checks the SAME
    config the build will run under. Accepts both `--config path` and
    `--config=path`, matching argparse's handling in every adws/adw_*.py
    entrypoint. A relative value is anchored at `top`, same as the default."""
    for i, arg in enumerate(argv):
        if arg == "--config" and i + 1 < len(argv):
            value = argv[i + 1]
        elif arg.startswith("--config="):
            value = arg[len("--config="):]
        else:
            continue
        path = Path(value)
        return path if path.is_absolute() else top / path
    return default_config_path(top)


def main(argv: list[str]) -> int:
    if len(argv) < 1:
        return 0  # nothing to check — fail open
    top = Path(argv[0])
    brief_arg = argv[1] if len(argv) > 1 else ""
    if not brief_arg:
        return 0
    adw_argv = argv[2:]

    try:
        config_path = config_path_from_argv(top, adw_argv)
        globs, data_dir = load_config(top, config_path)
        if not globs:
            return 0
        tokens = extract_tokens(read_brief(brief_arg))
        hits = find_hits(tokens, globs, data_dir)
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
