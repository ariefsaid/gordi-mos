#!/usr/bin/env bash
# review-gate — require a review RECORD, public and against the current commit.
#
# ⚠️ WHAT THIS CANNOT DO, stated first because the name suggests otherwise.
# It cannot establish that the reviewer was independent. In this repo the author spawns every
# reviewer — they are all agents — so the author can ask one to emit a favourable record. A
# cross-family review (gpt-5.6-luna, 2026-08-06) put it plainly: the control "manufactures more
# rigor than it proves", and recommended deleting it unless it is reframed as exactly what it is.
# This is that reframing. The independence of a review is established by a HUMAN reading the
# verdict, not by this script.
#
# What it DOES establish, which the previous state of affairs did not:
#   - a review exists, in public, on the PR — not in a gitignored file on one laptop
#   - it names the commit it covered, so a stale approval cannot gate new code
#   - it carries an explicit verdict, so DO NOT MERGE can actually block
#   - the recorded identity is not the author's login or display name, and is a plausible identity
#     rather than punctuation, whitespace or a look-alike — a typo and slip check, NOT a security
#     boundary
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
  # `${arr[@]}` on an empty array is an unbound-variable error under `set -u` in bash 3.2, which is
  # what macOS ships and where this is run by hand.
  if [[ -n "$repo" ]]; then
    payload=$(gh pr view "$pr" --repo "$repo" --json author,headRefOid,body,comments \
      --jq '{author: .author.login, authorName: .author.name, head: .headRefOid, bodies: ([.body] + [.comments[].body])}')
  else
    payload=$(gh pr view "$pr" --json author,headRefOid,body,comments \
      --jq '{author: .author.login, authorName: .author.name, head: .headRefOid, bodies: ([.body] + [.comments[].body])}')
  fi
fi

author=$(printf '%s' "$payload" | jq -r '.author // ""')
author_name=$(printf '%s' "$payload" | jq -r '.authorName // ""')
head=$(printf '%s' "$payload" | jq -r '.head // ""')
[[ -n "$head" ]] || fail "could not determine the PR head commit"
# Fail CLOSED when the author cannot be determined (a ghost/deleted account yields null). Otherwise
# the self-review check below silently does nothing, which is the one check that must never skip.
[[ -n "$author" || -n "$author_name" ]] || fail "could not determine the PR author — refusing rather than skipping the self-review check"

# ── Extract every review record, newest last (comments arrive in chronological order) ──────────
# A record is the marker followed by its three fields. Anything malformed is ignored here and then
# reported as "no valid record" — a half-written record must never read as an approval.
#
# Three properties this parser must have, each learned from a real bypass found in review:
#
#  1. A record inside a ``` fence is DOCUMENTATION, not a review. This PR's own body contained the
#     format example, and the gate read it as an approval — it refused only because the example's
#     sha happened to be stale. Fenced regions are skipped entirely.
#  2. A record must be CONTAINED IN ONE BODY and its three fields CONSECUTIVE. Without that, a
#     marker in one comment plus fields in another assemble into an approval nobody wrote.
#  3. A malformed record must FAIL, not vanish. Dropping it silently meant a reviewer who typed
#     `Commmit:` had their DO NOT MERGE discarded and an older MERGE stood.
#
# Bodies are separated by a sentinel so state resets per body.
records=$(printf '%s' "$payload" | jq -r '.bodies[]? // empty | . + "\n===REVIEW-GATE-BODY-END==="' | awk '
  function flush(  n) {
    if (!inrec) return
    n = (rev != "") + (ver != "") + (com != "")
    if (n == 3) print rev "\t" ver "\t" com
    else print "===MALFORMED===\t-\t-"   # incomplete block — refuse, never ignore
    inrec = 0; rev = ""; ver = ""; com = ""
  }
  /^===REVIEW-GATE-BODY-END===$/      { flush(); fence = 0; fencelen = 0; html = 0; next }
  # Fences are matched by RUN LENGTH, per CommonMark: a fence closes only on a marker at least as
  # long as the one that opened it. A boolean toggle let a ```` outer fence containing a ``` example
  # expose that example as a live record — demonstrated in review.
  /^[[:space:]]*(```+|~~~+)/ {
    line = $0; sub(/^[[:space:]]*/, "", line)
    ch = substr(line, 1, 1); n = 0
    while (substr(line, n + 1, 1) == ch) n++
    if (!fence)              { fence = 1; fencechar = ch; fencelen = n }
    else if (ch == fencechar && n >= fencelen) { fence = 0; fencelen = 0 }
    next
  }
  fence                               { next }
  # A record buried in a multi-line HTML comment is hidden from every human reading the PR, so it is
  # not visible review evidence. The marker is itself a complete one-line comment, so only OTHER
  # `<!--` openers start a hidden region.
  /^[[:space:]]*<!--/ && !/^[[:space:]]*<!-- *review-gate *-->[[:space:]]*$/ && !/-->/ { html = 1; next }
  html && /-->/                       { html = 0; next }
  html                                { next }
  # The marker must stand ALONE on its line. Found live on the PR for this gate: the body explained
  # the format with an inline mention, which opened a record that could never complete, so the gate
  # refused its own documentation. Writing about the gate must not trip it.
  /^[[:space:]]*<!-- *review-gate *-->[[:space:]]*$/ { flush(); inrec = 1; rev = ""; ver = ""; com = ""; next }
  !inrec                              { next }
  /^[[:space:]]*Reviewer:/  { sub(/^[[:space:]]*Reviewer:[[:space:]]*/, ""); rev = $0; next }
  /^[[:space:]]*Verdict:/   { sub(/^[[:space:]]*Verdict:[[:space:]]*/,  ""); ver = $0; next }
  /^[[:space:]]*Commit:/    { sub(/^[[:space:]]*Commit:[[:space:]]*/,   ""); com = $0; flush(); next }
  # Any other line ends the block. The three fields must be consecutive, so prose cannot bridge a
  # marker to fields written elsewhere in the same comment.
  { flush() }
')

[[ -n "$records" ]] || fail "no review record found on PR — add a <!-- review-gate --> block naming the reviewer, the verdict and the commit reviewed (a block inside a code fence is an example, not a review)"

# The newest record wins, so a re-review after changes can clear an earlier block.
last=$(printf '%s\n' "$records" | tail -1)
reviewer=$(printf '%s' "$last" | cut -f1 | tr -d '\r' | sed 's/[[:space:]]*$//')
verdict=$(printf  '%s' "$last" | cut -f2 | tr -d '\r' | sed 's/[[:space:]]*$//')
commit=$(printf   '%s' "$last" | cut -f3 | tr -d '\r' | sed 's/[[:space:]]*$//')

[[ "$reviewer" != "===MALFORMED===" ]] || fail "the newest review record is incomplete — it needs Reviewer, Verdict and Commit on consecutive lines. Refusing rather than falling back to an older record"
[[ -n "$reviewer" ]] || fail "the newest review record names no reviewer"

# ── Refuse: an identity that is not an identity ────────────────────────────────────────────────
# Review demonstrated three ways to satisfy a bare non-empty check without naming anybody:
# `Reviewer: !!!`, a single zero-width space, and `аsaid` whose first letter is Cyrillic U+0430 —
# which a human reads as the author while a bytewise comparison does not. So the reviewer must be
# plain ASCII (no look-alikes to normalise) and carry at least two alphanumerics.
if LC_ALL=C printf '%s' "$reviewer" | LC_ALL=C grep -q '[^ -~]'; then
  fail "the reviewer name contains non-ASCII characters — refused because a look-alike letter reads as one identity to a person and another to a comparison. Use a plain ASCII login or model name"
fi
ascii_count=$(printf '%s' "$reviewer" | tr -cd '[:alnum:]' | wc -c | tr -d ' ')
[[ "$ascii_count" -ge 2 ]] || fail "the reviewer name '$reviewer' is not an identity — it needs at least two alphanumeric characters"

# ── Refuse: self-review. The whole point. ──────────────────────────────────────────────────────
# Matched case-insensitively and as a substring, so "asaid via pi" cannot pass as a third party.
#
# Both the login AND the display name are checked. The review that found this put it plainly: the
# login here is `ariefsaid` while the name on every commit is `asaid`, so a gate comparing only the
# login let the single most natural thing to type walk straight through.
shopt -s nocasematch
for ident in "$author" "$author_name"; do
  [[ -n "$ident" ]] || continue
  if [[ "$reviewer" == "$ident" || "$reviewer" == *"$ident"* ]]; then
    shopt -u nocasematch
    fail "the reviewer ($reviewer) is the PR author ($ident) — a self-review does not gate a merge"
  fi
done

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
