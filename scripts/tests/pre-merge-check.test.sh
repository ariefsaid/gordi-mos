#!/usr/bin/env bash
# Tests for scripts/pre-merge-check.sh — the machine review gate.
#
# Why this exists: the gate failed OPEN twice on 2026-07-30, both times by trusting a git ref that
# had silently moved, and both times the bug shipped because the change was verified only against
# the scenario it was written for. A gate nobody tests is a gate whose failure mode is discovered
# by the incident it was built to prevent. Every case below is one that actually bit us, or the
# inverse of one — and each asserts an EXIT CODE, so a check that can no longer fail is itself a
# failure here.
#
# Usage: bash scripts/tests/pre-merge-check.test.sh
# No framework, no fixtures dir: each case builds a throwaway repo in $TMPDIR and deletes it.

set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/scripts/pre-merge-check.sh"
[[ -f "$SCRIPT" ]] || { echo "cannot find pre-merge-check.sh at $SCRIPT" >&2; exit 1; }

PASSED=0; FAILED=0

# Builds a repo with a real remote, a `main`, and a `dev` carrying unreviewed work.
# Echoes: <workdir> <merge-base-short>
make_repo() {
  local root; root="$(mktemp -d)"
  git init -q --bare "$root/remote"
  git init -q -b main "$root/work"
  (
    cd "$root/work"
    git config user.email t@t.test; git config user.name t
    git remote add origin "$root/remote"
    mkdir -p docs/reviews scripts
    cp "$SCRIPT" scripts/pre-merge-check.sh
    echo base > f.txt; git add -A; git commit -qm c0; git push -q origin main
    git checkout -qb dev
    echo work > g.txt; git add -A; git commit -qm "unreviewed work"
  )
  echo "$root"
}

write_ledger() {  # <workdir> <sha-cited-in-scope> [extra-body]
  local w="$1" sha="$2" extra="${3:-}"
  { printf '**Scope:** window since main @ `%s`\n' "$sha"
    printf -- '- spec: PASS — t\n- code-quality: PASS — t\n- design: PASS — t\n- security: PASS — t\n'
    [[ -n "$extra" ]] && printf '%s\n' "$extra"
  } > "$w/work/docs/reviews/dev.md"
  (cd "$w/work" && git add -A && git commit -qm ledger)
}

run_gate() {  # <workdir> [env assignments...] -> prints exit code
  local w="$1"; shift
  ( cd "$w/work" && env "$@" bash scripts/pre-merge-check.sh >/dev/null 2>&1; echo $? )
}

check() {  # <name> <expected-exit> <actual-exit>
  if [[ "$2" == "$3" ]]; then
    printf '  ok   %s (exit %s)\n' "$1" "$3"; PASSED=$((PASSED+1))
  else
    printf '  FAIL %s — expected exit %s, got %s\n' "$1" "$2" "$3"; FAILED=$((FAILED+1))
  fi
}

echo "pre-merge-check.sh"

# 1. Ledger citing the true merge-base → PASS.
R="$(make_repo)"; B="$(cd "$R/work" && git rev-parse --short=7 origin/main)"
write_ledger "$R" "$B"
check "current ledger passes" 0 "$(run_gate "$R")"
rm -rf "$R"

# 2. Ledger citing a SHA that is not the merge-base → FAIL. The original bug.
R="$(make_repo)"; write_ledger "$R" "deadbee"
check "stale ledger fails" 1 "$(run_gate "$R")"
rm -rf "$R"

# 3. Missing ledger → FAIL.
R="$(make_repo)"
check "missing ledger fails" 1 "$(run_gate "$R")"
rm -rf "$R"

# 4. Blocking verdict → FAIL even when the SHA is current.
R="$(make_repo)"; B="$(cd "$R/work" && git rev-parse --short=7 origin/main)"
write_ledger "$R" "$B"
(cd "$R/work" && sed -i.bak 's/- spec: PASS — t/- spec: REWORK — t/' docs/reviews/dev.md && rm -f docs/reviews/dev.md.bak && git commit -qam rework)
check "REWORK verdict fails" 1 "$(run_gate "$R")"
rm -rf "$R"

# 5. THE C-1 REGRESSION. Remote unreachable AND origin/main stale: the gate must refuse, not
#    silently measure against the stale ref. This exact shape printed "PASS: safe to merge" over
#    unreviewed commits before the fix.
R="$(make_repo)"; B="$(cd "$R/work" && git rev-parse --short=7 origin/main)"
write_ledger "$R" "$B"
(
  cd "$R/work"
  git checkout -q main && echo adv > h.txt && git add -A && git commit -qm "real main moved" && git push -q origin main
  git update-ref refs/remotes/origin/main "$B"   # never fetched since
  git checkout -q dev
  git remote set-url origin /nonexistent/unreachable.git
)
check "offline + stale origin/main fails closed" 1 "$(run_gate "$R")"
check "  ...and ALLOW_STALE_BASE=1 is an explicit, working override" 0 "$(run_gate "$R" ALLOW_STALE_BASE=1)"
rm -rf "$R"

# 6. No origin/main at all (fork with a differently-named remote, --single-branch clone) → FAIL,
#    not a silent fallback to a local ref.
R="$(make_repo)"; B="$(cd "$R/work" && git rev-parse --short=7 origin/main)"
write_ledger "$R" "$B"
(cd "$R/work" && git update-ref -d refs/remotes/origin/main && git remote set-url origin /nonexistent/unreachable.git)
check "no origin/main fails closed" 1 "$(run_gate "$R")"
rm -rf "$R"

# 7. THE I-5 REGRESSION. The Scope line is stale but the current SHA appears elsewhere in the
#    ledger — a pasted git log, or this repo's real "superseded ledger" provenance section.
#    A whole-file grep passes here; a Scope-line match must not.
R="$(make_repo)"; B="$(cd "$R/work" && git rev-parse --short=7 origin/main)"
write_ledger "$R" "deadbee" "## Superseded provenance
Earlier promotion: $B (retained for history)"
check "current SHA outside the Scope line does not satisfy the check" 1 "$(run_gate "$R")"
rm -rf "$R"

# 8. Feature branches are exempt — their ledger is written once for one window and has no
#    staleness mode. A false FAIL here would block every PR in the repo.
R="$(make_repo)"
(
  cd "$R/work" && git checkout -q -b feat/thing
  printf -- '- spec: PASS — t\n- code-quality: PASS — t\n- design: PASS — t\n- security: PASS — t\n' > docs/reviews/feat-thing.md
  git add -A && git commit -qm ledger
)
check "feature branch with no SHA in its ledger still passes" 0 "$(run_gate "$R")"
rm -rf "$R"

# 9. Branch-name matching is literal, not a glob or prefix: 'dev-something' is a feature branch.
R="$(make_repo)"
(
  cd "$R/work" && git checkout -q -b dev-something
  printf -- '- spec: PASS — t\n- code-quality: PASS — t\n- design: PASS — t\n- security: PASS — t\n' > docs/reviews/dev-something.md
  git add -A && git commit -qm ledger
)
check "'dev-something' is not treated as the long-lived 'dev'" 0 "$(run_gate "$R")"
rm -rf "$R"

# 10. core.abbrev drift must not block a correct ledger: `--short` alone would emit 12 chars here
#     and stop matching a 7-char citation.
R="$(make_repo)"; B="$(cd "$R/work" && git rev-parse --short=7 origin/main)"
write_ledger "$R" "$B"
(cd "$R/work" && git config core.abbrev 12)
check "core.abbrev=12 does not break a valid 7-char citation" 0 "$(run_gate "$R")"
rm -rf "$R"

# 11. THE F-1 REGRESSION. `git fetch origin main` updates refs/remotes/origin/main only when the
#     configured refspec covers it. Narrow the refspec and the fetch EXITS 0 while the tracking ref
#     stays frozen — success reported, baseline unmoved, gate passes over unreviewed work.
#     NB the merge-base only MOVES if dev has merged main, so the scenario must include that;
#     simply advancing main leaves merge-base at the fork point and the old ledger stays valid.
R="$(make_repo)"; OLD_B="$(cd "$R/work" && git rev-parse --short=7 origin/main)"
write_ledger "$R" "$OLD_B"
(
  cd "$R/work"
  git checkout -q main && echo adv > h.txt && git add -A && git commit -qm "real main moved" && git push -q origin main
  git checkout -q dev && git merge -q --no-edit main          # merge-base is now main's new tip
  git update-ref refs/remotes/origin/main "$OLD_B"            # pretend we never fetched it
  git config --unset-all remote.origin.fetch
  git config remote.origin.fetch '+refs/heads/dev:refs/remotes/origin/dev'   # does NOT cover main
)
check "fetch that succeeds without moving origin/main is caught" 1 "$(run_gate "$R")"
rm -rf "$R"

# 12. THE F-2 REGRESSION. PRE_MERGE_NO_FETCH=1 set FETCH_OK to a value that was neither "true" nor
#     "false", so the guard never fired — a silent bypass, quieter than the documented one.
R="$(make_repo)"; B="$(cd "$R/work" && git rev-parse --short=7 origin/main)"
write_ledger "$R" "$B"
check "PRE_MERGE_NO_FETCH alone is not a bypass" 1 "$(run_gate "$R" PRE_MERGE_NO_FETCH=1)"
check "  ...but with ALLOW_STALE_BASE it is an acknowledged one" 0 "$(run_gate "$R" PRE_MERGE_NO_FETCH=1 ALLOW_STALE_BASE=1)"
rm -rf "$R"

echo ""
echo "passed $PASSED, failed $FAILED"
[[ "$FAILED" -eq 0 ]]
