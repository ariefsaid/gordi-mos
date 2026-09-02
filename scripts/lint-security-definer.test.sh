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

# 4. A semicolon in a default string must not truncate the function header.
mkdir -p "$fixtures/semicolon_in_string"
cat > "$fixtures/semicolon_in_string/0001_bad.sql" <<'SQL'
create function mos.string_default(value text default 'not; a terminator') returns void
language plpgsql security definer as $$ begin null; end; $$;
SQL
rc=0
out=$(bash scripts/lint-security-definer.sh "$fixtures/semicolon_in_string" 2>&1) || rc=$?
if [ "$rc" -eq 1 ] && printf '%s' "$out" | grep -qi 'LINT FAIL'; then
  ok "semicolon in default string does not hide definer"
else
  bad "semicolon in default string should fail rc=1 with LINT FAIL; got rc=$rc, out: $out"
fi

# 5. A revoke in a block comment is not executable SQL.
mkdir -p "$fixtures/revoke_block_comment"
cat > "$fixtures/revoke_block_comment/0001_bad.sql" <<'SQL'
create function mos.block_comment() returns void
language plpgsql security definer as $$ begin null; end; $$;
/* revoke execute on function mos.block_comment() from public; */
SQL
rc=0
out=$(bash scripts/lint-security-definer.sh "$fixtures/revoke_block_comment" 2>&1) || rc=$?
if [ "$rc" -eq 1 ] && printf '%s' "$out" | grep -qi 'LINT FAIL'; then
  ok "revoke in block comment does not satisfy definer"
else
  bad "revoke in block comment should fail rc=1 with LINT FAIL; got rc=$rc, out: $out"
fi

# 6. A revoke in a dollar-quoted body is not executable SQL.
mkdir -p "$fixtures/revoke_dollar_body"
cat > "$fixtures/revoke_dollar_body/0001_bad.sql" <<'SQL'
create function mos.dollar_body() returns void
language plpgsql security definer as $$
  begin
    revoke execute on function mos.dollar_body() from public;
  end;
$$;
SQL
rc=0
out=$(bash scripts/lint-security-definer.sh "$fixtures/revoke_dollar_body" 2>&1) || rc=$?
if [ "$rc" -eq 1 ] && printf '%s' "$out" | grep -qi 'LINT FAIL'; then
  ok "revoke in dollar body does not satisfy definer"
else
  bad "revoke in dollar body should fail rc=1 with LINT FAIL; got rc=$rc, out: $out"
fi

# 7. Empty migrations dir — must fail closed (a lint that scanned nothing must not report OK).
mkdir -p "$fixtures/empty"
rc=0
out=$(bash scripts/lint-security-definer.sh "$fixtures/empty" 2>&1) || rc=$?
if [ "$rc" -ne 0 ]; then
  ok "empty migrations dir fails closed (rc=$rc)"
else
  bad "empty migrations dir should fail closed, got rc=0: $out"
fi

# 8. Per-function match: definer fn A with a revoke for a DIFFERENT fn B — the B revoke must not
#    satisfy A (a file-level match would let A stay PUBLIC-reachable). Must FAIL.
mkdir -p "$fixtures/cross_fn"
cat > "$fixtures/cross_fn/0001_cross.sql" <<'SQL'
create function mos.alpha() returns void
language plpgsql security definer as $$ begin null; end; $$;
revoke execute on function mos.beta() from public, anon, authenticated;
SQL
rc=0
out=$(bash scripts/lint-security-definer.sh "$fixtures/cross_fn" 2>&1) || rc=$?
if [ "$rc" -eq 1 ] && printf '%s' "$out" | grep -qi 'LINT FAIL'; then
  ok "definer A + revoke for different fn B fails"
else
  bad "definer A + revoke for fn B should fail rc=1 with LINT FAIL; got rc=$rc, out: $out"
fi

# 9. Two SECURITY DEFINER fns with only one revoke — the un-revoked one is still reachable. Must FAIL.
mkdir -p "$fixtures/two_defs"
cat > "$fixtures/two_defs/0001_two.sql" <<'SQL'
create function mos.alpha() returns void
language plpgsql security definer as $$ begin null; end; $$;
create function mos.beta() returns void
language plpgsql security definer as $$ begin null; end; $$;
revoke execute on function mos.alpha() from public, anon, authenticated;
SQL
rc=0
out=$(bash scripts/lint-security-definer.sh "$fixtures/two_defs" 2>&1) || rc=$?
if [ "$rc" -eq 1 ] && printf '%s' "$out" | grep -qi 'LINT FAIL'; then
  ok "two definers with only one revoke fails"
else
  bad "two definers with one revoke should fail rc=1 with LINT FAIL; got rc=$rc, out: $out"
fi

# 10. Matched pair with differing spelling: quoted schema-qualified name and arg-list spacing in
#    the revoke — whitespace/quoting normalised, schema.name compared. Must PASS.
mkdir -p "$fixtures/spaced"
cat > "$fixtures/spaced/0001_ok.sql" <<'SQL'
create function mos.alpha(text, integer) returns void
language plpgsql security definer as $$ begin null; end; $$;
revoke execute on function "mos"."alpha"( text , integer ) from public, anon, authenticated;
SQL
if bash scripts/lint-security-definer.sh "$fixtures/spaced" >/tmp/lintsecdef.out 2>&1; then
  ok "matched revoke with quoted name / arg-list spacing passes"
else
  bad "matched revoke with differing spacing/quoting should have passed:"; sed 's/^/        /' /tmp/lintsecdef.out
fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
