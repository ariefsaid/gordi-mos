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
stage="$(mktemp -d "$common/mos-hooks.XXXXXX")"
git archive "$src" .githooks | tar -x -C "$stage"
chmod +x "$stage"/.githooks/*
# Swap in one rename; the old set stays live until the new one is complete.
[ -d "$common/mos-hooks" ] && mv "$common/mos-hooks" "$stage/old"
mv "$stage/.githooks" "$common/mos-hooks"
rm -rf "$stage"
git config core.hooksPath "$common/mos-hooks"
git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r wt; do
  (cd "$wt" 2>/dev/null && bash "$common/mos-hooks/post-checkout") || true
done
echo "✓ core.hooksPath = $common/mos-hooks (installed from $src)"
echo "  pre-commit gates: conflict markers + eslint/stylelint/vitest scoped to staged files"
