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

[ ! -e "$tmp/main/.agents" ] && ok "main checkout is left alone" || bad "hook wrote .agents into the main checkout"

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

# No skills in the main checkout: nothing linked, checkout still succeeds.
rm -rf "$tmp/main/.claude"
g "$tmp/main" worktree add -q "$tmp/wt4" -b wt4 2>/dev/null; rc=$?
[ "$rc" -eq 0 ] && [ ! -e "$tmp/wt4/.agents" ] && ok "no main skills: no link, checkout succeeds" \
  || bad "no main skills: rc=$rc or a dangling .agents was made"

printf '\npost-checkout hook: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
