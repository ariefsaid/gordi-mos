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
# Fake Supabase CLI. Understands exactly two commands and one small dialect of SQL:
#   alter table X add constraint N ...          -> constraint N exists
#   alter table X drop constraint if exists N;  -> N gone, silently, whether or not it was there
#   create policy N on X ...                    -> policy N exists
#   drop policy if exists N on X;               -> N gone, silently
# State: $FAKE_DB/cons, $FAKE_DB/pols, $FAKE_DB/versions (applied migration versions).
set -euo pipefail
S="$FAKE_DB"; mkdir -p "$S"; : >> "$S/cons"; : >> "$S/pols"; : >> "$S/versions"

# Postgres FOLDS an unquoted identifier to lower case and keeps a "Quoted" one exactly as written.
# A stub that folds both models a database that does not exist — and, worse, hides the harness's
# own folding: with the stub folding too, deleting the fold from the selector changes nothing this
# suite can see (#481 review). So: match keywords on a folded copy, read the identifier from the
# ORIGINAL, and fold it only when it was unquoted.
ident_after() {  # ident_after STATEMENT WORD1 WORD2 -> the word following "WORD1 WORD2"
  printf '%s' "$1" | awk -v w1="$2" -v w2="$3" '
    { for (i = 1; i <= NF - 2; i++)
        if (tolower($i) == w1 && tolower($(i+1)) == w2) { print $(i+2); exit } }'
}
fold_ident() {  # fold_ident RAW -> the name Postgres would actually store
  local raw="${1%;}"
  case "$raw" in
    '"'*) raw="${raw#\"}"; printf '%s' "${raw%\"}" ;;
    *)    printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' ;;
  esac
}
apply_stmt() {  # apply_stmt STATEMENT
  local stmt="$1" lc n
  case "$stmt" in *[![:space:]]*) ;; *) return 0 ;; esac
  lc="$(printf '%s' "$stmt" | tr '[:upper:]' '[:lower:]')"
  case "$lc" in
    *"alter table"*"alter table"*)
      # Two commands fused into one statement: a severed `alter table t` prefix ran on into its
      # successor. Matching `add constraint` first would absorb it silently, which is how
      # line-granular sabotage escaped notice; Postgres rejects the fusion outright.
      echo "fake supabase: syntax error at or near \"alter\" -- two commands in one statement: $lc" >&2
      exit 1 ;;
    *"drop constraint if exists"*)
      n="$(fold_ident "$(ident_after "$stmt" if exists)")"
      [ -n "$n" ] || { echo "fake supabase: could not read the constraint name: $lc" >&2; exit 1; }
      grep -vxF "$n" "$S/cons" > "$S/cons.tmp" 2>/dev/null || : > "$S/cons.tmp"
      mv "$S/cons.tmp" "$S/cons" ;;
    *"add constraint"*)
      n="$(fold_ident "$(ident_after "$stmt" add constraint)")"
      [ -n "$n" ] || { echo "fake supabase: could not read the constraint name: $lc" >&2; exit 1; }
      grep -qxF "$n" "$S/cons" || echo "$n" >> "$S/cons" ;;
    *"drop policy if exists"*)
      n="$(fold_ident "$(ident_after "$stmt" if exists)")"
      [ -n "$n" ] || { echo "fake supabase: could not read the policy name: $lc" >&2; exit 1; }
      grep -vxF "$n" "$S/pols" > "$S/pols.tmp" 2>/dev/null || : > "$S/pols.tmp"
      mv "$S/pols.tmp" "$S/pols" ;;
    *"create policy"*)
      n="$(fold_ident "$(ident_after "$stmt" create policy)")"
      [ -n "$n" ] || { echo "fake supabase: could not read the policy name: $lc" >&2; exit 1; }
      grep -qxF "$n" "$S/pols" || echo "$n" >> "$S/pols" ;;
    *"alter table"*)
      # Reached only when the statement carries no recognised action — i.e. a severed prefix.
      echo "fake supabase: syntax error at or near \";\" -- ALTER TABLE requires an action: $lc" >&2
      exit 1 ;;
  esac
}
apply() {
  local f="$1" v; v="$(basename "$f" | sed -n 's/^\([0-9][0-9]*\)_.*/\1/p')"
  local line stmt=""
  # Accumulate lines until a `;` and apply the STATEMENT, not the line. A line-terminated stub
  # shrugs at the orphaned `alter table t` that line-granular sabotage leaves behind, so every
  # test of "the whole statement was commented out" passes whether the harness does that or not
  # (#481 review). Postgres does not shrug: an ALTER TABLE with no action is a syntax error.
  while IFS= read -r line; do
    case "$line" in "--"*) continue ;; esac   # a commented-out line is not part of a statement
    stmt="$stmt $line"
    # Apply every COMPLETE statement in what has accumulated — not "the line that happened to
    # contain a semicolon". Two statements can share one line, and a stub that hands the pair to
    # apply_stmt as a single chunk trips its own fusion guard, so the fixture for that case could
    # not be built at all and the line-granular sabotage writer had nothing that could catch it
    # (#481 review). A severed `alter table t` prefix still fuses with its successor here, because
    # the fusion is inside one `;`-delimited piece either way.
    while [ "$stmt" != "${stmt#*;}" ]; do
      apply_stmt "${stmt%%;*};"
      stmt="${stmt#*;}"
    done
  done < "$f"
  # psql runs a final statement that carries no terminator, so this one does too. A SEVERED
  # `alter table t` prefix — the continuation line commented out — has that same shape, and
  # apply_stmt rejects it for the reason Postgres does: an ALTER TABLE with no action.
  apply_stmt "$stmt"
  grep -qxF "$v" "$S/versions" || echo "$v" >> "$S/versions"
}
workdir() { local prev=""; for a in "$@"; do [ "$prev" = "--workdir" ] && { echo "$a"; return; }; prev="$a"; done; }
W="$(workdir "$@")"
echo "$W" >> "$S/workdirs"
case "$1 $2" in
  "db reset")
    # STUB_FAIL_RESTORE: fail the SECOND `db reset` against the head tree, never the first. The
    # first is step [1] FRESH, which the harness needs to succeed to reach the point where there
    # is anything to restore; the second is restore_db's own reset, which is the one this knob
    # exists to break. Same workdir both times, so a call COUNT is what tells them apart.
    case "$W" in
      */head)
        if [ "${STUB_FAIL_RESTORE:-0}" = "1" ]; then
          n=$(( $(cat "$S/head_reset_n" 2>/dev/null || echo 0) + 1 ))
          echo "$n" > "$S/head_reset_n"
          if [ "$n" -ge 2 ]; then
            echo "fake supabase: forced restore failure (STUB_FAIL_RESTORE)" >&2
            exit 1
          fi
        fi ;;
    esac
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
for a in "$@"; do [ "$a" = "-c" ] && {
  # G5 knob: withhold the NEWEST recorded version, so the chain looks like it failed to record
  # a migration it applied. Dropping the oldest instead would shrink the pending set and prove
  # nothing — the first attempt at this knob did exactly that.
  if [ "${STUB_DROP_VERSION:-0}" = "1" ]; then sort "$S/versions" | sed '$d'; else sort "$S/versions"; fi
  exit 0; }; done
cat > /dev/null   # swallow the fingerprint SQL on stdin
[ "${FAKE_EMPTY_FINGERPRINT:-0}" = "1" ] && exit 0
{
  sort "$S/cons" | while read -r n; do
    [ -n "$n" ] && echo "CONSTRAINT|t|$n|c valid=true CHECK"
  done
  # Real POLICY rows, alongside the fillers below. Without them the only object class this fake
  # database can carry is CONSTRAINT, and the --prove verdict's ability to adapt to the class it
  # actually broke is untestable — a literal `CONSTRAINT` would score the same (#481 review).
  : >> "$S/pols"
  sort "$S/pols" | while read -r n; do
    [ -n "$n" ] && echo "POLICY|t|$n|cmd=r permissive=true roles=authenticated"
  done
  for i in 1 2 3 4 5 6 7 8 9 10; do echo "CONSTRAINT|filler_$i|filler_${i}_pkey|p valid=true PRIMARY KEY (id)"; done
  for i in 1 2 3 4 5; do
    echo "RLS|filler_$i|-|enabled=true forced=true"
    echo "POLICY|filler_$i|filler_${i}_select|cmd=r permissive=true roles=authenticated"
    echo "FUNCTION|filler|fn_$i()|secdef=false volatility=v config=-"
  done
  echo "CATALOG|filler.vocab|code, name|<row><code>a</code></row>"
  if grep -qxF "t_cat_fkey" "$S/cons"; then echo "CATALOG|cat|code|<row><code>x</code></row>"; fi
} | sort | { if [ -n "${STUB_DROP_KIND:-}" ]; then grep -v "^${STUB_DROP_KIND}|"; else cat; fi; }
STUB
chmod +x "$T/bin/supabase" "$T/bin/docker"

# ── The throwaway repo: two generations of migrations, mirroring the real shape ──────────────────
# GEN 1 (the deployed baseline): 001 creates t and gives it a legacy CHECK.
# GEN 2 (today's tree):          001 EDITED so fresh databases never get that CHECK, plus 002
#                               which drops it conditionally and adds the catalog FK. Exactly the
#                               shape that has a branch CI can never reach.
# Four env knobs, set per fixture, all off by default so the shape above is what every existing
# section still gets — and so 002_catalog.sql's first three lines keep their line NUMBERS, which
# section L and section M assert on:
#   MKREPO_GEN1_EXTRA   raw SQL appended to the BASELINE's 001 (an object only a deployed db has)
#   MKREPO_GEN2_EXTRA   raw SQL appended to today's 002 (the conditional that repairs it)
#   MKREPO_NO_LEGACY=1  omit the legacy CHECK pair entirely, for a fixture whose only conditional
#                       drop is of some other object class
#   MKREPO_SEEDLESS=1   the BASELINE COMMIT carries no seed*.sql at all
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
  # The seed file has to be absent from the BASELINE COMMIT, not merely deleted afterwards: the
  # harness extracts the baseline TREE, so a seed written before gen1 is still in it and the
  # seedless path is never exercised — K6 passed against a blind pathspec (#481 review).
  [ "${MKREPO_SEEDLESS:-0}" = "1" ] || echo "-- nothing to seed" > "$R/supabase/seed.sql"
  {
    echo "create table t (a text);"
    [ "${MKREPO_NO_LEGACY:-0}" = "1" ] \
      || echo "alter table t add constraint t_legacy_check check (a in ('x'));"
    [ -z "${MKREPO_GEN1_EXTRA:-}" ] || printf '%s\n' "$MKREPO_GEN1_EXTRA"
  } > "$R/supabase/migrations/001_base.sql"
  ( cd "$R" && git init -q . && git add -A && git -c user.email=t@t -c user.name=t commit -qm gen1 )
  BASE_SHA="$( cd "$R" && git rev-parse HEAD )"
  [ "${MKREPO_SEEDLESS:-0}" = "1" ] && echo "-- nothing to seed" > "$R/supabase/seed.sql"
  cat > "$R/supabase/migrations/001_base.sql" <<'SQL'
create table t (a text);
SQL
  {
    echo "create table cat (code text);"
    [ "${MKREPO_NO_LEGACY:-0}" = "1" ] \
      || echo "alter table t drop constraint if exists t_legacy_check;"
    echo "alter table t add constraint t_cat_fkey foreign key (a) references cat(code);"
    [ -z "${MKREPO_GEN2_EXTRA:-}" ] || printf '%s\n' "$MKREPO_GEN2_EXTRA"
  } > "$R/supabase/migrations/002_catalog.sql"
  ( cd "$R" && git add -A && git -c user.email=t@t -c user.name=t commit -qm gen2 )
  echo "$BASE_SHA" > "$R/supabase/applied-path-baseline"
}

run() {  # run REPO_DIR OUT_DIR [args…] -> exit code, output in $LAST_OUT
  local r="$1" o="$2"; shift 2
  LAST_OUT="$( cd "$r" && PATH="$T/bin:$PATH" FAKE_DB="$T/db" MOS_DB_LOCK_HELD=1 APPLIED_PATH_MIN_PENDING="${MINP:-1}" \
    ./scripts/applied-path-check.sh --out "$o" "$@" 2>&1 )"
  return $?
}

echo "── A. the real shape: the applied path converges"
R="$T/good"; mkrepo "$R"
rm -rf "$T/db"; run "$R" "$T/out-a"; rc=$?
LAST_OUT_A="$LAST_OUT"   # kept for section K2: later runs overwrite LAST_OUT
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
LAST_OUT="$( cd "$R" && PATH="$T/bin:$PATH" FAKE_DB="$T/db" MOS_DB_LOCK_HELD=1 APPLIED_PATH_MIN_PENDING="${MINP:-1}" FAKE_EMPTY_FINGERPRINT=1 \
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

echo "── I. control: --prove's OWN verdict must be able to fail"
# Review of PR #471 proved the gap: neutering --prove's red assertion, or its fresh-invisibility
# gate, left this suite at 21/21. Section H covers the harness being gutted; nothing covered the
# PROOF layer being gutted.
#
# The FIRST repair of that gap did not close it (#481 review). It stripped every
# `drop constraint if exists` line out of the fixture, which makes the GREEN comparison at step 3
# fail on its own: the run exits 1 with a plain DRIFT and --prove never starts, so the mutated
# lines are never executed and an unmutated harness scores exactly what a mutated one does.
# (The fresh_gate mutation was doubly dead: it patched `diff -q`, and the harness says `diff -u`.)
#
# So each control below keeps a HEALTHY green path — --prove really runs — and uses a fixture on
# which the SHIPPED harness must reach a specific honest refusal. Then it re-runs the same fixture
# against the mutation and requires the two verdicts to DIFFER. Two runs, one comparison: a
# mutation that changes nothing cannot be scored as a pass.

# mutate_harness REPO NAME PERL_EXPR — copy the shipped harness in and patch it, and PROVE the
# patch landed. A mutation whose pattern no longer matches the harness silently turns its control
# into a second run of the shipped code, which is how the fresh_gate control died.
mutate_harness() {
  local r="$1" name="$2" expr="$3"
  cp "$HARNESS" "$r/scripts/applied-path-check.sh"
  perl -0pi -e "$expr" "$r/scripts/applied-path-check.sh"
  chmod +x "$r/scripts/applied-path-check.sh"
  if cmp -s "$HARNESS" "$r/scripts/applied-path-check.sh"; then
    bad "control: the $name mutation did not land — it patches text the harness no longer has"
    return 1
  fi
}

# I1 — the RED verdict itself. The only CI-unreachable conditional here drops an object no
# database ever had, so commenting it out changes nothing: --prove reaches its own verdict and
# that verdict must come out FALSE. Nothing else in this suite ever makes it come out false.
RI1="$T/prove-red"
( export MKREPO_NO_LEGACY=1
  export MKREPO_GEN2_EXTRA="alter table t drop constraint if exists t_ghost_check;"
  mkrepo "$RI1" )
cp "$HARNESS" "$RI1/scripts/applied-path-check.sh"; chmod +x "$RI1/scripts/applied-path-check.sh"
rm -rf "$T/db"; rm -rf "$T/out-i1"; mkdir -p "$T/out-i1"
run "$RI1" "$T/out-i1" --prove; rc=$?
if [ "$rc" != "0" ] && grep -qF "t_ghost_check" "$T/out-i1/red/sabotage.txt" 2>/dev/null \
   && printf '%s' "$LAST_OUT" | grep -qF "did NOT go red"; then
  ok "the shipped --prove reaches its verdict on a no-op sabotage and calls it FAILED (rc=$rc)"
else
  bad "--prove never reached a false verdict (rc=$rc): $(printf '%s' "$LAST_OUT" | tail -3 | tr '\n' ' ')"
fi
if mutate_harness "$RI1" red_assertion 's/\[ "\$RED_RC" -eq 1 \]/[ 1 -eq 1 ]/'; then
  rm -rf "$T/db"; rm -rf "$T/out-i1m"; mkdir -p "$T/out-i1m"
  run "$RI1" "$T/out-i1m" --prove
  if printf '%s' "$LAST_OUT" | grep -qF "did NOT go red"; then
    bad "control: neutering the red assertion changed nothing — this control scores a mutated harness the same as the shipped one"
  else
    ok "control: with the red assertion neutered the harness stops reporting that false verdict"
  fi
fi

# I2 — the fresh-invisibility gate. This conditional drops an object today's chain creates and
# then drops, so it is absent from fresh.txt (hence selectable) while blanking it DOES change a
# fresh reset. The shipped harness must refuse outright — rc 2, "changed the FRESH database too".
RI2="$T/prove-fresh"
( export MKREPO_NO_LEGACY=1
  export MKREPO_GEN2_EXTRA="alter table t add constraint t_temp_check check (a in ('q'));
alter table t drop constraint if exists t_temp_check;"
  mkrepo "$RI2" )
cp "$HARNESS" "$RI2/scripts/applied-path-check.sh"; chmod +x "$RI2/scripts/applied-path-check.sh"
rm -rf "$T/db"; rm -rf "$T/out-i2"; mkdir -p "$T/out-i2"
run "$RI2" "$T/out-i2" --prove; rc=$?
if [ "$rc" = "2" ] && printf '%s' "$LAST_OUT" | grep -qF "changed the FRESH database too"; then
  ok "the shipped --prove refuses when the mutation is visible to a fresh reset (rc=2)"
else
  bad "--prove did not refuse a fresh-visible mutation (rc=$rc): $(printf '%s' "$LAST_OUT" | tail -3 | tr '\n' ' ')"
fi
if mutate_harness "$RI2" fresh_gate 's/if ! diff -u "\$OUT\/fresh\.txt"/if false \&\& ! diff -u "\$OUT\/fresh.txt"/'; then
  rm -rf "$T/db"; rm -rf "$T/out-i2m"; mkdir -p "$T/out-i2m"
  run "$RI2" "$T/out-i2m" --prove; rc=$?
  if [ "$rc" = "2" ] || printf '%s' "$LAST_OUT" | grep -qF "changed the FRESH database too"; then
    bad "control: skipping the fresh-invisibility gate changed nothing — this control scores a mutated harness the same as the shipped one"
  else
    ok "control: with that gate skipped the run sails past it instead of refusing (rc=$rc)"
  fi
fi

echo "── J. the refusal guards G5 and G6 are themselves proven"
# Both were unproven: removing either left the suite green (review finding).
R9="$T/g5"; mkrepo "$R9"; cp "$HARNESS" "$R9/scripts/applied-path-check.sh"; chmod +x "$R9/scripts/applied-path-check.sh"
rm -rf "$T/db"; rm -rf "$T/out-j5"; mkdir -p "$T/out-j5"
STUB_DROP_VERSION=1 run "$R9" "$T/out-j5"; rc=$?
[ "$rc" = "2" ] && ok "G5 refuses when the chain did not record a pending version (rc=2)" \
  || bad "G5 did not refuse a chain missing a recorded version (rc=$rc)"

R10="$T/g6"; mkrepo "$R10"; cp "$HARNESS" "$R10/scripts/applied-path-check.sh"; chmod +x "$R10/scripts/applied-path-check.sh"
rm -rf "$T/db"; rm -rf "$T/out-j6"; mkdir -p "$T/out-j6"
STUB_DROP_KIND=POLICY run "$R10" "$T/out-j6"; rc=$?
[ "$rc" = "2" ] && ok "G6 refuses when a whole fact class vanished from the fingerprint (rc=2)" \
  || bad "G6 did not refuse a fingerprint missing a fact class (rc=$rc)"

echo "── K. the guards THIS PR added must themselves be visible to this suite"
# The review of PR #475 proved every change in it was invisible here: reverting the whole diff
# still scored 25/25. That is the defect the file exists to prevent, so each new behaviour now
# has a case that fails when the behaviour is removed.

# K1 — the baseline must be an ancestor of HEAD (G2b). An unrelated commit makes "the deployed
# database" a fiction; before this guard the run proceeded and compared against nonsense.
RK1="$T/k-ancestor"; mkrepo "$RK1"
( cd "$RK1" \
  && git checkout -q --orphan stray && git commit -q --allow-empty -m stray \
  && stray_sha="$(git rev-parse HEAD)" \
  && git checkout -q - \
  && printf '%s\n' "$stray_sha" > supabase/applied-path-baseline ) 2>/dev/null
rm -rf "$T/db"; rm -rf "$T/out-k1"; mkdir -p "$T/out-k1"
run "$RK1" "$T/out-k1"; rc=$?
if [ "$rc" = "2" ] && printf '%s' "$LAST_OUT" | grep -q "not an ancestor"; then
  ok "G2b refuses a baseline that is not an ancestor of HEAD (rc=2)"
else
  bad "G2b did not refuse a non-ancestor baseline (rc=$rc)"
fi

# K2 — thin coverage must BOUND the run, not merely mention it. #472 asks for forward baseline
# movement to be bounded "within N migrations"; an earlier round answered with a warning, and a
# cross-family review pointed out that a warning bounds nothing — a one-migration gap still
# reported GREEN having proven almost nothing. The fixture carries exactly one pending migration,
# so the default floor of 2 must REFUSE it, and the explicit opt-in must let it through.
rm -rf "$T/db"; rm -rf "$T/out-k2"; mkdir -p "$T/out-k2"
MINP=2 run "$R" "$T/out-k2"; rc=$?
if [ "$rc" = "2" ] && printf '%s' "$LAST_OUT" | grep -qi "covers very little"; then
  ok "a one-migration gap REFUSES by default (rc=2) and says why"
else
  bad "thin coverage did not bound the run (rc=$rc) — a warning is not a bound"
fi
if printf '%s' "$LAST_OUT" | grep -qi "APPLIED_PATH_MIN_PENDING"; then
  ok "the refusal names the deliberate opt-in rather than just refusing"
else
  bad "the refusal does not tell the caller how to proceed deliberately"
fi
# …and the opt-in really is what let every other case in this suite run: same repo, floor of 1.
if printf '%s' "$LAST_OUT_A" | grep -qi "covers very little"; then
  bad "the opt-in run still warned — the floor was not actually lowered"
else
  ok "an explicit APPLIED_PATH_MIN_PENDING=1 proceeds without the warning"
fi

# K3 — case folding follows Postgres, not the harness's convenience: an UNQUOTED identifier is
# folded to lower case, a "Quoted" one keeps exactly the case it was written in, and the
# fingerprint spells both that way. Both assertions are case-SENSITIVE — with `grep -i` neither
# could see a fold at all, so deleting the fold from the selector cost nothing (#481 review).
RK3="$T/k-upper"
( export MKREPO_GEN1_EXTRA="alter table t add constraint \"T_Quoted_Check\" check (a in ('z'));"
  export MKREPO_GEN2_EXTRA="alter table t drop constraint if exists \"T_Quoted_Check\";"
  mkrepo "$RK3" )
perl -0pi -e 's/drop constraint if exists t_legacy_check/DROP CONSTRAINT IF EXISTS T_LEGACY_CHECK/' \
  "$RK3/supabase/migrations/002_catalog.sql"
( cd "$RK3" && git add -A && git -c user.email=t@t -c user.name=t commit -qm upper >/dev/null )
rm -rf "$T/db"; rm -rf "$T/out-k3"; mkdir -p "$T/out-k3"
run "$RK3" "$T/out-k3" --prove; rc=$?
K3SAB="$(tr '\n' ' ' < "$T/out-k3/red/sabotage.txt" 2>/dev/null)"
if [ "$rc" = "0" ] && grep -q ":t_legacy_check$" "$T/out-k3/red/sabotage.txt" 2>/dev/null; then
  ok "an UPPERCASE unquoted conditional is selected and folded to lower case (rc=0)"
else
  bad "the unquoted identifier was not folded (rc=$rc, got: $K3SAB)"
fi
if grep -q ":T_Quoted_Check$" "$T/out-k3/red/sabotage.txt" 2>/dev/null; then
  ok "a \"Quoted\" identifier keeps its case, exactly as Postgres stores it"
else
  bad "a quoted identifier was folded — it would never match the fingerprint (got: $K3SAB)"
fi

# K4 — the sabotage record carries the object CLASS, so the --prove verdict asserts against the
# class actually broken. The previous attempt grepped a file nothing writes and always said
# CONSTRAINT; a policy-only baseline would then have produced a false red.
if awk -F: 'NF>=4 {found=1} END {exit !found}' "$T/out-k3/red/sabotage.txt" 2>/dev/null; then
  ok "the sabotage record names the object class it broke"
else
  bad "sabotage.txt carries no class field — the verdict cannot adapt"
fi

# K5 — a commented-out conditional is never counted as a mutation.
RK5="$T/k-comment"; mkrepo "$RK5"
perl -0pi -e 's/^(alter table t drop constraint if exists t_legacy_check;)/-- DROP CONSTRAINT IF EXISTS t_ghost_check;\n$1/m' \
  "$RK5/supabase/migrations/002_catalog.sql"
( cd "$RK5" && git add -A && git -c user.email=t@t -c user.name=t commit -qm comment >/dev/null )
rm -rf "$T/db"; rm -rf "$T/out-k5"; mkdir -p "$T/out-k5"
run "$RK5" "$T/out-k5" --prove >/dev/null 2>&1
if ! grep -qi "t_ghost_check" "$T/out-k5/red/sabotage.txt" 2>/dev/null; then
  ok "a commented-out conditional is not recorded as a mutation"
else
  bad "a comment was recorded in the evidence artifact as a real mutation"
fi

# K6 — a baseline carrying NO seed file extracts cleanly instead of dying on the glob. The
# fixture has to be seedless in the BASELINE COMMIT: deleting supabase/seed.sql afterwards left
# it in the tree git archive actually reads, so a blind `supabase/seed.sql` pathspec scored
# exactly the same as the guard (#481 review).
RK6="$T/k-seedless"; ( export MKREPO_SEEDLESS=1; mkrepo "$RK6" )
rm -rf "$T/db"; rm -rf "$T/out-k6"; mkdir -p "$T/out-k6"
run "$RK6" "$T/out-k6"; rc=$?
if [ "$rc" = "0" ]; then
  ok "a seedless baseline does not die on the seed glob (rc=0)"
else
  bad "a seedless baseline broke the run (rc=$rc): $(printf '%s' "$LAST_OUT" | tail -2 | tr '\n' ' ')"
fi

echo "── L. a conditional split across lines is commented out WHOLE"
# The line-granular selector commented out only the matching line, leaving an orphaned
# `alter table t` prefix — which surfaces as "migration up failed" instead of a diagnosis (#472).
RL="$T/l-multiline"; mkrepo "$RL"
perl -0pi -e "s/^alter table t drop constraint if exists t_legacy_check;/alter table t\n  drop constraint if exists t_legacy_check;/m" \
  "$RL/supabase/migrations/002_catalog.sql"
( cd "$RL" && git add -A && git -c user.email=t@t -c user.name=t commit -qm multiline >/dev/null )
rm -rf "$T/db"; rm -rf "$T/out-l"; mkdir -p "$T/out-l"
run "$RL" "$T/out-l" --prove; rc=$?
if [ "$rc" = "0" ]; then
  ok "a statement spanning two lines is sabotaged whole (rc=0)"
else
  bad "a multi-line conditional broke the run (rc=$rc) — orphaned prefix"
fi

# L2 — and the evidence artifact must record the WHOLE range it commented out. Naming only the
# first line names a mutation that did not happen: whoever reads red/sabotage.txt cannot
# reconstruct what changed. `NF>=4` was satisfied either way (#481 review).
if grep -qxF "CONSTRAINT:002_catalog.sql:2-3:t_legacy_check" "$T/out-l/red/sabotage.txt" 2>/dev/null; then
  ok "the multi-line statement is recorded with its FULL line range, identifier and class"
else
  bad "sabotage.txt did not record the whole range (got: $(tr '\n' ' ' < "$T/out-l/red/sabotage.txt" 2>/dev/null))"
fi

echo "── M. the statement lexer: dollar-quoted bodies, string literals, an unterminated tail"
# Every one of these was a selector that read SQL as "text between semicolons". The first two are
# false REDs on a gate that runs immediately before a staging deploy; the third is coverage that
# is silently smaller than the proof claims.

# M1 — a conditional drop inside a `do $$ … $$` body must NOT be selectable, which is exactly
# (the `perform 1;` is load-bearing: without it the block is the drop and nothing else, so the
# nothing-else guard rejects it whether or not `$$` is recognised, and deleting the bare-`$$`
# alternative from the lexer scored 53/53. P2 carries the same line for the same reason.)
# what the harness's own header already promises. Without dollar-quote awareness the `;` inside
# the body ends a statement that has none: the selector reports `4-7:t_do_check`, comments the
# opening half of the block out and leaves `end if; end $$;` orphaned, and t_do_check is an
# object no database ever had — absent from fresh.txt so always selected, absent from the red
# diff so step 6 reports "the broken conditional did NOT go red" and exits 1 on a healthy
# migration. That is a false RED on the gate that runs just before a staging deploy.
RM1="$T/m-dollar"
( export MKREPO_GEN2_EXTRA="do \$\$
begin
  if to_regclass('public.t') is not null then
    perform 1;
    alter table t drop constraint if exists t_do_check;
  end if;
end \$\$;"
  mkrepo "$RM1" )
rm -rf "$T/db"; rm -rf "$T/out-m1"; mkdir -p "$T/out-m1"
run "$RM1" "$T/out-m1" --prove; rc=$?
M1SAB="$(tr '\n' ' ' < "$T/out-m1/red/sabotage.txt" 2>/dev/null)"
if [ "$rc" = "0" ] && ! grep -q "t_do_check" "$T/out-m1/red/sabotage.txt" 2>/dev/null \
   && grep -qxF "CONSTRAINT:002_catalog.sql:2-2:t_legacy_check" "$T/out-m1/red/sabotage.txt" 2>/dev/null; then
  ok "a conditional drop inside a dollar-quoted body is not selectable (rc=0)"
else
  bad "the DO block leaked into the selection (rc=$rc, got: $M1SAB)"
fi

# M2 — a `--` inside a string literal must not blank the rest of the line. It erased the literal's
# own `;`, merging the insert into the conditional below it, so the harness commented out a
# statement it had no business touching and reported a range that never existed.
RM2="$T/m-literal"
( export MKREPO_GEN2_EXTRA="insert into cfg values ('a -- b');
alter table t drop constraint if exists t_str_check;"
  mkrepo "$RM2" )
rm -rf "$T/db"; rm -rf "$T/out-m2"; mkdir -p "$T/out-m2"
run "$RM2" "$T/out-m2" --prove; rc=$?
M2SAB="$(tr '\n' ' ' < "$T/out-m2/red/sabotage.txt" 2>/dev/null)"
if [ "$rc" = "0" ] && grep -qxF "CONSTRAINT:002_catalog.sql:5-5:t_str_check" "$T/out-m2/red/sabotage.txt" 2>/dev/null; then
  ok "a -- inside a string literal does not merge two statements (rc=0)"
else
  bad "the literal's -- swallowed the statement above it (rc=$rc, got: $M2SAB)"
fi

# M3 — the last statement in a file need not carry a terminator; psql runs it either way.
# `while ($shadow =~ /;/g)` never fired for the tail, so such a conditional was invisible.
RM3="$T/m-tail"
( export MKREPO_GEN2_EXTRA="alter table t drop constraint if exists t_tail_check"
  mkrepo "$RM3" )
rm -rf "$T/db"; rm -rf "$T/out-m3"; mkdir -p "$T/out-m3"
run "$RM3" "$T/out-m3" --prove; rc=$?
M3SAB="$(tr '\n' ' ' < "$T/out-m3/red/sabotage.txt" 2>/dev/null)"
if [ "$rc" = "0" ] && grep -qxF "CONSTRAINT:002_catalog.sql:4-4:t_tail_check" "$T/out-m3/red/sabotage.txt" 2>/dev/null; then
  ok "a final statement with no trailing semicolon is still selectable (rc=0)"
else
  bad "the unterminated tail statement was invisible to the selector (rc=$rc, got: $M3SAB)"
fi

echo "── N. the verdict names the class actually broken, not a fixed one"
# The class field existed but nothing could tell it from a literal: with a CONSTRAINT-only fixture
# and a `${SABOTAGED_KIND:-CONSTRAINT}` fallback, replacing the awk with SABOTAGED_KIND=CONSTRAINT
# scored the same (#481 review). This baseline's only CI-unreachable conditional drops a POLICY,
# so the two now differ — and a hardcoded CONSTRAINT is a false red before a staging deploy.
RN="$T/n-policy"
( export MKREPO_NO_LEGACY=1
  export MKREPO_GEN1_EXTRA="create policy t_legacy_pol on t for select using (true);"
  export MKREPO_GEN2_EXTRA="drop policy if exists t_legacy_pol on t;"
  mkrepo "$RN" )
rm -rf "$T/db"; rm -rf "$T/out-n"; mkdir -p "$T/out-n"
run "$RN" "$T/out-n" --prove; rc=$?
NSAB="$(tr '\n' ' ' < "$T/out-n/red/sabotage.txt" 2>/dev/null)"
if [ "$rc" = "0" ] && grep -qxF "POLICY:002_catalog.sql:3-3:t_legacy_pol" "$T/out-n/red/sabotage.txt" 2>/dev/null; then
  ok "a policy-only baseline is proven exactly as a constraint one is (rc=0)"
else
  bad "the policy-only baseline did not prove (rc=$rc, got: $NSAB)"
fi
if printf '%s' "$LAST_OUT" | grep -q "names the POLICY facts"; then
  ok "the --prove verdict asserts against POLICY, the class it actually broke"
else
  bad "the verdict did not adapt: $(printf '%s' "$LAST_OUT" | grep -E '^  (ok|FAIL) ' | tr '\n' ' ')"
fi

# N2 — and it names ANY class that drifted, not the alphabetically first. The pick was
# `sort -u | head -1`; with two sabotaged classes it took CONSTRAINT and asked whether CONSTRAINT
# facts drifted. Here the ghost constraint never existed, so blanking it changes nothing, while the
# POLICY drop is the one that moves — `head -1` reports "reported drift without naming a" and the
# gate goes red on a correct run, immediately before a staging deploy. Two classes, one drifting:
# the only shape that can tell the loop from the pick.
RN2="$T/n-mixed"
( export MKREPO_NO_LEGACY=1
  export MKREPO_GEN1_EXTRA="create policy t_mixed_pol on t for select using (true);"
  export MKREPO_GEN2_EXTRA="alter table t drop constraint if exists t_ghost_mixed;
drop policy if exists t_mixed_pol on t;"
  mkrepo "$RN2" )
rm -rf "$T/db"; rm -rf "$T/out-n2"; mkdir -p "$T/out-n2"
run "$RN2" "$T/out-n2" --prove; rc=$?
N2SAB="$(tr '\n' ' ' < "$T/out-n2/red/sabotage.txt" 2>/dev/null)"
if [ "$rc" = "0" ] \
   && grep -q "^CONSTRAINT:" "$T/out-n2/red/sabotage.txt" 2>/dev/null \
   && grep -q "^POLICY:" "$T/out-n2/red/sabotage.txt" 2>/dev/null; then
  ok "a mixed CONSTRAINT+POLICY baseline proves, both classes sabotaged (rc=0)"
else
  bad "the mixed baseline did not prove both classes (rc=$rc, got: $N2SAB)"
fi
if printf '%s' "$LAST_OUT" | grep -q "names the POLICY facts"; then
  ok "the verdict names the class that DRIFTED, not the alphabetically first one"
else
  bad "the verdict picked the wrong class: $(printf '%s' "$LAST_OUT" | grep -E '^  (ok|FAIL) ' | tr '\n' ' ')"
fi

echo "── O. two statements on one line: only the selected one is cut"
# #472's limit was half closed: the SELECTOR read whole statements, but the WRITER still prefixed
# `-- ` to every LINE of the range, so a selected statement sharing a line with a live one took
# the neighbour out too. The sabotaged FRESH reset then differs from the real one and step 5
# refuses — a false RED on the gate that runs immediately before a staging deploy.
RO="$T/o-pair"
( export MKREPO_GEN1_EXTRA="alter table t add constraint t_pair_check check (a in ('p'));"
  export MKREPO_GEN2_EXTRA="alter table t drop constraint if exists t_pair_check; alter table t add constraint t_keep_check check (a in ('y'));"
  mkrepo "$RO" )
rm -rf "$T/db"; rm -rf "$T/out-o"; mkdir -p "$T/out-o"
run "$RO" "$T/out-o" --prove; rc=$?
OSAB="$(tr '\n' ' ' < "$T/out-o/red/sabotage.txt" 2>/dev/null)"
if [ "$rc" = "0" ]; then
  ok "the live statement sharing the line survives the mutation (rc=0)"
else
  bad "cutting one statement took its line-neighbour with it (rc=$rc, got: $OSAB)"
fi
if grep -qxF "CONSTRAINT:002_catalog.sql:4-4:t_pair_check" "$T/out-o/red/sabotage.txt" 2>/dev/null; then
  ok "and the shared line is still recorded as the statement's range"
else
  bad "sabotage.txt lost the shared-line statement (got: $OSAB)"
fi

echo "── P. a multi-action ALTER: every drop recorded, a mixed one not selectable"
# P1 — `,` ends an identifier. Reading it as part of the name emitted `t_ghost_a,`, which can
# never appear in fresh.txt, so the CI-unreachability test was defeated and the statement was
# selected unconditionally — while the second drop was never recorded at all.
RP1="$T/p-comma"
( export MKREPO_GEN2_EXTRA="alter table t drop constraint if exists t_ghost_a, drop constraint if exists t_ghost_b;"
  mkrepo "$RP1" )
rm -rf "$T/db"; rm -rf "$T/out-p1"; mkdir -p "$T/out-p1"
run "$RP1" "$T/out-p1" --prove; rc=$?
P1SAB="$(tr '\n' ' ' < "$T/out-p1/red/sabotage.txt" 2>/dev/null)"
if [ "$rc" = "0" ] && ! grep -q ',' "$T/out-p1/red/sabotage.txt" 2>/dev/null; then
  ok "a trailing comma is not swallowed into the identifier (rc=0)"
else
  bad "the identifier carried a comma — a name no fingerprint can hold (rc=$rc, got: $P1SAB)"
fi
if grep -qxF "CONSTRAINT:002_catalog.sql:4-4:t_ghost_a" "$T/out-p1/red/sabotage.txt" 2>/dev/null \
   && grep -qxF "CONSTRAINT:002_catalog.sql:4-4:t_ghost_b" "$T/out-p1/red/sabotage.txt" 2>/dev/null; then
  ok "BOTH drops in the statement are recorded, not just the first"
else
  bad "sabotage.txt does not carry both drops under the names Postgres would store (got: $P1SAB)"
fi

# P2 — and a statement that also does something LIVE must not be selectable at all: the mutation
# blanks a statement whole, so cutting this one would delete the ADD from a fresh reset too.
RP2="$T/p-mixed"
( export MKREPO_GEN2_EXTRA="alter table t drop constraint if exists t_mixed_check, add constraint t_mixed_new check (a in ('m'));"
  mkrepo "$RP2" )
rm -rf "$T/db"; rm -rf "$T/out-p2"; mkdir -p "$T/out-p2"
run "$RP2" "$T/out-p2" --prove; rc=$?
P2SAB="$(tr '\n' ' ' < "$T/out-p2/red/sabotage.txt" 2>/dev/null)"
if [ "$rc" = "0" ] && ! grep -q "t_mixed_check" "$T/out-p2/red/sabotage.txt" 2>/dev/null; then
  ok "an ALTER mixing a conditional drop with a live action is not selected (rc=0)"
else
  bad "the mixed statement was selected — blanking it would cut the live ADD (rc=$rc, got: $P2SAB)"
fi

echo "── Q. a backslash inside an E'…' string does not end the literal"
# `''` is the escape in every string, but `\'` continues an E'…' one. Reading it as a terminator
# resumed lexing INSIDE the literal, so an object that exists only in string content was selected:
# absent from fresh.txt so always picked, absent from the red diff so step 6 reports "did NOT go
# red" on a healthy migration. Same false-RED class as the dollar-quote bug in section M.
RQ="$T/q-escape"
( export MKREPO_GEN2_EXTRA="insert into cfg values (E'a\\'; alter table t drop constraint if exists t_ghost');
alter table t drop constraint if exists t_esc_check;"
  mkrepo "$RQ" )
rm -rf "$T/db"; rm -rf "$T/out-q"; mkdir -p "$T/out-q"
run "$RQ" "$T/out-q" --prove; rc=$?
QSAB="$(tr '\n' ' ' < "$T/out-q/red/sabotage.txt" 2>/dev/null)"
if [ "$rc" = "0" ] && ! grep -q "t_ghost" "$T/out-q/red/sabotage.txt" 2>/dev/null \
   && grep -qxF "CONSTRAINT:002_catalog.sql:5-5:t_esc_check" "$T/out-q/red/sabotage.txt" 2>/dev/null; then
  ok "an object named only inside an E'…' literal is not selectable (rc=0)"
else
  bad "the escaped quote ended the literal and string content became SQL (rc=$rc, got: $QSAB)"
fi

echo "── O2. the live statement comes FIRST on the shared line"
# Section O only ever placed the live neighbour AFTER the drop, so a writer that blanks from the
# START OF THE LINE through the statement's `;` passed it — 51/51, zero reds — while destroying
# whatever preceded the selection. That is the same false refusal O exists to catch, mirrored
# (#481 cross-family review): the sabotaged FRESH reset loses the live ADD and step 5 exits 2.
RO2="$T/o2-live-first"
( export MKREPO_GEN1_EXTRA='alter table t add constraint t_pair2_check check (a is not null);'
  export MKREPO_GEN2_EXTRA='alter table t add constraint t_keep2_check check (a is not null); alter table t drop constraint if exists t_pair2_check;'
  mkrepo "$RO2" )
rm -rf "$T/db"; rm -rf "$T/out-o2"; mkdir -p "$T/out-o2"
run "$RO2" "$T/out-o2" --prove; rc=$?
O2SAB="$(tr '\n' ' ' < "$T/out-o2/red/sabotage.txt" 2>/dev/null)"
if [ "$rc" = "0" ] && grep -q "t_pair2_check" "$T/out-o2/red/sabotage.txt" 2>/dev/null; then
  ok "a live statement BEFORE the selected one on the same line survives (rc=0)"
else
  bad "blanking ran back over the live statement ahead of it (rc=$rc, got: $O2SAB)"
fi

echo "── P2. a NAMED dollar-quote tag is an extent too"
# The lexer accepts `$$` and `$tag$`. Only `$$` had a fixture, so deleting the named-tag
# alternative scored 51/51 while reopening the phantom-identifier leak M1 closes. This PR's own
# standard — the one used to defer /* */ to #488 — is that untested behaviour does not count.
RP2="$T/p2-named-tag"
# The body must CONTAIN a conditional drop, or nothing leaks whether the tag is recognised or
# not — my first fixture here had none and scored 53/53 with the branch deleted, i.e. it proved
# nothing. Same shape as the $$ fixture in M1, with a named tag.
# The interior `perform 1;` is load-bearing, not decoration. Without it the drop is bundled into
# `do $fn$ begin alter table …` and the nothing-else guard rejects it anyway, so the fixture
# passes whether the named tag is recognised or not — my first two attempts here did exactly
# that and scored 53/53 with the branch deleted. The `;` terminates the preceding statement so
# the drop stands alone as a CLEAN conditional, which is what leaks when the tag is unknown.
( export MKREPO_GEN2_EXTRA='do $fn$
begin
  perform 1;
  alter table t drop constraint if exists t_ghost_named;
end $fn$;
alter table t drop constraint if exists t_named_check;'
  mkrepo "$RP2" )
rm -rf "$T/db"; rm -rf "$T/out-p2"; mkdir -p "$T/out-p2"
run "$RP2" "$T/out-p2" --prove; rc=$?
P2SAB="$(tr '\n' ' ' < "$T/out-p2/red/sabotage.txt" 2>/dev/null)"
if [ "$rc" = "0" ] && ! grep -q "t_ghost" "$T/out-p2/red/sabotage.txt" 2>/dev/null; then
  ok "a named \$tag\$ body is stepped over like \$\$ (rc=0)"
else
  bad "the named-tag body leaked into the selection (rc=$rc, got: $P2SAB)"
fi

echo "── R. a quoted identifier may contain ;  --  and :"
# Postgres permits any character inside "…". The lexer STEPS OVER a quoted identifier so the
# selector can read its case, which left its content live to the boundary scan: a `;` inside a
# name split a statement that has none, and a `--` truncated it. Either way the real conditional
# is never selected and --prove exits 2 saying there is nothing CI cannot reach — a false refusal
# on the gate before a staging deploy. A `:` was worse: it shifted the evidence record's fields,
# and the verdict read the class out of the wrong column (#481 cross-family review).
RR="$T/r-qident"
  ( export MKREPO_GEN1_EXTRA='alter table t add constraint "semi;colon" check (a is not null);'
  export MKREPO_GEN2_EXTRA='alter table t drop constraint if exists "semi;colon";'
  mkrepo "$RR" )
rm -rf "$T/db"; rm -rf "$T/out-r"; mkdir -p "$T/out-r"
run "$RR" "$T/out-r" --prove; rc=$?
RSAB="$(tr '\n' ' ' < "$T/out-r/red/sabotage.txt" 2>/dev/null)"
if [ "$rc" = "0" ] && grep -qxF 'CONSTRAINT:002_catalog.sql:4-4:semi;colon' "$T/out-r/red/sabotage.txt" 2>/dev/null; then
  ok "a ; inside a quoted identifier does not split the statement (rc=0)"
else
  bad "the quoted identifier's ; split the statement (rc=$rc, got: $RSAB)"
fi

RR2="$T/r-qident-colon"
  ( export MKREPO_GEN1_EXTRA='alter table t add constraint "has:colon" check (a is not null);'
  export MKREPO_GEN2_EXTRA='alter table t drop constraint if exists "has:colon";'
  mkrepo "$RR2" )
rm -rf "$T/db"; rm -rf "$T/out-r2"; mkdir -p "$T/out-r2"
run "$RR2" "$T/out-r2" --prove; rc=$?
R2SAB="$(tr '\n' ' ' < "$T/out-r2/red/sabotage.txt" 2>/dev/null)"
# The class must still be readable as field 1 even though the IDENTIFIER carries a colon.
if [ "$rc" = "0" ] && [ "$(awk -F: 'NR==1 {print $1}' "$T/out-r2/red/sabotage.txt" 2>/dev/null)" = "CONSTRAINT" ]; then
  ok "a : inside a quoted identifier cannot shift the class field (rc=0)"
else
  bad "the colon shifted the evidence fields and the verdict read the wrong column (rc=$rc, got: $R2SAB)"
fi

echo "── S. a failed restore surfaces as a nonzero exit, never rc=0 (#489)"
# The mutex guarded the ATTEMPT, not the OUTCOME: restore_db's `supabase db reset` failing was
# swallowed by `||`, so the check reported rc=0 with the database left mid-reset for the next
# lock holder. STUB_FAIL_RESTORE fails only the SECOND db-reset against the head tree — the FRESH
# build at step [1] must still succeed, or there is no completed run left to prove this against.
rm -rf "$T/db"; rm -rf "$T/out-s1"; mkdir -p "$T/out-s1"
LAST_OUT="$( cd "$R" && PATH="$T/bin:$PATH" FAKE_DB="$T/db" MOS_DB_LOCK_HELD=1 \
    APPLIED_PATH_MIN_PENDING="${MINP:-1}" STUB_FAIL_RESTORE=1 \
    ./scripts/applied-path-check.sh --out "$T/out-s1" 2>&1 )"; rc=$?
if [ "$rc" != "0" ] && printf '%s' "$LAST_OUT" | grep -qF "restore FAILED"; then
  ok "a plain run whose restore fails exits nonzero, not rc=0 (rc=$rc)"
else
  bad "a failed restore did not surface (rc=$rc): $(printf '%s' "$LAST_OUT" | tail -3 | tr '\n' ' ')"
fi

# S2 — the same knob under --prove, the exact shape reported in #489: the proof itself holds
# (green), the restore message prints, and rc must still be nonzero rather than certifying a
# database it never actually put back.
rm -rf "$T/db"; rm -rf "$T/out-s2"; mkdir -p "$T/out-s2"
LAST_OUT="$( cd "$R" && PATH="$T/bin:$PATH" FAKE_DB="$T/db" MOS_DB_LOCK_HELD=1 \
    APPLIED_PATH_MIN_PENDING="${MINP:-1}" STUB_FAIL_RESTORE=1 \
    ./scripts/applied-path-check.sh --out "$T/out-s2" --prove 2>&1 )"; rc=$?
if [ "$rc" != "0" ] && printf '%s' "$LAST_OUT" | grep -qF "restore FAILED"; then
  ok "a GREEN --prove run whose restore fails exits nonzero, not rc=0 (rc=$rc)"
else
  bad "a --prove run with a failed restore did not surface it (rc=$rc): $(printf '%s' "$LAST_OUT" | tail -3 | tr '\n' ' ')"
fi
# S3 — a log tail must never read as success: the closing "✓ proven able to fail" line is gated
# on the restore having actually worked.
if printf '%s' "$LAST_OUT" | grep -qF "✓ proven able to fail"; then
  bad "the --prove success line printed even though the restore failed"
else
  ok "the --prove success line is withheld when the restore fails"
fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
