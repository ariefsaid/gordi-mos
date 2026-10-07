#!/usr/bin/env bash
# Usage: check-migration-order.sh <base-ref> [<head-ref>]   (head defaults to HEAD; the merge hook
# passes a fetched PR head)
# Fails when a migration added since <base-ref> has a version at or below the newest migration
# on <base-ref>: such a file applies out of order on databases that already ran the newer one.
# A rename counts as an addition of the new name.
set -euo pipefail

BASE="${1:?usage: check-migration-order.sh <base-ref> [<head-ref>]}"
HEADREF="${2:-HEAD}"
# Process substitution hides a failing git, so a bad ref would read as "no new migrations".
for r in "$BASE" "$HEADREF"; do
  git rev-parse -q --verify "$r^{commit}" >/dev/null || { echo "MIGRATION ORDER FAIL: unknown ref '$r'" >&2; exit 2; }
done
DIR="supabase/migrations"

version() { basename "$1" | sed -E 's/^([0-9]+)_.*/\1/'; }

max=0
while IFS= read -r f; do
  [[ "$f" == *.sql ]] || continue
  v="$(version "$f")"
  [[ "$v" =~ ^[0-9]+$ ]] && (( 10#$v > max )) && max=$((10#$v))
done < <(git ls-tree --name-only "$BASE" "$DIR/")

bad=()
while IFS= read -r f; do
  [[ "$f" == "$DIR"/*.sql ]] || continue
  v="$(version "$f")"
  if ! [[ "$v" =~ ^[0-9]+$ ]] || (( 10#$v <= max )); then bad+=("$f"); fi
done < <(git diff --no-renames --diff-filter=A --name-only "$BASE"..."$HEADREF" -- "$DIR")

if [ "${#bad[@]}" -gt 0 ]; then
  echo "MIGRATION ORDER FAIL: new migration(s) not newer than the latest on $BASE ($max):" >&2
  printf '  %s\n' "${bad[@]}" >&2
  echo "Rename each to a version >= $((max + 1)) (next free: $((max + 1)))." >&2
  exit 1
fi
echo "migration order ok (latest on $BASE: $max)"
