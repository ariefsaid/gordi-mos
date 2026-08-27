#!/usr/bin/env bash
# The drive loop's deterministic ticket picker. Prints every drivable issue, best first —
# the /drive skill takes line 1 and works it. No output = nothing drivable (exit 0; exit 1
# is reserved for a failed query, so "empty" and "broken" can't be confused).
#
# Drivable = open issue · not a PR · zero OPEN blockers (native dependencies) · unassigned
# (assignee = the claim, per docs/agents/issue-tracker.md) · none of the parked/human labels
# (wayfinder:grilling|map = owner frontier, needs-info/needs-triage = not ready,
#  ready-for-human/wontfix = not ours).
#
# Order: milestone number asc (nulls last), then issue number asc — milestone merge order
# matters (docs/decisions.md); within one, oldest first. --paginate walks the whole backlog;
# jq -s add flattens the per-page arrays.
#
# Self-test: scripts/drive-next.test.sh
set -uo pipefail

raw="$(gh api --paginate 'repos/{owner}/{repo}/issues?state=open&per_page=100' 2>/dev/null)" \
  || { echo "✗ drive-next: gh query failed" >&2; exit 1; }

printf '%s' "$raw" | jq -r -s '
  add
  | [ .[]
      | select(has("pull_request") | not)
      | select((.issue_dependencies_summary.blocked_by // 0) == 0)
      | select((.assignees | length) == 0)
      | select([.labels[].name]
          | map(. == "wayfinder:grilling" or . == "wayfinder:map" or . == "needs-info"
                or . == "needs-triage" or . == "ready-for-human" or . == "wontfix")
          | any | not)
    ]
  | sort_by((.milestone.number // 999999), .number)
  | .[] | "#\(.number)\t\(.title)\t\([.labels[].name] | join(","))"
'
