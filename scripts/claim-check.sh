#!/usr/bin/env bash
# claim-check — refuse claims that nothing can check.
#
# WHY. Every review round on #494 found the same defect, never in the logic: a SENTENCE asserting
# something the artifact does not do. Code has tests; prose has nothing. CLAUDE.md carried the rule
# as advice and advice did not hold, so the two mechanically checkable shapes are gates.
#
# It checks ONE shape: incident language beside a date, in a commit message or an added line.
#
# TWO other shapes were tried and CUT, and the reasons are the same one. A body-length cap refused a
# large share of this repo's own hand-written history while missing the squash bodies it was aimed
# at. A ban on counting your own evidence ("N tests pass") refused 40% of real commit messages —
# including counts it MANUFACTURED, by stripping `AC-804` down to an orphan `-808` — while an author
# refused for "21 tests pass" writes "the suite is green" and ships. The shape is unbounded; the
# vocabulary of an incident is not. A guard that refuses true sentences gets `--no-verify`'d, and
# then the arm worth keeping goes with it.
#
# So the remaining rule is narrow on purpose, and it is the one that maps to real harm: this repo is
# PUBLIC, and a date beside a cause is a lookup instruction.
#
# Usage:
#   scripts/claim-check.sh --message <file>  # the message being written (.githooks/commit-msg)
#   scripts/claim-check.sh --staged          # staged added lines       (.githooks/pre-commit)
#   scripts/claim-check.sh --branch <base>   # branch diff + messages   (pre-pr-verify, CI)
#
# The message check runs at commit-msg, not over history: judging pushed commits can only be
# satisfied by a force-push. Catch it while the message is still a file on disk.
#
# FAILS CLOSED. A check that cannot establish what to inspect exits non-zero. The first cut skipped
# silently on an unresolvable base, a bad ref and a missing file — a skipped check that announces
# nothing is indistinguishable from a passing one, which is this guard's own subject matter.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

fail=0
note() { printf '\033[31m✗ claim-check: %s\033[0m\n' "$1" >&2; fail=1; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$1"; }

# ── Pattern ─────────────────────────────────────────────────────────────────────────────────
# THIS REPO IS PUBLIC. A date beside a cause is a lookup instruction: the events feed names the
# push, the push names the objects. Moving the story to the next file over is not removing it.
# State the RULE, never the history — history goes to docs/ (no remote) or a private advisory.
INCIDENT_WORDS='published|leak(ed|s)?|exposed|exposure|force-push|orphan(ed)?|incident|breach|disclosed|compromised|un-publish|was committed once|protection class that failed'
# `(?!T)`-style negative lookahead is not in POSIX ERE, so the ISO form excludes a trailing
# `T<hh>:` by alternation instead: `'2026-07-01T03:14:00Z' must never leak to the DOM` is a
# fixture clock, not a date beside a cause, and it was the one false positive in the whole tree.
DATE_RE='20[0-9]{2}-[0-9]{2}-[0-9]{2}([^T0-9]|$)|20[0-9]{2}/[0-9]{2}/[0-9]{2}|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* +[0-9]{1,2},? +20[0-9]{2}|[0-9]{1,2} +(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* +20[0-9]{2}'


# Incident narrative — the SAME predicate for a message and for a diff line. The first cut checked
# messages for counts only, so the text that actually shipped the pointer passed it clean.
check_incident() {
  local text="$1" what="$2"
  local bad; bad="$(printf '%s' "$text" | grep -iE "$INCIDENT_WORDS" | grep -E "$DATE_RE" || true)"
  if [ -n "$bad" ]; then
    note "$what pairs incident language with a date:"
    printf '%s\n' "$bad" | sed 's/^/    /' >&2
    printf '  This repo is PUBLIC. The date is the pointer — state the RULE, not when it was learned.\n' >&2
  fi
}

# git diff, never through eval: an unquoted ref in an eval'd string executes a branch name like
# `feat/x$(...)y`, which git itself accepts. Proven exploitable before this rewrite.
# The exclusions are the guard's own tests, which must contain the shapes they assert on. That
# exemption is only safe because those fixtures are INVENTED — a made-up subject and a made-up
# date. An earlier cut used the repo's real incident wording there, so the narrative lived on in
# the one place the guard cannot read. Keep fixtures neutral or the exemption becomes a hiding
# place. The membership is PINNED by the self-test — the comment alone was enforced by nothing,
# and real narrative does survive in an excluded file, so growing the list needs a deliberate edit
# in two places.
GUARD_TESTS=(':(exclude)scripts/claim-check.sh'
             ':(exclude)scripts/claim-check.test.sh'
             ':(exclude)scripts/pre-commit-hook.test.sh'
             ':(exclude)scripts/commit-msg-hook.test.sh')
# --text: a `-diff` gitattribute makes git print "Binary files … differ" and emit ZERO `+` lines
# for a plain ASCII file, silently emptying this arm — local hook and CI lane alike. Proven, and
# --text overrides the attribute.
# RETURNS non-zero on a git failure; it must not `exit`, because every caller invokes it inside a
# command substitution where `exit` kills only the subshell — the caller then sees an empty diff and
# prints its green tick over a diff that never ran. That is the exact shape this guard refuses, and
# it shipped here once.
added_lines() {
  local out
  out="$(git diff --text "$@" -- . "${GUARD_TESTS[@]}")" || return 1
  printf '%s\n' "$out" | grep -E '^\+' | grep -vE '^\+\+\+' || true
}

case "${1:-}" in
  --message)
    f="${2:-}"
    [ -n "$f" ] && [ -f "$f" ] && [ -r "$f" ] || { note "--message needs a readable FILE (got '${f:-}')"; exit 1; }
    # Truncate at git's scissors line: `git commit -v` appends the staged DIFF below it, uncommented,
    # and judging that would make this arm read files — which it must not.
    msg="$(sed '/^# *-* *>8 *-*/,$d' "$f")"
    check_incident "$msg" "the commit message"
    [ "$fail" -eq 0 ] && ok "commit message carries no incident date"
    ;;
  --staged)
    staged="$(added_lines --cached)" \
      || { note "git diff --cached failed — refusing rather than reporting a clean diff"; exit 1; }
    check_incident "$staged" "an added line"
    [ "$fail" -eq 0 ] && ok "no incident narrative in staged lines"
    ;;
  --branch)
    base="${2:-}"
    [ -n "$base" ] || { note "--branch needs a base ref"; exit 1; }
    git rev-parse --verify --quiet "$base^{commit}" >/dev/null \
      || { note "--branch base '$base' does not resolve — refusing rather than skipping"; exit 1; }
    # ADDED LINES ONLY — deliberately not the commit messages. A dev->main PR spans hundreds of
    # merged commits whose messages nobody can edit without a force-push, which this guard names as
    # the reason it does not judge pushed history. Messages are caught at commit-msg, where they are
    # still a file on disk; this arm catches what actually lands in the tree.
    diff_lines="$(added_lines "$base...HEAD")" \
      || { note "git diff '$base...HEAD' failed — refusing rather than reporting a clean diff"; exit 1; }
    check_incident "$diff_lines" "an added line"
    [ "$fail" -eq 0 ] && ok "branch adds no incident narrative"
    ;;
  *) echo "usage: $0 --message <file> | --staged | --branch <base>" >&2; exit 2 ;;
esac

exit "$fail"
