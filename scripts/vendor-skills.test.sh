#!/usr/bin/env bash
# Reproducibility contract for the vendored skill inputs used by the MVP design workflow.
set -euo pipefail
cd "$(dirname "$0")/.."

script="scripts/vendor-skills.sh"
for name in IMPECCABLE_PIN TASTE_PIN GSTACK_PIN JEFF_PIN UUPM_PIN MPS_PIN SSSF_PIN; do
  pin="$(sed -n "s/^${name}=\"\([0-9a-f]*\)\"$/\1/p" "$script")"
  test "${#pin}" -eq 40
  grep -Fq "fetch -q --depth 1 origin \"\$$name\"" "$script"
done

if grep -Eq '^git clone ' "$script"; then
  echo "Skill input still clones a moving branch" >&2
  exit 1
fi

printf '%s\n' 'Skill pins are immutable'

# Agents may start every skill except /release (OD-2026-10-07-SKILL-HARNESS; /release waits on a merge guard).
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
for s in feedback release teach; do
  mkdir -p "$tmp/$s"; printf -- '---\nname: %s\ndisable-model-invocation: true\n---\nbody\n' "$s" > "$tmp/$s/SKILL.md"
done
eval "$(sed -n '/^unlock_skills()/,/^}/p' "$script")"
unlock_skills "$tmp"
! grep -q 'disable-model-invocation' "$tmp/feedback/SKILL.md" "$tmp/teach/SKILL.md" || { echo "owner-only flag left on a skill agents may start" >&2; exit 1; }
grep -q 'disable-model-invocation: true' "$tmp/release/SKILL.md" || { echo "/release lost its owner-only flag" >&2; exit 1; }
grep -q 'name: feedback' "$tmp/feedback/SKILL.md" || { echo "unlock damaged the frontmatter" >&2; exit 1; }
printf '%s\n' 'Agents may start every skill but /release'
