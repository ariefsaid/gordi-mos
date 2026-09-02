#!/usr/bin/env bash
# Self-test for scripts/lint-security-definer.sh (#565). That script moved under scripts/,
# which guards.yml's `NOT_INERT` allowlist treats as shipping no pixels — so a dev PR that
# neuters the lint (e.g. drops the revoke check) would sail through the geometry lane with
# nothing exercising it. This proves the lint can still fail, over disposable fixture
# migrations rather than the real supabase/migrations tree.
#
# Static/fixture-only: no docker, no DB, runs in the guards lane.
set -euo pipefail
cd "$(dirname "$0")/.."

pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

fixtures=$(mktemp -d -t lintsecdef.XXXXXX)
trap 'rm -rf "$fixtures"' EXIT

# 1. A SECURITY DEFINER function WITH a matching revoke — must pass.
mkdir -p "$fixtures/with_revoke"
cat > "$fixtures/with_revoke/0001_ok.sql" <<'SQL'
create function mos.approve_thing() returns void
language plpgsql security definer as $$ begin null; end; $$;
revoke execute on function mos.approve_thing() from public, anon, authenticated;
SQL
if bash scripts/lint-security-definer.sh "$fixtures/with_revoke" >/tmp/lintsecdef.out 2>&1; then
  ok "definer WITH revoke passes"
else
  bad "definer WITH revoke should have passed:"; sed 's/^/        /' /tmp/lintsecdef.out
fi

# 2. Red-first / can-fail control: the SAME function with the revoke line stripped — the
# neutered copy this whole test exists to catch. Must FAIL with rc=1 and a message.
mkdir -p "$fixtures/without_revoke"
grep -v '^revoke execute' "$fixtures/with_revoke/0001_ok.sql" > "$fixtures/without_revoke/0001_bad.sql"
rc=0
out=$(bash scripts/lint-security-definer.sh "$fixtures/without_revoke" 2>&1) || rc=$?
if [ "$rc" -eq 1 ] && printf '%s' "$out" | grep -qi 'LINT FAIL'; then
  ok "definer WITHOUT revoke fails (rc=1) with a message — proves the check can fail"
else
  bad "definer WITHOUT revoke should fail rc=1 with LINT FAIL; got rc=$rc, out: $out"
fi

# 3. A comment-only mention of "security definer" (no real clause) — must NOT be flagged.
mkdir -p "$fixtures/comment_only"
cat > "$fixtures/comment_only/0001_comment.sql" <<'SQL'
-- writes are RPC-only via the SECURITY DEFINER approval RPC
create function mos.plain_fn() returns void language plpgsql security invoker as $$ begin null; end; $$;
comment on function mos.plain_fn() is 'not a SECURITY DEFINER function, just a comment mentioning it';
SQL
if bash scripts/lint-security-definer.sh "$fixtures/comment_only" >/tmp/lintsecdef.out 2>&1; then
  ok "comment-only mention of SECURITY DEFINER is ignored"
else
  bad "comment-only mention should not have failed:"; sed 's/^/        /' /tmp/lintsecdef.out
fi

# 4. Empty migrations dir — must fail closed (a lint that scanned nothing must not report OK).
mkdir -p "$fixtures/empty"
rc=0
out=$(bash scripts/lint-security-definer.sh "$fixtures/empty" 2>&1) || rc=$?
if [ "$rc" -ne 0 ]; then
  ok "empty migrations dir fails closed (rc=$rc)"
else
  bad "empty migrations dir should fail closed, got rc=0: $out"
fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
