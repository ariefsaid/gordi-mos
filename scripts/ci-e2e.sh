#!/usr/bin/env bash
# ci-e2e — the ONLY door for dispatching the full CI e2e lane (integration.yml, `db` job) by hand.
# MOS and PMO are public repos that share one account-level Actions concurrency limit, so the
# lane is fair-use metered instead of free-for-all. A raw `gh workflow run` / `gh run rerun` is
# hook-denied (.claude/hooks/gh-write-firewall.sh); this wrapper enforces the rule first:
#
#   1. never while a dispatched run is queued or in progress in EITHER repo (never queue a second)
#   2. at most 3 MOS dispatches per UTC day, unless --owner-ok "<the owner's quoted words>"
#   3. at most one dispatch per branch#PR, unless --bugfix-proof "<bug, app change>" (the first
#      run found a real app bug and the fix changed app code). That lifts the limit for exactly
#      ONE follow-up (valid only when one run exists); a third run needs --owner-ok
#
# usage: scripts/ci-e2e.sh <branch> <pr-number> [--bugfix-proof "<why>"] [--owner-ok "<words>"]
#
# Prior runs on a branch = max(runs GitHub lists for it, lines in the log). A failed read refuses.
# Every dispatch appends ONE tab-separated line to the log shared with PMO ($HOME/.ci-e2e.log):
#   <UTC ISO date-time> <repo> <branch>#<pr> <normal|bugfix-proof|owner-ok> <quoted words | ->
# Reads use raw `gh`; the single write is the dispatch itself. Check, dispatch and log run under
# one machine-wide lock, so two concurrent invocations cannot both pass the checks (single
# machine only; no cross-machine coordination).
#
#   CI_E2E_LOG           override the shared log path
#   CI_E2E_LOCK          override the lock file (default $HOME/.ci-e2e.lock)
#   CI_E2E_LOCK_TIMEOUT  seconds to wait for the lock before refusing (default 60)
#   CI_E2E_URL_WAIT      seconds to wait for the run URL to appear after dispatch (default 6)
# Self-test: scripts/ci-e2e.test.sh
set -uo pipefail

MOS_REPO="ariefsaid/gordi-mos"; MOS_WF="integration.yml"
PMO_REPO="ariefsaid/PMO";       PMO_WF="ci.yml"
DAILY_CAP=3
LOG="${CI_E2E_LOG:-$HOME/.ci-e2e.log}"

die() { printf '✗ ci-e2e: %s\n' "$1" >&2; exit "${2:-1}"; }
usage() { die "usage: scripts/ci-e2e.sh <branch> <pr-number> [--bugfix-proof \"<why>\"] [--owner-ok \"<owner's words>\"]" 2; }

[ $# -ge 2 ] || usage
branch="$1"; pr="$2"; shift 2
case "$pr" in ''|*[!0-9]*) usage ;; esac
[ -n "$branch" ] || usage
bugfix="" ownerok=""
_orig=("$branch" "$pr")
while [ $# -gt 0 ]; do
  case "$1" in
    --bugfix-proof) [ $# -ge 2 ] && [ -n "$2" ] || usage; bugfix="$2"; _orig+=("$1" "$2"); shift 2 ;;
    --owner-ok)     [ $# -ge 2 ] && [ -n "$2" ] || usage; ownerok="$2"; _orig+=("$1" "$2"); shift 2 ;;
    *) usage ;;
  esac
done

# Serialize check -> dispatch -> log: re-run this script under the machine lock (exit 75 if the
# lock cannot be had in time). CI_E2E_LOCK_HELD marks the locked re-run.
if [ "${CI_E2E_LOCK_HELD:-}" != 1 ]; then
  exec bash "$(cd "$(dirname "$0")" && pwd)/lib/flock-run.sh" ci-e2e "${CI_E2E_LOCK:-$HOME/.ci-e2e.lock}" \
    "${CI_E2E_LOCK_TIMEOUT:-60}" CI_E2E_LOCK_HELD "another ci-e2e dispatch" -- \
    bash "$(cd "$(dirname "$0")" && pwd)/ci-e2e.sh" "${_orig[@]}"
fi

# One line per run: "<url> <branch>". A failed read is a refusal — an unverifiable queue is not empty.
active_runs() { # $1 repo · $2 workflow · $3 status
  gh run list -R "$1" --workflow "$2" --event workflow_dispatch --status "$3" \
    --json url,headBranch -q '.[] | "\(.url) \(.headBranch)"'
}

# ── 1. Nothing queued or running in either repo.
busy=""
for spec in "$MOS_REPO $MOS_WF" "$PMO_REPO $PMO_WF"; do
  set -- $spec
  for status in in_progress queued; do
    out="$(active_runs "$1" "$2" "$status")" || die "cannot list $status $2 runs in $1 — refusing (cannot prove the queue is empty)"
    [ -z "$out" ] || busy="${busy}${1} ${2} ${status}: ${out}"$'\n'
  done
done
if [ -n "$busy" ]; then
  printf '%s' "$busy" >&2
  die "a dispatched e2e run is already queued or in progress (listed above) — wait for it; never queue a second one"
fi

# ── 2. Daily cap, counted from GitHub itself (so a dispatch from any machine counts).
today="$(date -u +%Y-%m-%d)"
created="$(gh run list -R "$MOS_REPO" --workflow "$MOS_WF" --event workflow_dispatch --limit 100 \
  --json createdAt -q '.[].createdAt')" || die "cannot list today's $MOS_WF dispatches — refusing"
n_today="$(printf '%s\n' "$created" | grep -c "^$today" || true)"
if [ "$n_today" -ge "$DAILY_CAP" ] && [ -z "$ownerok" ]; then
  die "$n_today e2e dispatches already today (UTC) — cap is $DAILY_CAP per repo per day. Needs the owner's explicit OK: --owner-ok \"<their words>\""
fi

# ── 3. One run per branch#PR.
key="${branch}#${pr}"
n_log=0
[ ! -f "$LOG" ] || n_log="$(awk -F'\t' -v k="$key" '$2=="mos" && $3==k {n++} END{print n+0}' "$LOG")"
gh_runs="$(gh run list -R "$MOS_REPO" --workflow "$MOS_WF" --event workflow_dispatch --branch "$branch" --limit 100 \
  --json url -q '.[].url')" || die "cannot list prior $MOS_WF dispatches on $branch — refusing (cannot prove this PR has had none)"
n_gh="$(printf '%s\n' "$gh_runs" | grep -c . || true)"
n_prior=$(( n_gh > n_log ? n_gh : n_log ))
if [ "$n_prior" -ge 1 ] && [ -z "$ownerok" ]; then
  if [ "$n_prior" -ge 2 ]; then
    die "$key already had $n_prior e2e dispatches (GitHub: $n_gh, log: $n_log). A third run needs the owner's explicit --owner-ok \"<words>\" — --bugfix-proof covers only the second"
  elif [ -z "$bugfix" ]; then
    die "$key already had $n_prior e2e dispatch (GitHub: $n_gh, log: $n_log). A second run needs --bugfix-proof \"<what bug, which app change>\" (first run found a real app bug and the fix changed app code) or the owner's explicit --owner-ok \"<words>\""
  fi
fi

mode=normal; why="-"
if [ -n "$bugfix" ];  then mode=bugfix-proof; why="$bugfix";  fi
if [ -n "$ownerok" ]; then mode=owner-ok;     why="$ownerok"; fi
why="$(printf '%s' "$why" | tr '\t\r\n' '   ')"   # the log is tab-separated, one line per dispatch

GH_POST_DOOR=1 gh workflow run "$MOS_WF" -R "$MOS_REPO" --ref "$branch" || die "gh workflow run failed — nothing logged"
mkdir -p "$(dirname "$LOG")"
printf '%s\tmos\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$key" "$mode" "$why" >> "$LOG" \
  || die "dispatched but could not append to $LOG — record it by hand"
echo "✓ dispatched $MOS_WF on $branch ($mode) — logged to $LOG"

wait_s="${CI_E2E_URL_WAIT:-6}"; url=""
for _ in 1 2 3; do
  [ "$wait_s" = 0 ] || sleep "$((wait_s / 3 + 1))"
  url="$(gh run list -R "$MOS_REPO" --workflow "$MOS_WF" --event workflow_dispatch --branch "$branch" --limit 1 \
    --json url -q '.[0].url' 2>/dev/null)" || url=""
  [ -z "$url" ] || [ "$url" = null ] || break
  url=""
done
[ -n "$url" ] && echo "run: $url" || echo "run URL not visible yet — gh run list -R $MOS_REPO --workflow $MOS_WF"
exit 0
