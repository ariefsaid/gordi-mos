#!/usr/bin/env bash
# pre-merge-check.sh — machine-enforced review gate for Gordi MOS
#
# Usage: bash scripts/pre-merge-check.sh
# Run this before any merge-to-main. It will exit 1 if required reviews
# are missing or have a failing/incomplete verdict. Fix the ledger, then
# re-run until you see exit 0.
#
# Ledger location: docs/reviews/<branch-with-slashes->dashes>.md
# Verdict format (one per review):  - <review>: <VERDICT> — <reviewer/notes>
# Accepted verdicts: PASS  SHIP  FIX-THEN-SHIP
# Blocking verdicts: REWORK  FAIL  STILL-FAILING  (or blank/missing)
#
# NETWORK: this script fetches origin/main, because a stale baseline is the failure mode it exists
# to catch. Env overrides (both are logged in the report; neither is silent):
#   ALLOW_STALE_BASE=1    proceed with a possibly-stale baseline (offline / sandbox).
#   PRE_MERGE_NO_FETCH=1  skip the fetch. Requires ALLOW_STALE_BASE=1 as well — on its own it fails.
#
# Tests: scripts/tests/pre-merge-check.test.sh. Add a case for every change here; this gate has
# failed OPEN four times, each time in a path nobody had exercised.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# ── 1. Determine branch + merge base ────────────────────────────────────────
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == "main" ]]; then
  echo "ERROR: You are on main. Run this from the feature branch before merging." >&2
  exit 1
fi

# Baseline must be the REMOTE main. This block has now failed open TWICE, both times by trusting a
# ref that had silently moved, so it is deliberately paranoid:
#   1. 2026-07-30 — used local `main`, which sat a whole promotion behind origin/main. The staleness
#      check below passed because the ledger cited exactly that stale SHA.
#   2. 2026-07-30 (review of the fix for #1) — fetched with `|| true`, so an unreachable remote left
#      a stale origin/main in place and the report printed `base : origin/main @ <old>` with an
#      authoritative label, no warning, exit 0, over unreviewed commits. Reproduced, not theorised.
# A gate whose most common failure (laptop offline) makes it pass is worse than no gate, because it
# launders "I could not check" into "I checked and it is fine". So: no soft paths. Every way of NOT
# knowing the true baseline is exit 1, and the only bypass is loud, explicit and named.
# ALLOW_STALE_BASE=1 exists for a genuine sandbox/offline run — it does not skip the check, it only
# permits a possibly-stale ref, and the report says so on its face.
ALLOW_STALE="${ALLOW_STALE_BASE:-0}"
FETCH_OK=true
if [[ "${PRE_MERGE_NO_FETCH:-0}" == "1" ]]; then
  # Bypass #3 (F-2). This used to set a value that was neither "true" nor "false", so the guard
  # below never fired and this became a SILENT bypass — quieter than ALLOW_STALE_BASE, the one
  # that is supposed to be the loud escape hatch. It now falls into the same guard.
  FETCH_OK=skipped
else
  # `git fetch origin main` updates refs/remotes/origin/main only OPPORTUNISTICALLY — when the
  # configured remote.origin.fetch refspec happens to cover it. On a fork, a `git remote add -t`
  # remote, or a CI checkout with a narrowed refspec, the fetch EXITS 0 while the tracking ref
  # stays frozen: success reported, baseline unmoved, gate passes over unreviewed work (F-1,
  # reproduced). Fourth fail-open in this block. Name the destination explicitly so "fetch
  # succeeded" and "origin/main is current" cannot come apart.
  if git fetch --quiet --no-tags origin '+refs/heads/main:refs/remotes/origin/main' 2>/dev/null; then
    # Belt and braces: even an explicit refspec should be checked, not trusted.
    if ! git rev-parse --verify --quiet FETCH_HEAD >/dev/null \
       || [[ "$(git rev-parse origin/main 2>/dev/null)" != "$(git rev-parse FETCH_HEAD 2>/dev/null)" ]]; then
      FETCH_OK=false
    fi
  else
    FETCH_OK=false
  fi
fi

if [[ "$FETCH_OK" != "true" && "$ALLOW_STALE" != "1" ]]; then
  echo ""
  if [[ "$FETCH_OK" == "skipped" ]]; then
    echo "FAIL: PRE_MERGE_NO_FETCH=1 skipped the baseline refresh."
    echo "  Skipping the fetch means the baseline may predate the current main — the exact"
    echo "  staleness this gate exists to catch. It is not a free pass on its own."
    echo ""
    echo "  If that is genuinely what you want, say so explicitly:"
    echo "    PRE_MERGE_NO_FETCH=1 ALLOW_STALE_BASE=1 bash $0"
  else
    echo "FAIL: could not refresh origin/main — the baseline cannot be trusted."
    echo "  Either the fetch failed, or it succeeded without moving origin/main (a narrowed"
    echo "  remote refspec). Any ref present locally may predate the current main."
    echo ""
    echo "  Fix: restore network access, or widen the refspec:"
    echo "    git config --add remote.origin.fetch '+refs/heads/main:refs/remotes/origin/main'"
    echo "  Override (only if you fetched by hand just now): ALLOW_STALE_BASE=1 bash $0"
  fi
  echo ""
  exit 1
fi

if git rev-parse --verify --quiet origin/main >/dev/null; then
  BASE_REF="origin/main"
elif [[ "$ALLOW_STALE" == "1" ]]; then
  BASE_REF="main"
else
  echo ""
  echo "FAIL: no origin/main ref to measure against."
  echo "  A fork with a differently-named remote, or a --single-branch clone."
  echo "  Falling back to local 'main' would silently restore the bug this check fixes."
  echo ""
  echo "  Fix: git remote add origin <url> && git fetch origin main"
  echo "  Override: ALLOW_STALE_BASE=1 bash $0"
  echo ""
  exit 1
fi

# Unguarded, this dies as a bare `fatal: Not a valid object name` with exit 128 — which any wrapper
# testing for 1 mishandles, and which tells the operator nothing.
if ! MERGE_BASE="$(git merge-base "$BASE_REF" HEAD 2>/dev/null)"; then
  echo ""
  echo "FAIL: no merge base between '$BASE_REF' and HEAD."
  echo "  Shallow clone?  git fetch --unshallow"
  echo "  Different default branch?  git remote show origin"
  echo ""
  exit 1
fi

# ── 2. Compute ledger path (slashes → dashes) ────────────────────────────────
LEDGER_SLUG="${BRANCH//\//-}"
LEDGER="docs/reviews/${LEDGER_SLUG}.md"

# ── 3. Fail if ledger is missing ─────────────────────────────────────────────
if [[ ! -f "$LEDGER" ]]; then
  echo ""
  echo "FAIL: Review ledger missing."
  echo "  Expected: $LEDGER"
  echo ""
  echo "  Create it from docs/reviews/TEMPLATE.md, fill verdicts for all"
  echo "  required reviews, then re-run this script."
  echo ""
  exit 1
fi

# ── 3b. Fail if the ledger describes a window that already closed ────────────
# A feature branch is short-lived: its ledger is written once, for one window.
# A long-lived branch (dev) keeps the SAME ledger file across many promotions, so
# yesterday's verdicts silently satisfy today's gate. That happened on 2026-07-30:
# docs/reviews/dev.md still described the 2026-07-08 promotion (main @ 669ee0a,
# already merged), and this script exited 0 over 30 unreviewed commits — because
# steps 3-6 only ask "do verdict lines exist?", never "for WHICH diff?".
# The ledger must therefore cite the current merge-base, which changes every
# promotion. Scoped to long-lived branches; feature ledgers are unaffected.
LONG_LIVED_BRANCHES=("dev" "staging")
for b in "${LONG_LIVED_BRANCHES[@]}"; do
  if [[ "$BRANCH" == "$b" ]]; then
    # --short=7 pinned: `--short` alone is length-auto and honours core.abbrev, so a repo
    # configured to 12 emits a longer SHA than the ledger cites and blocks every promotion.
    BASE_SHORT="$(git rev-parse --short=7 "$MERGE_BASE")"

    # Match the SCOPE LINE only, not the whole file. A whole-file grep is a false-PASS surface
    # here: this ledger deliberately retains a provenance section listing superseded SHAs, and
    # any pasted `git log` block would satisfy the check while the verdicts stayed stale.
    # The error text already promised Scope-line semantics; now the code agrees with it.
    SCOPE_LINE="$(grep -m1 -iE '^[[:space:]]*[-*]?[[:space:]]*(\*\*)?Scope' "$LEDGER" || true)"
    if ! printf '%s' "$SCOPE_LINE" | grep -qF "$BASE_SHORT"; then
      WINDOW_COMMITS="$(git rev-list --count "${MERGE_BASE}..HEAD")"
      WINDOW_FILES="$(git diff --name-only "${MERGE_BASE}..HEAD" | wc -l | tr -d ' ')"
      echo ""
      echo "FAIL: Review ledger is stale — its Scope line does not cite the current merge-base."
      echo "  Ledger      : $LEDGER"
      echo "  Merge-base  : $BASE_SHORT  ($(git log -1 --format=%s "$MERGE_BASE"))"
      echo "  Window      : ${WINDOW_COMMITS} commit(s), ${WINDOW_FILES} file(s)"
      if [[ -z "$SCOPE_LINE" ]]; then
        echo "  Scope line  : (none found — the ledger needs a line starting with 'Scope')"
      else
        echo "  Scope line  : ${SCOPE_LINE:0:100}"
      fi
      echo ""
      echo "  '$BRANCH' reuses one ledger across promotions, so verdicts from a"
      echo "  previous window would otherwise pass this gate unnoticed."
      echo "  Re-run the battery over the CURRENT diff and rewrite $LEDGER,"
      echo "  citing '$BASE_SHORT' in its Scope line."
      echo ""
      exit 1
    fi
  fi
done

# ── 4. Inspect changed files to determine required reviews ───────────────────
CHANGED_FILES="$(git diff --name-only "${MERGE_BASE}..HEAD" 2>/dev/null || true)"

REQUIRE_SPEC=true        # always
REQUIRE_CODE_QUALITY=true # always
REQUIRE_SECURITY=false
REQUIRE_DESIGN=false

# Bounded so it catches migrations / RLS files / auth files but not unrelated paths
# that merely contain "auth"/"rls" as a substring (e.g. "author", "controls").
if echo "$CHANGED_FILES" | grep -qE 'supabase/migrations/|_rls|rls\.sql|(^|/)auth'; then
  REQUIRE_SECURITY=true
fi

if echo "$CHANGED_FILES" | grep -qE '\.tsx$|\.css$'; then
  REQUIRE_DESIGN=true
fi

# ── 5. Parse ledger verdicts ─────────────────────────────────────────────────
# Accepted line format: - <review>: <VERDICT> — <notes>
# Verdict must be one of: PASS, SHIP, FIX-THEN-SHIP
# Blocking verdicts: REWORK, FAIL, STILL-FAILING, or anything else (incl blank)

ACCEPTED_PATTERN='^(PASS|SHIP|FIX-THEN-SHIP)$'
BLOCKING_PATTERN='^(REWORK|FAIL|STILL-FAILING)$'

parse_verdict() {
  local review_key="$1"
  # Match lines like: - spec: PASS — ...  or  - code-quality: SHIP — ...
  # Key is case-insensitive prefix match
  local line
  line="$(grep -iE "^[[:space:]]*-[[:space:]]+${review_key}[[:space:]]*:" "$LEDGER" | head -1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  # The verdict is the FIRST whitespace-delimited token after the colon.
  # (PASS / SHIP / FIX-THEN-SHIP have no internal spaces; the " — notes" always
  #  follow a space, so taking $1 is robust — and does NOT split FIX-THEN-SHIP on
  #  its internal hyphens the way a dash-strip would.)
  local after_colon
  after_colon="$(echo "$line" | sed 's/^[^:]*:[[:space:]]*//')"
  echo "$after_colon" | awk '{print $1}'
}

FAILURES=()
SUMMARY_LINES=()

check_review() {
  local key="$1"
  local label="$2"
  local required="$3"

  if [[ "$required" != "true" ]]; then
    return
  fi

  local verdict
  verdict="$(parse_verdict "$key")"

  if [[ -z "$verdict" ]]; then
    FAILURES+=("  - ${label}: verdict line MISSING from ledger")
    SUMMARY_LINES+=("  ${label}: MISSING")
    return
  fi

  if echo "$verdict" | grep -qE "$BLOCKING_PATTERN"; then
    FAILURES+=("  - ${label}: verdict is '${verdict}' (blocking — resolve before merge)")
    SUMMARY_LINES+=("  ${label}: ${verdict} [BLOCKING]")
    return
  fi

  if ! echo "$verdict" | grep -qE "$ACCEPTED_PATTERN"; then
    FAILURES+=("  - ${label}: verdict '${verdict}' is not recognized (accepted: PASS SHIP FIX-THEN-SHIP)")
    SUMMARY_LINES+=("  ${label}: ${verdict} [UNRECOGNIZED]")
    return
  fi

  SUMMARY_LINES+=("  ${label}: ${verdict} [ok]")
}

check_review "spec"          "spec"         "$REQUIRE_SPEC"
check_review "code-quality"  "code-quality" "$REQUIRE_CODE_QUALITY"
check_review "design"        "design"       "$REQUIRE_DESIGN"
check_review "security"      "security"     "$REQUIRE_SECURITY"

# ── 6. Report ────────────────────────────────────────────────────────────────
echo ""
echo "pre-merge-check: branch '${BRANCH}'"
echo "  ledger : ${LEDGER}"
# Label the merge-base as a merge-base, not as the branch: printing "origin/main @ <sha>" invites
# reading <sha> as origin/main's tip, which it usually is not. Both are shown.
echo "  base   : merge-base(${BASE_REF} @ $(git rev-parse --short=7 "$BASE_REF"), HEAD) = $(git rev-parse --short=7 "$MERGE_BASE")  ($(git log -1 --format=%s "$MERGE_BASE"))"
if [[ "$FETCH_OK" != "true" ]]; then
  echo "  NOTE   : baseline NOT re-fetched (${FETCH_OK}) — running with ALLOW_STALE_BASE/PRE_MERGE_NO_FETCH; it may be stale."
fi
echo "  diff   : $(echo "$CHANGED_FILES" | wc -l | xargs) file(s) changed since merge-base"
echo "  reviews required: spec code-quality$(${REQUIRE_DESIGN} && echo " design" || true)$(${REQUIRE_SECURITY} && echo " security" || true)"
echo ""
echo "Verdicts:"
for line in "${SUMMARY_LINES[@]}"; do
  echo "$line"
done
echo ""

if [[ "${#FAILURES[@]}" -gt 0 ]]; then
  echo "FAIL: ${#FAILURES[@]} issue(s) must be resolved before merge:"
  for f in "${FAILURES[@]}"; do
    echo "$f"
  done
  echo ""
  exit 1
fi

echo "PASS: all required reviews cleared. Safe to merge."
echo ""
exit 0
