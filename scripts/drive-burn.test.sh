#!/usr/bin/env bash
# Self-test for scripts/drive-burn.sh — summing, windowing, and the two empty paths.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/drive-burn.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

t() { if [ "$2" -eq 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
      else fail=$((fail+1)); printf '  FAIL  %s — got: %s\n' "$1" "$3"; fi; }

mkdir -p "$tmp/sessions"
printf '{"x":1,"usage":{"totalTokens":100}}\n{"usage":{"totalTokens":250}}\n' > "$tmp/sessions/a.jsonl"
printf '{"usage":{"totalTokens":50}}\n' > "$tmp/sessions/b.jsonl"
printf '{"usage":{"totalTokens":9999}}\n' > "$tmp/sessions/old.jsonl"
touch -t 202601010000 "$tmp/sessions/old.jsonl"

out="$(PI_SESSIONS_DIR="$tmp/sessions" bash "$SCRIPT" 24)"
printf '%s' "$out" | grep -q "400 pi tokens across 2 session(s)"; t "sums fresh sessions, excludes old" $? "$out"

out="$(PI_SESSIONS_DIR="$tmp/nope" bash "$SCRIPT")"
printf '%s' "$out" | grep -q "no pi session dir"; t "missing dir reports, exits 0" $? "$out"

mkdir -p "$tmp/empty"
out="$(PI_SESSIONS_DIR="$tmp/empty" bash "$SCRIPT" 1)"
printf '%s' "$out" | grep -q "0 pi tokens"; t "empty window reports zero" $? "$out"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
