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
# Ledger contract: the EXIT trap appends after the gate has decided; the stamp is written only on green.
# It never alters the verification exit status, and ledger append failures never fail that result.
# Explicit exact-commit evidence: DESIGN_AUDIT_MODE=change-gate DESIGN_AUDIT_EVIDENCE_DIR=<dir>
# bash scripts/pre-pr-verify.sh. Unset DESIGN_AUDIT_MODE for ordinary checks.
#
# --dev: the light battery for a PR into dev, where CI is the full-suite gate — typecheck, lint
# and only the tests related to files changed vs the base. It writes pre-pr-verify-dev-ok, which
# scripts/gh-post.sh accepts for `--base dev` only. The default full battery (pre-pr-verify-ok) is
# what a PR into main needs.
set -euo pipefail
light=0
for _a in "$@"; do
  case "$_a" in
    --dev) light=1 ;;
    *) echo "usage: scripts/pre-pr-verify.sh [--dev]" >&2; exit 2 ;;
  esac
done
script_root="$(cd "$(dirname "$0")/.." && pwd -P)"
caller_root="$(git rev-parse --show-toplevel 2>/dev/null || :)"
if [ -z "$caller_root" ] || [ "$(cd "$caller_root" && pwd -P)" != "$script_root" ]; then
  echo "✗ pre-pr-verify invoked from a different checkout; run the script belonging to the checkout being verified" >&2
  exit 1
fi
cd "$script_root"

head="$(git rev-parse HEAD)"
gitdir="$(git rev-parse --git-dir)"
ledger_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
started_at="$(date +%s)"
mode=full
[ "$light" = 1 ] && mode=light
record_ledger() {
  local status=$? ended_at duration
  [ "$status" -eq 0 ] || mode=refused
  ended_at="$(date +%s 2>/dev/null || printf '%s' "$started_at")"
  duration=$((ended_at - started_at))
  [ "$duration" -ge 0 ] || duration=0
  { bash scripts/lib/flock-run.sh ledger-lock "$ledger_dir/verify-ledger.lock" 2 "" "the verification ledger" -- \
      bash -c 'printf "%s\\t%s\\t%s\\t%s\\n" "$1" "$2" "$3" "$4" >> "$5"' \
      _ "$started_at" "$duration" "$mode" "$head" "$ledger_dir/verify-ledger.log"; } 2>/dev/null || :
}
trap record_ledger EXIT

# Ordinary UI work keeps the changed-source detector and the normal app battery. The expensive
# exact-commit evidence validator is an explicit change-gate lane so a stale shell export cannot
# silently turn a bounded UI fix into a whole-matrix run.
audit_mode="${DESIGN_AUDIT_MODE:-ordinary}"
case "$audit_mode" in
  ordinary|change-gate) ;;
  *)
    rm -f "$gitdir/pre-pr-verify-ok" "$gitdir/pre-pr-verify-dev-ok"
    echo "✗ unknown DESIGN_AUDIT_MODE '$audit_mode' — unset it for ordinary checks or use change-gate" >&2
    exit 1
    ;;
esac
if [ "$audit_mode" = ordinary ] && [ -n "${DESIGN_AUDIT_EVIDENCE_DIR:-}" ]; then
  rm -f "$gitdir/pre-pr-verify-ok" "$gitdir/pre-pr-verify-dev-ok"
  echo "✗ DESIGN_AUDIT_EVIDENCE_DIR requires DESIGN_AUDIT_MODE=change-gate" >&2
  exit 1
fi
rm -f "$gitdir/pre-pr-verify-ok" "$gitdir/pre-pr-verify-dev-ok"
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
base_ref="origin/${MOS_PR_BASE:-dev}"
git rev-parse --verify "$base_ref^{commit}" >/dev/null 2>&1 || {
  echo "✗ cannot resolve verification base $base_ref" >&2
  exit 1
}
base="$(git merge-base HEAD "$base_ref")"
[ -n "$base" ] || { echo "✗ cannot find merge base with $base_ref" >&2; exit 1; }

# The quantitative audit is a database-free control surface. Re-run its manifest,
# artifact, and mutation checks whenever the harness or its chain wiring changes.
# A live render stays behind the explicit design-quality-audit.sh door.
design_audit_paths=""
if [ -n "$base" ]; then
  design_audit_paths="$(git diff --name-only "$base"...HEAD)"
fi
if printf '%s\n' "$design_audit_paths" | grep -Eq '^(adws/adw_design_audit\.py|mos-app/e2e/design-quality/|mos-app/playwright\.design-audit\.config\.ts|mos-app/tsconfig\.e2e\.json|scripts/design-quality-audit|mos-app/package\.json|\.github/workflows/(guards|design-shots)\.yml)$'; then
  bash scripts/design-quality-audit.test.sh
fi

# An explicit change-gate request validates the exact-commit evidence independently of the path
# diff. Ordinary UI changes do not enter this live-render lane.
if [ "$audit_mode" = change-gate ]; then
  if [ -z "${DESIGN_AUDIT_EVIDENCE_DIR:-}" ]; then
    echo "✗ DESIGN_AUDIT_MODE=change-gate requires DESIGN_AUDIT_EVIDENCE_DIR at the exact HEAD" >&2
    exit 1
  fi
  node --experimental-strip-types scripts/validate-design-evidence.mjs \
    "$DESIGN_AUDIT_EVIDENCE_DIR" "$head" --require-change-gate
fi
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
  # UI diffs must pass the repository-owned Impeccable detector. The helper scans the branch
  # diff when a base resolves and every tracked production UI source file when it does not.
  # Tests and fixtures stay excluded because their example markup may intentionally prove a rule.
  bash scripts/impeccable-changed-ui.sh "$base"

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
  if [ "$light" = 1 ]; then
    # Tests related to the changed app files only (deleted files cannot be passed). Changes
    # outside mos-app/src (config, dependencies) are CI's to catch on a dev PR.
    related=()
    while IFS= read -r _f; do
      [ -n "$_f" ] && related+=("${_f#mos-app/}")
    done < <(git diff --name-only --diff-filter=d "$base"...HEAD -- 'mos-app/src/*.ts' 'mos-app/src/*.tsx')
    # A supabase/ change has no import edge into mos-app, but some unit tests read those files
    # from disk: run them too.
    if [ -n "$(git diff --name-only "$base"...HEAD -- supabase/)" ]; then
      while IFS= read -r _f; do
        [ -n "$_f" ] && related+=("${_f#mos-app/}")
      done < <(git grep -l -E "'supabase'|[^@]supabase/" -- 'mos-app/src/*.test.ts' 'mos-app/src/*.test.tsx')
    fi
    echo "── light (--dev): typecheck, lint, tests related to ${#related[@]} changed file(s)"
    bash scripts/with-test-lock.sh bash -c \
      'cd mos-app && npm run typecheck && npm run lint && { [ "$#" -eq 0 ] || npm exec -- vitest related "$@" --run --passWithNoTests; }' \
      _ ${related[@]+"${related[@]}"}
  else
    bash scripts/with-test-lock.sh bash -c \
      'cd mos-app && npm run typecheck && npm run lint && npm run test:coverage && npm run build'
  fi
else
  mode=skipped
  echo "── every changed path proven inert — npm lane skipped (CI verify applies the same polarity)"
fi

# A change under scripts/ runs the guard self-tests CI's guards job runs (the list in guards.yml).
# The marker keeps a self-test that drives this script from recursing.
if [ -n "$base" ] && [ -z "${MOS_GUARD_SELFTESTS_RUNNING:-}" ] \
   && [ -n "$(git diff --name-only "$base"...HEAD -- scripts/)" ] && [ -f .github/workflows/guards.yml ]; then
  while IFS= read -r _t; do
    [ -f "$_t" ] || continue
    echo "── guard self-test: $_t"
    MOS_GUARD_SELFTESTS_RUNNING=1 bash "$_t" >/dev/null 2>&1 || { echo "✗ $_t failed — run it for details" >&2; exit 1; }
  done < <(grep -oE 'bash scripts/[A-Za-z0-9_.-]+\.test\.sh' .github/workflows/guards.yml | awk '{print $2}' | sort -u)
fi

if [ "$(git rev-parse HEAD)" != "$head" ] || [ -n "$(git status --porcelain)" ]; then
  echo "✗ checkout changed during verification — rerun on the final clean commit" >&2
  exit 1
fi

stamp=pre-pr-verify-ok; [ "$light" = 1 ] && stamp=pre-pr-verify-dev-ok
printf '%s' "$head" > "$gitdir/$stamp"
echo "✓ ALL GREEN — stamped ${head:0:8} ($stamp)"
