#!/usr/bin/env bash
# review-gate — every reviewer on the roster recorded a verdict against THIS commit.
#
# ── WHAT CHANGED, AND WHY ─────────────────────────────────────────────────────────────────────
#
# The previous version required the review comment's GitHub author to differ from the PR author.
# That check was unsatisfiable here and always would have been: this repo has ONE collaborator, so
# every PR author and every comment author are the same account. Its own workflow header had
# already reasoned its way to that fact — branch protection was rejected because "the repo has one
# collaborator" — and then the script reimposed the identical constraint by another route. It never
# refused a real review, because it never got the chance: the workflow was not registered on the
# default branch and had zero runs (#311).
#
# The deeper error was asking CI to adjudicate something CI cannot observe. A GitHub login proves
# which token posted a comment, never that anyone read the diff. On a repo where the author holds
# every token, it does not even prove that much.
#
# So identity is gone, and the ROSTER takes its place. Independence here comes from role
# separation — three reviewers with different briefs, different lenses, different failure modes —
# not from account separation. That is a property of how the review was run, and the checkable
# residue is: did all three lenses actually report, against this commit?
#
# The real failure mode this catches is the one that kept happening: one review runs, comes back
# clean, and the change ships as "reviewed". A missing lens is silent. This makes it loud.
#
# ── WHAT THIS STILL CANNOT DO ─────────────────────────────────────────────────────────────────
#
# It cannot tell a careful review from a rubber stamp, and it cannot prove a human or a distinct
# agent produced any record — the lens name is typed, not attested. It is deliberately not trying
# to. What it proves is narrow and worth having: three named lenses each recorded an explicit
# verdict, publicly, timestamped, pinned to the commit under review, and going stale the moment
# anything is pushed. Whether the reviews were any good is judged by a human reading them.
#
# ── THE RECORD — the whole body of a comment, nothing else ────────────────────────────────────
#
#   <!-- review-gate -->
#   Reviewer: spec            # spec | code-quality | security (the roster — docs/agents/review.md)
#   Verdict: MERGE            # MERGE | MERGE WITH CHANGES | DO NOT MERGE
#   Commit: 1506ce9           # the head sha reviewed; a stale review must not gate new code
#
# One comment per lens; the newest record for a lens wins, so a re-review supersedes. A record must
# be a comment's ENTIRE body — not inside a fence, an indented block, a <details>, a <pre>, or a
# sentence. Three consecutive reviews of the old markdown-parsing version found seven bypasses; the
# whole-body rule is what retired them, and it stays.
#
# The PR body cannot carry a record. The author writes the body, so a record there would be a
# self-review by construction — the one identity-shaped rule worth keeping, because it costs
# nothing and needs no login to enforce.
#
# Usage:
#   scripts/review-gate.sh <pr-number> [repo]
#   REVIEW_GATE_FIXTURE=<file> scripts/review-gate.sh
#     fixture: {"head":"sha","comments":[{"login":"who","body":"..."}]}

set -Eeuo pipefail

# The roster, in report order. Changing it changes what every PR owes — see docs/agents/review.md.
ROSTER="spec code-quality security"

fail() { printf 'review-gate: REFUSED — %s\n' "$1" >&2; exit 1; }

if [[ -n "${REVIEW_GATE_FIXTURE:-}" ]]; then
  [[ -f "$REVIEW_GATE_FIXTURE" ]] || fail "fixture not found: $REVIEW_GATE_FIXTURE"
  payload=$(cat "$REVIEW_GATE_FIXTURE")
else
  pr="${1:-}"
  [[ -n "$pr" ]] || fail "usage: review-gate.sh <pr-number> [repo]"
  repo="${2:-${GITHUB_REPOSITORY:-}}"
  # Note `${arr[@]}` on an empty array is an unbound-variable error under set -u on bash 3.2 (macOS),
  # so the two calls are spelled out rather than built from an array.
  if [[ -n "$repo" ]]; then
    payload=$(gh pr view "$pr" --repo "$repo" --json headRefOid,comments \
      --jq '{head: .headRefOid, comments: [.comments[] | {login: .author.login, body: .body}]}')
  else
    payload=$(gh pr view "$pr" --json headRefOid,comments \
      --jq '{head: .headRefOid, comments: [.comments[] | {login: .author.login, body: .body}]}')
  fi
fi

head=$(printf '%s' "$payload" | jq -r '.head // ""')
[[ -n "$head" ]] || fail "could not determine the PR head commit"

# jq does the matching: no markdown parsing, and `\r?` so CRLF is accepted. Field lines must start
# at column 0 — allowing leading whitespace let a four-space indented block (which GitHub renders as
# code, i.e. documentation) normalise into a valid record.
#
# Tabs are folded to spaces in every captured field BEFORE the tab-separated line is built. A tab
# pasted into the verdict once made a record reading `DO NOT MERGE` come out as MERGE, by shifting
# the fields left; folding first makes such a value merely unrecognised, which is a refusal.
records=$(printf '%s' "$payload" | jq -r '
  def clean: gsub("\t";" ") | gsub("^\\s+|\\s+$";"");
  .comments[]
  | select((.body // "")
      | gsub("^\\s+|\\s+$";"")
      | test("^<!--\\s*review-gate\\s*-->\\r?\\nReviewer:[^\\n]*\\r?\\nVerdict:[^\\n]*\\r?\\nCommit:[^\\n]*$"))
  | { lens:    (.body | capture("Reviewer:\\s*(?<r>[^\\r\\n]*)").r | clean | ascii_downcase),
      verdict: (.body | capture("Verdict:\\s*(?<v>[^\\r\\n]*)").v  | clean),
      commit:  (.body | capture("Commit:\\s*(?<c>[^\\r\\n]*)").c   | clean) }
  | "\(.lens)\t\(.verdict)\t\(.commit)"')

[[ -n "$records" ]] || fail "no review record found — the roster is '$ROSTER'. Each owes one comment whose ENTIRE body is '<!-- review-gate -->' then 'Reviewer:' then 'Verdict:' then 'Commit:'. A record inside a code block, an HTML comment or a sentence is documentation, not a review"

# The newest record for a lens wins, so a re-review supersedes an earlier one. bash 3.2 (macOS) has
# no associative arrays, hence awk rather than a map.
latest_for() {
  printf '%s\n' "$records" | awk -F'\t' -v want="$1" '$1==want {v=$2; c=$3} END {if (v != "") print v "\t" c}'
}

missing=""
for lens in $ROSTER; do
  [[ -n "$(latest_for "$lens")" ]] || missing="$missing $lens"
done
[[ -z "$missing" ]] || fail "no review recorded by:$missing — every change is reviewed by all of '$ROSTER', so a missing lens is an unreviewed axis, not a silent pass"

# Refuse on ANY block before reporting a pass: one reviewer saying DO NOT MERGE settles it,
# whatever the other two found.
for lens in $ROSTER; do
  rec=$(latest_for "$lens"); verdict=${rec%%$'\t'*}; commit=${rec#*$'\t'}
  case "$verdict" in
    "MERGE"|"MERGE WITH CHANGES") ;;
    "DO NOT MERGE") fail "the $lens review says DO NOT MERGE" ;;
    *) fail "the $lens review's verdict '$verdict' is not recognised — use MERGE, MERGE WITH CHANGES or DO NOT MERGE (case-sensitive)" ;;
  esac
  [[ ${#commit} -ge 7 ]] || fail "the $lens review names commit '$commit', too short to identify a revision"
  [[ "${head:0:${#commit}}" == "$commit" ]] || fail "the $lens review covers commit $commit, but the PR head is ${head:0:${#commit}} — re-review the current code"
done

for lens in $ROSTER; do
  rec=$(latest_for "$lens")
  printf 'review-gate: %-12s %s\n' "$lens" "${rec%%$'\t'*}"
done
printf 'review-gate: PASS — all roster lenses reviewed %s\n' "${head:0:7}"
