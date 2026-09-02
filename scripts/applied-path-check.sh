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
# Exit: 0 converges · 1 DRIFT (or the proof did not hold, or the database was not restored) ·
#       2 the check could not run meaningfully.
#
# ── WHAT IT GENERALISES OVER, AND WHAT IT DOES NOT ──────────────────────────────────────────────
# Generalises: any number of pending migrations, any schema, any table, any constraint, any
# activity. The one thing it is told is WHICH COMMIT IS DEPLOYED — no script can infer that —
# and that lives in supabase/applied-path-baseline. #230's baseline cutover is the second
# customer: point --baseline at the pre-squash commit and nothing else changes.
# Does NOT generalise: --prove can only break conditional statements whose target object class the
# fingerprint covers (constraints and policies today). A `do $$ … $$` repair block, a
# `drop function if exists`, or a multi-action ALTER that mixes a conditional drop with a live
# action (`drop constraint if exists c, add constraint c check (…)`) is exercised by the check but
# cannot be selected as the mutation — the last because the mutation blanks a statement whole, so
# breaking it would be visible to a fresh reset. --prove says so and exits 2 rather than quietly
# proving nothing.
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
# RESTORE_FAILED makes a failed reset load-bearing on the script's own exit code (fail closed): a
# caller that sees rc=0 needs it to mean the database really is back to a plain fresh reset, not
# merely that the attempt was made. One attempt only — DB_DIRTY clears whether it succeeded or
# not, so a second call (the explicit --prove call, then the EXIT trap) is a no-op rather than a
# silent retry that could flip a recorded failure back to unnoticed.
RESTORE_FAILED=0
restore_db() {
  [ "$DB_DIRTY" = "1" ] || return 0
  # DB_DIRTY clears immediately, before the reset even runs — not on success. Clearing only on
  # success would let a second call (the explicit --prove call, then the EXIT trap) retry: slow
  # when the first attempt already worked, and if that retry then succeeded it would leave
  # RESTORE_FAILED stuck at 1 from the earlier failure — a false red on a database that ended up
  # fine.
  DB_DIRTY=0
  if [ ! -d "${HEAD_TREE:-/nonexistent}/supabase" ]; then
    # The working tree restore_db resets FROM is gone — an unattemptable restore, which must not
    # read as a completed one.
    echo "   ✗ restore FAILED — the working tree is gone, nothing to reset back to" >&2
    RESTORE_FAILED=1
    return 0
  fi
  echo "   restoring the local database to a plain fresh reset…"
  supabase db reset --local --workdir "$HEAD_TREE" >/dev/null 2>&1 || {
    RESTORE_FAILED=1
    echo "   ✗ restore FAILED — the database is left mid-reset, unusable by the next lock holder. Run: supabase db reset" >&2
  }
}
# The RESTORE_FAILED check runs BEFORE rm -rf, not after: under `set -e` a failing `rm` would
# abort the rest of this trap right there, and an EXIT trap that never calls `exit` itself leaves
# the shell's exit status exactly as an earlier `exit N` left it — so the one command that
# overrides a GREEN result on a failed restore has to run no matter what `rm` does.
trap 'restore_db; [ "$RESTORE_FAILED" = 0 ] || exit 1; rm -rf "$WORK"' EXIT
if [ -n "$OUT" ]; then mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"; else OUT="$WORK/out"; mkdir -p "$OUT"; fi

FP_SQL="$REPO/scripts/lib/applied-path-fingerprint.sql"
[ -f "$FP_SQL" ] || skip "missing $FP_SQL"

# ── Building blocks ─────────────────────────────────────────────────────────────────────────────

# Only the parts of supabase/ that `db reset` and `migration up` read. Deliberately not the whole
# directory: functions/ is irrelevant here and the directory also holds environment material a
# check has no business copying around.
extract_tree() {  # REF DEST
  mkdir -p "$2"
  # `git archive` treats a pathspec matching NOTHING as fatal, so passing the seed glob blindly
  # makes a baseline that predates any seed*.sql exit 2 with "could not extract" — a refusal that
  # reads like a broken harness rather than a fine one (#472). Ask git what exists at that ref
  # first and pass only what does.
  local paths=(supabase/config.toml supabase/migrations)
  local seeds
  seeds="$(git ls-tree -r --name-only "$1" -- supabase 2>/dev/null | grep -E '^supabase/seed[^/]*\.sql$' || true)"
  if [ -n "$seeds" ]; then
    while IFS= read -r f; do [ -n "$f" ] && paths+=("$f"); done <<< "$seeds"
  fi
  git archive "$1" "${paths[@]}" | tar -x -C "$2" \
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

# G2b: the baseline must be an ANCESTOR of HEAD, and must not have crept so far forward that the
# check covers almost nothing (#472). Neither condition can be seen from a green run: a baseline
# advanced one commit behind HEAD still passes G2 with a single pending migration, and reports
# GREEN having proven nearly nothing. Coverage shrinking silently is the failure mode this catches.
git merge-base --is-ancestor "$BASELINE_SHA" HEAD 2>/dev/null \
  || skip "the baseline $BASELINE is not an ancestor of HEAD — it names a commit this branch never had, so 'the deployed database' is a fiction here"
# Coverage shrink. #472 asks for forward baseline movement to be BOUNDED, and an earlier round
# answered with a warning only — an arbitrary floor would refuse to run on a repo that legitimately
# has one pending migration, and the defect named was that coverage shrinks SILENTLY. A
# cross-family review then pointed out the obvious: a warning does not bound anything. A run with
# one pending migration still reports GREEN having proven almost nothing about the chain.
#
# So: it REFUSES by default, and the escape hatch is explicit rather than arbitrary. Setting
# APPLIED_PATH_MIN_PENDING=1 is a caller saying "yes, one migration really is the whole gap" —
# a statement someone made on purpose, which is exactly what the silent version lacked. Exit 2 is
# the established "cannot run meaningfully" code, not a proof failure.
THIN_COVERAGE=""
MIN_PENDING="${APPLIED_PATH_MIN_PENDING:-2}"
if [ "$PENDING_N" -lt "$MIN_PENDING" ]; then
  THIN_COVERAGE="only $PENDING_N migration(s) pending against $BASELINE — this check now covers very little. If the baseline has crept forward, move it back to what is actually deployed."
  printf '  ⚠ %s\n' "$THIN_COVERAGE" >&2
  skip "$THIN_COVERAGE Set APPLIED_PATH_MIN_PENDING=$PENDING_N to run anyway and say so deliberately."
fi

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
  # Seed asymmetry (#472): FRESH is seeded from the working tree's seed*.sql, APPLIED from the
  # BASELINE's, and `migration up` never re-seeds — a real deployed database isn't re-seeded
  # either. So a seed edit to a migration-owned table's CONTENT, with no migration to carry it,
  # produces a diff whose every fact is table CONTENT (CATALOG) and nothing about SCHEMA
  # (CONSTRAINT/RLS/POLICY/FUNCTION). That is not the chain failing to converge — it is a seed
  # edit that needs a migration to actually reach a deployed database, and the generic "does NOT
  # match a fresh one" message sends the reader hunting a migration bug that is not there.
  DRIFT_KINDS="$(grep -oE '^[+-][A-Z]+\|' "$OUT/drift.diff" | sed 's/^.//;s/|$//' | sort -u)"
  if [ "$DRIFT_KINDS" = "CATALOG" ]; then
    echo "✗ SEED-DRIFT — every differing fact is table CONTENT, not schema:" >&2
    echo "  supabase/seed*.sql was edited but no migration carries the change, so the applied path" >&2
    echo "  (not re-seeded after migration up, same as a real deployed database) still has the" >&2
    echo "  BASELINE's row content while a fresh reset has the working tree's. Add a migration" >&2
    echo "  (DML) if a deployed database needs this content too — or if the difference is inert," >&2
    echo "  it is still true drift from the fresh path and this check is right to refuse it." >&2
    head -60 "$OUT/drift.diff" >&2
    echo "  full diff: $OUT/drift.diff" >&2
    exit 1
  fi
  echo "✗ DRIFT — a database migrated from $(git rev-parse --short "$BASELINE_SHA") does NOT match a fresh one:" >&2
  head -60 "$OUT/drift.diff" >&2
  echo "  full diff: $OUT/drift.diff" >&2
  exit 1
fi
rm -f "$OUT/drift.diff"
# ⚠ DO NOT set DB_DIRTY=0 here (review of this PR caught it). "Identical" is identical in the
# FINGERPRINT, which covers migration-owned tables only and excludes volatile columns outright —
# it says nothing about seed data. The database in hand was seeded from the BASELINE commit's
# seed*.sql, so on this very branch a green run would hand back Café plans dated at UTC
# current_date: the pre-#469 state whose whole problem was that nothing on screen explains it.
# The trap restores; leaving it armed costs one reset and removes a class of haunting.
echo "✓ the applied path converges: a migrated database is indistinguishable from a fresh one"

# The base evidence table is written on EVERY run, not only under --prove: the fast lane runs
# plain, and a coverage warning that only reaches the deploy lane's artifact is half a warning.
{
  echo "# Applied-path check (#393)"
  echo
  echo "| | |"
  echo "|---|---|"
  echo "| repo commit | \`$(git rev-parse HEAD)\` |"
  echo "| deployed baseline | \`$BASELINE_SHA\` |"
  echo "| pending migrations | $PENDING_N |"
  echo "| facts compared | $(head_of "$OUT/fresh.txt") |"
  [ -n "$THIN_COVERAGE" ] && echo "| ⚠ coverage | $THIN_COVERAGE |"
  echo
  echo "GREEN — a database migrated from the baseline is indistinguishable from a fresh one."
} > "$OUT/SUMMARY.md"

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
    spans=""
    # STATEMENT-aware, not line-aware (#472). Commenting out one LINE of a statement spanning
    # several leaves an orphaned `alter table X` prefix, which surfaces as "migration up failed"
    # rather than a diagnosis. Perl finds each statement's full CHARACTER extent, blanking `--`
    # comments first so a commented-out conditional is never mistaken for a live one, and folding
    # unquoted identifiers the way Postgres and the fingerprint both do.
    while IFS=: read -r first last soff eoff kind ids; do
      [ -n "$ids" ] || continue
      # Unreachable by CI iff EVERY object the statement drops is absent from a freshly reset
      # database. All-or-nothing, because the mutation blanks the statement WHOLE: if one target
      # of a multi-action ALTER does survive into fresh.txt, blanking would be visible to a fresh
      # reset. Confirmed empirically at step 5 — a wrong pick there stops the run rather than
      # weakening the proof.
      IFS=$'\t' read -r -a IDS <<< "$ids"
      unreachable=1
      for id in "${IDS[@]}"; do
        if grep -qF "|$id|" "$OUT/fresh.txt"; then unreachable=0; fi
      done
      [ "$unreachable" = "1" ] || continue
      spans="${spans}${spans:+,}${soff}-${eoff}"
      # The whole RANGE, not just its first line, and one row per object the statement drops. A
      # reader of red/sabotage.txt has to be able to reconstruct exactly what was commented out:
      # "line 2" for a statement that occupied lines 2-3 is a record of something that did not
      # happen, and so is a single identifier for a statement that dropped two.
      for id in "${IDS[@]}"; do
        # CLASS FIRST, deliberately. Postgres permits a colon inside a quoted identifier, and the
        # verdict reads the class with `awk -F:` — with the identifier ahead of it, `"has:colon"`
        # shifted every field and the run exited 1 saying the red run named no CONSTRAINT (#481
        # cross-family review). The identifier is last, where a colon in it can shift nothing.
        printf '%s:%s:%s-%s:%s\n' "$kind" "$(basename "$f")" "$first" "$last" "$id" >> "$OUT/red/sabotage.txt"
      done
    done < <(perl -0777 -ne '
      my $shadow = $_;
      my @qident;
      my $n = length($shadow);
      # ONE left-to-right lex, the way Postgres reads a file: whichever of a `--` comment, a
      # string literal or a dollar-quoted body STARTS first owns its whole extent, and that
      # extent is blanked to spaces — newlines kept, so line numbers stay true. Without it a
      # `--` inside a literal erases the rest of the line and merges two statements, and a `;`
      # inside a `do $$ … $$` body splits a statement that has none, which yields a phantom
      # identifier that is in neither fresh.txt nor the red diff: a FALSE RED on the gate that
      # runs immediately before a staging deploy (#472). The header above promises a DO block
      # cannot be selected; this is what makes that true.
      my $i = 0;
      while ($i < $n) {
        my $c = substr($shadow, $i, 1);
        my $j;
        if ($c eq "-" && substr($shadow, $i + 1, 1) eq "-") {
          $j = index($shadow, "\n", $i); $j = $n if $j < 0;
        } elsif ($c eq "\x27" || $c eq "\"") {
          # `\x27\x27` doubles the quote in every string; a BACKSLASH escapes it only in an
          # E\x27…\x27 string, which is the one form where standard_conforming_strings does not
          # apply. Reading `\\\x27` as a terminator resumes lexing INSIDE the literal, so a
          # `drop constraint if exists …` written in string content is selected as if it were
          # SQL — an object no database ever had, absent from fresh.txt so always picked and
          # absent from the red diff so step 6 reports "did NOT go red": a false RED on the gate
          # that runs immediately before a staging deploy (#481 review). Same class as the
          # dollar-quote bug above.
          my $esc = ($c eq "\x27" && $i > 0
                     && substr($shadow, $i - 1, 1) =~ /[Ee]/
                     && ($i < 2 || substr($shadow, $i - 2, 1) !~ /[A-Za-z0-9_\$"]/));
          $j = $i + 1;
          while ($j < $n) {
            if ($esc && substr($shadow, $j, 1) eq "\\") { $j += 2; next }
            if (substr($shadow, $j, 1) ne $c) { $j++; next }
            if (substr($shadow, $j + 1, 1) eq $c) { $j += 2; next }
            $j++; last;
          }
          $j = $n if $j > $n;
          # A quoted IDENTIFIER is stepped over in $shadow, never blanked: the selector still has
          # to read its case out of it, because Postgres keeps the case and the fingerprint
          # therefore does too. But its CONTENT must not reach the boundary scan — Postgres
          # permits `;` and `--` inside a quoted name, and either one splits or truncates a
          # statement that has neither (#481 cross-family review). So the extent is recorded and
          # blanked in $split below, which is what the scan reads. Same length, so every offset
          # and line number stays true.
          if ($c eq "\"") { push @qident, [$i, $j]; $i = $j; next }
        } elsif ($c eq "\$" && substr($shadow, $i) =~ /^(\$\$|\$[A-Za-z_][A-Za-z0-9_]*\$)/) {
          my $tag = $1;
          $j = index($shadow, $tag, $i + length($tag));
          $j = ($j < 0) ? $n : $j + length($tag);
        } else { $i++; next }
        my $seg = substr($shadow, $i, $j - $i); $seg =~ s/[^\n]/ /g;
        substr($shadow, $i, $j - $i) = $seg;
        $i = $j;
      }
      my @at; my $ln = 1;
      for my $k (0 .. $n - 1) { $at[$k] = $ln; $ln++ if substr($shadow, $k, 1) eq "\n"; }
      # $split is $shadow with quoted-identifier CONTENT blanked as well: statement boundaries are
      # found in it, identifiers are still extracted from $shadow. Blanking preserves length, so
      # the two agree on every offset.
      my $split = $shadow;
      for my $q (@qident) {
        my $seg = substr($split, $q->[0], $q->[1] - $q->[0]); $seg =~ s/[^\n]/ /g;
        substr($split, $q->[0], $q->[1] - $q->[0]) = $seg;
      }
      my @stmts; my $start = 0;
      while ($split =~ /;/g) {
        my $e = pos($split) - 1; push @stmts, [$start, $e]; $start = $e + 1;
      }
      # A file whose LAST statement carries no terminator is still a statement — psql runs it.
      # Without this the tail is invisible, so a conditional drop written without a trailing
      # semicolon could never be selected and the proof would silently cover less than it says.
      if ($start < $n && substr($split, $start) =~ /\S/) {
        my $e = $n - 1; $e-- while $e > $start && substr($split, $e, 1) =~ /\s/;
        push @stmts, [$start, $e];
      }
      # A `,` ENDS an identifier: it separates the actions of a multi-action ALTER. Reading it as
      # part of the name emitted `t_cat_fkey,` — a phantom that can never appear in fresh.txt, so
      # the CI-unreachability test passed vacuously and the statement was selected unconditionally
      # (#481 review).
      my $OBJ  = qr/(?:(?:"[^"]+"|\w+)\s*\.\s*)?(?:"[^"]+"|\w+)/;
      my $COND = qr/drop\s+(constraint|policy)\s+if\s+exists\s+("[^"]+"|[^\s;,]+)/i;
      for my $s (@stmts) {
        my ($st, $end) = @$s;
        my $stmt = substr($shadow, $st, $end - $st + 1);
        # EVERY conditional drop in the statement, not merely the first: one ALTER can drop two
        # constraints, and recording one of them describes a mutation smaller than the one made.
        my (@ids, $kind);
        while ($stmt =~ /$COND/g) {
          my ($k, $raw) = (uc($1), $2);
          my $quoted = ($raw =~ /^"/);
          $raw =~ s/^"//; $raw =~ s/"$//; $raw = lc($raw) unless $quoted;
          $kind = $k; push @ids, $raw;
        }
        next unless @ids;
        # …and the statement must do NOTHING ELSE, because the mutation blanks it whole.
        # `alter table t drop constraint if exists c, add constraint c check (…);` is the
        # idiomatic repair shape; blanking it would delete the ADD from a FRESH reset too, which
        # step 5 reports as "the mutation changed the FRESH database" — a refusal on the gate that
        # runs before a staging deploy. Not selectable is the safe answer, the same answer the
        # header already gives for a `do $$ … $$` block.
        my $rest = $stmt;
        $rest =~ s/$COND//g;
        $rest =~ s/^\s*alter\s+table\s+(?:only\s+)?$OBJ//i;   # the ALTER TABLE prefix
        $rest =~ s/\bon\s+$OBJ//i;                            # DROP POLICY … ON t
        $rest =~ s/[\s,;]//g;
        next if length $rest;
        my $fs = $st; $fs++ while $fs < $end && substr($shadow, $fs, 1) =~ /\s/;
        # Character offsets travel alongside the line numbers: the line range is for the human
        # reading red/sabotage.txt, the offsets are what the mutation actually cuts. Identifiers
        # come last so a `:` inside a "Quoted" one cannot shift the class field.
        print join(":", $at[$fs], $at[$end], $fs, $end, $kind, join("\t", @ids)), "\n";
      }
    ' "$f" || true)
    [ -n "$spans" ] || continue
    # Blank each selected statement over its EXACT character extent — spaces for everything but
    # newlines, so every line number in red/sabotage.txt stays true. NOT a `-- ` prefix on every
    # line of the range (#481 review): two statements can share a line, and commenting that line
    # out takes the neighbour with it, so the sabotaged FRESH reset differs from the real one and
    # step 5 refuses — a false RED on the gate that runs immediately before a staging deploy, the
    # same shape as the dollar-quote and string-literal bugs. Blanking also introduces no comment
    # syntax, so nothing inside the statement's own text can terminate the mutation early.
    SPANS="$spans" perl -0777 -i -pe '
      for my $r (map { [ split /-/ ] } split /,/, $ENV{SPANS}) {
        my $len = $r->[1] - $r->[0] + 1;
        my $seg = substr($_, $r->[0], $len);
        $seg =~ s/[^\n]/ /g;
        substr($_, $r->[0], $len) = $seg;
      }
    ' "$f"
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
# Assert against the class actually sabotaged, not a fixed one: a baseline whose pending
# migrations carry only policy drops produces a correct RED naming POLICY rows, and a hardcoded
# CONSTRAINT check would call that a failure — a false red on the gate before a staging deploy.
# Field 1, not field 4: the class leads the record so a colon inside a quoted identifier cannot
# shift it. NF>=4 still holds — file, range and identifier follow.
# ANY sabotaged class that drifted satisfies this, not the alphabetically-first one. `sort -u |
# head -1` picked CONSTRAINT over POLICY every time, so a batch mixing a no-op ghost constraint
# drop with a load-bearing policy drop refused a proof that actually held: drift named the POLICY,
# the verdict demanded a CONSTRAINT, and the gate before a staging deploy exited 1 (#481
# cross-family review). The `:-CONSTRAINT` fallback went with it — SAB_N > 0 is enforced above and
# every row leads with its class, so it was dead code, and it is the same fallback that once made
# the adaptive-verdict test vacuous.
SABOTAGED_KINDS="$(awk -F: 'NF>=4 {print $1}' "$OUT/red/sabotage.txt" | sort -u)"
DRIFTED_KIND=""
for _k in $SABOTAGED_KINDS; do
  if grep -qE "^[+-]${_k}\|" "$OUT/red/drift.diff" 2>/dev/null; then DRIFTED_KIND="$_k"; break; fi
done
SABOTAGED_KIND="$(printf '%s' "$SABOTAGED_KINDS" | tr '\n' '/')"; SABOTAGED_KIND="${SABOTAGED_KIND%/}"
if [ -n "$DRIFTED_KIND" ]; then
  note "ok" "the red run names the ${DRIFTED_KIND} facts that survived"
else
  note "FAIL" "the red run reported drift without naming a ${SABOTAGED_KIND}"; FAILED=1
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
  # The review's point was that thin coverage shrinks SILENTLY — so it goes in the artifact a
  # reader downloads, not only in a stderr line nobody keeps.
  [ -n "$THIN_COVERAGE" ] && echo "| ⚠ coverage | $THIN_COVERAGE |"
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
# Gated on RESTORE_FAILED: the trap below still turns this into a nonzero exit, but a log tail
# ending on "✓ proven able to fail" must never be readable as success when the restore wasn't one.
if [ "$RESTORE_FAILED" = 0 ]; then
  echo "✓ proven able to fail: green on the real migrations, red when the conditional is broken,"
  echo "  and a fresh reset cannot tell the difference."
fi
