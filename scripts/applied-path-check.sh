#!/usr/bin/env bash
#
# applied-path-check.sh — run the branch of a migration that only a DEPLOYED database reaches (#393).
#
# ── THE HOLE ────────────────────────────────────────────────────────────────────────────────────
# CI always starts from nothing: `supabase db reset`, then the suite. So a migration written to be
# conditional on prior state — `drop constraint if exists`, `drop policy if exists`, a `do $$ … $$`
# repair block — has a branch CI structurally cannot reach. The only environments that run it are
# staging and production, where being wrong is expensive.
#
# ── THE PROPERTY ────────────────────────────────────────────────────────────────────────────────
#   A database built from the DEPLOYED baseline and then migrated forward is INDISTINGUISHABLE
#   from a freshly reset one.
# Not "the migration ran without error" — indistinguishable, in the facts that decide behaviour:
# CHECK / primary-key / unique / foreign-key constraints, RLS posture, policies, function
# signatures, and the contents of every migration-owned catalog table, across every business
# schema. scripts/lib/applied-path-fingerprint.sql owns that list and derives every set from the
# catalog: no table, schema, constraint or migration is named anywhere in this check.
#
# ── HOW THE TWO DATABASES ARE BUILT ─────────────────────────────────────────────────────────────
#   FRESH     `supabase db reset` on the working tree. Exactly what CI runs.
#   APPLIED   `supabase db reset` on the supabase/ tree AS IT WAS AT THE BASELINE COMMIT — a real
#             pre-migration schema, seeded, carrying the rows a deployed database carries — then
#             `supabase migration up` on the working tree, which is the real migration chain and
#             applies exactly the versions the baseline has not seen.
# Two builds, one stack, run one after the other under the shared DB lock.
#
# Why the baseline must come from git and not from `db reset --version`: the migrations that built
# the deployed schema were EDITED afterwards — that is why the fresh path no longer produces the
# constraints the conditional block drops. Replaying today's files up to yesterday's version
# reproduces today's schema, not the deployed one, and the check would be comparing a database
# with itself. That is exactly how the first attempt at this harness (PR #465) became a check that
# could not fail, which is why guard G4 refuses to continue unless the pre-migration database is
# demonstrably different from a fresh one.
#
# ── USAGE ───────────────────────────────────────────────────────────────────────────────────────
#   scripts/applied-path-check.sh                  # does the applied path converge?
#   scripts/applied-path-check.sh --prove          # ALSO prove this check can fail (AC-3)
#   scripts/applied-path-check.sh --out DIR        # keep fingerprints, diffs and SUMMARY.md in DIR
#   scripts/applied-path-check.sh --baseline REF   # override the deployed baseline
#
#   MOS_APPLIED_PATH_BASELINE  same as --baseline
#   MOS_DB_CONTAINER           override the stack's Postgres container name
#
# Exit: 0 converges · 1 DRIFT (or the proof did not hold) · 2 the check could not run meaningfully.
#
# ── WHAT IT GENERALISES OVER, AND WHAT IT DOES NOT ──────────────────────────────────────────────
# Generalises: any number of pending migrations, any schema, any table, any constraint, any
# activity. The one thing it is told is WHICH COMMIT IS DEPLOYED — no script can infer that —
# and that lives in supabase/applied-path-baseline. #230's baseline cutover is the second
# customer: point --baseline at the pre-squash commit and nothing else changes.
# Does NOT generalise: --prove can only break conditional statements whose target object class the
# fingerprint covers (constraints and policies today). A `do $$ … $$` repair block or a
# `drop function if exists` is exercised by the check but cannot be selected as the mutation, and
# --prove says so and exits 2 rather than quietly proving nothing.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

# The whole run is one lock hold: up to four resets and two migration chains. A sibling worktree
# resetting in the middle would produce both false REDs and false GREENs.
if [ "${MOS_DB_LOCK_HELD:-}" != "1" ]; then
  exec "$REPO/scripts/with-db-lock.sh" "$0" "$@"
fi

BASELINE="${MOS_APPLIED_PATH_BASELINE:-}"
OUT=""
PROVE=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --baseline) BASELINE="${2:?--baseline needs a git ref}"; shift 2 ;;
    --out)      OUT="${2:?--out needs a directory}"; shift 2 ;;
    --prove)    PROVE=1; shift ;;
    -h|--help)  sed -n '2,60p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

skip() { echo "✗ CANNOT RUN MEANINGFULLY: $*" >&2; exit 2; }
fail() { echo "✗ $*" >&2; exit 1; }
say()  { echo "   $*"; }
head_of() { wc -l < "$1" | tr -d ' '; }

# ── The stack ───────────────────────────────────────────────────────────────────────────────────
project_id="$(sed -n 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' \
              supabase/config.toml | head -1)"
[ -n "$project_id" ] || skip "supabase/config.toml has no project_id"
CONTAINER="${MOS_DB_CONTAINER:-supabase_db_${project_id}}"
psql_db() { docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || skip "the local stack is not running (container $CONTAINER). Run: supabase start"

# ── The baseline: the commit whose supabase/ tree matches what is DEPLOYED ──────────────────────
if [ -z "$BASELINE" ]; then
  BF="supabase/applied-path-baseline"
  [ -f "$BF" ] || skip "no baseline: pass --baseline REF or create $BF"
  BASELINE="$(grep -v '^[[:space:]]*#' "$BF" | tr -d '[:space:]' | grep . | head -1 || true)"
  [ -n "$BASELINE" ] || skip "$BF names no ref"
fi
BASELINE_SHA="$(git rev-parse --verify "${BASELINE}^{commit}" 2>/dev/null || true)"
[ -n "$BASELINE_SHA" ] || skip "baseline ref '$BASELINE' is not in this clone — CI needs fetch-depth: 0"

# ── Where the evidence lands ────────────────────────────────────────────────────────────────────
# mktemp, never a fixed /tmp path: two runs in parallel must not read each other's fingerprints.
WORK="$(mktemp -d "${TMPDIR:-/tmp}/applied-path.XXXXXXXX")"
# The local stack is shared. This check deliberately leaves it on a pre-migration — and, under
# --prove, a deliberately broken — schema partway through, so it must never hand it back that
# way: not to the e2e job that runs after it in CI, and not to whoever is working in the next
# terminal. DB_DIRTY tracks whether the database still needs putting back.
DB_DIRTY=0
restore_db() {
  [ "$DB_DIRTY" = "1" ] || return 0
  [ -d "${HEAD_TREE:-/nonexistent}/supabase" ] || return 0
  echo "   restoring the local database to a plain fresh reset…"
  supabase db reset --local --workdir "$HEAD_TREE" >/dev/null 2>&1 || \
    echo "   ⚠ could not restore the database — run: supabase db reset" >&2
  DB_DIRTY=0
}
trap 'restore_db; rm -rf "$WORK"' EXIT
if [ -n "$OUT" ]; then mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"; else OUT="$WORK/out"; mkdir -p "$OUT"; fi

FP_SQL="$REPO/scripts/lib/applied-path-fingerprint.sql"
[ -f "$FP_SQL" ] || skip "missing $FP_SQL"

# ── Building blocks ─────────────────────────────────────────────────────────────────────────────

# Only the parts of supabase/ that `db reset` and `migration up` read. Deliberately not the whole
# directory: functions/ is irrelevant here and the directory also holds environment material a
# check has no business copying around.
extract_tree() {  # REF DEST
  mkdir -p "$2"
  git archive "$1" supabase/config.toml supabase/migrations 'supabase/seed*.sql' | tar -x -C "$2" \
    || skip "could not extract supabase/ at $1"
  [ -d "$2/supabase/migrations" ] || skip "$1 has no supabase/migrations"
}

copy_worktree() {  # DEST — the working tree, uncommitted edits included
  mkdir -p "$1/supabase"
  cp supabase/config.toml "$1/supabase/"
  cp -R supabase/migrations "$1/supabase/migrations"
  local f; for f in supabase/seed*.sql; do [ -e "$f" ] && cp "$f" "$1/supabase/"; done
  return 0
}

versions_in() { ls "$1/supabase/migrations" | sed -n 's/^\([0-9][0-9]*\)_.*\.sql$/\1/p' | sort; }

db_reset() {      # TREE LOG
  supabase db reset --local --workdir "$1" >"$2" 2>&1 || { tail -30 "$2" >&2; fail "db reset failed in $1"; }
}
migration_up() {  # TREE LOG
  supabase migration up --local --workdir "$1" >"$2" 2>&1 || { tail -30 "$2" >&2; fail "migration up failed from $1"; }
}

fingerprint() {  # OUTFILE
  psql_db -At -F'|' -f - < "$FP_SQL" > "$1" || skip "the fingerprint query failed — see $1"
  # G6: a fingerprint that came back empty, or that lost a whole fact class, would make any two
  # databases compare equal. That is a broken check, not a passing one.
  local n; n=$(head_of "$1")
  [ "$n" -ge 20 ] || skip "the fingerprint has only $n rows — it is not describing a database"
  local k; for k in CONSTRAINT RLS POLICY FUNCTION CATALOG; do
    grep -q "^$k|" "$1" || skip "the fingerprint carries no $k rows — coverage has silently collapsed"
  done
}

# ── Setup ───────────────────────────────────────────────────────────────────────────────────────
HEAD_TREE="$WORK/head"; BASE_TREE="$WORK/base"
copy_worktree "$HEAD_TREE"
extract_tree "$BASELINE_SHA" "$BASE_TREE"

# G3: the baseline's config must drive the SAME stack, or "fresh" and "applied" are two different
# databases in the trivial sense and nothing is being compared.
for key in project_id port; do
  a="$(sed -n "s/^[[:space:]]*$key[[:space:]]*=[[:space:]]*\(.*\)/\1/p" "$BASE_TREE/supabase/config.toml" | head -1)"
  b="$(sed -n "s/^[[:space:]]*$key[[:space:]]*=[[:space:]]*\(.*\)/\1/p" "$HEAD_TREE/supabase/config.toml" | head -1)"
  [ "$a" = "$b" ] || skip "the baseline's config.toml disagrees on $key ($a vs $b) — it would target a different stack"
done

# G2: something must actually be pending, or the applied path IS the fresh path.
comm -13 <(versions_in "$BASE_TREE") <(versions_in "$HEAD_TREE") > "$OUT/pending-versions.txt"
PENDING_N=$(grep -c . "$OUT/pending-versions.txt" || true)
[ "$PENDING_N" -gt 0 ] || skip "no migration is pending against $BASELINE — move supabase/applied-path-baseline back to a commit that is actually deployed"

echo "── applied-path check"
say "repo      $(git rev-parse --short HEAD)"
say "baseline  $(git rev-parse --short "$BASELINE_SHA")  ($PENDING_N migration(s) pending)"

# ── 1. FRESH — what CI always builds ────────────────────────────────────────────────────────────
echo "── [1] FRESH — supabase db reset on the working tree"
db_reset "$HEAD_TREE" "$OUT/reset-fresh.log"
fingerprint "$OUT/fresh.txt"
say "$(head_of "$OUT/fresh.txt") facts"

# ── 2. DEPLOYED — the pre-migration database, seeded ────────────────────────────────────────────
echo "── [2] DEPLOYED — supabase db reset on the baseline tree (a real pre-migration database)"
DB_DIRTY=1
db_reset "$BASE_TREE" "$OUT/reset-baseline.log"
fingerprint "$OUT/pre.txt"
say "$(head_of "$OUT/pre.txt") facts"

# G4 — THE GUARD THE FIRST ATTEMPT DID NOT HAVE. If the pre-migration database already looks like
# a fresh one, everything after this is a database compared with itself.
diff -u "$OUT/fresh.txt" "$OUT/pre.txt" > "$OUT/pre-vs-fresh.diff" || true
PRE_DELTA=$(grep -c '^[+-][^+-]' "$OUT/pre-vs-fresh.diff" || true)
[ "$PRE_DELTA" -gt 0 ] || skip "the baseline database is already identical to a fresh one — there is no applied path here to exercise, and comparing them would pass on air"
say "differs from fresh in $PRE_DELTA facts — this is a genuine pre-migration database"

# ── 3. MIGRATE — the real chain, over that database ─────────────────────────────────────────────
echo "── [3] MIGRATE — supabase migration up, the real chain"
migration_up "$HEAD_TREE" "$OUT/migrate.log"
# G5: the chain must have recorded exactly the versions that were pending.
psql_db -At -c 'select version from supabase_migrations.schema_migrations order by version' > "$OUT/applied-versions.txt"
MISSING="$(comm -23 "$OUT/pending-versions.txt" <(sort "$OUT/applied-versions.txt") | tr '\n' ' ')"
[ -z "${MISSING// /}" ] || skip "the chain did not record these pending versions: $MISSING"
fingerprint "$OUT/migrated.txt"
say "$(head_of "$OUT/migrated.txt") facts"

GREEN_RC=0
diff -u "$OUT/fresh.txt" "$OUT/migrated.txt" > "$OUT/drift.diff" || GREEN_RC=1
if [ "$GREEN_RC" -ne 0 ]; then
  echo "✗ DRIFT — a database migrated from $(git rev-parse --short "$BASELINE_SHA") does NOT match a fresh one:" >&2
  head -60 "$OUT/drift.diff" >&2
  echo "  full diff: $OUT/drift.diff" >&2
  exit 1
fi
rm -f "$OUT/drift.diff"
DB_DIRTY=0   # proven identical to a fresh reset — nothing to put back
echo "✓ the applied path converges: a migrated database is indistinguishable from a fresh one"

if [ "$PROVE" -eq 0 ]; then
  say "evidence: $OUT"
  exit 0
fi

# ── 4. PROVE IT CAN FAIL (AC-3) ─────────────────────────────────────────────────────────────────
# Break the conditional repair statements that a fresh reset can never reach, then show that the
# fresh half does not notice and the applied half does.
echo
echo "── [4] PROVE — select the statements CI structurally cannot reach"
mkdir -p "$OUT/red"
SAB_TREE="$WORK/sabotaged"; copy_worktree "$SAB_TREE"
: > "$OUT/red/sabotage.txt"
while read -r v; do
  [ -n "$v" ] || continue
  for f in "$SAB_TREE"/supabase/migrations/"$v"_*.sql; do
    [ -e "$f" ] || continue
    lines=""
    while IFS=: read -r no text; do
      # The object this statement drops. Only classes the fingerprint covers can be judged.
      ident="$(printf '%s' "$text" | sed -n 's/.*[Ii][Ff][[:space:]]*[Ee][Xx][Ii][Ss][Tt][Ss][[:space:]]*\([^ ;]*\).*/\1/p')"
      [ -n "$ident" ] || continue
      # Unreachable by CI iff the object is absent from a freshly reset database. Confirmed
      # empirically at step 5 — a wrong pick there stops the run rather than weakening the proof.
      grep -qF "|$ident|" "$OUT/fresh.txt" && continue
      lines="${lines}${lines:+,}$no"
      printf '%s:%s:%s\n' "$(basename "$f")" "$no" "$ident" >> "$OUT/red/sabotage.txt"
    done < <(grep -nE 'drop[[:space:]]+(constraint|policy)[[:space:]]+if[[:space:]]+exists' "$f" || true)
    [ -n "$lines" ] || continue
    LINES="$lines" perl -i -pe 'BEGIN{%L = map { $_ => 1 } split /,/, $ENV{LINES}} $_ = "-- [applied-path sabotage] " . $_ if $L{$.}' "$f"
  done
done < "$OUT/pending-versions.txt"
SAB_N=$(grep -c . "$OUT/red/sabotage.txt" || true)
[ "$SAB_N" -gt 0 ] || skip "no CI-unreachable conditional statement among the $PENDING_N pending migrations — AC-3 cannot be demonstrated against this baseline. Either the baseline is stale, or these migrations carry no branch CI misses."
say "$SAB_N statement(s) commented out (see $OUT/red/sabotage.txt)"

echo "── [5] the break must be INVISIBLE to a fresh reset"
DB_DIRTY=1
db_reset "$SAB_TREE" "$OUT/red/reset-fresh.log"
fingerprint "$OUT/red/fresh.txt"
if ! diff -u "$OUT/fresh.txt" "$OUT/red/fresh.txt" > "$OUT/red/fresh-vs-fresh.diff"; then
  head -30 "$OUT/red/fresh-vs-fresh.diff" >&2
  skip "the mutation changed the FRESH database too, so it is not a CI-unreachable branch and the contrast would prove nothing. Exclude that statement."
fi
rm -f "$OUT/red/fresh-vs-fresh.diff"
say "byte-identical to the un-mutated fresh reset — CI cannot see this break"

echo "── [6] the same break must be FATAL to the applied path"
db_reset "$BASE_TREE" "$OUT/red/reset-baseline.log"
migration_up "$SAB_TREE" "$OUT/red/migrate.log"
fingerprint "$OUT/red/migrated.txt"
RED_RC=0
diff -u "$OUT/red/fresh.txt" "$OUT/red/migrated.txt" > "$OUT/red/drift.diff" || RED_RC=1

FAILED=0
note() { printf '  %-5s %s\n' "$1" "$2"; }
echo
[ "$RED_RC" -eq 1 ] && note "ok" "with the conditional broken, the applied path goes RED" \
  || { note "FAIL" "the broken conditional did NOT go red — this check cannot fail"; FAILED=1; }
if grep -q '^[+-]CONSTRAINT|' "$OUT/red/drift.diff" 2>/dev/null; then
  note "ok" "the red run names the facts that survived"
else
  note "FAIL" "the red run reported drift without naming a constraint"; FAILED=1
fi
note "ok" "the green run converged and the mutation was invisible to a fresh reset"

{
  echo "# Applied-path check — green/red evidence (#393, AC-3)"
  echo
  echo "| | |"
  echo "|---|---|"
  echo "| repo commit | \`$(git rev-parse HEAD)\` |"
  echo "| deployed baseline | \`$BASELINE_SHA\` |"
  echo "| pending migrations | $PENDING_N |"
  echo "| facts compared | $(head_of "$OUT/fresh.txt") |"
  echo
  echo "## GREEN — the real migrations"
  echo
  echo "A database reset onto the baseline tree differed from a fresh one in **$PRE_DELTA facts**"
  echo "(\`pre-vs-fresh.diff\`) — it is a genuine pre-migration database, not a fresh one relabelled."
  echo "After \`supabase migration up\`, \`migrated.txt\` and \`fresh.txt\` are identical."
  echo
  echo "## RED — the same run with the CI-unreachable statements commented out"
  echo
  echo "Broken (\`red/sabotage.txt\`):"
  echo
  echo '```'
  cat "$OUT/red/sabotage.txt"
  echo '```'
  echo
  echo "\`red/fresh.txt\` is byte-identical to \`fresh.txt\`: **a plain fresh reset cannot see this**."
  echo "The applied path can — \`red/drift.diff\`:"
  echo
  echo '```diff'
  head -40 "$OUT/red/drift.diff" 2>/dev/null || echo "(no drift — THIS IS THE FAILURE)"
  echo '```'
  echo
  echo "## Reproduce"
  echo
  echo '```'
  echo "supabase start"
  echo "scripts/applied-path-check.sh --prove --out artifacts/applied-path"
  echo '```'
} > "$OUT/SUMMARY.md"

echo
restore_db
say "evidence: $OUT (fresh.txt, pre.txt, migrated.txt, red/, SUMMARY.md)"
[ "$FAILED" -eq 0 ] || fail "the proof did not hold"
echo "✓ proven able to fail: green on the real migrations, red when the conditional is broken,"
echo "  and a fresh reset cannot tell the difference."
