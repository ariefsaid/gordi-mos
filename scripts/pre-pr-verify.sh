#!/usr/bin/env bash
# pre-pr-verify — the local battery, run before ANY PR is created or refreshed.
#
# Mirrors CI's verify lane (typecheck, lint, coverage-gated tests, build) so failures
# surface locally instead of in a queued CI round-trip. On success it stamps
# $GIT_DIR/pre-pr-verify-ok with the HEAD sha; the Claude hook
# .claude/hooks/pre-pr-gate.sh refuses PR creation unless that stamp matches HEAD.
#
# Deliberately NOT here: review-by-someone-else (docs/agents/review.md — three lenses, a loop step,
# never a CI check); the audit-register coverage gate is tracked separately (#295).
set -euo pipefail
cd "$(dirname "$0")/.."

head="$(git rev-parse HEAD)"
gitdir="$(git rev-parse --git-dir)"
echo "── pre-pr-verify @ ${head:0:8} ($(git rev-parse --abbrev-ref HEAD))"

if [ -n "$(git status --porcelain)" ]; then
  echo "✗ worktree is dirty — the stamp certifies a COMMIT. Commit or stash first." >&2
  exit 1
fi

# The python side of the repo — the nightly snapshot job. CI's verify lane only ever exercises
# mos-app/, so without this the job's unit suite would be absent from the battery that stamps a
# commit as ready for a PR. It is hermetic and takes milliseconds.
bash scripts/reporting-snapshot.test.sh

# ponytail: diff budget — oversized tickets are what six-round review chains are made of.
# Warn-first for one milestone (owner 2026-08-27), then flips to a refusal.
base="$(git merge-base HEAD "origin/${MOS_PR_BASE:-dev}" 2>/dev/null || true)"
if [ -n "$base" ]; then
  changed=$(git diff --numstat "$base"...HEAD -- ':!*package-lock.json' | awk '{s+=$1+$2} END{print s+0}')
  [ "$changed" -le 400 ] || echo "⚠ diff budget: $changed changed lines (>400) — split the next ticket smaller"
  # Comment-essay refusal over the whole branch (the 3000-words-per-LOC class). Counts, never judges.
  bash scripts/prose-budget.sh "$base"
fi

# A fresh git worktree has no node_modules, and a rebase that crosses a dependency change leaves a
# stale one. Either way the heavy section dies with `tsc: command not found` (exit 127) or a wall of
# TS2307s naming packages the branch never touched — which reads as a broken toolchain or, worse,
# as the branch's own failure. That misreading cost four false diagnoses in one session.
# `npm ci` (not install) is what CI runs, so it also proves package.json and the lockfile agree.
# Outside the test lock: installing is not a test, and holding the lock through it starves the host.
if [ ! -x mos-app/node_modules/.bin/tsc ]; then
  echo "── deps: node_modules is absent or incomplete in this worktree — running npm ci first"
  (cd mos-app && npm ci --no-audit --no-fund)
fi

# The heavy section runs under the machine-global test lock: two concurrent batteries starve
# each other into moving false REDs — and two full vitest pools OOM'd this host once already.
bash scripts/with-test-lock.sh bash -c \
  'cd mos-app && npm run typecheck && npm run lint && npm run test:coverage && npm run build'

printf '%s' "$head" > "$gitdir/pre-pr-verify-ok"
echo "✓ ALL GREEN — stamped ${head:0:8}"
