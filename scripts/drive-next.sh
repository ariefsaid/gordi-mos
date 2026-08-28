#!/usr/bin/env bash
# The drive loop's deterministic ticket picker. Prints every drivable issue, best first —
# the /drive skill takes line 1 and works it. No output = nothing drivable (exit 0; exit 1
# is reserved for a failed query, so "empty" and "broken" can't be confused).
#
# Drivable = open issue · not a PR · zero OPEN blockers (native dependencies) · unassigned
# (assignee = the claim, per docs/agents/issue-tracker.md) · none of the parked/human labels
# (wayfinder:grilling|map = owner frontier, needs-info/needs-triage = not ready,
#  ready-for-human/wontfix = not ours) · NOT already implemented by an open PR (a "Closes #N"
# in any open PR body/title parks N — markers get forgotten, the PR itself is the truth;
# cold-start audit 2026-08-28 found four built tickets listed as drivable).
#
# Order: milestone number asc (nulls last) · `ready-for-agent` before unlabeled (with no
# milestones in the tracker, the label is the only "this is next" signal — same audit) ·
# issue number asc. --paginate walks the whole backlog; jq -s add flattens the pages.
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
      | select([.labels[].name]
          | map(. == "wayfinder:grilling" or . == "wayfinder:map" or . == "needs-info"
                or . == "needs-triage" or . == "ready-for-human" or . == "wontfix")
          | any | not)
    ]
  | sort_by((.milestone.number // 999999),
            (if ([.labels[].name] | index("ready-for-agent")) then 0 else 1 end),
            .number)
  | .[] | "#\(.number)\t\(.title)\t\([.labels[].name] | join(","))"
'
