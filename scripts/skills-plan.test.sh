#!/usr/bin/env bash
# Self-test for skills-plan.sh — format, path, and installed-skill validation.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd -P)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
SCRIPT="$ROOT/scripts/skills-plan.sh"
pass=0; fail=0

if [ ! -f "$SCRIPT" ]; then
  printf '  FAIL  skills-plan.sh is missing\n'
  exit 1
fi

fixture="$tmp/fixture"
mkdir -p "$fixture/scripts" "$fixture/.claude/skills/tdd"
cp "$SCRIPT" "$fixture/scripts/skills-plan.sh"
printf 'name: tdd\n' > "$fixture/.claude/skills/tdd/SKILL.md"
SCRIPT="$fixture/scripts/skills-plan.sh"

check() { # $1 name · $2 expected rc · $3 body
  local name="$1" want="$2" body="$3" rc
  printf '%s\n' "$body" > "$tmp/plan.md"
  bash "$SCRIPT" check "$tmp/plan.md" >/dev/null 2>&1; rc=$?
  if [ "$rc" -eq "$want" ]; then
    pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else
    fail=$((fail+1)); printf '  FAIL  %s — rc=%s (want %s)\n' "$name" "$rc" "$want"
  fi
}
plan() { printf '## Skills plan\n| Skill | Phase | Evidence |\n|---|---|---|\n| %s | %s | %s |\n' "$1" "$2" "$3"; }

valid="$(plan tdd build docs/reviews/1541/tdd.md)"
check 'valid skills plan passes' 0 "$valid"
printf '%s' "$valid" | bash "$SCRIPT" check - >/dev/null 2>&1; rc=$?
if [ "$rc" -eq 0 ]; then
  pass=$((pass+1)); printf '  ok    check reads a valid plan from stdin\n'
else
  fail=$((fail+1)); printf '  FAIL  check should read a valid plan from stdin — rc=%s\n' "$rc"
fi
printf '## Summary\nNo plan.\n' | bash "$SCRIPT" check - >/dev/null 2>&1; rc=$?
if [ "$rc" -ne 0 ]; then
  pass=$((pass+1)); printf '  ok    check rejects an invalid stdin plan\n'
else
  fail=$((fail+1)); printf '  FAIL  check should reject an invalid stdin plan\n'
fi
check 'missing section fails' 1 '## Summary
No plan.'
check 'header without a data row fails' 1 '## Skills plan
| Skill | Phase | Evidence |
|---|---|---|
'
check 'empty cell fails' 1 "$(plan tdd '' docs/reviews/1541/tdd.md)"
check 'skill name must be lowercase bare name' 1 "$(plan TDD build docs/reviews/1541/tdd.md)"
check 'unknown skill fails when a skills directory exists' 1 "$(plan no-such-skill build docs/reviews/1541/tdd.md)"
check 'absolute evidence path fails' 1 "$(plan tdd build /docs/reviews/1541/tdd.md)"
check 'parent traversal in evidence path fails' 1 "$(plan tdd build docs/../private/evidence.md)"

printf '%s\n' "$valid" > "$tmp/plan.md"
evidence="$(bash "$SCRIPT" evidence "$tmp/plan.md" 2>/dev/null)"; rc=$?
if [ "$rc" -eq 0 ] && [ "$evidence" = 'docs/reviews/1541/tdd.md' ]; then
  pass=$((pass+1)); printf '  ok    evidence prints relative paths one per line\n'
else
  fail=$((fail+1)); printf '  FAIL  evidence output — rc=%s output=%s\n' "$rc" "$evidence"
fi

cold="$tmp/cold"
mkdir -p "$cold/scripts"
cp "$SCRIPT" "$cold/scripts/skills-plan.sh"
plan unknown-on-cold-checkout build docs/reviews/1541/tdd.md > "$tmp/cold.md"
if bash "$cold/scripts/skills-plan.sh" check "$tmp/cold.md" >/dev/null 2>&1; then
  pass=$((pass+1)); printf '  ok    missing skills directories skip the existence check\n'
else
  fail=$((fail+1)); printf '  FAIL  cold checkout should skip skill existence validation\n'
fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
