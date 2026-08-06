#!/usr/bin/env bash
# pre-pr-verify — the local battery, run before ANY PR is created or refreshed.
#
# Mirrors CI's verify lane (typecheck, lint, coverage-gated tests, build) so failures
# surface locally instead of in a queued CI round-trip. On success it stamps
# $GIT_DIR/pre-pr-verify-ok with the HEAD sha; the Claude hook
# .claude/hooks/pre-pr-gate.sh refuses PR creation unless that stamp matches HEAD.
#
# Deliberately NOT here: review-by-someone-else is enforced in CI by
# scripts/review-gate.sh; the audit-register coverage gate is tracked separately (#295).
set -euo pipefail
cd "$(dirname "$0")/.."

head="$(git rev-parse HEAD)"
gitdir="$(git rev-parse --git-dir)"
echo "── pre-pr-verify @ ${head:0:8} ($(git rev-parse --abbrev-ref HEAD))"

if [ -n "$(git status --porcelain)" ]; then
  echo "✗ worktree is dirty — the stamp certifies a COMMIT. Commit or stash first." >&2
  exit 1
fi

cd mos-app
npm run typecheck
npm run lint
npm run test:coverage
npm run build
cd ..

printf '%s' "$head" > "$gitdir/pre-pr-verify-ok"
echo "✓ ALL GREEN — stamped ${head:0:8}"
