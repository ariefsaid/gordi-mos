#!/usr/bin/env bash
# Resolve the local design skills from any checkout of this repository.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash scripts/ui-skill-tools.sh <paths|check|impeccable|ux-search> [args...]

  paths                 Print the skill entrypoints and Impeccable playbooks.
  check                 Verify entrypoints and probe the two executables.
  impeccable <args...>  Run an installed Impeccable CLI utility, e.g. context or detect.
  ux-search <args...>    Run the UI UX Pro Max catalog search from this checkout.

Read each applicable SKILL.md. Impeccable critique, audit, layout and similar
commands are AI-harness playbooks in reference/*.md, not launcher subcommands.
Taste is a judgment skill with no CLI. A successful check proves availability,
not that a design review, rendered operation, critique, or audit was performed.
USAGE
}

case "${1:-}" in
  paths|check|impeccable|ux-search) command_name=$1; shift ;;
  *) usage >&2; exit 2 ;;
esac

common_dir=$(git rev-parse --path-format=absolute --git-common-dir)
main_root=$(dirname "$common_dir")
skills="$main_root/.claude/skills"
ui_route="$main_root/docs/takeover/mvp-ui-continuation.md"
impeccable_skill="$skills/impeccable/SKILL.md"
impeccable_launcher="$skills/impeccable/scripts/impeccable"
impeccable_operate="$skills/impeccable/reference/operate.md"
impeccable_critique="$skills/impeccable/reference/critique.md"
impeccable_audit="$skills/impeccable/reference/audit.md"
impeccable_craft_floor="$skills/impeccable/reference/craft-floor.md"
taste_skill="$skills/taste/SKILL.md"
ux_skill="$skills/ui-ux-pro-max/SKILL.md"
ux_reference="$skills/ui-ux-pro-max/templates/base/quick-reference.md"
ux_search="$skills/ui-ux-pro-max/scripts/search.py"

for required in "$ui_route" "$impeccable_skill" "$impeccable_operate" "$impeccable_critique" "$impeccable_audit" "$impeccable_craft_floor" "$taste_skill" "$ux_skill" "$ux_reference" "$ux_search"; do
  if [[ ! -s "$required" ]]; then
    printf 'Missing UI review dependency: %s\n' "$required" >&2
    exit 1
  fi
done
if [[ ! -x "$impeccable_launcher" ]]; then
  printf 'Missing executable Impeccable launcher: %s\n' "$impeccable_launcher" >&2
  exit 1
fi

case "$command_name" in
  paths)
    printf 'UI continuation route: %s\nImpeccable skill: %s\nTaste skill: %s\nUI UX Pro Max skill: %s\n' \
      "$ui_route" "$impeccable_skill" "$taste_skill" "$ux_skill"
    printf 'Impeccable launcher: %s\nImpeccable Operate: %s\nImpeccable critique playbook: %s\nImpeccable audit playbook: %s\nImpeccable craft floor: %s\nUI UX Pro Max search: %s\n' \
      "$impeccable_launcher" "$impeccable_operate" "$impeccable_critique" "$impeccable_audit" "$impeccable_craft_floor" "$ux_search"
    ;;
  check)
    engine=$("$impeccable_launcher" engine-probe)
    [[ "$engine" == impeccable-engine* ]] || { printf 'Impeccable engine probe failed.\n' >&2; exit 1; }
    python3 "$ux_search" --help >/dev/null
    printf 'Available: %s; UI UX Pro Max search; Taste reference. No review has run.\n' "$engine"
    ;;
  impeccable)
    [[ $# -gt 0 ]] || { usage >&2; exit 2; }
    case "$1" in
      critique|audit|layout|distill|clarify|adapt|harden|polish|shape|craft|init|document|extract|bolder|quieter|onboard|animate|colorize|typeset|delight|overdrive|optimize|live)
        printf 'Impeccable %s is an AI-harness playbook, not a launcher subcommand. Read its reference/*.md via `paths`.\n' "$1" >&2
        exit 2
        ;;
    esac
    exec "$impeccable_launcher" "$@"
    ;;
  ux-search)
    [[ $# -gt 0 ]] || { usage >&2; exit 2; }
    exec python3 "$ux_search" "$@"
    ;;
esac
