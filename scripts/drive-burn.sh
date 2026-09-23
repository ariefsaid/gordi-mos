#!/usr/bin/env bash
# One burn line for the /drive exit report: pi token spend for THIS project's sessions.
#
#   scripts/drive-burn.sh [hours]      (default 24)
#
# Sums the usage records pi already writes (~/.pi/agent/sessions/<cwd-slug>/*.jsonl).
# Worktree and factory dispatches log under their OWN slugs (one per checkout path), so SUM
# across EVERY slug matching this repo, not just the main checkout's.
# PI_SESSIONS_DIR overrides the sessions ROOT (self-test). Missing dir/no sessions in the
# window = report 0, exit 0. Session files found but 0 totalTokens records parsed = ERROR,
# exit 1 (fail closed — a silent 0 would understate burn).
# Self-test: scripts/drive-burn.test.sh
set -uo pipefail

hours="${1:-24}"
root="${PI_SESSIONS_DIR:-$HOME/.pi/agent/sessions}"
[ -d "$root" ] || { echo "burn: no pi session dir for this checkout"; exit 0; }

# Every slug for this repo shares the <repo> path fragment (main checkout, .claude, and each
# .claude/worktrees/<branch> dispatch) — collect them ALL, not just the main checkout's.
dirs=()
while IFS= read -r -d '' d; do dirs+=("$d"); done \
  < <(find "$root" -maxdepth 1 -mindepth 1 -type d -name '*gordi-mos*' -print0 2>/dev/null)
[ "${#dirs[@]}" -gt 0 ] || { echo "burn: 0 pi tokens (no sessions in last ${hours}h)"; exit 0; }

n="$(find "${dirs[@]}" -name '*.jsonl' -mmin -$((hours * 60)) 2>/dev/null | wc -l | tr -d ' ')"
[ "$n" -gt 0 ] || { echo "burn: 0 pi tokens (no sessions in last ${hours}h)"; exit 0; }

# -exec cat {} + keeps filenames intact (xargs split on spaces and silently dropped those files).
# Fail closed: files in the window with nothing parsable must ERROR, not report a silent 0.
raw="$(find "${dirs[@]}" -name '*.jsonl' -mmin -$((hours * 60)) -exec cat {} + 2>/dev/null \
  | grep -oE '"totalTokens":[0-9]+' | cut -d: -f2)"
[ -n "$raw" ] || { echo "burn: ERROR ${n} session file(s) in the window but 0 totalTokens records parsed" >&2; exit 1; }
total="$(printf '%s\n' "$raw" | awk '{s+=$1} END {print s+0}')"
echo "burn: ${total} pi tokens across ${n} session(s) in last ${hours}h (all checkout/worktree slugs)"
