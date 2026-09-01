#!/usr/bin/env bash
# Carry the four PR stamps across a PURE rebase — mechanically proven identical content.
#
#   scripts/carry-stamps.sh <old-tip-sha>
#
# A rebase moves shas without (usually) changing patches, but stamps bind to shas, so every
# dev-move used to cost a full re-verify + reviewer confirm round for byte-identical content
# (3x in one day — the "what else is inefficient" answer, 2026-09-01). `git range-diff` decides
# identity: every branch commit must map `=` (unchanged patch; identical-patch REORDERS carry —
# tree-preserving). Edited, dropped, or added commits refuse and the normal chain applies. No LLM:
# the carry is exactly as trustworthy as git's own patch-id.
# Self-test: scripts/carry-stamps.test.sh
set -uo pipefail

die() { printf '✗ carry-stamps: %s\n' "$1" >&2; exit 1; }

old="${1:?usage: carry-stamps.sh <old-tip-sha> [base-ref]}"
baseref="${2:-origin/dev}"
git rev-parse --verify --quiet "$old^{commit}" >/dev/null || die "old tip '$old' does not resolve"
new="$(git rev-parse HEAD)"
[ "$old" != "$new" ] || die "old tip IS HEAD — nothing to carry"

rd="$(git range-diff --no-color "$old"..."$new" 2>/dev/null)" || die "range-diff failed (no common base?)"
[ -n "$rd" ] || die "empty range-diff — nothing to compare"
# Pure means: every branch commit maps '=' unchanged, and every right-only row is a commit the
# BASE already contains (dev's own advance — what a rebase absorbs; NOTE the inherited assumption:
# containment in $baseref certifies "already gated" only because dev advances via gated PRs).
# A right-only row NOT in the base is new unreviewed work → refuse. Anything else → refuse.
# FIELD-ANCHORED parsing: range-diff rows are `<ord>: <sha> <mark> <ord>: <sha> <subject…>` —
# the mark is FIELD 3, never matched as a substring (a subject containing " = " defeated the
# substring form three ways in review; the marker column is the only trustworthy signal).
identical=0
while read -r f1 f2 f3 f4 f5 _rest; do
  [ -n "$f1" ] || continue
  case "$f3" in
    '=') identical=$((identical + 1)) ;;
    '>')
      [ "$f1" = "-:" ] || die "rebase is NOT pure — left-side commit $f2 changed ('$f3'); re-verify and re-review"
      git merge-base --is-ancestor "$f5" "$baseref" 2>/dev/null \
        || die "rebase is NOT pure — right-side commit $f5 is not contained in $baseref (new/changed work); re-verify and re-review"
      ;;
    *) die "rebase is NOT pure — commit $f2 marked '$f3'; re-verify and re-review the new HEAD" ;;
  esac
done <<< "$rd"
[ "$identical" -gt 0 ] || die "no identical branch commits in the range-diff — nothing to carry"

gitdir="$(git rev-parse --git-dir)"
carried=0
for f in pre-pr-verify-ok independent-review-spec-ok independent-review-code-quality-ok independent-review-security-ok; do
  [ -f "$gitdir/$f" ] || continue
  case "$f" in
    pre-pr-verify-ok) [ "$(cat "$gitdir/$f")" = "$old" ] || continue; printf '%s' "$new" > "$gitdir/$f" ;;
    *) [ "$(awk '{print $1}' "$gitdir/$f")" = "$old" ] || continue
       rest="$(cut -d' ' -f2- "$gitdir/$f")"; printf '%s %s\n' "$new" "$rest" > "$gitdir/$f" ;;
  esac
  carried=$((carried + 1))
done
[ "$carried" -gt 0 ] || die "no stamps bound to $old to carry — run the battery and review as usual"
echo "✓ pure rebase proven ($identical identical commits) — $carried stamp(s) carried ${old:0:8} → ${new:0:8}"
