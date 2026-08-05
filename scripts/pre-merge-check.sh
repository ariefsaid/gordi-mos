#!/usr/bin/env bash
#
# pre-merge-check.sh — the machine half of the /code-review merge gate.
#
#   Usage:  bash scripts/pre-merge-check.sh          (run from anywhere in the repo)
#   Exit 0  = every axis the diff requires carries a verdict in the ledger.
#   Exit 1  = something is missing, blocking, or unresolvable. Read the message.
#
# This is a LOCAL pre-merge gate. It is deliberately not wired into CI.
#
# ---------------------------------------------------------------------------
# THE ONE RULE THIS SCRIPT EXISTS TO OBEY, inherited verbatim from the version
# it replaces:
#
#   "A check whose failure mode is silence is not a check: the error must
#    never be quieter than the pass."
#
# So: every unresolvable condition — no branch, no base ref, no diff, no
# ledger, an unreadable ledger, a named spec that isn't there — is a LOUD
# non-zero exit, never a skipped check and never a default pass. The ERR trap
# below covers the cases nobody thought of.
# ---------------------------------------------------------------------------
#
# WHAT IT CHECKS
#   The ledger at docs/reviews/<branch-with-slashes-as-dashes>.md carries one
#   verdict line per axis that the diff requires. /code-review decides which
#   axes those are; this script works the same set out mechanically:
#
#     standards   always
#     spec        always
#     design      any *.tsx / *.css in the diff
#     security    any auth / RLS / schema / org_id path in the diff
#     acceptance  the governing spec carries acceptance-criteria ids
#
#   The governing spec is named by the ledger's own "**Spec:**" line, so this
#   script never guesses which spec applies. Write "**Spec:** none" if there
#   genuinely is not one — an absent line is a failure, not an exemption.
#
# LEDGER FORMAT
#   Anywhere in the file, one line per axis:
#
#     - standards: PASS — <who reviewed, what they found>
#     - spec: PASS — ...
#     - design: DEFERRED — <why, and what closes it>
#
#   Verdict is the first word after the colon. The LAST line for an axis wins
#   (the battery's convention is BLOCK -> fix -> re-verify -> PASS).
#
#   PASS      PASS APPROVE APPROVED SHIP FIX-THEN-SHIP
#   DEFERRED  DEFERRED — accepted, but NOT counted as a pass. It is reported
#             on its own line in the summary and requires a stated reason.
#             This verdict exists so "not reviewed" stops being written as
#             PASS: it is the honest word for an axis somebody chose to carry.
#   BLOCKING  BLOCK BLOCKED FAIL REWORK NOT-RUN STILL-FAILING — and anything
#             unrecognised, because an unreadable verdict is not a pass.
#
# WHAT IT DOES NOT CHECK
#   Typecheck, lint, coverage, tests, design guards, audit coverage. Those are
#   their own gates and belong to their own commands. This one answers exactly
#   one question: was the review recorded?
#
set -euo pipefail

# Nothing may fall over quietly. Any unhandled failure lands here and shouts.
trap 'rc=$?; echo "" >&2; echo "ERROR: pre-merge-check aborted at line ${LINENO} (exit ${rc}). Treat this as a FAILED gate — it did not finish, so it did not pass." >&2; exit 1' ERR

fail() { echo "" >&2; echo "FAIL: $*" >&2; echo "" >&2; exit 1; }

# ── 1. Where are we ─────────────────────────────────────────────────────────
REPO_ROOT="$(git rev-parse --show-toplevel)" || fail "not inside a git repository."
cd "$REPO_ROOT"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ -z "$BRANCH" || "$BRANCH" == "HEAD" ]]; then
  fail "cannot resolve a branch name (detached HEAD?). The ledger is keyed by branch, so there is nothing to look up. Check out the feature branch and re-run."
fi
if [[ "$BRANCH" == "dev" || "$BRANCH" == "main" || "$BRANCH" == "staging" ]]; then
  fail "you are on '${BRANCH}'. Run this from the feature branch, before the merge."
fi

# Base ref. Resolve explicitly and fail loudly rather than guessing a scope.
if git rev-parse --verify --quiet origin/dev >/dev/null; then
  BASE_REF=origin/dev
elif git rev-parse --verify --quiet dev >/dev/null; then
  BASE_REF=dev
else
  fail "cannot resolve 'origin/dev' or 'dev' — cannot work out what this branch changed.
  Fix: git fetch origin dev    (do NOT skip the gate because the ref is missing)"
fi

MERGE_BASE="$(git merge-base "$BASE_REF" HEAD)" \
  || fail "git merge-base ${BASE_REF} HEAD failed — refusing to guess the review scope."

CHANGED_FILES="$(git diff --name-only "${MERGE_BASE}..HEAD")" \
  || fail "git diff ${MERGE_BASE}..HEAD failed — cannot work out which axes are required."
[[ -n "$CHANGED_FILES" ]] \
  || fail "no files changed vs ${BASE_REF}. A gate that requires no reviews is not a gate — refusing to pass."

# ── 2. The ledger ───────────────────────────────────────────────────────────
LEDGER="docs/reviews/${BRANCH//\//-}.md"

[[ -e "$LEDGER" ]] || fail "review ledger missing.
  Expected: ${LEDGER}
  Run /code-review and record its verdicts there, then re-run this script.
  Shape to copy: docs/reviews/feat-186-squash-verify.md"
[[ -f "$LEDGER" && -r "$LEDGER" && -s "$LEDGER" ]] \
  || fail "review ledger ${LEDGER} exists but is not a readable, non-empty file."

# ── 3. Which axes does this diff require ────────────────────────────────────
require_design=false
require_security=false
# `if`, never `grep … && var=true`: under `set -e` a non-matching grep makes the
# whole compound return non-zero and kills the script — the gate dying at exactly
# the moment it found nothing. Silence again.
if grep -qE '\.tsx$|\.css$' <<<"$CHANGED_FILES"; then require_design=true; fi

# Bounded so it catches migrations, RLS and auth paths without matching
# unrelated words that merely contain them ("author", "controls").
if grep -qE 'supabase/migrations/|(^|/|_|-)rls|(^|/)auth|org_id' <<<"$CHANGED_FILES"; then require_security=true; fi

# Acceptance follows the governing spec, which the ledger must name.
SPEC="$(sed -n 's/.*\*\*Spec:\*\*[[:space:]]*\([^[:space:]]*\).*/\1/p' "$LEDGER" | head -1 || true)"
[[ -n "$SPEC" ]] || fail "ledger ${LEDGER} does not name a governing spec.
  Add a line:  **Spec:** docs/specs/<name>.spec.md
  If there genuinely is no spec, write:  **Spec:** none
  (an absent line is a failure, not an exemption — that is how the Acceptance
   axis got skipped by silence)"

require_acceptance=false
SPEC_NOTE="none declared"
if [[ "$SPEC" != "none" && "$SPEC" != "None" && "$SPEC" != "NONE" ]]; then
  [[ -r "$SPEC" ]] || fail "ledger names spec '${SPEC}', which is not a readable file.
  Fix the path in ${LEDGER} — a spec this script cannot open is a spec it cannot check."
  # Criteria ids are the bolded ids inside the acceptance-criteria section.
  # Read the section rather than the whole file, so FR-/NFR- ids don't count,
  # and match any namespace so a renamed one still registers.
  CRITERIA="$(awk '/^#+[[:space:]]*Acceptance Criteria/{s=1;next} s&&/^#{1,2}[[:space:]]/{s=0} s' "$SPEC" \
              | grep -oE '\*\*[A-Z]+-[0-9]{3}\*\*' | tr -d '*' | sort -u || true)"
  if [[ -n "$CRITERIA" ]]; then
    require_acceptance=true
    SPEC_NOTE="${SPEC} ($(wc -l <<<"$CRITERIA" | tr -d ' ') criteria: $(head -1 <<<"$CRITERIA")…)"
  else
    SPEC_NOTE="${SPEC} (no acceptance criteria found)"
  fi
fi

# ── 4. Read the verdicts ────────────────────────────────────────────────────
PASS_RE='^(PASS|APPROVE|APPROVED|SHIP|FIX-THEN-SHIP)$'
BLOCK_RE='^(BLOCK|BLOCKED|FAIL|REWORK|NOT-RUN|STILL-FAILING)$'

# Plain newline-joined strings, not arrays: this repo's bash is 3.2, where
# `${#arr[@]}` on an empty array under `set -u` is itself an error.
SUMMARY=""
PROBLEMS=""
PROBLEM_COUNT=0
DEFERRALS=""

add_summary()  { SUMMARY="${SUMMARY}$1"$'\n'; }
add_problem()  { PROBLEMS="${PROBLEMS}  - $1"$'\n'; PROBLEM_COUNT=$((PROBLEM_COUNT + 1)); }
add_deferral() { DEFERRALS="${DEFERRALS}  - $1"$'\n'; }

check_axis() {
  local axis="$1" required="$2"
  if [[ "$required" != "true" ]]; then
    add_summary "  ${axis}: not required by this diff"
    return
  fi

  local line verdict rest
  line="$(grep -iE "^[[:space:]]*-[[:space:]]*${axis}[[:space:]]*:" "$LEDGER" | tail -1 || true)"
  if [[ -z "$line" ]]; then
    add_problem "${axis}: NO VERDICT LINE in ${LEDGER} (expected a line like '- ${axis}: PASS — …')"
    add_summary "  ${axis}: MISSING"
    return
  fi

  rest="${line#*:}"
  verdict="$(awk '{print $1}' <<<"$rest")"

  if [[ "$verdict" == "DEFERRED" ]]; then
    # A deferral with no reason is a silent skip wearing a verdict's clothes.
    local reason="${rest#*$verdict}"
    if [[ -z "$(tr -d '[:space:]:—-' <<<"$reason")" ]]; then
      add_problem "${axis}: DEFERRED with no stated reason — say what was deferred and what closes it"
      add_summary "  ${axis}: DEFERRED (no reason) [BLOCKING]"
    else
      add_deferral "${axis}:${reason}"
      add_summary "  ${axis}: DEFERRED — carried, NOT a pass"
    fi
    return
  fi

  if grep -qE "$BLOCK_RE" <<<"$verdict"; then
    add_problem "${axis}: verdict is '${verdict}' — blocking, resolve before merge"
    add_summary "  ${axis}: ${verdict} [BLOCKING]"
    return
  fi

  if ! grep -qE "$PASS_RE" <<<"$verdict"; then
    add_problem "${axis}: verdict '${verdict}' is not recognised (pass: PASS APPROVE APPROVED SHIP FIX-THEN-SHIP; or DEFERRED with a reason)"
    add_summary "  ${axis}: ${verdict} [UNRECOGNISED]"
    return
  fi

  add_summary "  ${axis}: ${verdict}"
}

check_axis standards  true
check_axis spec       true
check_axis design     "$require_design"
check_axis security   "$require_security"
check_axis acceptance "$require_acceptance"

# ── 5. Report ───────────────────────────────────────────────────────────────
echo ""
echo "pre-merge-check — branch '${BRANCH}' vs ${BASE_REF}"
echo "  ledger : ${LEDGER}"
echo "  spec   : ${SPEC_NOTE}"
echo "  diff   : $(wc -l <<<"$CHANGED_FILES" | tr -d ' ') file(s) since merge-base"
echo ""
echo "Verdicts:"
printf '%s' "$SUMMARY"

if [[ -n "$DEFERRALS" ]]; then
  echo ""
  echo "Deferred — recorded, not reviewed. Open, not closed:"
  printf '%s' "$DEFERRALS"
fi

if [[ "$PROBLEM_COUNT" -gt 0 ]]; then
  echo ""
  echo "FAIL: ${PROBLEM_COUNT} issue(s) must be resolved before merge:" >&2
  printf '%s' "$PROBLEMS" >&2
  echo "" >&2
  exit 1
fi

echo ""
echo "PASS: every required axis carries a verdict in ${LEDGER}."
echo ""
exit 0
