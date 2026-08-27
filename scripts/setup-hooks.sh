#!/usr/bin/env bash
# Point git at the repo's TRACKED hooks (.githooks) so the pre-commit gate is versioned
# and applies to every clone and worktree — including the ones agents work in.
# Idempotent. Run once per clone:  ./scripts/setup-hooks.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true
echo "✓ core.hooksPath = .githooks (tracked)"
echo "  pre-commit gates: conflict markers + eslint/stylelint/vitest scoped to staged files"
