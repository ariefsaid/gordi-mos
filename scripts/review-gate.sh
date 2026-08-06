#!/usr/bin/env bash
# review-gate — a review was recorded, by someone who is not the author, against THIS commit.
#
# ── WHY THIS IS 60 LINES AND NOT 200 ──────────────────────────────────────────────────────────
#
# The previous shape parsed raw markdown looking for a review record: skipping ``` fences, HTML
# comments, prose mentions, tracking body boundaries with a sentinel. Three consecutive reviews
# broke it, the last finding SEVEN more bypasses — including a tab pasted into a field, which made
# a record whose Verdict line read `DO NOT MERGE` come out as MERGE, and a sentinel line that
# reopened the fence and HTML guards at once.
#
# Every one of those bugs lived in the same place: inferring, from arbitrary markdown, which text
# is a real review and which is documentation. So that job is gone.
#
#   1. A record must be the ENTIRE body of a PR comment. Not inside a fence, an indented block,
#      a <details>, a <pre>, or a sentence. There is nothing to hide a record inside any more.
#   2. The reviewer is the comment's GitHub author, supplied by the API. It is NOT typed by anyone,
#      so it cannot be a look-alike, an email local-part, punctuation or a zero-width space — the
#      whole identity-spoofing class disappears with the field.
#   3. The PR body cannot carry a record at all. The author writes the body, so a record there
#      would be a self-review by construction.
#
# ── WHAT THIS STILL CANNOT DO ─────────────────────────────────────────────────────────────────
#
# It cannot establish that the reviewer was independent in any deeper sense. On this repo the
# author spawns every reviewer, and on a public repo any GitHub user can comment. What it proves
# is narrow and worth having: a comment exists, written by an account that is not the PR author,
# carrying an explicit verdict, naming the commit it reviewed. Independence is judged by a human
# reading the review — not by this script.
#
# ── THE RECORD — the whole body of a comment, nothing else ────────────────────────────────────
#
#   <!-- review-gate -->
#   Verdict: MERGE            # MERGE | MERGE WITH CHANGES | DO NOT MERGE
#   Commit: 1506ce9           # the head sha reviewed; a stale review must not gate new code
#
# Usage:
#   scripts/review-gate.sh <pr-number> [repo]
#   REVIEW_GATE_FIXTURE=<file> scripts/review-gate.sh
#     fixture: {"author":"login","head":"sha","comments":[{"login":"who","body":"..."}]}

set -Eeuo pipefail

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
    payload=$(gh pr view "$pr" --repo "$repo" --json author,headRefOid,comments \
      --jq '{author: .author.login, head: .headRefOid, comments: [.comments[] | {login: .author.login, body: .body}]}')
  else
    payload=$(gh pr view "$pr" --json author,headRefOid,comments \
      --jq '{author: .author.login, head: .headRefOid, comments: [.comments[] | {login: .author.login, body: .body}]}')
  fi
fi

author=$(printf '%s' "$payload" | jq -r '.author // ""')
head=$(printf '%s' "$payload" | jq -r '.head // ""')
[[ -n "$head" ]] || fail "could not determine the PR head commit"
[[ -n "$author" ]] || fail "could not determine the PR author — refusing rather than skipping the self-review check"

# The newest comment whose WHOLE body is a record. jq does the matching: no markdown parsing, and
# `\r?` so CRLF is accepted. The field lines must start at column 0 — allowing leading
# whitespace let a four-space indented block (which GitHub renders as code, i.e. documentation)
# normalise into a valid record.
record=$(printf '%s' "$payload" | jq -r --arg author "$author" '
  [ .comments[]
    | select((.body // "")
        | gsub("^\\s+|\\s+$";"")
        | test("^<!--\\s*review-gate\\s*-->\\r?\\nVerdict:[^\\n]*\\r?\\nCommit:[^\\n]*$"))
  ] | last // empty
  | { login: .login,
      verdict: (.body | capture("Verdict:\\s*(?<v>[^\\r\\n]*)").v | gsub("^\\s+|\\s+$";"")),
      commit:  (.body | capture("Commit:\\s*(?<c>[^\\r\\n]*)").c  | gsub("^\\s+|\\s+$";"")) }
  | "\(.login)\t\(.verdict)\t\(.commit)"')

[[ -n "$record" ]] || fail "no review record found — one comment whose ENTIRE body is: '<!-- review-gate -->' then 'Verdict:' then 'Commit:'. A record inside a code block, an HTML comment or a sentence is documentation, not a review"

reviewer=${record%%$'\t'*}
rest=${record#*$'\t'}
verdict=${rest%%$'\t'*}
commit=${rest#*$'\t'}

# The reviewer is a GitHub login from the API, so this is an exact comparison — not a substring
# guess at a typed string, which is what the look-alike bypasses defeated.
[[ "$reviewer" != "$author" ]] || fail "the only review record was written by the PR author ($author) — a self-review does not gate a merge"

case "$verdict" in
  "MERGE"|"MERGE WITH CHANGES") ;;
  "DO NOT MERGE") fail "the newest review says DO NOT MERGE (by $reviewer)" ;;
  *) fail "verdict '$verdict' is not recognised — use MERGE, MERGE WITH CHANGES or DO NOT MERGE (case-sensitive)" ;;
esac

[[ ${#commit} -ge 7 ]] || fail "the reviewed commit '$commit' is too short to identify a revision"
[[ "${head:0:${#commit}}" == "$commit" ]] || fail "the newest review covers commit $commit, but the PR head is ${head:0:${#commit}} — re-review the current code"

printf 'review-gate: reviewed by %s — %s — at %s (PR head %s)\n' "$reviewer" "$verdict" "$commit" "${head:0:${#commit}}"
printf 'review-gate: PASS\n'
