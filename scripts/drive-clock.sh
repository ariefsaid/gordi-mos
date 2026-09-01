#!/usr/bin/env bash
# Wall-clock ledger report: scripts/drive-clock.sh [hours] (default 24).
# Ledger records are tab-separated: start epoch, duration seconds, mode, HEAD sha.
# VERIFY_LEDGER_PATH overrides the git-adjacent ledger for self-tests. A missing ledger is zero;
# a malformed record fails closed.
set -uo pipefail

hours="${1:-24}"
[[ "$hours" =~ ^[1-9][0-9]*$ ]] || { echo "clock: ERROR hours must be a positive integer" >&2; exit 1; }
ledger="${VERIFY_LEDGER_PATH:-$(git rev-parse --git-dir 2>/dev/null)/verify-ledger.log}"
[ -e "$ledger" ] || { echo "clock: 0 runs, 0.00 total minutes, 0.00% skipped (last ${hours}h)"; exit 0; }
[ -r "$ledger" ] || { echo "clock: ERROR ledger is not readable" >&2; exit 1; }

now="${VERIFY_LEDGER_NOW:-$(date +%s)}"
[[ "$now" =~ ^[0-9]+$ ]] || { echo "clock: ERROR invalid clock" >&2; exit 1; }
cutoff=$((now - hours * 3600))
runs=0
total_seconds=0
skipped=0
while IFS= read -r line || [ -n "$line" ]; do
  IFS=$'\t' read -r started duration mode head extra <<< "$line"
  if [ -n "${extra:-}" ] || ! [[ "$started" =~ ^[0-9]+$ ]] || \
     ! [[ "$duration" =~ ^[0-9]+$ ]] || ! [[ "$mode" =~ ^(full|skipped)$ ]] || \
     ! [[ "$head" =~ ^[0-9a-fA-F]{7,64}$ ]]; then
    echo "clock: ERROR malformed ledger record" >&2
    exit 1
  fi
  if [ "$started" -ge "$cutoff" ] && [ "$started" -le "$now" ]; then
    runs=$((runs + 1))
    total_seconds=$((total_seconds + duration))
    [ "$mode" = skipped ] && skipped=$((skipped + 1))
  fi
done < "$ledger"

minutes=$(awk -v seconds="$total_seconds" 'BEGIN { printf "%.2f", seconds / 60 }')
ratio=$(awk -v skipped="$skipped" -v runs="$runs" 'BEGIN { printf "%.2f", runs ? skipped * 100 / runs : 0 }')
printf 'clock: %d runs, %s total minutes, %s%% skipped (last %sh)\n' "$runs" "$minutes" "$ratio" "$hours"
