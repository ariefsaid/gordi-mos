#!/usr/bin/env bash
# Every migration that DEFINES a `security definer` function must also REVOKE its PUBLIC
# execute grant in the same file. Defense-in-depth: prevents a recurrence of the
# _test_seed_role_tree audit Critical where a SECURITY DEFINER function was reachable via
# PostgREST because it lacked an explicit REVOKE.
#
# SQL line comments are stripped first so a mere *mention* of "security definer" in a comment
# (e.g. "writes are RPC-only via the SECURITY DEFINER approval RPC") is not a false positive —
# only an actual definer clause in executable SQL is flagged. `comment on ... is '...'` bodies
# are stripped too: `sed 's/--.*//'` strips `--` line comments but not SQL *string literals*, so
# a `comment on function ... is '... SECURITY DEFINER ...'` tripped this on a function explicitly
# declared `security invoker` (found on `v4-redesign`, PR #175). Deliberately narrow — a
# `security definer` clause can never appear inside a COMMENT ON statement, so this cannot hide
# a real one. Stripping *all* quoted strings was rejected: one unbalanced quote anywhere would
# silently over-strip and turn a security gate into a false negative, far worse than the false
# positive it fixes.
#
# Extracted from the `pgtap` and `db` CI jobs (#565), which carried this verbatim in both —
# an acknowledged sync burden. One source of truth now; both jobs `run: bash` this file.
set -euo pipefail

failed=0
for f in supabase/migrations/*.sql; do
  body=$(sed 's/--.*//' "$f" | perl -0777 -pe 's/comment\s+on\b[^;]*;//gis')
  if echo "$body" | grep -qi 'security definer'; then
    if ! echo "$body" | grep -qi 'revoke execute on function'; then
      echo "LINT FAIL: $f has SECURITY DEFINER but no 'revoke execute on function'" >&2
      failed=1
    fi
  fi
done

if [ "$failed" -eq 1 ]; then
  echo "Fix: add 'revoke execute on function <fn>() from public, anon, authenticated;' after each SECURITY DEFINER function definition." >&2
  exit 1
fi
echo "Lint OK: all SECURITY DEFINER migrations have revoke."
