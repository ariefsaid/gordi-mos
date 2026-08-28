#!/usr/bin/env bash
# The drive loop's deterministic ticket picker. Prints every drivable issue, best first —
# the /drive skill takes line 1 and works it. No output = nothing drivable (exit 0; exit 1
# is reserved for a failed query, so "empty" and "broken" can't be confused).
#
# Drivable = open issue · not a PR · carries `ready-for-agent` (STRICT ADMISSION, OD-WAY-83:
# legacy/unlabeled issues go through /triage first — /drive consumes only canonical tickets) ·
# zero OPEN blockers (native dependencies) · unassigned (assignee = the claim, per
# docs/agents/issue-tracker.md) · NOT already implemented by an open PR (a "Closes #N" in any
# open PR body/title parks N — markers get forgotten, the PR itself is the truth).
#
# Order: milestone number asc (nulls last), then issue number asc. --paginate walks the whole
# backlog; jq -s add flattens the pages.
#
# Self-test: scripts/drive-next.test.sh
set -uo pipefail

raw="$(gh api --paginate 'repos/{owner}/{repo}/issues?state=open&per_page=100' 2>/dev/null)" \
  || { echo "✗ drive-next: gh query failed" >&2; exit 1; }
prs="$(gh api --paginate 'repos/{owner}/{repo}/pulls?state=open&per_page=100' 2>/dev/null)" \
  || { echo "✗ drive-next: gh pulls query failed" >&2; exit 1; }

# Boundaries both sides: 'Encloses #5' must not match via its 'closes' substring, and
# 'Fixes #5abc' is not a ref (GitHub only links a number ending at a word boundary).
pr_refs="$(printf '%s' "$prs" | jq -r -s 'add // [] | .[] | "\(.title) \(.body // "")"' \
  | grep -oiE '(^|[^[:alnum:]])(close[sd]?|fixe?[sd]?|resolve[sd]?)[[:space:]]+#[0-9]+([^[:alnum:]]|$)' \
  | grep -oE '#[0-9]+' | tr -d '#' | sort -nu \
  | jq -R -n '[inputs | tonumber]')"

printf '%s' "$raw" | jq -r -s --argjson prrefs "${pr_refs:-[]}" '
  add
  | [ .[]
      | select(has("pull_request") | not)
      | select((.issue_dependencies_summary.blocked_by // 0) == 0)
      | select((.assignees | length) == 0)
      | select(.number as $n | $prrefs | index($n) | not)
      | select([.labels[].name] | index("ready-for-agent"))
    ]
  | sort_by((.milestone.number // 999999), .number)
  | .[] | "#\(.number)\t\(.title)\t\([.labels[].name] | join(","))"
'
