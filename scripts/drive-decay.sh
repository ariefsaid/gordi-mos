#!/usr/bin/env bash
# Backlog decay report for the /drive exit step. Lists rot; acting on it is the skill's job.
#
#   scripts/drive-decay.sh [stale-days] [triage-days]     (defaults 3 and 7)
#
# Sections (tab-separated, header per section):
#   DEAD-CLAIM  — open, assigned, no update in <stale-days>: the assignee claim is likely a dead
#                 session; drive-next skips assigned tickets, so these are invisible until cleared.
#   AGING-TRIAGE — needs-triage older than <triage-days>: /feedback filed it, nothing revisits it.
#   UNTRACKED   — open issues with NO workflow-state label at all (not ready-for-*, needs-*,
#                 wayfinder:*, wontfix): invisible to the strict picker AND to triage — /triage's
#                 queue too (dual audit 2026-08-28 found 19 of 40 open issues in this state).
#   FRONTIER    — one line: count of open wayfinder:grilling tickets awaiting the owner.
#
# DRIVE_DECAY_NOW overrides "now" (ISO8601) for the self-test. Exit 1 = query failed (≠ empty).
# Self-test: scripts/drive-decay.test.sh
set -uo pipefail

stale_days="${1:-3}"
triage_days="${2:-7}"
now="${DRIVE_DECAY_NOW:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

raw="$(gh api --paginate 'repos/{owner}/{repo}/issues?state=open&per_page=100' 2>/dev/null)" \
  || { echo "✗ drive-decay: gh query failed" >&2; exit 1; }

printf '%s' "$raw" | jq -r -s --arg now "$now" \
  --argjson sd "$stale_days" --argjson td "$triage_days" '
  def age_days(t): (($now | fromdateiso8601) - (t | fromdateiso8601)) / 86400 | floor;
  add
  | map(select(has("pull_request") | not))
  | (map(select((.assignees | length) > 0 and (age_days(.updated_at) >= $sd))
      | "DEAD-CLAIM\t#\(.number)\t\(.assignees[0].login)\t\(age_days(.updated_at))d quiet\t\(.title)")
     | .[]),
    (map(select(([.labels[].name] | index("needs-triage")) and (age_days(.created_at) >= $td))
      | "AGING-TRIAGE\t#\(.number)\t\(age_days(.created_at))d old\t\(.title)")
     | .[]),
    (map(select([.labels[].name]
        | map(test("^(ready-for-|needs-|wayfinder:|wontfix)")) | any | not)
      | "UNTRACKED\t#\(.number)\t\(.title)")
     | .[]),
    "FRONTIER\t\(map(select(([.labels[].name] | index("wayfinder:grilling"))
                       and ((.issue_dependencies_summary.blocked_by // 0) == 0))) | length) unblocked grilling ticket(s) awaiting the owner"
'
