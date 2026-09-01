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
# Ledger contract: the EXIT trap appends only after a successful run has written its stamp.
# Ledger contract: ledger append failures never fail the verification result.
set -euo pipefail
cd "$(dirname "$0")/.."

head="$(git rev-parse HEAD)"
gitdir="$(git rev-parse --path-format=absolute --git-common-dir)"
started_at="$(date +%s)"
mode=full
record_ledger() {
  local status=$? ended_at duration
  [ "$status" -eq 0 ] || mode=refused
  ended_at="$(date +%s 2>/dev/null || printf '%s' "$started_at")"
  duration=$((ended_at - started_at))
  [ "$duration" -ge 0 ] || duration=0
  { printf '%s\t%s\t%s\t%s\n' "$started_at" "$duration" "$mode" "$head" >> "$gitdir/verify-ledger.log"; } 2>/dev/null || :
}
trap record_ledger EXIT
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

# A fresh worktree has no node_modules; a rebase across a dependency change leaves a stale one.
# Either way the heavy section dies as `tsc: command not found` or a wall of TS2307s, which reads
# as a broken toolchain rather than a missing install — four false diagnoses in one session.
# `npm ci` is what CI runs, so it also proves package.json and the lockfile agree, and it writes
# node_modules/.package-lock.json — a newer lockfile means the tree predates current deps.

# SCOPE the heavy lane by the diff, with CI verify's own polarity: skip ONLY when every changed
# path is on a PROVEN-INERT allowlist — anything unrecognized runs the full battery, so layout
# drift (a root tsconfig, a shared/ package, a rename OUT of mos-app/) costs wasted minutes, not
# an unrun gate. The obvious inverse ("skip unless mos-app/ changed") is fail-open and was
# rejected in review for exactly the reason verify.yml documents. No resolvable base → full run.
app_touched=1
if [ -n "$base" ]; then
  changed="$(git diff --name-only "$base"...HEAD)"
  # No -q: early-exit SIGPIPEs the printf producer above the 64KB pipe buffer and pipefail then
  # reads the match as absent — a demonstrated wrong-skip at a 4999-file diff. Full drain + test
  # emptiness instead. List polarity note: additions here are DELIBERATE and each provably
  # cannot reach the npm gates — agents/ adws/ .githooks/ justfile .env.sample are root surfaces
  # with no path into mos-app's build; CI's inert list differs (supabase/ runs there too) and the
  # divergence is safe-direction only (extra local runs, never extra skips).
  offlist="$(printf '%s\n' "$changed" \
       | grep -vE '^(docs/|scripts/|agents/|adws/|\.githooks/|\.github/|\.claude/|justfile$|\.gitignore$|\.env\.sample$|[^/]+\.md$)' || true)"
  if [ -n "$changed" ] && [ -z "$offlist" ]; then
    app_touched=0
  fi
fi
if [ "$app_touched" = 1 ]; then
  # Every binary, not one sentinel: a tree with tsc but no eslint died 127 at `npm run lint`.
  # Installing is not a test, so this sits outside the test lock.
  deps_missing=""
  for _b in tsc eslint stylelint vitest vite; do
    [ -x "mos-app/node_modules/.bin/$_b" ] || deps_missing="${deps_missing}${deps_missing:+ }$_b"
  done
  if [ -n "$deps_missing" ] \
     || [ mos-app/package-lock.json -nt mos-app/node_modules/.package-lock.json ]; then
    echo "── deps: ${deps_missing:+missing }${deps_missing:-node_modules is older than package-lock.json} — running npm ci first"
    (cd mos-app && npm ci --no-audit --no-fund)
  fi
  # The heavy section runs under the machine-global test lock: two concurrent batteries starve
  # each other into moving false REDs — and two full vitest pools OOM'd this host once already.
  bash scripts/with-test-lock.sh bash -c \
    'cd mos-app && npm run typecheck && npm run lint && npm run test:coverage && npm run build'
else
  mode=skipped
  echo "── every changed path proven inert — npm lane skipped (CI verify applies the same polarity)"
fi

printf '%s' "$head" > "$gitdir/pre-pr-verify-ok"
echo "✓ ALL GREEN — stamped ${head:0:8}"
