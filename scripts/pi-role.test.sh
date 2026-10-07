#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
SCRIPT="$ROOT/scripts/pi-role.sh"

if [ ! -x "$SCRIPT" ]; then
  echo "FAIL pi-role launcher is missing or not executable: scripts/pi-role.sh" >&2
  exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat > "$tmp/bin/pi" <<'EOF'
#!/usr/bin/env bash
printf '%s\0' "$@" > "${PI_ROLE_CAPTURE:?}"
printf '%s' "$PATH" > "${PI_ROLE_PATH_CAPTURE:?}"
cat > "${PI_ROLE_STDIN_CAPTURE:?}"
EOF
chmod +x "$tmp/bin/pi"
printf 'Reply OK.\n' > "$tmp/brief.md"

common_dir=$(git rev-parse --git-common-dir)
case "$common_dir" in /*) ;; *) common_dir="$ROOT/$common_dir" ;; esac
MAIN_ROOT=$(cd "$(dirname "$common_dir")" && pwd -P)

tool_contracts=$(grep -l '^tools:' agents/*.md || true)
[ "$tool_contracts" = "agents/researcher.md" ] || {
  printf '  FAIL  researcher must be the only role with frontmatter tools\n' >&2
  exit 1
}

pass=0
fail() { printf '  FAIL  %s\n' "$1" >&2; exit 1; }
ok() { pass=$((pass + 1)); printf '  ok    %s\n' "$1"; }

check_invocation() {
  local role="$1" expected_skills="$2" expected_model="$3" expected_tools="$4"
  local capture="$tmp/$role.argv" captured_path="$tmp/$role.path" captured_stdin="$tmp/$role.stdin" output="$tmp/$role.out"
  rm -f "$capture" "$captured_path" "$captured_stdin"
  if ! PI_ROLE_CAPTURE="$capture" PI_ROLE_PATH_CAPTURE="$captured_path" PI_ROLE_STDIN_CAPTURE="$captured_stdin" \
    PATH="$tmp/bin:$PATH" bash "$SCRIPT" "$role" "$tmp/brief.md" --mode json >"$output" 2>&1; then
    cat "$output" >&2
    fail "$role dispatch should reach the fake pi"
  fi
  python3 - "$capture" "$captured_path" "$captured_stdin" "$ROOT" "$MAIN_ROOT" "$role" \
    "$expected_skills" "$expected_model" "$expected_tools" "$tmp/brief.md" <<'PY'
import os
import sys
from pathlib import Path

capture, path_capture, stdin_capture, root, main_root, role, skills_text, model, tools, brief = sys.argv[1:]
args = Path(capture).read_bytes().split(b"\0")[:-1]
args = [argument.decode() for argument in args]
path = Path(path_capture).read_text()
expected_skills = skills_text.split(",") if skills_text else []

def one_value(flag):
    positions = [index for index, value in enumerate(args) if value == flag]
    assert len(positions) == 1, f"expected one {flag}, got {positions} in {args}"
    index = positions[0]
    assert index + 1 < len(args), f"{flag} has no value"
    return args[index + 1]

assert one_value("--append-system-prompt") == f"agents/{role}.md", args
assert args.count("--no-skills") == 1, args
assert args.count("--no-extensions") == 1, args
actual_extensions = [args[index + 1] for index, value in enumerate(args[:-1]) if value == "--extension"]
expected_extensions = [str(Path(root) / "adws/adw_data/harness_engineering/subagents.ts")] if role == "eng-planner" else []
assert actual_extensions == expected_extensions, f"extensions mismatch: {actual_extensions} != {expected_extensions}"
actual_skills = [args[index + 1] for index, value in enumerate(args[:-1]) if value == "--skill"]
expected_paths = [str(Path(main_root) / ".claude" / "skills" / skill) for skill in expected_skills]
assert actual_skills == expected_paths, f"skills mismatch: {actual_skills} != {expected_paths}"
assert all((Path(skill) / "SKILL.md").is_file() for skill in actual_skills), actual_skills
assert one_value("--tools") == tools, args
assert one_value("--model") == model, args
assert "--mode" in args and args[args.index("--mode") + 1] == "json", args
assert args[-2:] == ["-p", "@" + str(Path(brief).resolve())], args
assert path.split(os.pathsep)[0] == str(Path(root) / "scripts" / "gh-shim"), path
assert Path(stdin_capture).read_bytes() == b"", "pi stdin must be /dev/null"
PY
  ok "$role loads its contract, selected skills, model/tools and brief under the gh shim"
}

# Skills are fixed role contracts; roster-backed model/tool values are asserted at their source.
check_invocation implementer 'tdd,codebase-design,diagnosing-bugs' 'bitdeer/deepseek-ai/DeepSeek-V4-Flash' 'read,grep,find,ls,bash,edit,write'
check_invocation ui-implementer 'impeccable,ui-ux-pro-max,taste,tdd,agent-browser' 'bitdeer/deepseek-ai/DeepSeek-V4-Flash' 'read,grep,find,ls,bash,edit,write'
check_invocation spec-reviewer 'code-review' 'zai/glm-5.3-flash' 'read,grep,find,ls,bash,write'
check_invocation code-quality-reviewer 'code-review' 'zai/glm-5.3-flash' 'read,grep,find,ls,bash,write'
check_invocation security-reviewer 'code-review,cso' 'zai/glm-5.3-flash' 'read,grep,find,ls,bash,write'
check_invocation design-reviewer 'design-review,impeccable,ui-ux-pro-max,taste,agent-browser' 'zai/glm-5.3-flash' 'read,grep,find,ls,bash,write'
check_invocation eng-planner 'codebase-design,domain-modeling,tdd' 'zai/glm-5.3-flash' 'read,grep,find,ls,bash,write,subagent_create,subagent_continue,subagent_list,subagent_remove'
check_invocation documenter '' 'openai-codex/gpt-5.6-luna' 'read,grep,find,ls,bash,write'
check_invocation design-architect 'design-system,impeccable,taste' 'openai-codex/gpt-6-luna' 'read,bash,edit,write,grep,find,ls'
check_invocation researcher 'research' 'openai-codex/gpt-6-luna' 'read,grep,find,ls,bash,write'

capture="$tmp/unknown.argv"
output="$tmp/unknown.out"
if PI_ROLE_CAPTURE="$capture" PI_ROLE_PATH_CAPTURE="$tmp/unknown.path" PI_ROLE_STDIN_CAPTURE="$tmp/unknown.stdin" \
  PATH="$tmp/bin:$PATH" bash "$SCRIPT" unknown-role "$tmp/brief.md" >"$output" 2>&1; then
  fail "unknown roles must be refused"
fi
grep -Eqi 'unknown role|role .*not found' "$output" || fail "unknown-role refusal should be clear"
[ ! -e "$capture" ] || fail "unknown role must be refused before pi starts"
ok "unknown role is refused before pi starts"

# A separate local git checkout proves a role cannot launch with an unavailable skill.
fixture="$tmp/missing-skill-repo"
mkdir -p "$fixture/scripts/lib" "$fixture/agents" "$fixture/scripts/gh-shim"
cp "$SCRIPT" "$fixture/scripts/pi-role.sh"
cp "$ROOT/scripts/lib/py-with-deps.sh" "$fixture/scripts/lib/py-with-deps.sh"
chmod +x "$fixture/scripts/pi-role.sh"
git -C "$fixture" init -q
mkdir -p "$fixture/adws/adw_sssf_config"
cat > "$fixture/adws/adw_sssf_config/sssf.config.yaml" <<'EOF'
defaults:
  model: zai/glm-5.3-flash
  tools: [read]
agents:
  - name: reviewer
    model: zai/glm-5.3-flash
    tools: [read]
EOF
cat > "$fixture/agents/broken.md" <<'EOF'
---
name: broken
roster_agent: reviewer
skills:
  - deliberately-missing
context: []
---
Broken role fixture.
EOF
capture="$tmp/missing-skill.argv"
output="$tmp/missing-skill.out"
if (cd "$fixture" && PI_ROLE_CAPTURE="$capture" PI_ROLE_PATH_CAPTURE="$tmp/missing-skill.path" \
  PI_ROLE_STDIN_CAPTURE="$tmp/missing-skill.stdin" PATH="$tmp/bin:$PATH" \
  bash scripts/pi-role.sh broken "$tmp/brief.md") >"$output" 2>&1; then
  fail "roles with missing skills must be refused"
fi
grep -Fq 'deliberately-missing' "$output" || fail "missing-skill refusal should name the missing skill"
[ ! -e "$capture" ] || fail "missing skill must be refused before pi starts"
ok "missing skill is named and refused before pi starts"

printf 'PASS pi-role self-test (%s checks)\n' "$pass"
