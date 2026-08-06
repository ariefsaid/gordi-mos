#!/usr/bin/env bash
# review-gate — enforce that a change was reviewed by someone other than its author.
#
# WHY THIS EXISTS, AND WHY THE PREVIOUS ATTEMPT DID NOT WORK
#
# `/code-review` step 6 has always said: no review recorded means not reviewed, so no merge. The
# script it named stopped existing, so for weeks the clause was documentation rather than a control.
# The first replacement (PR #240, closed) looked for a review ledger under `docs/` — which is
# gitignored. The evidence lived only on the author's own machine. A gate whose input no reviewer
# and no CI run can see cannot gate anything, and it passed on a ledger that said "reviewed by me,
# the author" and on a change with every axis DEFERRED.
#
# So the evidence moved to the one place CI can read and a human cannot quietly edit after the fact:
# a comment on the pull request itself. Public, timestamped, attributable, and part of the record.
#
# THE RECORD FORMAT — a fenced block in any PR comment or in the PR body:
#
#   <!-- review-gate -->
#   Reviewer: gpt-5.6-luna via pi          # who did it: a GitHub login, or a model/agent identity
#   Verdict: MERGE                         # MERGE | MERGE WITH CHANGES | DO NOT MERGE
#   Commit: 1506ce9                        # the head sha the review actually covered
#
# WHAT IT REFUSES, all fail-closed:
#   - no record at all
#   - the newest record says DO NOT MERGE
#   - the reviewer is the PR author (the incident this comes from: a merge on the author's own read)
#   - the record covers a commit that is no longer the PR head — a stale review must not gate new
#     code, which is the check the previous attempt lacked entirely
#
# Usage:
#   scripts/review-gate.sh <pr-number> [repo]
#   REVIEW_GATE_FIXTURE=<file> scripts/review-gate.sh   # offline: read a JSON fixture instead of gh
#
# The fixture path exists so this script's own failure modes can be exercised without a live PR —
# a gate nobody has watched fail is only a belief. See scripts/review-gate.test.sh.

set -Eeuo pipefail

fail() { printf 'review-gate: REFUSED — %s\n' "$1" >&2; exit 1; }
note() { printf 'review-gate: %s\n' "$1"; }

# ── Gather: author login, head sha, and every candidate record body ────────────────────────────
if [[ -n "${REVIEW_GATE_FIXTURE:-}" ]]; then
  [[ -f "$REVIEW_GATE_FIXTURE" ]] || fail "fixture not found: $REVIEW_GATE_FIXTURE"
  payload=$(cat "$REVIEW_GATE_FIXTURE")
else
  pr="${1:-}"
  [[ -n "$pr" ]] || fail "usage: review-gate.sh <pr-number> [repo]"
  repo="${2:-${GITHUB_REPOSITORY:-}}"
  repo_arg=()
  [[ -n "$repo" ]] && repo_arg=(--repo "$repo")
  # One call: author, head sha, body, and all comment bodies.
  payload=$(gh pr view "$pr" "${repo_arg[@]}" \
    --json author,headRefOid,body,comments \
    --jq '{author: .author.login, head: .headRefOid, bodies: ([.body] + [.comments[].body])}')
fi

author=$(printf '%s' "$payload" | jq -r '.author // ""')
head=$(printf '%s' "$payload" | jq -r '.head // ""')
[[ -n "$head" ]] || fail "could not determine the PR head commit"

# ── Extract every review record, newest last (comments arrive in chronological order) ──────────
# A record is the marker followed by its three fields. Anything malformed is ignored here and then
# reported as "no valid record" — a half-written record must never read as an approval.
records=$(printf '%s' "$payload" | jq -r '.bodies[]? // empty' | awk '
  /<!-- *review-gate *-->/ { inrec=1; rev=""; ver=""; com=""; next }
  inrec && /^[[:space:]]*Reviewer:/  { sub(/^[[:space:]]*Reviewer:[[:space:]]*/,  ""); rev=$0; next }
  inrec && /^[[:space:]]*Verdict:/   { sub(/^[[:space:]]*Verdict:[[:space:]]*/,   ""); ver=$0; next }
  inrec && /^[[:space:]]*Commit:/    { sub(/^[[:space:]]*Commit:[[:space:]]*/,    ""); com=$0
                                       if (rev != "" && ver != "") print rev "\t" ver "\t" com
                                       inrec=0; next }
  inrec && /^[[:space:]]*$/ { next }
')

[[ -n "$records" ]] || fail "no review record found on PR — add a <!-- review-gate --> block naming the reviewer, the verdict and the commit reviewed"

# The newest record wins, so a re-review after changes can clear an earlier block.
last=$(printf '%s\n' "$records" | tail -1)
reviewer=$(printf '%s' "$last" | cut -f1 | tr -d '\r' | sed 's/[[:space:]]*$//')
verdict=$(printf  '%s' "$last" | cut -f2 | tr -d '\r' | sed 's/[[:space:]]*$//')
commit=$(printf   '%s' "$last" | cut -f3 | tr -d '\r' | sed 's/[[:space:]]*$//')

[[ -n "$reviewer" ]] || fail "the newest review record names no reviewer"

# ── Refuse: self-review. The whole point. ──────────────────────────────────────────────────────
# Compared case-insensitively, and also against the bare login inside a longer identity string, so
# "asaid via pi" cannot slip past as a different person.
shopt -s nocasematch
if [[ -n "$author" && ( "$reviewer" == "$author" || "$reviewer" == *"$author"* ) ]]; then
  shopt -u nocasematch
  fail "the reviewer ($reviewer) is the PR author ($author) — a self-review does not gate a merge"
fi

# ── Refuse: an explicit block, or an unrecognised verdict ──────────────────────────────────────
case "$verdict" in
  "MERGE"|"MERGE WITH CHANGES") ;;
  "DO NOT MERGE") shopt -u nocasematch; fail "the newest review says DO NOT MERGE" ;;
  *) shopt -u nocasematch; fail "verdict '$verdict' is not recognised — use MERGE, MERGE WITH CHANGES or DO NOT MERGE" ;;
esac
shopt -u nocasematch

# ── Refuse: a stale review. The check the previous attempt did not have. ───────────────────────
# Short shas are normal in a hand-written record, so compare on the shorter of the two lengths.
[[ -n "$commit" ]] || fail "the newest review record names no commit — a review that does not say what it covered cannot be checked for staleness"
n=${#commit}
if [[ "$n" -lt 7 ]]; then
  fail "the reviewed commit '$commit' is too short to identify a revision (need at least 7 characters)"
fi
if [[ "${head:0:$n}" != "$commit" ]]; then
  fail "the newest review covers commit $commit, but the PR head is ${head:0:$n} — re-review the current code"
fi

note "reviewed by $reviewer — $verdict — at $commit (PR head ${head:0:$n})"
note "PASS"
