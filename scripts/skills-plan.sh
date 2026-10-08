#!/usr/bin/env bash
# Validate and extract the one Skills plan format used by agent-ready and factory briefs.
set -uo pipefail

die() { printf '✗ skills-plan: %s\n' "$1" >&2; exit 1; }

[ "$#" -eq 2 ] || die "usage: skills-plan.sh <check|evidence> <file|->"
mode="$1"; file="$2"
case "$mode" in check|evidence) ;; *) die "unknown command '$mode' (check|evidence)" ;; esac

parse_plan() {
awk '
  function trim(value) {
    sub(/^[ \t\r]+/, "", value)
    sub(/[ \t\r]+$/, "", value)
    return value
  }
  function fail(message) {
    printf "skills-plan: %s\n", message > "/dev/stderr"
    failed = 1
    exit 1
  }
  function row_cells(line, cells, count) {
    if (substr(line, 1, 1) != "|" || substr(line, length(line), 1) != "|")
      fail("table rows must start and end with |")
    count = split(line, cells, "|")
    if (count != 5) fail("each table row must have exactly three cells")
    for (cell = 2; cell <= 4; cell++) cells[cell] = trim(cells[cell])
  }
  /^## Skills plan[ \t]*$/ {
    sections++
    if (sections > 1) fail("more than one ## Skills plan section")
    inside = 1
    next
  }
  inside && /^##[ \t]/ { inside = 0 }
  inside {
    line = trim($0)
    if (line == "") next
    if (stage == 0) {
      row_cells(line, cells)
      if (cells[2] != "Skill" || cells[3] != "Phase" || cells[4] != "Evidence")
        fail("table header must be | Skill | Phase | Evidence |")
      stage = 1
      next
    }
    if (stage == 1) {
      row_cells(line, cells)
      if (cells[2] != "---" || cells[3] != "---" || cells[4] != "---")
        fail("table separator must be |---|---|---|")
      stage = 2
      next
    }
    row_cells(line, cells)
    skill = cells[2]; phase = cells[3]; evidence = cells[4]
    if (skill == "" || phase == "" || evidence == "")
      fail("every Skills plan cell must be non-empty")
    if (skill !~ /^[a-z0-9-]+$/)
      fail("Skill must be a bare name matching [a-z0-9-]+: " skill)
    if (substr(evidence, 1, 5) != "docs/" || evidence ~ /^\// || index(evidence, "..") > 0 ||
        evidence ~ /\\/ || evidence ~ /\/\// || substr(evidence, length(evidence), 1) == "/")
      fail("Evidence must be a relative path under docs/ with no ..: " evidence)
    rows++
    print skill "\t" evidence
  }
  END {
    if (failed) exit 1
    if (sections == 0) {
      printf "skills-plan: missing ## Skills plan section\n" > "/dev/stderr"
      exit 1
    }
    if (stage < 2) {
      printf "skills-plan: Skills plan table is missing its header or separator\n" > "/dev/stderr"
      exit 1
    }
    if (rows == 0) {
      printf "skills-plan: Skills plan must contain at least one data row\n" > "/dev/stderr"
      exit 1
    }
  }
' "$@"
}
if [ "$file" = "-" ]; then
  parsed="$(parse_plan)" || exit 1
else
  [ -r "$file" ] || die "cannot read plan file: $file"
  parsed="$(parse_plan "$file")" || exit 1
fi

script_root="$(cd "$(dirname "$0")/.." && pwd -P)" || die "cannot locate checkout"
main_checkout="$(git -C "$script_root" worktree list --porcelain 2>/dev/null \
  | awk '$1 == "worktree" { sub(/^worktree /, ""); print; exit }')"
[ -n "$main_checkout" ] || main_checkout="$script_root"
skill_dirs=()
for dir in "$main_checkout/.claude/skills" "$main_checkout/.claude/skill-overrides"; do
  [ -d "$dir" ] && skill_dirs+=("$dir")
done

while IFS=$'\t' read -r skill evidence; do
  [ -n "$skill" ] || continue
  if [ "${#skill_dirs[@]}" -gt 0 ]; then
    found=0
    for dir in "${skill_dirs[@]}"; do
      if [ -f "$dir/$skill/SKILL.md" ]; then found=1; break; fi
    done
    [ "$found" -eq 1 ] || die "unknown skill '$skill' (not found in .claude/skills or .claude/skill-overrides)"
  fi
  if [ "$mode" = evidence ]; then printf '%s\n' "$evidence"; fi
done <<< "$parsed"

[ "$mode" = evidence ] || printf '✓ skills plan valid\n'
