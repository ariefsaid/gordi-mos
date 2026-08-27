#!/usr/bin/env bash
# The single door for GitHub WRITES from agent sessions. Raw `gh issue create`, `gh pr comment`,
# write-mode `gh api` etc. are hook-blocked (.claude/hooks/gh-write-firewall.sh); this wrapper
# scans every outbound string against the posting policy, then execs `gh` with the same args.
#
#   scripts/gh-post.sh issue comment 42 --body "..."     # any gh write, same argv as gh itself
#   scripts/gh-post.sh pr create --base dev --title ... # extra: requires the two PR stamps
#
# Policy patterns live OUTSIDE this public repo, in the local docs checkout
# (docs/gh-denylist.txt of the MAIN worktree — worktrees don't materialize gitignored dirs).
# Missing policy file = refuse (fail closed). A match = refuse, no override flag on purpose:
# reword the text or take it to the owner. Rationale: docs/decisions.md (2026-08-27).
#
# PR stamps checked on `pr create`:
#   <git-dir>/pre-pr-verify-ok        HEAD sha           (scripts/pre-pr-verify.sh)
#   <git-dir>/independent-review-ok   "<sha> <reviewer> …" (scripts/record-review.sh)
#
# Self-test: scripts/gh-post.test.sh
set -uo pipefail

die() { printf '✗ gh-post: %s\n' "$1" >&2; exit 1; }

[ $# -ge 1 ] || die "usage: gh-post.sh <gh args…>"

main_wt="$(git worktree list --porcelain 2>/dev/null | awk '$1=="worktree"{print $2; exit}')"
[ -n "$main_wt" ] || die "not inside a git checkout"
denylist="$main_wt/docs/gh-denylist.txt"
[ -s "$denylist" ] || die "posting policy missing: $denylist — writes are fail-closed without it"

# ── Collect every outbound string: all argv, plus the contents of any file-carrying flag
# (--body-file / --input / -F key=@file). Stdin payloads ('-') are refused outright — text the
# scanner can't see is text that doesn't leave.
texts=("$@")
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  a="${args[$i]}"
  f="" v=""
  case "$a" in
    --body-file|--input) f="${args[$((i + 1))]:-}" ;;
    --body-file=*|--input=*) f="${a#*=}" ;;
    -F|--field) v="${args[$((i + 1))]:-}" ;;
    -F?*) v="${a#-F}" ;;
    --field=*) v="${a#--field=}" ;;
  esac
  case "$v" in *=@*) f="${v#*=@}" ;; esac
  if [ -n "$f" ]; then
    [ "$f" != "-" ] || die "stdin payloads ('-') are not scannable — put the text in a file"
    [ -r "$f" ] || die "cannot read body file: $f"
    texts+=("$(cat "$f")")
  fi
done

# ── Scan. Report the matching pattern so the fix is obvious; never echo the blocked text back.
while IFS= read -r pat; do
  case "$pat" in ''|'#'*) continue ;; esac
  for t in "${texts[@]}"; do
    if printf '%s' "$t" | grep -Eiq -e "$pat"; then
      die "REFUSED — text matches posting-policy pattern: $pat
  This repo is public. Reword, or escalate to the owner. (Policy: $denylist)"
    fi
  done
done < "$denylist"

# ── PR creation: both stamps must certify the exact HEAD being PRed. The verb is found by the
# first two non-flag argv entries, so global flags (`gh --repo x/y pr create`) can't dodge it —
# and a pr create may only target THIS checkout: the stamps certify HEAD here, nothing else.
verb1="" verb2=""
skip=0
for a in "$@"; do
  if [ "$skip" = 1 ]; then skip=0; continue; fi
  case "$a" in
    -R|--repo|--hostname) skip=1; continue ;;   # value-taking global flags: skip flag + value
    -*) continue ;;
  esac
  if [ -z "$verb1" ]; then verb1="$a"; elif [ -z "$verb2" ]; then verb2="$a"; break; fi
done
if [ "$verb1" = "pr" ] && [ "$verb2" = "create" ]; then
  for a in "$@"; do
    case "$a" in
      --repo|--repo=*|-R|-R?*|--head|--head=*|-H|-H?*)
        die "'pr create' through this door targets the current checkout only — no --repo/--head (the stamps certify HEAD here). cd to the branch's checkout instead." ;;
    esac
  done
  gitdir="$(git rev-parse --git-dir)" || die "not a git repo"
  head="$(git rev-parse HEAD)"
  v="$(cat "$gitdir/pre-pr-verify-ok" 2>/dev/null || true)"
  [ "$v" = "$head" ] || die "no verify stamp for HEAD — run: bash scripts/pre-pr-verify.sh"
  r="$(awk '{print $1}' "$gitdir/independent-review-ok" 2>/dev/null || true)"
  [ "$r" = "$head" ] || die "no independent-review stamp for HEAD — an agent that did not write this branch must review it (glm/luna/terra, or opus as fallback), then: bash scripts/record-review.sh --reviewer <name> --artifact <review file>"
fi

exec gh "$@"
