#!/usr/bin/env bash
# Carry the four PR stamps across a PURE rebase — mechanically proven identical content.
#
#   scripts/carry-stamps.sh <old-tip-sha>
#
# A rebase moves shas without (usually) changing patches, but stamps bind to shas, so every
# dev-move used to cost a full re-verify + a reviewer confirm round for byte-identical content
# (3x in one day — the "what else is inefficient" answer, 2026-09-01). `git range-diff` decides
# identity: every commit pair must be `=` (unchanged patch). Anything else — reordered, edited,
# dropped, added — refuses, and the normal re-verify + re-review applies. No LLM, no judgment:
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
# BASE already contains (dev's own advance — what a rebase absorbs). A right-only row NOT in the
# base is new unreviewed work → refuse. Anything else (edited '!', dropped '<', reordered) → refuse.
while IFS= read -r line; do
  case "$line" in
    *" = "*) continue ;;
    *"-:"*">"*)
      sha="$(printf '%s' "$line" | grep -oE '>[[:space:]]*[0-9]+:[[:space:]]+[0-9a-f]+' | grep -oE '[0-9a-f]+$')"
      [ -n "$sha" ] && git merge-base --is-ancestor "$sha" "$baseref" 2>/dev/null \
        || die "rebase is NOT pure — right-side commit ${sha:-?} is not contained in $baseref (new/changed work); re-verify and re-review"
      ;;
    *) die "rebase is NOT pure — '$line'; re-verify and re-review the new HEAD" ;;
  esac
done <<< "$rd"

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
echo "✓ pure rebase proven ($(printf '%s\n' "$rd" | grep -c ' = ') identical commits) — $carried stamp(s) carried ${old:0:8} → ${new:0:8}"
