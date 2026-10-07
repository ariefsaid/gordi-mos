#!/usr/bin/env bash
# Point git at the MAIN checkout's tracked hooks (.githooks) by absolute path, so every clone and
# worktree runs the same reviewed hooks — never the copy inside whatever branch a worktree has
# checked out (a branch-controlled post-checkout would run on mere checkout). Then link the project
# skills into the main checkout and every existing worktree (new ones get it from post-checkout).
# Idempotent. Run once per clone:  ./scripts/setup-hooks.sh  (npm `prepare` runs it too)
set -euo pipefail
cd "$(dirname "$0")/.."
main="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
git config core.hooksPath "$main/.githooks"
chmod +x "$main"/.githooks/* 2>/dev/null || true
git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r wt; do
  (cd "$wt" 2>/dev/null && bash "$main/.githooks/post-checkout") || true
done
echo "✓ core.hooksPath = $main/.githooks (the main checkout's tracked hooks)"
echo "  pre-commit gates: conflict markers + eslint/stylelint/vitest scoped to staged files"
