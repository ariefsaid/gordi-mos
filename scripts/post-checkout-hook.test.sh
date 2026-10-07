#!/usr/bin/env bash
# Self-test for .githooks/post-checkout — a new worktree gets the main checkout's project skills.
set -uo pipefail
cd "$(dirname "$0")/.."
HOOK="$(pwd)/.githooks/post-checkout"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }
g() { git -C "$1" -c user.email=t@t -c user.name=t "${@:2}"; }

git init -q "$tmp/main"
mkdir -p "$tmp/main/.githooks"; cp "$HOOK" "$tmp/main/.githooks/post-checkout"
g "$tmp/main" config core.hooksPath .githooks
echo x > "$tmp/main/f"; g "$tmp/main" add f; g "$tmp/main" commit -qm base
mkdir -p "$tmp/main/.claude/skills/demo"; echo '# demo' > "$tmp/main/.claude/skills/demo/SKILL.md"

g "$tmp/main" worktree add -q "$tmp/wt" -b wt 2>/dev/null
[ -f "$tmp/wt/.agents/skills/demo/SKILL.md" ] && ok "new worktree sees the main checkout's skills" \
  || bad "new worktree has no .agents/skills/demo/SKILL.md"


# An existing .agents is never replaced.
g "$tmp/main" worktree add -q --no-checkout "$tmp/wt3" -b wt3 2>/dev/null
mkdir -p "$tmp/wt3/.agents/skills/own"
(cd "$tmp/wt3" && bash "$HOOK" 0 0 1)
[ -d "$tmp/wt3/.agents/skills/own" ] && [ ! -L "$tmp/wt3/.agents/skills" ] && ok "existing .agents/skills kept" \
  || bad "existing .agents/skills was replaced"

# A planted .agents symlink is never followed.
g "$tmp/main" worktree add -q --no-checkout "$tmp/wt5" -b wt5 2>/dev/null
mkdir -p "$tmp/elsewhere"; ln -s "$tmp/elsewhere" "$tmp/wt5/.agents"
(cd "$tmp/wt5" && bash "$HOOK" 0 0 1)
[ ! -e "$tmp/elsewhere/skills" ] && ok "planted .agents symlink not followed" || bad "hook wrote through a planted .agents symlink"

# setup-hooks, run from a worktree: hooks come from the main checkout by absolute path, and the
# main checkout plus every existing worktree get the link.
mkdir -p "$tmp/main/scripts"; cp scripts/setup-hooks.sh "$tmp/main/scripts/"
g "$tmp/main" add scripts .githooks; g "$tmp/main" commit -qm setup
g "$tmp/main" update-ref refs/remotes/origin/dev HEAD
g "$tmp/main" worktree add -q --no-checkout "$tmp/wt6" -b wt6 2>/dev/null
g "$tmp/wt6" checkout -q wt6 -- scripts 2>/dev/null
bash "$tmp/wt6/scripts/setup-hooks.sh" >/dev/null 2>&1
want="$(cd "$tmp/main/.git" && pwd -P)/mos-hooks-$(g "$tmp/main" rev-parse --short=12 origin/dev)"
got="$(g "$tmp/main" config core.hooksPath)"
[ "$(cd "$got" 2>/dev/null && pwd -P)" = "$want" ] && [ -x "$want/post-checkout" ] && ok "setup-hooks installs the hooks into the shared git dir" \
  || bad "setup-hooks hooksPath=$got, want $want"
[ -f "$tmp/main/.agents/skills/demo/SKILL.md" ] && [ -f "$tmp/wt6/.agents/skills/demo/SKILL.md" ] \
  && ok "setup-hooks backfills the main checkout and existing worktrees" || bad "setup-hooks did not backfill the links"
# A branch's own copy of a hook never runs when a worktree checks it out.
g "$tmp/main" worktree add -q "$tmp/wt7" -b wt7 2>/dev/null
g "$tmp/main" checkout -q -b hostile
printf '#!/usr/bin/env bash\ntouch "%s/pwned"\n' "$tmp" > "$tmp/main/.githooks/post-checkout"
g "$tmp/main" commit -qam hostile; g "$tmp/main" checkout -q - 2>/dev/null; rm -f "$tmp/pwned"
g "$tmp/wt7" checkout -q hostile 2>/dev/null
[ ! -e "$tmp/pwned" ] && ok "a worktree checking out a branch never runs that branch's hook" || bad "the branch's own post-checkout ran in a worktree"
g "$tmp/main" checkout -q --detach hostile 2>/dev/null
[ ! -e "$tmp/pwned" ] && ok "the main checkout switching branch never runs that branch's hook" || bad "the branch's own post-checkout ran in the main checkout"
g "$tmp/main" checkout -q - 2>/dev/null

# setup-hooks installs origin/dev's committed hooks even while the main checkout sits on a
# hostile branch.
g "$tmp/main" checkout -q --detach hostile 2>/dev/null; rm -f "$tmp/pwned"
bash "$tmp/wt6/scripts/setup-hooks.sh" >/dev/null 2>&1
g "$tmp/main" checkout -q - 2>/dev/null; rm -f "$tmp/pwned"
g "$tmp/main" worktree add -q --detach "$tmp/wt8" HEAD 2>/dev/null
[ ! -e "$tmp/pwned" ] && ok "setup-hooks never installs a checked-out branch's hook" || bad "setup-hooks installed the hostile branch's hook"

# Re-running after dev moves installs a new set first, then removes the old one.
first="$(g "$tmp/main" config core.hooksPath)"
g "$tmp/main" commit -q --allow-empty -m moved; g "$tmp/main" update-ref refs/remotes/origin/dev HEAD
bash "$tmp/wt6/scripts/setup-hooks.sh" >/dev/null 2>&1
second="$(g "$tmp/main" config core.hooksPath)"
[ "$first" != "$second" ] && [ -x "$second/post-checkout" ] && [ ! -e "$first" ] \
  && ok "a re-install repoints to a complete new set and removes the old one" || bad "re-install: first=$first second=$second"

# A second setup waits while another holds the lock, then completes; a holder that dies frees it.
lockfile="$(cd "$tmp/main/.git" && pwd -P)/mos-hooks.lock"
hold() { perl -MFcntl=:flock -e 'open(my $f, ">>", shift) or die; flock($f, LOCK_EX) or die; sleep 30' "$lockfile" & holder=$!; sleep 0.5; }
g "$tmp/main" commit -q --allow-empty -m moved-again; g "$tmp/main" update-ref refs/remotes/origin/dev HEAD
before="$(g "$tmp/main" config core.hooksPath)"
hold
bash "$tmp/wt6/scripts/setup-hooks.sh" >/dev/null 2>&1 & bg=$!
sleep 1
[ "$(g "$tmp/main" config core.hooksPath)" = "$before" ] && kill -0 "$bg" 2>/dev/null && waited=1 || waited=0
kill -9 "$holder"; wait "$bg"
[ "$waited" = 1 ] && [ "$(g "$tmp/main" config core.hooksPath)" != "$before" ] \
  && ok "a second setup waits for the lock and proceeds once the holder dies" || bad "setup did not serialize on the lock (waited=$waited)"

# No skills in the main checkout: nothing linked, checkout still succeeds.
rm -rf "$tmp/main/.claude"
g "$tmp/main" worktree add -q "$tmp/wt4" -b wt4 2>/dev/null; rc=$?
[ "$rc" -eq 0 ] && [ ! -e "$tmp/wt4/.agents" ] && ok "no main skills: no link, checkout succeeds" \
  || bad "no main skills: rc=$rc or a dangling .agents was made"

printf '\npost-checkout hook: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
