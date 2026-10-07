#!/usr/bin/env bash
# Install the tracked hooks (.githooks) from origin/dev — reviewed, committed content, never a
# working tree — as a copy inside the shared git dir, and point every clone and worktree at it.
# No checkout then ever runs a branch's own hook (a branch-controlled post-checkout would run on
# mere checkout). Re-run to pick up hook changes after they merge (npm `prepare` does). Then link
# the project skills into the main checkout and every existing worktree (new ones get it from
# post-checkout). Idempotent:  ./scripts/setup-hooks.sh
set -euo pipefail
cd "$(dirname "$0")/.."
common="$(git rev-parse --path-format=absolute --git-common-dir)"
src=origin/dev; git rev-parse -q --verify "$src" >/dev/null || src=HEAD   # fresh clone before fetch
dest="$common/mos-hooks-$(git rev-parse --short=12 "$src")"
if [ ! -d "$dest" ]; then
  stage="$(mktemp -d "$common/mos-hooks.XXXXXX")"; trap 'rm -rf "$stage"' EXIT
  git archive "$src" .githooks | tar -x -C "$stage"
  chmod +x "$stage"/.githooks/*
  mv "$stage/.githooks" "$dest"
fi
# Repoint in one config write (git swaps the config file atomically), then drop older sets — there
# is never a moment without hooks.
git config core.hooksPath "$dest"
# Never remove the set the config names right now: a concurrent setup may have just repointed it.
active="$(git config core.hooksPath)"
for d in "$common"/mos-hooks-*; do [ "$d" = "$dest" ] || [ "$d" = "$active" ] || rm -rf "$d"; done
git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r wt; do
  (cd "$wt" 2>/dev/null && bash "$dest/post-checkout") || true
done
echo "✓ core.hooksPath = $dest (installed from $src)"
echo "  pre-commit gates: conflict markers + eslint/stylelint/vitest scoped to staged files"
