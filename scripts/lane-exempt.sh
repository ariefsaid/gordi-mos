#!/usr/bin/env bash
# Log a lane exemption so a Claude-subagent dispatch can pass the deny hook
# (.claude/hooks/agent-dispatch-lane.sh). The factory is the default executor for build work
# (docs/agents/factory.md § Executor routing); an exemption is a logged event, never a sentence.
#
#   scripts/lane-exempt.sh <#issue|-> <category> [reason…]
#
# Categories (the routing table's own lanes):
#   money-auth | diagnosis | fog | factory-self-edit   build lanes — need an issue, and the
#                                                      in-flight marker is posted to it (audit trail)
#   research | review                                  read/verify lanes — local marker only
#
# Marker: <git-dir>/lane-exempt, honored by the hook for 8 hours.
# Self-test: scripts/lane-exempt.test.sh
set -uo pipefail

die() { printf '✗ lane-exempt: %s\n' "$1" >&2; exit 1; }

issue="${1:-}"; cat="${2:-}"; shift 2 2>/dev/null || die "usage: lane-exempt.sh <#issue|-> <category> [reason…]"
reason="${*:-}"

case "$cat" in
  money-auth|diagnosis|fog|factory-self-edit) build_lane=1 ;;
  research|review) build_lane=0 ;;
  *) die "unknown category '$cat' (money-auth|diagnosis|fog|factory-self-edit|research|review)" ;;
esac

gitdir="$(git rev-parse --git-dir)" || die "not a git repo"

if [ "$build_lane" = 1 ]; then
  n="${issue#\#}"
  case "$n" in ''|*[!0-9]*) die "build-lane exemption needs an issue number (got '$issue')" ;; esac
  [ -n "$reason" ] || die "build-lane exemption needs a one-line reason"
  # The post IS the audit trail — no post, no exemption.
  "$(dirname "$0")/gh-post.sh" issue comment "$n" \
    --body "In flight (Director lane, $(date -u +%Y-%m-%d)): $cat — $reason. Do not re-dispatch." \
    || die "could not post the in-flight marker to #$n — no marker, no exemption"
fi

printf '%s %s %s %s\n' "$(date +%s)" "$cat" "$issue" "$reason" > "$gitdir/lane-exempt"
echo "✓ lane exemption logged: $cat ($issue) — valid 8h"
