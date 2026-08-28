#!/usr/bin/env bash
# prose-budget — refuse comment-essay diffs; run by pre-pr-verify over the whole branch.
#
#   scripts/prose-budget.sh <base-ref>
#
# Counts ADDED lines in the branch diff, split into comment lines (// # -- /* * leaders in
# ts/tsx/js/css/sql/sh/py) and code lines. Machine-decidable only (the #497 lesson: a guard that
# judges honesty blocks honest work; a guard that counts lines cannot):
#   REFUSE : >50 added comment lines AND comments outnumber code   (the 3000-words-per-LOC class)
#   WARN   : >20 added comment lines and ratio > 0.5
# New in-repo markdown is warned past 200 added lines — prose narratives belong in local docs/.
# Self-test: scripts/prose-budget.test.sh
set -uo pipefail

base="${1:?usage: prose-budget.sh <base-ref>}"

added="$(git diff "$base"...HEAD -- '*.ts' '*.tsx' '*.js' '*.mjs' '*.css' '*.sql' '*.sh' '*.py' \
  | grep -E '^\+[^+]' | sed 's/^+//' || true)"
comments="$(printf '%s\n' "$added" | grep -cE '^[[:space:]]*(//|#|--|/\*|\*)' || true)"
code="$(printf '%s\n' "$added" | grep -vcE '^[[:space:]]*(//|#|--|/\*|\*)|^[[:space:]]*$' || true)"

if [ "$comments" -gt 50 ] && [ "$comments" -gt "$code" ]; then
  echo "✗ prose-budget: $comments added comment lines vs $code code lines — the diff is the essay; comments state what code can't show. Cut, then re-run." >&2
  exit 1
fi
if [ "$comments" -gt 20 ] && [ "$code" -gt 0 ] && [ $((comments * 2)) -gt "$code" ]; then
  echo "⚠ prose-budget: $comments comment lines on $code code lines — heavy; a WHY-comment earns its line, narration doesn't"
fi

md="$(git diff "$base"...HEAD -- '*.md' | grep -cE '^\+[^+]' || true)"
[ "$md" -le 200 ] || echo "⚠ prose-budget: $md added markdown lines in the public repo — narratives belong in local docs/"

exit 0
