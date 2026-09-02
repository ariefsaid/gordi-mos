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

# is_merged()'s squash-detection step ends in a command substitution (`git cherry ... | grep`)
# feeding a `[ -z ... ]` test — that construct sees only stdout, never the exit status of the
# pipeline it came from. A FAILED cherry call (e.g. an unfetchable/corrupt target ref) prints
# nothing on stdout, which reads identically to "no unmerged patches" unless the exit status is
# checked separately. Force that failure with a `git` shim so the fixture doesn't depend on
# finding a real-world way to make cherry error out after merge-base/commit-tree already
# succeeded: fail closed must mean "kept", never a `branch -D` on a guess.
shim="$tmp/shimbin"
mkdir -p "$shim"
real_git="$(command -v git)"
cat > "$shim/git" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "cherry" ] && [ -n "\${FAKE_CHERRY_FAIL:-}" ]; then
  exit 17
fi
exec "$real_git" "\$@"
EOF
chmod +x "$shim/git"

repo4="$tmp/repo4"
mkdir -p "$repo4/.claude/worktrees"
git -C "$repo4" init -q
git -C "$repo4" config user.email t@t
git -C "$repo4" config user.name t
git -C "$repo4" checkout -q -b dev
echo base > "$repo4/f.txt"; git -C "$repo4" add f.txt; git -C "$repo4" commit -qm base
git -C "$repo4" remote add origin "$repo4"
git -C "$repo4" worktree add -q -b feat-squashed "$repo4/.claude/worktrees/feat-squashed" dev
echo one >> "$repo4/.claude/worktrees/feat-squashed/f.txt"
git -C "$repo4/.claude/worktrees/feat-squashed" commit -qam c1
git -C "$repo4" merge --squash feat-squashed -q >/dev/null
git -C "$repo4" commit -qm squash

out="$(cd "$repo4" && PATH="$shim:$PATH" FAKE_CHERRY_FAIL=1 bash "$SCRIPT" dev 2>&1)"
printf '%s' "$out" | grep -q "kept, still checked out.*feat-squashed"; t "branch kept when cherry itself fails (fail closed)" $? "$out"
if [ -d "$repo4/.claude/worktrees/feat-squashed" ]; then
  pass=$((pass+1)); printf '  ok    worktree survives a failed cherry call\n'
else fail=$((fail+1)); printf '  FAIL  worktree survives a failed cherry call\n%s\n' "$out"; fi
git -C "$repo4" branch --list feat-squashed | grep -q feat-squashed
t "branch survives a failed cherry call" $? "branch feat-squashed missing"

# Ticket #635: the "never the main tree" guard compared worktree paths to
# `git rev-parse --show-toplevel` — wherever the sweep was INVOKED from. Run from a LINKED
# worktree, the real main checkout was evaluated like any other worktree and, when its branch
# read as merged, listed "-> remove" (git refused the removal; nothing lost, but only by luck).
# The main tree must NEVER be listed/removed, and neither may the worktree the sweep runs from.
repo5="$tmp/repo5"
mkdir -p "$repo5/.claude/worktrees"
git -C "$repo5" init -q
git -C "$repo5" config user.email t@t
git -C "$repo5" config user.name t
git -C "$repo5" checkout -q -b dev
# Ignore .claude/worktrees/ like the real repo does — without it the main tree reads DIRTY
# (the linked worktree dir is untracked) and the dirty guard would mask the #635 bug.
printf '.claude/worktrees/\n' > "$repo5/.gitignore"
echo base > "$repo5/f.txt"; git -C "$repo5" add f.txt .gitignore; git -C "$repo5" commit -qm base
git -C "$repo5" remote add origin "$repo5"
# Branch sits AT dev, so it is trivially merged — the sweep from inside it must skip both the
# main tree (on dev) and itself.
git -C "$repo5" worktree add -q -b feat-from-here "$repo5/.claude/worktrees/feat-from-here" dev
# Git prints REALPATHS in `worktree list` (macOS /var → /private/var), so the asserts compare
# against the resolved form too — same realpath lesson the fix itself must learn.
repo5_real="$(cd "$repo5" && pwd -P)"
wt_real="$(cd "$repo5/.claude/worktrees/feat-from-here" && pwd -P)"

out="$(cd "$repo5/.claude/worktrees/feat-from-here" && bash "$SCRIPT" dev 2>&1)"; rc=$?
[ "$rc" -eq 0 ]; t "sweep from a linked worktree exits zero" $? "$out"
if printf '%s' "$out" | grep -Fq "worktree (merged): $repo5_real [dev]"; then
  fail=$((fail+1)); printf '  FAIL  main tree never listed for removal (sweep run from linked worktree)\n%s\n' "$out"
else pass=$((pass+1)); printf '  ok    main tree never listed for removal (sweep run from linked worktree)\n'; fi
if [ -f "$repo5/f.txt" ]; then
  pass=$((pass+1)); printf '  ok    main tree still on disk\n'
else fail=$((fail+1)); printf '  FAIL  main tree still on disk\n'; fi
if printf '%s' "$out" | grep -Fq "$wt_real"; then
  fail=$((fail+1)); printf '  FAIL  invocation worktree never listed for removal\n%s\n' "$out"
else pass=$((pass+1)); printf '  ok    invocation worktree never listed for removal\n'; fi
[ -d "$repo5/.claude/worktrees/feat-from-here" ]
t "invocation worktree still on disk" $? "worktree feat-from-here missing"

# Ticket #637: BOTH archive paths (`archive_or_keep`'s destination and the 90d prune root)
# resolved via `git rev-parse --show-toplevel` — wherever the sweep was INVOKED from. Run from
# a linked worktree, traces were archived INTO that worktree instead of the main tree's
# adws/adw_data/archive (and the invoking worktree is never removed, so the evidence rots in a
# throwaway tree). Both must resolve under the MAIN tree: traces land in the main tree's
# archive, and the 90d prune removes a >90d entry there while a fresh entry survives.
repo6="$tmp/repo6"
mkdir -p "$repo6/.claude/worktrees"
git -C "$repo6" init -q
git -C "$repo6" config user.email t@t
git -C "$repo6" config user.name t
git -C "$repo6" checkout -q -b dev
# Same ignore set as the real repo: traced paths must not read as dirty, and the linked
# worktree dir must not make the main tree dirty.
printf '.claude/worktrees/\nadws/adw_data/sessions/\nadws/adw_data/sssf.db*\nadws/adw_data/archive/\n' > "$repo6/.gitignore"
echo base > "$repo6/f.txt"; git -C "$repo6" add f.txt .gitignore; git -C "$repo6" commit -qm base
git -C "$repo6" remote add origin "$repo6"
# The sweep is invoked from INSIDE this worktree (never removed — the #635 FROM_TREE guard).
git -C "$repo6" worktree add -q -b feat-invoker "$repo6/.claude/worktrees/feat-invoker" dev
# Separate merged worktree carrying a run trace — must be archived into the MAIN tree.
git -C "$repo6" worktree add -q -b feat-traced "$repo6/.claude/worktrees/feat-traced" dev
mkdir -p "$repo6/.claude/worktrees/feat-traced/adws/adw_data/sessions"
echo trace > "$repo6/.claude/worktrees/feat-traced/adws/adw_data/sessions/x.jsonl"
# The 90d prune root is the second archive path: an entry older than 90 days under the MAIN
# tree's adws/adw_data/archive must be pruned by a sweep invoked from the linked worktree,
# while a fresh entry survives.
mkdir -p "$repo6/adws/adw_data/archive/stale-cap"
echo keepsake > "$repo6/adws/adw_data/archive/stale-cap/run.jsonl"
touch -t 202601010000 "$repo6/adws/adw_data/archive/stale-cap"
mkdir -p "$repo6/adws/adw_data/archive/fresh-cap"
echo keepsake > "$repo6/adws/adw_data/archive/fresh-cap/run.jsonl"

out="$(cd "$repo6/.claude/worktrees/feat-invoker" && bash "$SCRIPT" dev 2>&1)"
[ -f "$repo6/adws/adw_data/archive/feat-traced/sessions/x.jsonl" ]
t "trace archived under the MAIN tree's archive (sweep run from a linked worktree)" $? "$out"
if [ -e "$repo6/.claude/worktrees/feat-invoker/adws/adw_data/archive/feat-traced" ]; then
  fail=$((fail+1)); printf '  FAIL  archive never lands inside the invoking worktree\n%s\n' "$out"
else pass=$((pass+1)); printf '  ok    archive never lands inside the invoking worktree\n'; fi
printf '%s' "$out" | grep -q "archive (pruned, >90d old): .*stale-cap"; t "90d prune hits the MAIN tree's archive (sweep run from a linked worktree)" $? "$out"
if [ ! -e "$repo6/adws/adw_data/archive/stale-cap" ]; then
  pass=$((pass+1)); printf '  ok    stale archive entry removed from disk (sweep run from a linked worktree)\n'
else fail=$((fail+1)); printf '  FAIL  stale archive entry removed from disk (sweep run from a linked worktree)\n'; fi
if [ -f "$repo6/adws/adw_data/archive/fresh-cap/run.jsonl" ]; then
  pass=$((pass+1)); printf '  ok    fresh archive entry survives the prune (sweep run from a linked worktree)\n'
else fail=$((fail+1)); printf '  FAIL  fresh archive entry survives the prune (sweep run from a linked worktree)\n'; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
