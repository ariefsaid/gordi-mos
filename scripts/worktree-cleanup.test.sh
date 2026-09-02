#!/usr/bin/env bash
# Self-test for scripts/worktree-cleanup.sh — merged-branch sweep, the detached review-worktree
# age sweep (AC-562-3), trace archiving on removal AND failure retention (failed archive keeps
# the worktree), 90d archive pruning (AC-562-4), dirty-worktree protection (uncommitted/
# untracked work is kept), and fetch-failure abort (fail closed: stale origin refs must never
# drive removals).
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/worktree-cleanup.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

t() { if [ "$2" -eq 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
      else fail=$((fail+1)); printf '  FAIL  %s\n%s\n' "$1" "$3"; fi; }

# Throwaway repo so the sweep's git plumbing runs end-to-end; origin points at itself so a
# branch merged into dev is recognised by the (unchanged) merged path. The committed
# .gitignore mirrors the real repo's (adws/adw_data traces are ignored) — otherwise every
# traced worktree would read as dirty and the archive-then-remove flow would be unreachable.
repo="$tmp/repo"
mkdir -p "$repo"
git -C "$repo" init -q
git -C "$repo" config user.email t@t
git -C "$repo" config user.name t
git -C "$repo" checkout -q -b dev
printf 'adws/adw_data/sessions/\nadws/adw_data/sssf.db*\nadws/adw_data/archive/\n' > "$repo/.gitignore"
git -C "$repo" add .gitignore; git -C "$repo" commit -qm init
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
# merged branch worktree with UNCOMMITTED + UNTRACKED work — MUST be kept, never force-removed
git -C "$repo" worktree add -q -b feat-dirty "$repo/.claude/worktrees/feat-dirty" HEAD
echo dirty-wip >> "$repo/.claude/worktrees/feat-dirty/a"
echo untracked-note > "$repo/.claude/worktrees/feat-dirty/notes.md"
# merged branch worktree whose trace archive target is BLOCKED (a file sits where the archive
# dir must be) — archive fails, so the worktree MUST be kept (fail-closed retention)
git -C "$repo" worktree add -q -b feat-archfail "$repo/.claude/worktrees/feat-archfail" HEAD
mkdir -p "$repo/.claude/worktrees/feat-archfail/adws/adw_data/sessions"
echo trace > "$repo/.claude/worktrees/feat-archfail/adws/adw_data/sessions/x.jsonl"
mkdir -p "$repo/adws/adw_data/archive"
echo blocker > "$repo/adws/adw_data/archive/feat-archfail"

touch -t 202601010000 "$repo/.claude/worktrees/review-old"

# An archive entry older than 90 days (AC-562-4) — must be pruned regardless of worktrees.
mkdir -p "$repo/adws/adw_data/archive/old-cap"
echo keepsake > "$repo/adws/adw_data/archive/old-cap/run.jsonl"
touch -t 202601010000 "$repo/adws/adw_data/archive/old-cap"

out="$(cd "$repo" && bash "$SCRIPT" dev --max-age-days 2 2>&1)"
rc=$?
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

# Dirty-worktree protection (fail closed against the old --force removal):
printf '%s' "$out" | grep -q "dirty, kept.*feat-dirty"; t "dirty merged worktree reported 'dirty, kept'" $? "$out"
if [ -f "$repo/.claude/worktrees/feat-dirty/notes.md" ] \
   && grep -q dirty-wip "$repo/.claude/worktrees/feat-dirty/a"; then
  pass=$((pass+1)); printf '  ok    dirty merged worktree survives with contents intact\n'
else fail=$((fail+1)); printf '  FAIL  dirty merged worktree survives with contents intact\n'; fi
git -C "$repo" branch --list feat-dirty | grep -q feat-dirty
t "branch of kept dirty worktree not deleted" $? "branch feat-dirty missing"

# Archive-failure retention (fail closed): no removal when the trace archive failed.
printf '%s' "$out" | grep -q "trace archive FAILED.*feat-archfail"; t "failed trace archive reported" $? "$out"
if [ -f "$repo/.claude/worktrees/feat-archfail/adws/adw_data/sessions/x.jsonl" ]; then
  pass=$((pass+1)); printf '  ok    worktree kept after failed trace archive\n'
else fail=$((fail+1)); printf '  FAIL  worktree kept after failed trace archive\n'; fi

# Fetch failure must ABORT the removal pass (fail closed): a stale origin/<target> would
# otherwise drive merge-base checks and could delete live work.
repo2="$tmp/repo2"
mkdir -p "$repo2"
git -C "$repo2" init -q
git -C "$repo2" config user.email t@t
git -C "$repo2" config user.name t
git -C "$repo2" checkout -q -b dev
echo a > "$repo2/a"; git -C "$repo2" add a; git -C "$repo2" commit -qm init
git -C "$repo2" remote add origin "$repo2"
git -C "$repo2" fetch -q origin
mkdir -p "$repo2/.claude/worktrees"
git -C "$repo2" worktree add -q -b feat-gone "$repo2/.claude/worktrees/feat-gone" HEAD
mkdir -p "$tmp/notarepo"
git -C "$repo2" remote set-url origin "$tmp/notarepo"

out="$(cd "$repo2" && bash "$SCRIPT" dev 2>&1)"; rc=$?
[ "$rc" -ne 0 ]; t "fetch failure exits nonzero" $? "$out"
printf '%s' "$out" | grep -q "aborting removals"; t "fetch failure reported as aborting removals" $? "$out"
if [ -d "$repo2/.claude/worktrees/feat-gone" ]; then
  pass=$((pass+1)); printf '  ok    fetch failure keeps merged worktree on disk\n'
else fail=$((fail+1)); printf '  FAIL  fetch failure keeps merged worktree on disk\n'; fi
git -C "$repo2" branch --list feat-gone | grep -q feat-gone
t "fetch failure keeps merged branch" $? "branch feat-gone missing"

# Squash-merge equivalence (this repo squash-merges every PR, so a shipped branch's tip is
# never an ancestor of the target — ancestry alone would keep it forever):
#   (a) a branch with 2 real commits + 1 empty "wip: claim" divergence-guard commit, where the
#       target carries their squashed equivalent as ONE new commit -> swept + branch deleted.
#   (b) a branch with unrelated unmerged work -> kept (never treated as merged).
#   (c) a squash-merged branch whose worktree is dirty -> kept, same as any other dirty worktree.
repo3="$tmp/repo3"
mkdir -p "$repo3/.claude/worktrees"
git -C "$repo3" init -q
git -C "$repo3" config user.email t@t
git -C "$repo3" config user.name t
git -C "$repo3" checkout -q -b dev
echo base > "$repo3/f.txt"; git -C "$repo3" add f.txt; git -C "$repo3" commit -qm base
git -C "$repo3" remote add origin "$repo3"

git -C "$repo3" worktree add -q -b feat-squashed "$repo3/.claude/worktrees/feat-squashed" dev
echo one >> "$repo3/.claude/worktrees/feat-squashed/f.txt"
git -C "$repo3/.claude/worktrees/feat-squashed" commit -qam "commit1"
echo two >> "$repo3/.claude/worktrees/feat-squashed/f.txt"
git -C "$repo3/.claude/worktrees/feat-squashed" commit -qam "commit2"
git -C "$repo3/.claude/worktrees/feat-squashed" commit -q --allow-empty -m "wip: claim divergence guard"
git -C "$repo3" merge --squash feat-squashed -q >/dev/null
git -C "$repo3" commit -qm "squash merged feat-squashed"

git -C "$repo3" worktree add -q -b feat-unmerged "$repo3/.claude/worktrees/feat-unmerged" dev
echo unrelated >> "$repo3/.claude/worktrees/feat-unmerged/f.txt"
git -C "$repo3/.claude/worktrees/feat-unmerged" commit -qam "not shipped"

git -C "$repo3" worktree add -q -b feat-squashed-dirty "$repo3/.claude/worktrees/feat-squashed-dirty" dev
echo three >> "$repo3/.claude/worktrees/feat-squashed-dirty/f.txt"
git -C "$repo3/.claude/worktrees/feat-squashed-dirty" commit -qam "commit3"
git -C "$repo3" merge --squash feat-squashed-dirty -q >/dev/null
git -C "$repo3" commit -qm "squash merged feat-squashed-dirty"
echo uncommitted >> "$repo3/.claude/worktrees/feat-squashed-dirty/f.txt"

out="$(cd "$repo3" && bash "$SCRIPT" dev --max-age-days 2 2>&1)"
printf '%s' "$out" | grep -q "worktree (merged): .*feat-squashed\]"; t "squash-merged worktree swept" $? "$out"
if [ -d "$repo3/.claude/worktrees/feat-squashed" ]; then
  fail=$((fail+1)); printf '  FAIL  squash-merged worktree removed from disk\n'
else pass=$((pass+1)); printf '  ok    squash-merged worktree removed from disk\n'; fi
git -C "$repo3" branch --list feat-squashed | grep -q feat-squashed
[ $? -ne 0 ]; t "squash-merged branch deleted" $? "branch feat-squashed still present"

if printf '%s' "$out" | grep -E "(merged|remove|delete).*feat-unmerged"; then
  fail=$((fail+1)); printf '  FAIL  unmerged branch left untouched\n%s\n' "$out"
else pass=$((pass+1)); printf '  ok    unmerged branch left untouched\n'; fi
if [ -d "$repo3/.claude/worktrees/feat-unmerged" ]; then
  pass=$((pass+1)); printf '  ok    unmerged worktree still on disk\n'
else fail=$((fail+1)); printf '  FAIL  unmerged worktree still on disk\n'; fi
git -C "$repo3" branch --list feat-unmerged | grep -q feat-unmerged
t "unmerged branch kept" $? "branch feat-unmerged missing"

printf '%s' "$out" | grep -q "dirty, kept.*feat-squashed-dirty"; t "squash-merged but dirty worktree kept" $? "$out"
if [ -d "$repo3/.claude/worktrees/feat-squashed-dirty" ]; then
  pass=$((pass+1)); printf '  ok    squash-merged dirty worktree still on disk\n'
else fail=$((fail+1)); printf '  FAIL  squash-merged dirty worktree still on disk\n'; fi
git -C "$repo3" branch --list feat-squashed-dirty | grep -q feat-squashed-dirty
t "branch of kept squash-merged dirty worktree not deleted" $? "branch feat-squashed-dirty missing"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
