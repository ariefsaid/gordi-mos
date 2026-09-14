#!/usr/bin/env bash
# Scan production UI source changed since a base commit. When the base cannot be
# resolved, scan every tracked production UI source file so the gate fails closed.
set -euo pipefail
cd "$(dirname "$0")/.."

base="${1:-}"
impeccable_files=()

if [ -n "$base" ] && git cat-file -e "$base^{commit}" 2>/dev/null; then
  candidates="$(git diff --name-only --diff-filter=ACMR "$base"...HEAD -- mos-app/src)"
else
  candidates="$(git ls-files mos-app/src)"
fi

while IFS= read -r ui_file; do
  [ -n "$ui_file" ] || continue
  case "$ui_file" in
    mos-app/src/*.css|mos-app/src/*.html|mos-app/src/*.jsx|mos-app/src/*.tsx|mos-app/src/*.vue|mos-app/src/*.svelte|mos-app/src/*.astro)
      case "$ui_file" in
        *.test.*|*.spec.*|*/__tests__/*|*/fixtures/*) ;;
        *) impeccable_files+=("$ui_file") ;;
      esac
      ;;
  esac
done <<< "$candidates"

if [ "${#impeccable_files[@]}" -eq 0 ]; then
  exit 0
fi

echo "── impeccable: scanning ${#impeccable_files[@]} production UI source file(s)"
node scripts/impeccable-detect.mjs --no-advisory "${impeccable_files[@]}"
