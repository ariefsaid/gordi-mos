#!/usr/bin/env bash
# Self-test for scripts/drive-burn.sh — summing, windowing, the two empty paths, and the
# fail-closed path: session files in the window with nothing parsable = ERROR, nonzero exit.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/drive-burn.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

t() { if [ "$2" -eq 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
      else fail=$((fail+1)); printf '  FAIL  %s — got: %s\n' "$1" "$3"; fi; }

# Two slug dirs for this repo (main checkout + a worktree dispatch); a third slug for a
# DIFFERENT repo must stay out of the sum.
mkdir -p "$tmp/sessions/--Users-x-Coding-gordi-mos--"
mkdir -p "$tmp/sessions/--Users-x-Coding-gordi-mos-.claude-worktrees-fix-1--"
mkdir -p "$tmp/sessions/--Users-x-Coding-other-project--"

printf '{"x":1,"usage":{"totalTokens":100}}\n{"usage":{"totalTokens":250}}\n' > "$tmp/sessions/--Users-x-Coding-gordi-mos--/a.jsonl"
printf '{"usage":{"totalTokens":50}}\n' > "$tmp/sessions/--Users-x-Coding-gordi-mos--/b.jsonl"
printf '{"usage":{"totalTokens":7}}\n' > "$tmp/sessions/--Users-x-Coding-gordi-mos-.claude-worktrees-fix-1--/with space.jsonl"
# second slug carries its own tokens too — the burn must SUM, not take the first dir
printf '{"usage":{"totalTokens":9999}}\n' > "$tmp/sessions/--Users-x-Coding-other-project--/excluded.jsonl"
printf '{"usage":{"totalTokens":9999}}\n' > "$tmp/sessions/--Users-x-Coding-gordi-mos--/old.jsonl"
touch -t 202601010000 "$tmp/sessions/--Users-x-Coding-gordi-mos--/old.jsonl"

out="$(PI_SESSIONS_DIR="$tmp/sessions" bash "$SCRIPT" 24)"
printf '%s' "$out" | grep -q "407 pi tokens across 3 session(s)"; t "sums across both repo slugs, excludes non-repo + old, incl. spaced filename" $? "$out"

out="$(PI_SESSIONS_DIR="$tmp/nope" bash "$SCRIPT")"
printf '%s' "$out" | grep -q "no pi session dir"; t "missing dir reports, exits 0" $? "$out"

mkdir -p "$tmp/empty"
out="$(PI_SESSIONS_DIR="$tmp/empty" bash "$SCRIPT" 1)"
printf '%s' "$out" | grep -q "0 pi tokens"; t "empty window reports zero" $? "$out"

# Malformed session files must fail closed: files found but 0 records parsed = ERROR (exit 1),
# never a silent "0 tokens".
mkdir -p "$tmp/garbage/--Users-x-Coding-gordi-mos--"
printf 'not json at all\n{"broken": tru\n' > "$tmp/garbage/--Users-x-Coding-gordi-mos--/junk.jsonl"
out="$(PI_SESSIONS_DIR="$tmp/garbage" bash "$SCRIPT" 24 2>&1)"; rc=$?
[ "$rc" -ne 0 ]; t "unparsable session files exit nonzero (fail closed)" $? "$out"
printf '%s' "$out" | grep -q "ERROR"; t "unparsable session files error instead of reporting 0" $? "$out"

# Boundary: SOME parsable records among the files = sum those, exit 0.
mkdir -p "$tmp/mixed/--Users-x-Coding-gordi-mos--"
printf 'garbage line\n' > "$tmp/mixed/--Users-x-Coding-gordi-mos--/junk.jsonl"
printf '{"usage":{"totalTokens":55}}\n' > "$tmp/mixed/--Users-x-Coding-gordi-mos--/good.jsonl"
out="$(PI_SESSIONS_DIR="$tmp/mixed" bash "$SCRIPT" 24 2>&1)"; rc=$?
{ [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q "55 pi tokens across 2 session(s)"; }
t "some parsable records among junk still sum, exit 0" $? "$out"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
