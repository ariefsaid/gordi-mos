#!/usr/bin/env bash
# Install the main checkout's tracked hooks (.githooks) as a COPY inside the shared git dir and
# point every clone and worktree at it. Hooks then never come from whatever branch a checkout has
# — a branch-controlled post-checkout would run on mere checkout. Re-run to pick up hook changes
# (npm `prepare` does). Then link the project skills into the main checkout and every existing
# worktree (new ones get it from post-checkout). Idempotent:  ./scripts/setup-hooks.sh
set -euo pipefail
cd "$(dirname "$0")/.."
common="$(git rev-parse --path-format=absolute --git-common-dir)"
main="$(dirname "$common")"
rm -rf "$common/mos-hooks" && cp -R "$main/.githooks" "$common/mos-hooks"
chmod +x "$common"/mos-hooks/* 2>/dev/null || true
git config core.hooksPath "$common/mos-hooks"
git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r wt; do
  (cd "$wt" 2>/dev/null && bash "$common/mos-hooks/post-checkout") || true
done
echo "✓ core.hooksPath = $common/mos-hooks (installed copy of the main checkout's .githooks)"
echo "  pre-commit gates: conflict markers + eslint/stylelint/vitest scoped to staged files"
