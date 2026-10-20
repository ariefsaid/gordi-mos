#!/usr/bin/env bash
# Usage: check-migration-rollback.sh <base-ref> [<head-ref>]
# New migrations newer than the base's latest must document a DOWN path or provide a rollback file.
set -euo pipefail

BASE="${1:?usage: check-migration-rollback.sh <base-ref> [<head-ref>] }"
HEADREF="${2:-HEAD}"
MIGRATIONS_DIR="supabase/migrations"
ROLLBACKS_DIR="supabase/rollbacks"

for ref in "$BASE" "$HEADREF"; do
  git rev-parse -q --verify "$ref^{commit}" >/dev/null \
    || { echo "MIGRATION ROLLBACK FAIL: unknown ref '$ref'" >&2; exit 2; }
done
git merge-base "$BASE" "$HEADREF" >/dev/null \
  || { echo "MIGRATION ROLLBACK FAIL: $BASE and $HEADREF share no history" >&2; exit 2; }

version() { basename "$1" | sed -nE 's/^([0-9]{14})_.*\.sql$/\1/p'; }
has_down_header() {
  git show "$HEADREF:$1" | awk '
    /^[[:space:]]*$/ { next }
    /^--/ { if ($0 ~ /^-- DOWN[:( ]/) found=1; next }
    { exit }
    END { if (found) exit 0; exit 1 }
  '
}
latest=0
while IFS= read -r file; do
  [[ "$file" == "$MIGRATIONS_DIR/"*.sql ]] || continue
  v="$(version "$file")"
  [[ "$v" =~ ^[0-9]{14}$ ]] || continue
  [[ "$v" > "$latest" ]] && latest="$v"
done <<< "$(git ls-tree -r --name-only "$BASE" -- "$MIGRATIONS_DIR")"

added="$(git -c core.quotePath=false diff --no-renames --diff-filter=A --name-only \
  "$BASE"..."$HEADREF" -- "$MIGRATIONS_DIR")"
bad=()
while IFS= read -r file; do
  [[ "$file" == "$MIGRATIONS_DIR/"*.sql ]] || continue
  v="$(version "$file")"
  [[ "$v" =~ ^[0-9]{14}$ && "$v" > "$latest" ]] || continue
  rollback="$ROLLBACKS_DIR/${file##*/}"
  has_down_header "$file" && continue
  git cat-file -e "$HEADREF:$rollback" 2>/dev/null && continue
  bad+=("$file")
done <<< "$added"

if [ "${#bad[@]}" -gt 0 ]; then
  echo "MIGRATION ROLLBACK FAIL: migrations newer than the latest on $BASE ($latest) need a '-- DOWN' header line or a matching file under $ROLLBACKS_DIR:" >&2
  printf '  %s\n' "${bad[@]}" >&2
  echo "Add a line beginning '-- DOWN:' or '-- DOWN (...)' or add $ROLLBACKS_DIR/<migration filename>." >&2
  exit 1
fi

echo "rollback check ok (latest on $BASE: $latest)"
