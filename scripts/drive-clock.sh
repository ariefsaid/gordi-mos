#!/usr/bin/env bash
# Wall-clock ledger report: scripts/drive-clock.sh [hours] (default 24).
# Ledger records are tab-separated: start epoch, duration seconds, mode, HEAD sha.
# VERIFY_LEDGER_PATH overrides the common-git-dir ledger for self-tests. A missing ledger is zero;
# malformed records in the reporting window fail closed; recover from ancient corruption by deleting
# the ledger.
set -uo pipefail

hours="${1:-24}"
[[ "$hours" =~ ^[1-9][0-9]*$ ]] || { echo "clock: ERROR hours must be a positive integer" >&2; exit 1; }
if [ -n "${VERIFY_LEDGER_PATH:-}" ]; then
  ledger="$VERIFY_LEDGER_PATH"
else
  git_common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || {
    echo "clock: ERROR not inside a git repository" >&2
    exit 1
  }
  [ -n "$git_common_dir" ] || { echo "clock: ERROR git common dir is empty" >&2; exit 1; }
  ledger="$git_common_dir/verify-ledger.log"
fi
[ -e "$ledger" ] || { echo "clock: 0 runs, 0.00 total minutes, 0.00% skipped, 0 refusals (last ${hours}h)"; exit 0; }
[ -r "$ledger" ] || { echo "clock: ERROR ledger is not readable" >&2; exit 1; }

now="${VERIFY_LEDGER_NOW:-$(date +%s)}"
[[ "$now" =~ ^[0-9]+$ ]] || { echo "clock: ERROR invalid clock" >&2; exit 1; }
cutoff=$((now - hours * 3600))
runs=0
total_seconds=0
skipped=0
refusals=0
while IFS= read -r line || [ -n "$line" ]; do
  IFS=$'\t' read -r started duration mode head extra <<< "$line"
  # Only records whose timestamp is in-window can affect this report. Delete the ledger to
  # recover from ancient corruption; a broken historical byte must not brick future reports.
  if [[ "$started" =~ ^[0-9]+$ ]] && [ "$started" -ge "$cutoff" ] && [ "$started" -le "$now" ]; then
    if [ -n "${extra:-}" ] || ! [[ "$duration" =~ ^[0-9]+$ ]] || \
       ! [[ "$mode" =~ ^(full|skipped|refused)$ ]] || ! [[ "$head" =~ ^[0-9a-fA-F]{7,64}$ ]]; then
      echo "clock: ERROR malformed ledger record" >&2
      exit 1
    fi
    total_seconds=$((total_seconds + duration))
    if [ "$mode" = refused ]; then
      refusals=$((refusals + 1))
    else
      runs=$((runs + 1))
      [ "$mode" = skipped ] && skipped=$((skipped + 1))
    fi
  fi
done < "$ledger"

minutes=$(awk -v seconds="$total_seconds" 'BEGIN { printf "%.2f", seconds / 60 }')
ratio=$(awk -v skipped="$skipped" -v runs="$runs" 'BEGIN { printf "%.2f", runs ? skipped * 100 / runs : 0 }')
printf 'clock: %d runs, %s total minutes, %s%% skipped, %d refusals (last %sh)\n' "$runs" "$minutes" "$ratio" "$refusals" "$hours"
