#!/usr/bin/env bash
# Reproducibility contract for the vendored skill inputs used by the MVP design workflow.
set -euo pipefail
cd "$(dirname "$0")/.."

script="scripts/vendor-skills.sh"
bash -n "$script" || { echo "vendor-skills.sh does not parse" >&2; exit 1; }
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

# Agents may start every skill, /release included: merges into main/staging are guarded by the
# owner-assent check instead (OD-2026-10-07-HARNESS-ANSWERS).
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
for s in feedback release teach; do
  mkdir -p "$tmp/$s"; printf -- '---\nname: %s\ndisable-model-invocation: true\n---\nbody\n' "$s" > "$tmp/$s/SKILL.md"
done
eval "$(sed -n '/^unlock_skills()/,/^}/p' "$script")"
unlock_skills "$tmp"
! grep -q 'disable-model-invocation' "$tmp"/*/SKILL.md || { echo "owner-only flag left on a skill agents may start" >&2; exit 1; }
grep -q 'name: release' "$tmp/release/SKILL.md" || { echo "unlock damaged the frontmatter" >&2; exit 1; }
printf '%s\n' 'Agents may start every skill'
