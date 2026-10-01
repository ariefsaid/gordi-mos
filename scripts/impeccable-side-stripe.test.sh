#!/usr/bin/env bash
# Self-test for the vendored detector's side-stripe rules: a one-colour stripe drawn with a semantic
# token or on an option/menu state is flagged; tab and navigation states, neutral hairlines and the
# 2px warning row rule are not.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENTRY="$ROOT/scripts/impeccable-detect.mjs"
dir="$(mktemp -d "${TMPDIR:-/tmp}/impeccable-stripe.XXXXXX")"
trap 'rm -rf "$dir"' EXIT
fail=0

# expect <flagged|clean> <label> <css>
expect() {
  local want="$1" label="$2" css="$3" file="$dir/case.css" json hit
  printf '%s\n' "$css" > "$file"
  json="$(node "$ENTRY" --json --no-config "$file" || true)"
  hit="$(printf '%s' "${json:-[]}" | node --input-type=module -e '
    import fs from "node:fs";
    const findings = JSON.parse(fs.readFileSync(0, "utf8"));
    process.stdout.write(findings.some((f) => f.antipattern === "side-tab") ? "flagged" : "clean");
  ')"
  if [ "$hit" = "$want" ]; then
    echo "ok   $want  $label"
  else
    echo "FAIL want $want, got $hit: $label" >&2
    fail=1
  fi
}

expect flagged "primary inset stripe on [data-selected] option" \
  '.x__option[data-selected] { box-shadow: inset 3px 0 0 var(--primary); }'
expect flagged "primary inset stripe on [data-highlighted] option" \
  '.x__option[data-highlighted] { box-shadow: inset 3px 0 0 var(--primary); }'
expect flagged "primary inset stripe on [aria-selected] option" \
  ".x__option[aria-selected='true'] { box-shadow: inset 3px 0 0 var(--primary); }"
expect flagged "ring inset stripe on menu item .is-active" \
  '.menu__item.is-active { box-shadow: inset 4px 0 0 var(--ring); }'
expect flagged "warning 3px inset stripe on an option" \
  '.x__option[data-selected] { box-shadow: inset 3px 0 0 var(--warning); }'
expect flagged "brand-blue 3px inset stripe stays flagged" \
  '.x__card { box-shadow: inset 3px 0 0 var(--brand-blue); }'
expect flagged "semantic token with --color- prefix" \
  '.x__card { box-shadow: inset 3px 0 0 var(--color-primary); }'

expect clean "neutral 1px side border" \
  '.x__row { border-left: 1px solid var(--border); }'
expect clean "neutral border token as an inset stripe" \
  '.x__card { box-shadow: inset 3px 0 0 var(--border); }'
expect clean "secondary fill token as an inset stripe" \
  '.x__card { box-shadow: inset 3px 0 0 var(--secondary); }'
expect clean "tab [aria-selected] underline indicator" \
  ".tabs__tab[aria-selected='true'] { box-shadow: inset 0 -3px 0 var(--primary); }"
expect clean "tab [role=tab][aria-selected] side indicator" \
  "[role='tab'][aria-selected='true'] { box-shadow: inset 3px 0 0 var(--primary); }"
expect clean "rail nav item .is-active indicator" \
  '.rail__item.is-active { box-shadow: inset 3px 0 0 var(--primary); }'
expect clean "nav [aria-current] indicator" \
  ".nav__link[aria-current='page'] { box-shadow: inset 3px 0 0 var(--primary); }"
expect clean "2px warning row rule (border)" \
  '.row--urgent { border-left: 2px solid var(--warning); }'
expect clean "2px warning row rule (inset shadow)" \
  '.row--urgent { box-shadow: inset 2px 0 0 0 var(--warning); }'

[ "$fail" -eq 0 ] && echo 'impeccable side-stripe self-test passed'
exit "$fail"
