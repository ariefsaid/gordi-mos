#!/usr/bin/env bash
# Self-test for scripts/worktree-cleanup.sh — merged-branch sweep (unchanged), plus the
# detached review-worktree age sweep (AC-562-3) and its archive/failure-retention (AC-562-4).
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/worktree-cleanup.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

t() { if [ "$2" -eq 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
      else fail=$((fail+1)); printf '  FAIL  %s\n%s\n' "$1" "$3"; fi; }

# Throwaway repo so the sweep's git plumbing runs end-to-end; origin points at itself so a
# branch merged into dev is recognised by the (unchanged) merged path.
repo="$tmp/repo"
mkdir -p "$repo"
git -C "$repo" init -q
git -C "$repo" config user.email t@t
git -C "$repo" config user.name t
git -C "$repo" checkout -q -b dev
echo a > "$repo/a"; git -C "$repo" add a; git -C "$repo" commit -qm init
git -C "$repo" remote add origin "$repo"

mkdir -p "$repo/.claude/worktrees"
# old detached review worktree (no branch line) with archived traces — MUST be swept + archived
git -C "$repo" worktree add -q --detach "$repo/.claude/worktrees/review-old" HEAD
mkdir -p "$repo/.claude/worktrees/review-old/adws/adw_data/sessions"
echo trace > "$repo/.claude/worktrees/review-old/adws/adw_data/sessions/x.jsonl"
# fresh detached review worktree — MUST survive the age cutoff
git -C "$repo" worktree add -q --detach "$repo/.claude/worktrees/review-fresh" HEAD
# branch worktree merged into dev — still swept via the branch path (regression guard)
git -C "$repo" worktree add -q -b feat-merged "$repo/.claude/worktrees/feat-merged" HEAD

touch -t 202601010000 "$repo/.claude/worktrees/review-old"

# An archive entry older than 90 days (AC-562-4) — must be pruned regardless of worktrees.
mkdir -p "$repo/adws/adw_data/archive/old-cap"
echo keepsake > "$repo/adws/adw_data/archive/old-cap/run.jsonl"
touch -t 202601010000 "$repo/adws/adw_data/archive/old-cap"

out="$(cd "$repo" && bash "$SCRIPT" dev --max-age-days 2)"
printf '%s' "$out" | grep -q "archive (pruned, >90d old): .*old-cap"; t "90d-old archive entry pruned" $? "$out"
if [ ! -d "$repo/adws/adw_data/archive/old-cap" ]; then
  pass=$((pass+1)); printf '  ok    pruned archive entry removed from disk\n'
else fail=$((fail+1)); printf '  FAIL  pruned archive entry removed from disk\n'; fi
printf '%s' "$out" | grep -q "worktree (detached, >2d old): .*review-old"; t "old detached review worktree swept" $? "$out"
printf '%s' "$out" | grep -q "worktree (merged): .*feat-merged"; t "merged branch worktree still swept" $? "$out"
if printf '%s' "$out" | grep -q "review-fresh"; then
  fail=$((fail+1)); printf '  FAIL  fresh detached worktree survives\n%s\n' "$out"
else pass=$((pass+1)); printf '  ok    fresh detached worktree survives\n'; fi
if [ -d "$repo/.claude/worktrees/review-old" ]; then
  fail=$((fail+1)); printf '  FAIL  old detached worktree removed from disk\n'
else pass=$((pass+1)); printf '  ok    old detached worktree removed from disk\n'; fi
if [ -d "$repo/.claude/worktrees/review-fresh" ]; then
  pass=$((pass+1)); printf '  ok    fresh detached worktree still on disk\n'
else fail=$((fail+1)); printf '  FAIL  fresh detached worktree still on disk\n'; fi
printf '%s' "$out" | grep -q "traces archived.*review-old"; t "detached sweep archives traces before removal" $? "$out"
if [ -f "$repo/adws/adw_data/archive/review-old/sessions/x.jsonl" ]; then
  pass=$((pass+1)); printf '  ok    archived traces landed in archive/\n'
else fail=$((fail+1)); printf '  FAIL  archived traces landed in archive/\n'; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]