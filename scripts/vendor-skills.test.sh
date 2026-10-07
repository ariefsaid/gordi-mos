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

# Description replacement keeps YAML metadata and body intact while handling block scalars.
desc_tmp="$tmp/descriptions"; mkdir -p "$desc_tmp/single" "$desc_tmp/folded" "$desc_tmp/literal" "$desc_tmp/unlisted"
printf '%s\n' '---' 'name: single' 'description: Original single-line wording.' 'license: MIT' 'metadata:' '  keep: yes' '---' 'single body' > "$desc_tmp/single/SKILL.md"
printf '%s\n' '---' 'name: folded' 'description: >' '  Original folded wording' '  continues here.' '# retained comment' 'metadata:' '  keep: intact' '---' 'folded body' > "$desc_tmp/folded/SKILL.md"
printf '%s\n' '---' 'name: literal' 'description: |' '  Original literal wording' '  continues here.' 'metadata:' '  keep: literal' '---' 'literal body' > "$desc_tmp/literal/SKILL.md"
printf '%s\n' '---' 'name: unlisted' 'description: Leave exactly unchanged.' 'license: Apache-2.0' '---' 'unlisted body' > "$desc_tmp/unlisted/SKILL.md"
cp "$desc_tmp/unlisted/SKILL.md" "$desc_tmp/unlisted.before"
printf 'single\tShort single sentence.\nfolded\tShort folded sentence.\nliteral\tShort literal sentence.\n' > "$tmp/descriptions.tsv"
eval "$(sed -n '/^replace_skill_descriptions()/,/^}/p' "$script")"
replace_skill_descriptions "$desc_tmp" "$tmp/descriptions.tsv"
grep -q '^description: "Short single sentence\."$' "$desc_tmp/single/SKILL.md" || { echo "single-line description was not replaced" >&2; exit 1; }
grep -q '^description: "Short folded sentence\."$' "$desc_tmp/folded/SKILL.md" || { echo "folded description was not replaced" >&2; exit 1; }
grep -q '^description: "Short literal sentence\."$' "$desc_tmp/literal/SKILL.md" || { echo "literal description was not replaced" >&2; exit 1; }
grep -q '^license: MIT$' "$desc_tmp/single/SKILL.md" && grep -q '^# retained comment$' "$desc_tmp/folded/SKILL.md" && grep -q '^  keep: intact$' "$desc_tmp/folded/SKILL.md" && grep -q '^  keep: literal$' "$desc_tmp/literal/SKILL.md" || { echo "description replacement changed other frontmatter" >&2; exit 1; }
grep -q '^single body$' "$desc_tmp/single/SKILL.md" && grep -q '^folded body$' "$desc_tmp/folded/SKILL.md" && grep -q '^literal body$' "$desc_tmp/literal/SKILL.md" || { echo "description replacement changed a skill body" >&2; exit 1; }
! grep -Eq 'Original (folded|literal) wording|continues here' "$desc_tmp/folded/SKILL.md" "$desc_tmp/literal/SKILL.md" || { echo "old block description lines remained" >&2; exit 1; }
cmp -s "$desc_tmp/unlisted.before" "$desc_tmp/unlisted/SKILL.md" || { echo "unlisted description changed" >&2; exit 1; }
printf 'missing-skill\tThis row must fail.\n' > "$tmp/unknown.tsv"
if replace_skill_descriptions "$desc_tmp" "$tmp/unknown.tsv" 2>"$tmp/unknown.err"; then
  echo "unknown description-map skill was accepted" >&2
  exit 1
fi
grep -q "unknown skill 'missing-skill'" "$tmp/unknown.err" || { echo "unknown skill failure was not clear" >&2; exit 1; }
printf '%s\n' 'Skill descriptions are replaced without changing other content'
