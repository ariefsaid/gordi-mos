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

MERGE_BASE="$(git merge-base main HEAD)"

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
CHANGED_FILES="$(git diff --name-only "${MERGE_BASE}..HEAD" 2>/dev/null || true)"

REQUIRE_SPEC=true        # always
REQUIRE_CODE_QUALITY=true # always
REQUIRE_SECURITY=false
REQUIRE_DESIGN=false

if echo "$CHANGED_FILES" | grep -qE 'supabase/migrations/|_rls|auth|rls'; then
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
  # Extract the verdict token (first word after the colon, before ' — ' or end)
  local after_colon
  after_colon="$(echo "$line" | sed 's/^[^:]*:[[:space:]]*//')"
  # Take text before em-dash (— U+2014) or regular dash-dash
  local verdict_part
  verdict_part="$(echo "$after_colon" | sed 's/[[:space:]]*[—–-][[:space:]]*.*//')"
  # Trim whitespace
  echo "$verdict_part" | xargs
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
