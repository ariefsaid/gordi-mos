#!/usr/bin/env bash
# Behaviour test for the migration rollback gate, isolated in a throwaway git repo.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/check-migration-rollback.sh"
T="$(mktemp -d "${TMPDIR:-/tmp}/migration-rollback-selftest.XXXXXXXX")"
trap 'rm -rf "$T"' EXIT
cd "$T"
git init -q -b dev
git config user.email t@t.test
git config user.name t
mkdir -p supabase/migrations supabase/rollbacks
printf '%s\n' 'select 1;' > supabase/migrations/20260101000000_legacy.sql
git add -A && git commit -qm base
BASE="$(git rev-parse HEAD)"
pass=0

reset_case() {
  git checkout -q -B pr "$BASE"
  git reset --hard -q "$BASE"
}
check() {
  local label="$1" want="$2" rc=0 out
  out="$(bash "$SCRIPT" dev 2>&1)" || rc=$?
  if [ "$rc" -ne "$want" ]; then
    printf 'FAIL %s: rc=%s want=%s\n%s\n' "$label" "$rc" "$want" "$out" >&2
    exit 1
  fi
  case "$label" in
    *"grandfathers existing"*)
      grep -q 'rollback check ok' <<<"$out" || { printf 'FAIL %s: missing success result\n%s\n' "$label" "$out" >&2; exit 1; } ;;
    *"missing rollback"*|*"non-header"*)
      grep -q 'supabase/migrations/20260101000001_' <<<"$out" \
        && grep -q -- "-- DOWN:" <<<"$out" \
        && grep -q 'supabase/rollbacks' <<<"$out" \
        || { printf 'FAIL %s: unclear failure message\n%s\n' "$label" "$out" >&2; exit 1; } ;;
  esac
  printf 'ok   %s\n' "$label"
  pass=$((pass + 1))
}

# A pre-cutoff migration without a DOWN path is grandfathered.
check 'grandfathers existing migrations' 0

reset_case
printf '%s\n' '-- DOWN: reverse this migration.' 'select 2;' > supabase/migrations/20260101000001_header.sql
git add -A && git commit -qm 'new migration has DOWN header'
check 'accepts exact DOWN header' 0

reset_case
printf '%s\n' 'select 2;' > supabase/migrations/20260101000001_file.sql
printf '%s\n' 'select 1;' > supabase/rollbacks/20260101000001_file.sql
git add -A && git commit -qm 'new migration has rollback file'
check 'accepts matching rollback file' 0

reset_case
printf '%s\n' 'select 2;' > supabase/migrations/20260101000001_missing.sql
git add -A && git commit -qm 'new migration has no rollback'
check 'rejects missing rollback' 1

reset_case
printf '%s\n' '-- Rollback: not the required DOWN header form.' 'select 2;' > supabase/migrations/20260101000001_form.sql
git add -A && git commit -qm 'new migration has alternate comment'
check 'rejects alternate comment without rollback file' 1

reset_case
printf '%s\n' 'select 2;' '-- DOWN: this is outside the header.' > supabase/migrations/20260101000001_nonheader.sql
git add -A && git commit -qm 'new migration has a non-header DOWN comment'
check 'rejects non-header DOWN comment' 1

printf '%s/6 passed\n' "$pass"
