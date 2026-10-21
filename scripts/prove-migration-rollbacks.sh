#!/usr/bin/env bash
# Usage: prove-migration-rollbacks.sh <base-ref> <db-container>
# Exercise executable rollback files for migrations newer than the base, then restore the schema.
set -euo pipefail
export LC_ALL=C

BASE="${1:?usage: prove-migration-rollbacks.sh <base-ref> <db-container>}"
DB_CONTAINER="${2:?usage: prove-migration-rollbacks.sh <base-ref> <db-container>}"
MIGRATIONS_DIR="supabase/migrations"
ROLLBACKS_DIR="supabase/rollbacks"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || { echo 'MIGRATION ROLLBACK PROOF FAIL: not in a git worktree' >&2; exit 2; }
cd "$REPO_ROOT"
for ref in "$BASE" HEAD; do
  git rev-parse -q --verify "$ref^{commit}" >/dev/null \
    || { echo "MIGRATION ROLLBACK PROOF FAIL: unknown ref '$ref'" >&2; exit 2; }
done
git merge-base "$BASE" HEAD >/dev/null \
  || { echo "MIGRATION ROLLBACK PROOF FAIL: $BASE and HEAD share no history" >&2; exit 2; }

migration_version() {
  local filename="${1##*/}"
  [[ "$filename" =~ ^([0-9]+)_.*\.sql$ ]] || return 1
  printf '%s' "${BASH_REMATCH[1]}"
}
normalize_version() {
  local version="$1"
  while [[ "${#version}" -gt 1 && "${version:0:1}" == 0 ]]; do
    version="${version:1}"
  done
  printf '%s' "$version"
}
version_greater() {
  local left right
  left="$(normalize_version "$1")"
  right="$(normalize_version "$2")"
  if ((${#left} > ${#right})); then return 0; fi
  if ((${#left} < ${#right})); then return 1; fi
  [[ "$left" > "$right" ]]
}
has_down_header() {
  awk '
    /^[[:space:]]*$/ { next }
    /^[[:space:]]*--/ { if ($0 ~ /^[[:space:]]*-- DOWN([: (]|$)/) found=1; next }
    { exit }
    END { if (found) exit 0; exit 1 }
  ' "$1"
}

latest="0"
while IFS= read -r path; do
  version="$(migration_version "$path")" || continue
  if version_greater "$version" "$latest"; then
    latest="$(normalize_version "$version")"
  fi
done < <(git ls-tree -r --name-only "$BASE" -- "$MIGRATIONS_DIR")

migrations=()
rollback_files=()
unproven=()
missing=()
shopt -s nullglob
for migration in "$MIGRATIONS_DIR"/*.sql; do
  version="$(migration_version "$migration")" || continue
  version_greater "$version" "$latest" || continue
  rollback="$ROLLBACKS_DIR/${migration##*/}"
  if [[ -f "$rollback" ]]; then
    insert_at="${#migrations[@]}"
    for ((index=0; index<${#migrations[@]}; index++)); do
      existing_version="$(migration_version "${migrations[$index]}")"
      if version_greater "$existing_version" "$version"; then
        insert_at="$index"
        break
      fi
    done
    migrations=("${migrations[@]:0:insert_at}" "$migration" "${migrations[@]:insert_at}")
    rollback_files=("${rollback_files[@]:0:insert_at}" "$rollback" "${rollback_files[@]:insert_at}")
  elif has_down_header "$migration"; then
    unproven+=("$migration")
  else
    missing+=("$migration")
  fi
done
shopt -u nullglob

for migration in "${unproven[@]}"; do
  echo "UNPROVEN: $migration has a DOWN header but no executable rollback file"
done
if ((${#missing[@]} > 0)); then
  echo "MIGRATION ROLLBACK PROOF FAIL: migrations need a DOWN header or matching rollback file:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 1
fi
if ((${#migrations[@]} == 0)); then
  echo "migration rollback proof: no executable rollback files newer than $BASE (latest: $latest)"
  exit 0
fi

# psql reads stdin inside the container, so `\ir` files are inlined here, relative to the including file.
expand_includes() {
  local dir line
  dir="$(dirname "$1")"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^\\ir[[:space:]]+([^[:space:]]+) ]]; then
      expand_includes "$dir/${BASH_REMATCH[1]}"
    else
      printf '%s\n' "$line"
    fi
  done < "$1"
}

run_sql() {
  local action="$1" path="$2"
  echo "${action}: $path"
  if ! expand_includes "$path" | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f -; then
    if [[ "$action" == rollback ]]; then
      echo "MIGRATION ROLLBACK PROOF FAIL: rollback proof failed for $path" >&2
    else
      echo "MIGRATION ROLLBACK PROOF FAIL: migration reapply failed for $path" >&2
    fi
    exit 1
  fi
}

# Roll back newest first and re-apply oldest first, matching migration-chain order.
for ((index=${#migrations[@]} - 1; index >= 0; index--)); do
  run_sql 'rollback' "${rollback_files[$index]}"
done
for migration in "${migrations[@]}"; do
  run_sql 'reapply' "$migration"
done

echo "migration rollback proof passed: ${#migrations[@]} rollback(s) and reapply(s); ${#unproven[@]} unproven DOWN header(s)"
