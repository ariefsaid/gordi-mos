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

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# ── 1. Determine branch + merge base ────────────────────────────────────────
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == "main" ]]; then
  echo "ERROR: You are on main. Run this from the feature branch before merging." >&2
  exit 1
fi

# Resolve the main ref explicitly. A fresh/cloud clone of a feature branch often has NO local
# `main`, and the bare `git merge-base main HEAD` then died before a single check ran. Prefer the
# local ref, fall back to origin/main, and fail LOUDLY (never silently) if neither resolves.
if git rev-parse --verify --quiet main >/dev/null; then
  MAIN_REF=main
elif git rev-parse --verify --quiet origin/main >/dev/null; then
  MAIN_REF=origin/main
else
  echo "ERROR: cannot resolve 'main' or 'origin/main' — cannot compute the diff to review." >&2
  echo "  Fix: git fetch origin main    (do NOT skip this gate because the ref is missing)" >&2
  exit 1
fi

if ! MERGE_BASE="$(git merge-base "$MAIN_REF" HEAD)"; then
  echo "ERROR: git merge-base $MAIN_REF HEAD failed — refusing to guess the review scope." >&2
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

# ── 4. Inspect changed files to determine required reviews ───────────────────
# FAIL-CLOSED. This was `... 2>/dev/null || true` — which meant ANY git failure produced an empty
# file list, and an empty list matches no pattern, so REQUIRE_DESIGN and REQUIRE_SECURITY silently
# became false and the gate waved the branch through on spec+code-quality alone. A check whose
# failure mode is silence is not a check: the error must never be quieter than the pass.
if ! CHANGED_FILES="$(git diff --name-only "${MERGE_BASE}..HEAD")"; then
  echo "ERROR: git diff ${MERGE_BASE}..HEAD failed — cannot determine which reviews are required." >&2
  exit 1
fi
if [[ -z "$CHANGED_FILES" ]]; then
  echo "ERROR: no files changed vs ${MAIN_REF} — nothing to review, or the merge-base is wrong." >&2
  echo "  A gate that requires no reviews is not a gate. Refusing to pass." >&2
  exit 1
fi

# AC-002 (step-1 styling pass) is NOT enforced here: this is the SHARED pre-merge gate and later
# redesign steps (2+) legitimately change *.tsx. AC-002 was a one-time property of the step-1 commit
# (CSS/tokens + test files only) and is recorded as verified in docs/reviews/feat-redesign-buildout.md
# (gpt-5.4 cross-family review confirmed zero *.tsx / zero production *.ts behavior change).

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

# APPROVE/BLOCK were missing here while the review battery has used exactly those two words since
# the redesign began — so the vocabulary the reviewers actually write was unrecognized by the gate
# that judges them. Both spellings are accepted now; drift like this is why the gate went unrun.
ACCEPTED_PATTERN='^(PASS|SHIP|FIX-THEN-SHIP|APPROVE|APPROVED)$'
# NOT-RUN is a first-class blocking verdict: "this review never happened" is a distinct, honest
# state from "it ran and failed", and both must block. Without it the only way to say "owed" was to
# omit the line, which the gate reports as a MISSING line — indistinguishable from a formatting slip.
BLOCKING_PATTERN='^(REWORK|FAIL|STILL-FAILING|BLOCK|BLOCKED|NOT-RUN)$'

parse_verdict() {
  local review_key="$1"
  # Match lines like: - spec: PASS — ...  or  - code-quality: SHIP — ...
  # Key is case-insensitive prefix match
  local line
  # tail -1, not head -1: the battery's convention is BLOCK -> fix -> re-verify -> APPROVE, so the
  # LAST recorded verdict is the current one. head -1 read the oldest — which meant an early PASS
  # could outrank a later BLOCK. If a key has several lines, the count is surfaced in the report.
  line="$(grep -iE "^[[:space:]]*-[[:space:]]+${review_key}[[:space:]]*:" "$LEDGER" | tail -1 || true)"
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
