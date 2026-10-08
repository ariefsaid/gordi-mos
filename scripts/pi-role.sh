#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: scripts/pi-role.sh <role> <brief-file> [extra pi args]" >&2
  exit 2
}

[ "$#" -ge 2 ] || usage
role="$1"
brief="$2"
shift 2

case "$role" in
  ''|*[!a-zA-Z0-9-]*) echo "pi-role: unknown role '$role'" >&2; exit 2 ;;
esac

root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "pi-role: run from inside a git checkout" >&2
  exit 2
}
role_file="$root/agents/$role.md"
[ -f "$role_file" ] || { echo "pi-role: unknown role '$role' (no agents/$role.md contract)" >&2; exit 2; }
[ -f "$brief" ] || { echo "pi-role: brief file not found: $brief" >&2; exit 2; }
brief_abs="$(cd "$(dirname "$brief")" && pwd -P)/$(basename "$brief")"
common_dir=$(git rev-parse --git-common-dir)
case "$common_dir" in /*) ;; *) common_dir="$root/$common_dir" ;; esac
main_root=$(cd "$(dirname "$common_dir")" && pwd -P)
cd "$root"

for argument in "$@"; do
  case "$argument" in
    --model|--model=*|--provider|--provider=*|--tools|-t|--no-tools|-nt|--no-builtin-tools|-nbt|--exclude-tools|-xt|--skill|--no-skills|-ns|-e|--extension|--extension=*|--append-system-prompt|--system-prompt|--)
      echo "pi-role: '$argument' is controlled by the role contract or roster" >&2
      exit 2
      ;;
  esac
done

[ -d "$root/scripts/gh-shim" ] || { echo "pi-role: gh-shim directory not found under $root/scripts" >&2; exit 2; }

work=$(mktemp -d "${TMPDIR:-/tmp}/pi-role.XXXXXX")
trap 'rm -rf "$work"' EXIT
. "$root/scripts/lib/py-with-deps.sh"
if ! py_with_deps_init "$work/venv"; then
  echo "pi-role: could not load the roster YAML parser dependencies" >&2
  exit 1
fi

PI_ROLE_ROOT="$root" PI_ROLE_MAIN_ROOT="$main_root" PI_ROLE_NAME="$role" PI_ROLE_BRIEF="$brief_abs" \
  py_with_deps - "$@" <<'PY'
import os
import re
import shlex
import sys
from pathlib import Path

import yaml


def fail(message: str, code: int = 2) -> None:
    print(f"pi-role: {message}", file=sys.stderr)
    raise SystemExit(code)


root = Path(os.environ["PI_ROLE_ROOT"])
main_root = Path(os.environ["PI_ROLE_MAIN_ROOT"])
role = os.environ["PI_ROLE_NAME"]
contract = root / "agents" / f"{role}.md"
text = contract.read_text()
if not text.startswith("---\n"):
    fail(f"agents/{role}.md has no YAML frontmatter")
try:
    _, frontmatter, _ = text.split("---", 2)
    metadata = yaml.safe_load(frontmatter) or {}
except (ValueError, yaml.YAMLError) as error:
    fail(f"cannot parse agents/{role}.md frontmatter: {error}")
if metadata.get("name") != role:
    fail(f"agents/{role}.md name must be '{role}'")
skills = metadata.get("skills")
if not isinstance(skills, list) or any(not isinstance(skill, str) for skill in skills):
    fail(f"agents/{role}.md must declare skills as a list")
context = metadata.get("context")
if not isinstance(context, list) or any(
    not isinstance(pointer, str) or " — " not in pointer for pointer in context
):
    fail(f"agents/{role}.md must declare context pointers as 'path — when to read it'")

config_path = root / "adws/adw_sssf_config/sssf.config.yaml"
try:
    config = yaml.safe_load(config_path.read_text()) or {}
except (OSError, yaml.YAMLError) as error:
    fail(f"cannot read roster {config_path}: {error}")
defaults = config.get("defaults") or {}
roster = config.get("agents") or []
roster_agent_name = metadata.get("roster_agent")
if roster_agent_name:
    matches = [agent for agent in roster if agent.get("name") == roster_agent_name]
else:
    contract_path = f"agents/{role}.md"
    matches = [agent for agent in roster if agent.get("contract") == contract_path]
if len(matches) > 1:
    fail(f"multiple roster entries resolve role '{role}'")
roster_agent = matches[0] if matches else None
if roster_agent and "tools" in metadata:
    fail(f"agents/{role}.md must take tools from the roster, not frontmatter")

model = (roster_agent or {}).get("model") or metadata.get("model") or defaults.get("model")
thinking = (roster_agent or {}).get("thinking") or defaults.get("thinking")
tools = metadata.get("tools") if not roster_agent else roster_agent.get("tools")
if tools is None:
    tools = defaults.get("tools")
extensions = (roster_agent or {}).get("harness_engineering", defaults.get("harness_engineering", []))
if not isinstance(extensions, list) or any(not isinstance(extension, str) for extension in extensions):
    fail(f"no valid extensions are configured for role '{role}'")
if not isinstance(model, str) or not model.strip():
    fail(f"no model is configured for role '{role}'")
if not isinstance(thinking, str) or not thinking.strip():
    fail(f"no thinking level is configured for role '{role}'")
if not isinstance(tools, list) or not tools or any(not isinstance(tool, str) for tool in tools):
    fail(f"no valid tools are configured for role '{role}'")
if len(set(tools)) != len(tools):
    fail(f"role '{role}' has duplicate tools")

extension_paths = []
for extension in extensions:
    extension_path = (root / extension).resolve()
    if not extension_path.is_relative_to(root.resolve()) or not extension_path.is_file():
        fail(f"role '{role}' references missing extension '{extension}'")
    extension_paths.append(str(extension_path))

skill_paths = []
configured_skills_root = os.environ.get("PI_ROLE_SKILLS_DIR")
skills_root = Path(configured_skills_root or main_root / ".claude" / "skills").resolve()
launcher_pattern = re.compile(
    r"Bash\(\s*(~/.claude/skills/([A-Za-z0-9._-]+)/bin/([A-Za-z0-9._-]+))"
)
for skill in skills:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", skill):
        fail(f"invalid skill name '{skill}' in agents/{role}.md")
    skill_dir = skills_root / skill
    skill_file = skill_dir / "SKILL.md"
    if not skill_file.is_file():
        fail(f"role '{role}' references missing skill '{skill}' at {skill_file}")

    skill_text = skill_file.read_text()
    if skill_text.startswith("---\n"):
        try:
            _, skill_frontmatter, _ = skill_text.split("---", 2)
            skill_metadata = yaml.safe_load(skill_frontmatter) or {}
        except (ValueError, yaml.YAMLError):
            skill_metadata = {}
        allowed_tools = skill_metadata.get("allowed-tools", []) if isinstance(skill_metadata, dict) else []
        if isinstance(allowed_tools, str):
            allowed_tools = [allowed_tools]
        if isinstance(allowed_tools, list):
            for declaration in allowed_tools:
                if not isinstance(declaration, str):
                    continue
                for match in launcher_pattern.finditer(declaration):
                    declared_path, launcher_skill, launcher_name = match.groups()
                    if launcher_skill in {".", ".."} or launcher_name in {".", ".."}:
                        continue
                    relative_path = Path(launcher_skill) / "bin" / launcher_name
                    launcher_path = (
                        skills_root / relative_path
                        if configured_skills_root
                        else Path(declared_path).expanduser()
                    ).resolve()
                    if not launcher_path.is_file():
                        fail(
                            f"skill '{skill}' declares missing Bash launcher '{launcher_path}' "
                            "in allowed-tools"
                        )
    skill_paths.append(str(skill_dir.resolve()))

extra_args = sys.argv[1:]
argv = ["pi", "--model", model, "--thinking", thinking, "--tools", ",".join(tools), "--no-extensions"]
for extension_path in extension_paths:
    argv.extend(("--extension", extension_path))
argv.extend(("--append-system-prompt", f"agents/{role}.md", "--no-skills"))
for skill_path in skill_paths:
    argv.extend(("--skill", skill_path))
argv.extend(extra_args)
argv.extend(("-p", "@" + str(Path(os.environ["PI_ROLE_BRIEF"]).resolve())))

shim = str(root / "scripts" / "gh-shim")
environment = os.environ.copy()
environment["PATH"] = shim + os.pathsep + environment.get("PATH", "")
print(f"pi-role: PATH={shlex.quote(shim)}:\"$PATH\" {shlex.join(argv)}", file=sys.stderr, flush=True)
null_fd = os.open(os.devnull, os.O_RDONLY)
os.dup2(null_fd, 0)
if null_fd != 0:
    os.close(null_fd)
try:
    os.execvpe("pi", argv, environment)
except FileNotFoundError:
    fail("pi CLI was not found on PATH", 127)
PY
