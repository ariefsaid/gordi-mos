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
