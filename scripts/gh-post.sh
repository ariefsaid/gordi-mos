#!/usr/bin/env bash
# The single door for GitHub WRITES from agent sessions. Raw `gh issue create`, `gh pr comment`,
# write-mode `gh api` etc. are hook-blocked (.claude/hooks/gh-write-firewall.sh); this wrapper
# scans every outbound string against the posting policy, then execs `gh` with the same args.
#
#   scripts/gh-post.sh issue comment 42 --body "..."     # any gh write, same argv as gh itself
#   scripts/gh-post.sh pr create --base dev --title ... # requires three lens stamps; other bases also need full verify
#
# Policy patterns live OUTSIDE this public repo, in the local docs checkout
# (docs/gh-denylist.txt of the MAIN worktree — worktrees don't materialize gitignored dirs).
# Missing policy file = refuse (fail closed). A match = refuse, no override flag on purpose:
# reword the text or take it to the owner. Rationale: docs/decisions.md (2026-08-27).
#
# PR stamps checked on `pr create` and REST create `api repos/<this>/pulls`: dev needs only the three
# lens stamps because CI verify is its gate; every other base needs full local verify plus all lenses.
#   <git-dir>/pre-pr-verify-ok                    HEAD sha    (scripts/pre-pr-verify.sh; non-dev bases)
#   <git-dir>/independent-review-<lens>-ok  ×3    per lens    (scripts/record-review.sh --lens …)
#
# Self-test: scripts/gh-post.test.sh
set -uo pipefail

die() { printf '✗ gh-post: %s\n' "$1" >&2; exit 1; }

[ $# -ge 1 ] || die "usage: gh-post.sh <gh args…>"

main_wt="$(git worktree list --porcelain 2>/dev/null | awk '$1=="worktree"{print $2; exit}')"
[ -n "$main_wt" ] || die "not inside a git checkout"
denylist="$main_wt/docs/gh-denylist.txt"
[ -s "$denylist" ] || die "posting policy missing: $denylist — writes are fail-closed without it"

# ── Verb allowlist. A firewall enumerates what it PERMITS — a denylist of argv forms is a
# bypass-hunting game with no end (rounds 1–3 of the gate review each found a new one: global
# flags, =-forms, `pr new`, `release -F`). Only the writes this repo actually performs pass;
# anything else — aliases included — is refused until deliberately added here.
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
case "$verb1 $verb2" in
  "issue create"|"issue comment"|"issue edit"|"issue close"|"issue reopen") ;;
  "pr create"|"pr comment"|"pr edit"|"pr close"|"pr reopen"|"pr review") ;;
  "api "*) ;;
  *) die "'$verb1 $verb2' is not in the allowlist — this door permits the writes the repo actually uses (issue/pr create·comment·edit·close·reopen·review, api). Canonical verbs only, no aliases. Extend scripts/gh-post.sh deliberately if this write is legitimate." ;;
esac

# ── api argv is parsed exactly as gh parses it, so the path, method and fields the door checks are
# the ones gh sends: the endpoint comes straight after `api`, and every flag is one gh documents.
# A short-flag cluster (`-iXPOST`) or a decoy flag value would otherwise slip a second meaning past.
api_method="" api_input=0 api_fields=()
if [ "$verb1" = "api" ]; then
  [ "${1:-}" = "api" ] && [ "${2:-}" = "$verb2" ] || die "'api' must come first, with the endpoint straight after it"
  argv=("$@")
  for ((i = 2; i < ${#argv[@]}; i++)); do
    a="${argv[$i]}" val=""
    case "$a" in
      -X|--method|-f|--raw-field|-F|--field|-H|--header|-p|--preview|-q|--jq|-t|--template|--cache|--input)
        [ $((i + 1)) -lt ${#argv[@]} ] || die "'$a' needs a value"
        i=$((i + 1)); val="${argv[$i]}"; flag="$a" ;;
      --method=*|--raw-field=*|--field=*|--header=*|--preview=*|--jq=*|--template=*|--cache=*|--input=*)
        flag="${a%%=*}"; val="${a#*=}" ;;
      -[XfFHpqt]?*) flag="${a:0:2}"; val="${a:2}" ;;
      -i|--include|--paginate|--silent|--slurp|--verbose) continue ;;
      *) die "'api' argument '$a' is not one this door parses — pass each flag separately, after the endpoint" ;;
    esac
    case "$flag" in
      -X|--method)
        [ -n "$val" ] || die "'$flag' needs a non-empty value"
        api_method="$val" ;;
      -f|--raw-field|-F|--field) api_fields+=("$val") ;;
      --input) api_input=1 ;;
    esac
  done
  api_effective_method="$(printf '%s' "$api_method" | tr '[:lower:]' '[:upper:]')"
  if [ -z "$api_effective_method" ]; then
    # gh api implies POST for --input or request fields; otherwise it implies GET.
    if [ "${#api_fields[@]}" -gt 0 ] || [ "$api_input" = 1 ]; then api_effective_method=POST; else api_effective_method=GET; fi
  fi
fi

# ── Collect every outbound string: all argv, plus the contents of any file-carrying flag
# (--body-file / --input / -F key=@file, in space or equals form). Stdin payloads ('-') are
# refused outright — text the scanner can't see is text that doesn't leave.
texts=("$@")
args=("$@")
issue_body_set=0 issue_body=""
for ((i = 0; i < ${#args[@]}; i++)); do
  a="${args[$i]}"
  f="" v=""
  if [ "$verb1 $verb2" = "issue create" ] || [ "$verb1 $verb2" = "issue edit" ]; then
    case "$a" in
      --body|-b) issue_body_set=1; issue_body="${args[$((i + 1))]:-}" ;;
      --body=*) issue_body_set=1; issue_body="${a#--body=}" ;;
      -b?*) issue_body_set=1; issue_body="${a#-b}" ;;
      --body-file|-F|--body-file=*|-F?*) issue_body_set=1 ;;
    esac
  fi
  case "$a" in
    --body-file|--input) f="${args[$((i + 1))]:-}" ;;
    --body-file=*|--input=*) f="${a#*=}" ;;
    -F|--field) v="${args[$((i + 1))]:-}" ;;
    -F?*) v="${a#-F}" ;;
    --field=*) v="${a#--field=}" ;;
  esac
  # On issue/pr verbs -F is --body-file.
  [ "$verb1" = "api" ] || case "$a" in
    -F) f="${args[$((i + 1))]:-}" ;;
    -F?*) f="${a#-F}" ;;
  esac
  case "$v" in *=@*) f="${v#*=@}" ;; esac
  if [ -n "$f" ]; then
    [ "$f" != "-" ] || die "stdin payloads ('-') are not scannable — put the text in a file"
    [ -r "$f" ] || die "cannot read body file: $f"
    file_text="$(cat "$f")"
    texts+=("$file_text")
    if [ "$verb1 $verb2" = "issue create" ] || [ "$verb1 $verb2" = "issue edit" ]; then
      case "$a" in --body-file|-F|--body-file=*|-F?*) issue_body="$file_text" ;; esac
    fi
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
# ── Repo scope: every write through this door lands in THIS checkout's repo. An `api` path must
# name it (repos/<owner>/<name>/…); a --repo on any other verb must equal it. A caller acting on
# text found in an issue or PR body cannot redirect a write elsewhere.
source "$(dirname "$0")/lib/github-repo.sh"
this_repo="$(origin_repo)"
[ -n "$this_repo" ] || die "this checkout has no GitHub origin — the door scopes every write to it"
# gh resolves the repo and host from these before any flag or remote; the door never lets them.
[ -z "${GH_REPO:-}" ] || die "GH_REPO is set — the door resolves the repo from this checkout only"
[ -z "${GH_HOST:-}" ] || die "GH_HOST is set — the door writes to github.com only"
for a in "$@"; do case "$a" in --hostname|--hostname=*) die "--hostname is refused — the door writes to github.com only" ;; esac; done
if [ "$verb1" = "api" ]; then
  case "${verb2%%\?*}" in
    *"//"*|*[!A-Za-z0-9/_.-]*) die "'api $verb2' carries an empty segment or a character outside [A-Za-z0-9/_.-] — the path must name the target directly" ;;
  esac
  case "$verb2" in
    *"/../"*|*"/./"*|*"/.."|*"/.") die "'api $verb2' carries a dot segment — the path must name the target directly" ;;
    repos/"$this_repo"/*|/repos/"$this_repo"/*) ;;
    *) die "'api $verb2' does not address this checkout's repo ($this_repo) — the door writes here only" ;;
  esac
else
  prev=""
  for a in "$@"; do
    case "$prev" in --repo|-R) [ "$a" = "$this_repo" ] || die "--repo '$a' is not this checkout's repo ($this_repo)";; esac
    case "$a" in
      --repo=*) [ "${a#--repo=}" = "$this_repo" ] || die "--repo '${a#--repo=}' is not this checkout's repo ($this_repo)" ;;
      -R?*) [ "${a#-R}" = "$this_repo" ] || die "--repo '${a#-R}' is not this checkout's repo ($this_repo)" ;;
    esac
    prev="$a"
  done
fi


# ── PR creation: required stamps certify the exact HEAD being PRed — dev needs three lenses,
# other bases also need full verify — and a pr create may only target THIS checkout. The REST create
# (`api repos/<this>/pulls`, the route cloud sessions use where GraphQL is blocked) passes the same gate.
require_pr_stamps() { # $1 base branch ('' when none named)
  local base_val="$1" gitdir head v r lens stamp_file stamp release_stamp_file release_sha
  gitdir="$(git rev-parse --git-dir)" || die "not a git repo"
  head="$(git rev-parse HEAD)"
  # Staging promotion normally uses a direct post-deploy fast-forward push, not a PR. If a PR is
  # used to move main into staging, main's merge commit carries the release PR's review stamps;
  # CI still gates that PR. Any other route into staging needs the stamps.
  [ "$base_val" = "staging" ] && [ "$(git branch --show-current)" = "main" ] && return 0
  v="$(cat "$gitdir/pre-pr-verify-ok" 2>/dev/null || true)"
  # CI verify is the gate for dev PRs, so only every other base needs the full local stamp.
  if [ "$base_val" != "dev" ] && [ "$v" != "$head" ]; then
    die "no full verify stamp for HEAD — run: bash scripts/pre-pr-verify.sh (only --base dev is exempt; CI verify is its gate)"
  fi
  # OD-WAY-83: three explicit lens records, each its own stamp on this exact HEAD.
  for lens in spec code-quality security; do
    stamp_file="$gitdir/independent-review-$lens-ok"
    stamp="$(cat "$stamp_file" 2>/dev/null || true)"
    r="$(printf '%s\n' "$stamp" | awk '{print $1}')"
    if [ "$lens" = security ] && { [ "$base_val" = main ] || [ "$base_val" = staging ]; }; then
      release_stamp_file="$gitdir/independent-review-security-release-ok"
      release_sha="$(cat "$release_stamp_file" 2>/dev/null || true)"
      [ "$release_sha" = "$head" ] \
        || die "a PR into $base_val needs release-rule stamps — record the security lens with: bash scripts/record-review.sh --lens security --base $base_val --reviewer <opus id> --artifact <record>"
    fi
    [ "$r" = "$head" ] || die "no $lens lens stamp for HEAD — a reviewer that did not write this branch records each lens: bash scripts/record-review.sh --lens $lens --reviewer <glm/luna/opus…> --artifact <record>"
  done
}

# Reuse-first (CLAUDE.md "Reuse before build"): a PR body names what it reused, on a line that
# starts "Reused:" (anything new is justified there too). Checked on PRs into dev, where new work
# enters; release PRs carry work already reviewed that way.
require_reused_line() {
  local t
  for t in "${texts[@]}"; do
    printf '%s\n' "$t" | sed -E '1s/^(-[fF]|--(raw-)?field=)?body=//' \
      | grep -Eiq '^[[:space:]]*(\*\*)?Reused(\*\*)?:' && return 0
  done
  die "the PR body has no 'Reused:' line — name the existing components, helpers, tests or patterns you reused (and why anything new was needed)"
}

default_base_branch() {
  local base
  base="$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null)" || return 1
  [ -n "$base" ] || return 1
  printf '%s' "$base"
}

contains_ready_label() { [[ ",$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')," == *,ready-for-agent,* ]]; }

require_ready_issue_skills_plan() {
  local ready=0 issue_target="" label result body
  local -a argv=("$@")
  for ((i = 0; i < ${#argv[@]}; i++)); do
    a="${argv[$i]}"
    case "$verb1 $verb2:$a" in
      "issue create:--label"|"issue create:-l"|"issue edit:--add-label")
        [ $((i + 1)) -lt ${#argv[@]} ] || continue
        i=$((i + 1)); label="${argv[$i]}" ;;
      "issue create:--label="*|"issue create:--add-label="*|"issue edit:--add-label="*|"issue create:-l"?*)
        case "$a" in -l*) label="${a#-l}" ;; *) label="${a#*=}" ;; esac ;;
      *) continue ;;
    esac
    contains_ready_label "$label" && ready=1
  done
  [ "$ready" -eq 1 ] || return 0

  if [ "$verb1 $verb2" = "issue edit" ]; then
    for ((i = 0; i + 2 < ${#argv[@]}; i++)); do
      if [ "${argv[$i]}" = issue ] && [ "${argv[$((i + 1))]}" = edit ]; then
        issue_target="${argv[$((i + 2))]}"
        [[ "$issue_target" = -* ]] && issue_target=""
        break
      fi
    done
    if [ "$issue_body_set" -eq 0 ]; then
      [ -n "$issue_target" ] || die "cannot identify the issue for ready-for-agent; pass its number so the current body can be fetched"
      body="$(gh issue view "$issue_target" --json body -q .body 2>/dev/null)" \
        || die "cannot fetch the current body for issue $issue_target; retry when GitHub is reachable"
      issue_body="$body"
    fi
  fi

  result="$(printf '%s\n' "$issue_body" | bash "$(dirname "$0")/skills-plan.sh" check - 2>&1)" && return 0
  [ -z "$issue_target" ] || issue_target="issue #$issue_target: "
  die "${issue_target}ready-for-agent requires a valid Skills plan
$result"
}

if [ "$verb1 $verb2" = "issue create" ] || [ "$verb1 $verb2" = "issue edit" ]; then
  require_ready_issue_skills_plan "$@"
fi

if [ "$verb1" = "pr" ] && [ "$verb2" = "create" ]; then
  for a in "$@"; do
    case "$a" in
      --repo|--repo=*|-R|-R?*|--head|--head=*|-H|-H?*|--hostname|--hostname=*)
        die "'pr create' through this door targets the current checkout on the default host only — no --repo/--head/--hostname (the stamps certify HEAD here). cd to the branch's checkout instead." ;;
    esac
  done
  base_val="" base_seen=0
  argv=("$@")
  for ((i = 0; i < ${#argv[@]}; i++)); do
    a="${argv[$i]}"
    case "$a" in
      --assignee|-a|--body|-b|--body-file|-F|--label|-l|--milestone|-m|--project|-p|--reviewer|-r|--title|-t)
        [ $((i + 1)) -lt ${#argv[@]} ] || die "'$a' needs a value"
        i=$((i + 1)); continue ;;
    esac
    case "$a" in
      --base|-B)
        [ $((i + 1)) -lt ${#argv[@]} ] || die "'$a' needs a value"
        i=$((i + 1)); candidate="${argv[$i]}" ;;
      --base=*) candidate="${a#--base=}" ;;
      -B?*) candidate="${a#-B}" ;;
      # gh accepts grouped short flags (-dB main, -dBmain); this door does not parse them.
      -[!-]*B*) die "grouped short flags with -B are not accepted here — pass the base on its own: --base <branch>" ;;
      *) continue ;;
    esac
    [ -n "$candidate" ] || die "base needs a value"
    if [ "$base_seen" = 1 ] && [ "$candidate" != "$base_val" ]; then
      die "multiple different PR bases were given — name one base"
    fi
    base_val="$candidate" base_seen=1
  done
  if [ "$base_seen" = 0 ]; then
    base_val="$(default_base_branch)" || die "cannot read repository default branch"
  fi
  require_pr_stamps "$base_val"
  [ "$base_val" = dev ] && require_reused_line
fi

issue_number_from_path() {
  local candidate="$1" suffix="${2:-}"
  if [ -n "$suffix" ]; then
    case "$candidate" in */"$suffix") candidate="${candidate%/"$suffix"}" ;; *) return 1 ;; esac
  fi
  case "$candidate" in ''|*[!0-9]*) return 1 ;; esac
  printf '%s' "$candidate"
}

if [ "$verb1" = "api" ]; then
  path="${verb2#/}"; path="${path%%\?*}"; path="${path%/}"
  case "$path" in repos/"$this_repo"/issues/*/labels) [ "$api_effective_method" = GET ] || die "REST issue-label writes are refused — use 'issue edit --add-label' to change labels" ;; esac
  issue_path=0
  case "$path" in
    "repos/$this_repo/issues") issue_path=1 ;;
    "repos/$this_repo/issues/"*)
      issue_number="$(issue_number_from_path "${path#repos/$this_repo/issues/}" 2>/dev/null || true)"
      [ -n "$issue_number" ] && issue_path=1 ;;
  esac
  if [ "$issue_path" = 1 ] && [ "$api_effective_method" != GET ]; then
    has_labels="$api_input"
    for kv in "${api_fields[@]:-}"; do
      field_name="${kv%%=*}"
      case "$field_name" in labels|labels\[* ) has_labels=1 ;; esac
    done
    [ "$has_labels" = 0 ] || die "REST issue writes refused — labels go through 'issue create --label' or 'issue edit --add-label'"
  fi
  api_write_allowed=0
  if [ "$api_effective_method" != GET ]; then
    case "$api_effective_method:$path" in
      "POST:repos/$this_repo/security-advisories"|"POST:repos/$this_repo/pulls") api_write_allowed=1 ;;
    esac
    issue_prefix="repos/$this_repo/issues/"
    if [ "$api_effective_method" = POST ]; then
      case "$path" in
        "$issue_prefix"*/comments)
          issue_number="$(issue_number_from_path "${path#"$issue_prefix"}" comments 2>/dev/null || true)"
          [ -n "$issue_number" ] && api_write_allowed=1 ;;
      esac
    elif [ "$api_effective_method" = PATCH ]; then
      case "$path" in
        "$issue_prefix"*)
          issue_number="$(issue_number_from_path "${path#"$issue_prefix"}" 2>/dev/null || true)"
          [ -n "$issue_number" ] && api_write_allowed=1 ;;
      esac
    fi
    [ "$api_write_allowed" = 1 ] || die "'api $api_effective_method $path' is not in the write allowlist. Allowed API writes: POST repos/$this_repo/security-advisories; POST repos/$this_repo/pulls (REST PR stamps required); POST repos/$this_repo/issues/<number>/comments; PATCH repos/$this_repo/issues/<number> without labels."
  fi
  # REST PR creation must pass the same HEAD stamps as `pr create`.
  if [ "$path" = "repos/$this_repo/pulls" ] && [ "$api_effective_method" = POST ]; then
    [ "$api_input" = 0 ] || die "REST PR create must pass base/head as -f fields — an --input payload hides them from the stamp check"
    base_val="" base_seen=0 head_val=""
    for kv in "${api_fields[@]}"; do
      case "$kv" in
        base=*) base_val="${kv#base=}"; base_seen=1 ;;
        head=*) head_val="${kv#head=}" ;;
        head_repo=*) die "REST PR create through this door targets this checkout only — no head_repo" ;;
      esac
    done
    branch="$(git branch --show-current)"
    [ -n "$branch" ] && { [ "$head_val" = "$branch" ] || [ "$head_val" = "${this_repo%%/*}:$branch" ]; } \
      || die "REST PR create must name head=<this checkout's branch> ('$branch') — the stamps certify HEAD here"
    if [ "$base_seen" = 0 ]; then
      base_val="$(default_base_branch)" || die "cannot read repository default branch"
    else
      [ -n "$base_val" ] || die "REST PR create needs a non-empty base field"
    fi
    require_pr_stamps "$base_val"
    [ "$base_val" = dev ] && require_reused_line
  fi
fi

# GH_POST_DOOR marks this as the sanctioned write path for scripts/gh-shim/gh (the PATH-level
# firewall non-Claude harnesses run under) — without it the shim would refuse our own exec.
GH_POST_DOOR=1 exec gh "$@"
