#!/usr/bin/env bash
#
# Self-test for the applied-path harness (#393).
#
# IT ASSERTS BEHAVIOUR, NEVER SOURCE TEXT. The previous attempt's self-test grepped the harness
# for its own strings; a reviewer replaced the entire body with `echo` and it still passed 9/9.
# So this one builds a THROWAWAY GIT REPO with two generations of fake migrations, stubs the
# database behind a fake `supabase` + `docker` on PATH, and runs the real harness end to end —
# green, red, and every refuse-to-run guard. Section H then guts the harness and requires this
# suite to notice: a test that cannot fail is the defect being tested for.
#
# No Docker, no Postgres, no Supabase CLI: it runs in the guard-self-tests job in seconds.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
HARNESS="$REPO/scripts/applied-path-check.sh"
FP_SQL="$REPO/scripts/lib/applied-path-fingerprint.sql"
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }
eq()  { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (want '$3', got '$2')"; fi; }

T="$(mktemp -d "${TMPDIR:-/tmp}/applied-path-selftest.XXXXXXXX")"
trap 'rm -rf "$T"' EXIT

# ── The stubs: a database made of two text files ────────────────────────────────────────────────
mkdir -p "$T/bin"

cat > "$T/bin/supabase" <<'STUB'
#!/usr/bin/env bash
# Fake Supabase CLI. Understands exactly two commands and one dialect of SQL:
#   alter table X add constraint N ...      -> N exists
#   alter table X drop constraint if exists N;  -> N gone, silently, whether or not it was there
# State: $FAKE_DB/cons (constraint names) and $FAKE_DB/versions (applied migration versions).
set -euo pipefail
S="$FAKE_DB"; mkdir -p "$S"; : >> "$S/cons"; : >> "$S/versions"
apply() {
  local f="$1" v; v="$(basename "$f" | sed -n 's/^\([0-9][0-9]*\)_.*/\1/p')"
  local line n
  while IFS= read -r line; do
    case "$line" in
      "--"*) continue ;;   # a commented-out statement is not a statement
      *"drop constraint if exists"*)
        n="$(printf '%s' "$line" | sed -n 's/.*if exists \([^ ;]*\).*/\1/p')"
        grep -vxF "$n" "$S/cons" > "$S/cons.tmp" 2>/dev/null || : > "$S/cons.tmp"
        mv "$S/cons.tmp" "$S/cons" ;;
      *"add constraint"*)
        n="$(printf '%s' "$line" | sed -n 's/.*add constraint \([^ ;]*\).*/\1/p')"
        grep -qxF "$n" "$S/cons" || echo "$n" >> "$S/cons" ;;
    esac
  done < "$f"
  grep -qxF "$v" "$S/versions" || echo "$v" >> "$S/versions"
}
workdir() { local prev=""; for a in "$@"; do [ "$prev" = "--workdir" ] && { echo "$a"; return; }; prev="$a"; done; }
W="$(workdir "$@")"
echo "$W" >> "$S/workdirs"
case "$1 $2" in
  "db reset")
    : > "$S/cons"; : > "$S/versions"
    for f in "$W"/supabase/migrations/*.sql; do apply "$f"; done ;;
  "migration up")
    for f in "$W"/supabase/migrations/*.sql; do
      v="$(basename "$f" | sed -n 's/^\([0-9][0-9]*\)_.*/\1/p')"
      grep -qxF "$v" "$S/versions" || apply "$f"
    done ;;
  *) echo "fake supabase: unsupported: $*" >&2; exit 64 ;;
esac
STUB

cat > "$T/bin/docker" <<'STUB'
#!/usr/bin/env bash
# Fake docker. `inspect` says the stack is up; `exec … psql` renders a fingerprint from the
# fake database, or answers the applied-versions query.
set -euo pipefail
S="$FAKE_DB"
[ "$1" = "inspect" ] && { echo true; exit 0; }
[ "$1" = "exec" ] || { echo "fake docker: unsupported: $*" >&2; exit 64; }
for a in "$@"; do [ "$a" = "-c" ] && { sort "$S/versions"; exit 0; }; done
cat > /dev/null   # swallow the fingerprint SQL on stdin
[ "${FAKE_EMPTY_FINGERPRINT:-0}" = "1" ] && exit 0
{
  sort "$S/cons" | while read -r n; do
    [ -n "$n" ] && echo "CONSTRAINT|t|$n|c valid=true CHECK"
  done
  for i in 1 2 3 4 5 6 7 8 9 10; do echo "CONSTRAINT|filler_$i|filler_${i}_pkey|p valid=true PRIMARY KEY (id)"; done
  for i in 1 2 3 4 5; do
    echo "RLS|filler_$i|-|enabled=true forced=true"
    echo "POLICY|filler_$i|filler_${i}_select|cmd=r permissive=true roles=authenticated"
    echo "FUNCTION|filler|fn_$i()|secdef=false volatility=v config=-"
  done
  echo "CATALOG|filler.vocab|code, name|<row><code>a</code></row>"
  if grep -qxF "t_cat_fkey" "$S/cons"; then echo "CATALOG|cat|code|<row><code>x</code></row>"; fi
} | sort
STUB
chmod +x "$T/bin/supabase" "$T/bin/docker"

# ── The throwaway repo: two generations of migrations, mirroring the real shape ──────────────────
# GEN 1 (the deployed baseline): 001 creates t and gives it a legacy CHECK.
# GEN 2 (today's tree):          001 EDITED so fresh databases never get that CHECK, plus 002
#                               which drops it conditionally and adds the catalog FK. Exactly the
#                               shape that has a branch CI can never reach.
mkrepo() {  # mkrepo DIR
  local R="$1"
  mkdir -p "$R/scripts/lib" "$R/supabase/migrations"
  cp "$HARNESS" "$R/scripts/applied-path-check.sh"; chmod +x "$R/scripts/applied-path-check.sh"
  cp "$FP_SQL" "$R/scripts/lib/applied-path-fingerprint.sql"
  cat > "$R/supabase/config.toml" <<'CFG'
project_id = "fake-mos"
[db]
port = 55432
CFG
  echo "-- nothing to seed" > "$R/supabase/seed.sql"
  cat > "$R/supabase/migrations/001_base.sql" <<'SQL'
create table t (a text);
alter table t add constraint t_legacy_check check (a in ('x'));
SQL
  ( cd "$R" && git init -q . && git add -A && git -c user.email=t@t -c user.name=t commit -qm gen1 )
  BASE_SHA="$( cd "$R" && git rev-parse HEAD )"
  cat > "$R/supabase/migrations/001_base.sql" <<'SQL'
create table t (a text);
SQL
  cat > "$R/supabase/migrations/002_catalog.sql" <<'SQL'
create table cat (code text);
alter table t drop constraint if exists t_legacy_check;
alter table t add constraint t_cat_fkey foreign key (a) references cat(code);
SQL
  ( cd "$R" && git add -A && git -c user.email=t@t -c user.name=t commit -qm gen2 )
  echo "$BASE_SHA" > "$R/supabase/applied-path-baseline"
}

run() {  # run REPO_DIR OUT_DIR [args…] -> exit code, output in $LAST_OUT
  local r="$1" o="$2"; shift 2
  LAST_OUT="$( cd "$r" && PATH="$T/bin:$PATH" FAKE_DB="$T/db" MOS_DB_LOCK_HELD=1 \
    ./scripts/applied-path-check.sh --out "$o" "$@" 2>&1 )"
  return $?
}

echo "── A. the real shape: the applied path converges"
R="$T/good"; mkrepo "$R"
rm -rf "$T/db"; run "$R" "$T/out-a"; rc=$?
eq "exits 0 when a migrated database matches a fresh one" "$rc" "0"
[ -s "$T/out-a/fresh.txt" ] && [ -s "$T/out-a/migrated.txt" ] \
  && ok "wrote both fingerprints" || bad "fingerprints missing"
if diff -q "$T/out-a/fresh.txt" "$T/out-a/migrated.txt" >/dev/null 2>&1; then
  ok "fresh and migrated agree"; else bad "fresh and migrated disagree on a converging tree"; fi
if diff -q "$T/out-a/fresh.txt" "$T/out-a/pre.txt" >/dev/null 2>&1; then
  bad "the pre-migration database was identical to fresh — nothing was migrated"
else ok "the pre-migration database really was different (two databases, not one)"; fi
grep -qF "t_legacy_check" "$T/out-a/pre-vs-fresh.diff" \
  && ok "the pre-migration database carried the legacy constraint" \
  || bad "the baseline build never produced the legacy state"

echo "── B. a broken conditional is caught"
R2="$T/broken"; mkrepo "$R2"
grep -v 'drop constraint if exists' "$R2/supabase/migrations/002_catalog.sql" > "$R2/x" \
  && mv "$R2/x" "$R2/supabase/migrations/002_catalog.sql"
( cd "$R2" && git add -A && git -c user.email=t@t -c user.name=t commit -qm break >/dev/null )
rm -rf "$T/db"; run "$R2" "$T/out-b"; rc=$?
eq "exits 1 when the applied path keeps a constraint a fresh database never has" "$rc" "1"
grep -qF "t_legacy_check" "$T/out-b/drift.diff" 2>/dev/null \
  && ok "the drift names the surviving constraint" || bad "drift did not name the constraint"

echo "── C. --prove: green, then red, then the contrast"
rm -rf "$T/db"; run "$R" "$T/out-c" --prove; rc=$?
eq "--prove exits 0 when the proof holds" "$rc" "0"
grep -qF "t_legacy_check" "$T/out-c/red/sabotage.txt" 2>/dev/null \
  && ok "it broke the statement CI cannot reach" || bad "nothing was selected to break"
[ -s "$T/out-c/red/drift.diff" ] && ok "breaking it turned the applied path red" \
  || bad "breaking the conditional did NOT go red — the check cannot fail"
if diff -q "$T/out-c/fresh.txt" "$T/out-c/red/fresh.txt" >/dev/null 2>&1; then
  ok "the same break is invisible to a fresh reset — the contrast AC-3 asks for"
else bad "the break changed the fresh database too"; fi
[ -s "$T/out-c/SUMMARY.md" ] && ok "left a SUMMARY.md artifact" || bad "no artifact written"
# The stack is shared: a run that leaves the deliberately broken schema behind would poison the
# e2e job that follows it in CI, and whoever is working in the next terminal.
if grep -qxF "t_legacy_check" "$T/db/cons" 2>/dev/null; then
  bad "the run handed the database back still carrying the sabotaged state"
else ok "it puts the database back to a plain fresh reset before exiting"; fi

echo "── D. it refuses to run when it could not fail"
R3="$T/vacuous"; mkrepo "$R3"
( cd "$R3" && git rev-parse HEAD ) > "$R3/supabase/applied-path-baseline"
rm -rf "$T/db"; run "$R3" "$T/out-d1"; rc=$?
eq "exit 2 when nothing is pending against the baseline" "$rc" "2"

R4="$T/nodiff"; mkrepo "$R4"
( cd "$R4" && git rev-parse HEAD ) > "$R4/supabase/applied-path-baseline"
echo "-- a migration that changes nothing" > "$R4/supabase/migrations/003_noop.sql"
( cd "$R4" && git add -A && git -c user.email=t@t -c user.name=t commit -qm noop >/dev/null )
rm -rf "$T/db"; run "$R4" "$T/out-d2"; rc=$?
eq "exit 2 when the baseline database is already identical to a fresh one" "$rc" "2"
printf '%s' "$LAST_OUT" | grep -qi "pass on air" \
  && ok "and says why, rather than reporting success" || bad "the refusal did not explain itself"

R5="$T/noref"; mkrepo "$R5"
echo "0000000000000000000000000000000000000000" > "$R5/supabase/applied-path-baseline"
rm -rf "$T/db"; run "$R5" "$T/out-d3"; rc=$?
eq "exit 2 when the baseline commit is not in the clone (shallow CI checkout)" "$rc" "2"

echo "── E. a collapsed fingerprint is a broken check, not a passing one"
rm -rf "$T/db"
LAST_OUT="$( cd "$R" && PATH="$T/bin:$PATH" FAKE_DB="$T/db" MOS_DB_LOCK_HELD=1 FAKE_EMPTY_FINGERPRINT=1 \
  ./scripts/applied-path-check.sh --out "$T/out-e" 2>&1 )"; rc=$?
eq "exit 2 when the fingerprint comes back empty" "$rc" "2"

echo "── F. every database command goes through the shared lock"
R6="$T/lock"; mkrepo "$R6"
cat > "$R6/scripts/with-db-lock.sh" <<'LOCK'
#!/usr/bin/env bash
echo "LOCK-TAKEN" > "$LOCK_WITNESS"
exec env MOS_DB_LOCK_HELD=1 "$@"
LOCK
chmod +x "$R6/scripts/with-db-lock.sh"
rm -rf "$T/db"; rm -f "$T/witness"
( cd "$R6" && PATH="$T/bin:$PATH" FAKE_DB="$T/db" LOCK_WITNESS="$T/witness" \
    ./scripts/applied-path-check.sh --out "$T/out-f" >/dev/null 2>&1 )
grep -q LOCK-TAKEN "$T/witness" 2>/dev/null \
  && ok "an unlocked invocation re-execs itself under with-db-lock.sh" \
  || bad "the harness reset a database without taking the shared lock"

echo "── G. two runs never share a scratch path"
# Behavioural, not a grep for `mktemp`: the fake CLI records every --workdir it is handed, and
# the trees two runs build must not collide. A fixed /tmp path is how parallel CI runs read each
# other's half-written fingerprints.
rm -rf "$T/db"; run "$R" "$T/out-g1" >/dev/null 2>&1
w1="$(sed 's|/[^/]*$||' "$T/db/workdirs" | sort -u | head -1)"
rm -rf "$T/db"; run "$R" "$T/out-g2" >/dev/null 2>&1
w2="$(sed 's|/[^/]*$||' "$T/db/workdirs" | sort -u | head -1)"
if [ -n "$w1" ] && [ -n "$w2" ] && [ "$w1" != "$w2" ]; then
  ok "each run builds its trees under its own scratch directory"
else bad "two runs shared the scratch path '$w1' — parallel runs would corrupt each other"; fi

echo "── H. control: a gutted harness must NOT pass this suite"
# The defect this whole file exists to prevent. Replace the harness body with a stub that just
# succeeds, and re-run section B's assertion — the one that requires a REAL red. If the stub
# still satisfies it, these tests are decoration.
R7="$T/gutted"; mkrepo "$R7"
grep -v 'drop constraint if exists' "$R7/supabase/migrations/002_catalog.sql" > "$R7/x" \
  && mv "$R7/x" "$R7/supabase/migrations/002_catalog.sql"
( cd "$R7" && git add -A && git -c user.email=t@t -c user.name=t commit -qm break >/dev/null )
printf '#!/usr/bin/env bash\necho "✓ the applied path converges"\nexit 0\n' > "$R7/scripts/applied-path-check.sh"
chmod +x "$R7/scripts/applied-path-check.sh"
rm -rf "$T/db"; rm -rf "$T/out-h"; mkdir -p "$T/out-h"
run "$R7" "$T/out-h"; rc=$?
if [ "$rc" = "1" ] && grep -qF "t_legacy_check" "$T/out-h/drift.diff" 2>/dev/null; then
  bad "control: a stub harness satisfied the red assertion — this suite proves nothing"
else
  ok "control: a stub harness fails the red assertion (rc=$rc, no drift artifact)"
fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
