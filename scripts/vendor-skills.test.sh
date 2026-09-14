#!/usr/bin/env bash
# Reproducibility contract for the two UI-review inputs used by the MVP design workflow.
set -euo pipefail
cd "$(dirname "$0")/.."

script="scripts/vendor-skills.sh"
for name in IMPECCABLE_PIN TASTE_PIN; do
  pin="$(sed -n "s/^${name}=\"\([0-9a-f]*\)\"$/\1/p" "$script")"
  test "${#pin}" -eq 40
  grep -Fq "fetch -q --depth 1 origin \"\$$name\"" "$script"
done

if grep -Eq 'git clone .*https://github.com/(pbakaus/impeccable|Leonxlnx/taste-skill)' "$script"; then
  echo "UI review skill input still clones a moving branch" >&2
  exit 1
fi

printf '%s\n' 'UI review skill pins are immutable'
