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
# Pinned: the base certifies "already gated" only because dev and main advance via gated PRs.
case "$baseref" in origin/dev|origin/main) ;; *) die "base must be origin/dev or origin/main (got '$baseref')" ;; esac
git rev-parse -q --verify "$baseref^{commit}" >/dev/null || die "$baseref does not resolve — git fetch origin first"
git rev-parse --verify --quiet "$old^{commit}" >/dev/null || die "old tip '$old' does not resolve"
new="$(git rev-parse HEAD)"
[ "$old" != "$new" ] || die "old tip IS HEAD — nothing to carry"

# A migration renumber also carries: every commit after the stamped tip only renames
# supabase/migrations/<version>_<name>.sql to a new version, same name, byte-identical content
# (the merge-time order check asks for exactly this).
renumber_only() {
  git merge-base --is-ancestor "$old" "$new" || return 1
  [ -z "$(git rev-list --merges "$old..$new")" ] || return 1
  local c
  for c in $(git rev-list "$old..$new"); do
    # --raw --no-abbrev: same mode, same blob, R100 rename of a branch-added <14-digit>_<name>.sql
    # to a new 14-digit version, same name.
    git diff --raw --no-abbrev -M100% "$c^" "$c" | awk -F'\t' -v base="$(git ls-tree --name-only "$baseref" supabase/migrations/ | tr '\n' '|')" '
      { n++; split($1, m, " ")
        if (substr(m[1], 2) != m[2] || m[3] != m[4] || m[5] != "R100") bad = 1
        a = $2; b = $3
        if (a !~ /^supabase\/migrations\/[0-9]{14}_/ || b !~ /^supabase\/migrations\/[0-9]{14}_/) bad = 1
        if (index("|" base, "|" a "|")) bad = 1          # a migration the base already has
        sa = a; sb = b; sub(/^supabase\/migrations\/[0-9]{14}_/, "", sa); sub(/^supabase\/migrations\/[0-9]{14}_/, "", sb)
        if (sa != sb) bad = 1
      }
      END { exit (bad || n == 0) }' || return 1
  done
  # Across all those commits, migrations must still apply in the same order.
  [ "$(migration_order "$old")" = "$(migration_order "$new")" ]
}
# Filename order is the order Supabase applies migrations in; git lists tree entries in that order.
# Compare the files' contents (blob ids) in that order, so no two migrations can trade places.
migration_order() { git ls-tree "$1" supabase/migrations/ | awk '{print $3}'; }
# Merging dev in (the house rule: merge, never rebase) also carries: every first-parent commit
# after the stamped tip is a merge of a base-contained commit whose tree is exactly git's own
# clean merge — no conflict resolution, no edit riding along.
clean_merges_only() {
  git merge-base --is-ancestor "$old" "$new" || return 1
  local c p1 p2 extra
  for c in $(git rev-list --first-parent "$old..$new"); do
    read -r p1 p2 extra <<<"$(git rev-list --parents -n 1 "$c" | cut -d' ' -f2-)"
    [ -n "$p2" ] && [ -z "$extra" ] || return 1
    git merge-base --is-ancestor "$p2" "$baseref" || return 1
    [ "$(git merge-tree --write-tree "$p1" "$p2" 2>/dev/null)" = "$(git rev-parse "$c^{tree}")" ] || return 1
  done
}
if renumber_only; then
  identical="renumber"
elif clean_merges_only; then
  identical="merge"
else
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
fi

gitdir="$(git rev-parse --git-dir)"
carried=0
for f in pre-pr-verify-ok pre-pr-verify-dev-ok independent-review-spec-ok independent-review-code-quality-ok independent-review-security-ok; do
  [ -f "$gitdir/$f" ] || continue
  case "$f" in
    pre-pr-verify-ok|pre-pr-verify-dev-ok) [ "$(cat "$gitdir/$f")" = "$old" ] || continue; printf '%s' "$new" > "$gitdir/$f" ;;
    *) [ "$(awk '{print $1}' "$gitdir/$f")" = "$old" ] || continue
       rest="$(cut -d' ' -f2- "$gitdir/$f")"; printf '%s %s\n' "$new" "$rest" > "$gitdir/$f" ;;
  esac
  carried=$((carried + 1))
done
[ "$carried" -gt 0 ] || die "no stamps bound to $old to carry — run the battery and review as usual"
echo "✓ carry proven ($identical) — $carried stamp(s) carried ${old:0:8} → ${new:0:8}"
