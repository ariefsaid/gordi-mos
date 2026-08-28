#!/usr/bin/env bash
# One burn line for the /drive exit report: pi token spend for THIS project's sessions.
#
#   scripts/drive-burn.sh [hours]      (default 24)
#
# Sums the usage records pi already writes (~/.pi/agent/sessions/<cwd-slug>/*.jsonl).
# ponytail: main-checkout sessions only — worktree dispatches land under other slugs, factory
# runs log to adws/adw_data, and a `--no-session` dispatch logs NOTHING (so drop that flag on
# dispatches you want counted); extend when a real routing decision needs the other meters.
# PI_SESSIONS_DIR overrides the directory (self-test). Missing dir/no sessions = report, exit 0.
# Self-test: scripts/drive-burn.test.sh
set -uo pipefail

hours="${1:-24}"
slug="-$(pwd | tr '/' '-')--"
dir="${PI_SESSIONS_DIR:-$HOME/.pi/agent/sessions/$slug}"
[ -d "$dir" ] || { echo "burn: no pi session dir for this checkout"; exit 0; }

files="$(find "$dir" -name '*.jsonl' -mmin -$((hours * 60)) 2>/dev/null)"
[ -n "$files" ] || { echo "burn: 0 pi tokens (no sessions in last ${hours}h)"; exit 0; }

total="$(printf '%s\n' "$files" | xargs cat 2>/dev/null \
  | grep -oE '"totalTokens":[0-9]+' | cut -d: -f2 | awk '{s+=$1} END {print s+0}')"
n="$(printf '%s\n' "$files" | wc -l | tr -d ' ')"
echo "burn: ${total} pi tokens across ${n} session(s) in last ${hours}h (main checkout only)"
