#!/usr/bin/env bash
# claim-check — refuse claims that nothing can check.
#
# WHY. Every review round on #494 found the same defect, never in the logic: a SENTENCE asserting
# something the artifact does not do. Code has tests; prose has nothing. CLAUDE.md already said
# "prove the check can fail" and words did not hold, so the two checkable shapes are gates.
#
# Usage:
#   scripts/claim-check.sh --message <file>  # the message being written (.githooks/commit-msg)
#   scripts/claim-check.sh --staged          # staged added lines       (.githooks/pre-commit)
#   scripts/claim-check.sh --branch <base>   # branch diff              (scripts/pre-pr-verify.sh)
#
# The message check runs at commit-msg, not over history: judging pushed commits can only be
# satisfied by a force-push. Catch it while the message is still a file on disk.
# Self-test: scripts/claim-check.test.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

fail=0
note() { printf '\033[31m✗ claim-check: %s\033[0m\n' "$1" >&2; fail=1; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$1"; }

# ── 1. A count of evidence in a commit message ───────────────────────────────────────────────
# Banned outright rather than checked against the real number: a count in prose is true the day it
# is written and silently wrong after. The stamp and the CI run hold the numbers and re-measure.
# The noun list is every count that went wrong on #494 — tests, assertions, descriptions, and a
# staff headcount, which the public-repo banner calls an enumeration hint in its own right.
COUNT_NOUNS='tests?|subtests|assertions?|files?|checks?|comments?|descriptions?|places?|sites?|lines?|rows?|streams?|addresses|people|persons?|passed|failed'
COUNT_WORDS='two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty'
check_message_text() {
  local msgs="$1" bad=''
  [ -z "$msgs" ] && { ok "no commit message to check"; return; }
  while IFS= read -r line; do
    case "$line" in \#*) continue ;; esac
    # A cardinal — digit or word — within three words of an evidence noun, or an N/N ratio.
    if printf '%s' "$line" | grep -qiE \
         "\b([0-9][0-9,]*|$COUNT_WORDS)( +[a-z-]+){0,3} +($COUNT_NOUNS)\b|\b[0-9][0-9,]+/[0-9][0-9,]+\b"; then
      bad="$bad
    $line"
    fi
  done <<< "$(printf '%s' "$msgs" | tr '\0' '\n')"
  if [ -n "$bad" ]; then
    note "the commit message states a count of its own evidence:$bad"
    printf '  A count in prose is true the day you write it and wrong after. The verify stamp and\n' >&2
    printf '  the CI run hold the numbers, and they re-measure. Write "the suite passes".\n' >&2
  else
    ok "no test counts in commit messages"
  fi
}

# ── 2. Incident narrative in a tracked file ──────────────────────────────────────────────────
# THIS REPO IS PUBLIC. A date beside a cause is a lookup instruction: the events feed names the
# push, the push names the objects. Moving the story to the next file over is not removing it.
# State the RULE, never the history — history goes to docs/ (no remote) or a private advisory.
INCIDENT_WORDS='published|leak(ed|s)?|exposed|exposure|force-push|orphan(ed)?|incident|breach|un-publish|was committed once|protection class that failed'
# ponytail: a commit body over 20 lines is an essay. Global CLAUDE.md says apply ponytail to
# prose; nothing enforced it, so I wrote 3000-word messages all session. Cap, not taste.
check_length() {
  n=$(sed '1,2d' "$1" | grep -c . )
  [ "$n" -le 20 ] && { ok "commit body is $n lines"; return 0; }
  note "commit body is $n lines (max 20). Say it once — the rationale belongs in docs/gotchas.md, not in every artifact."
}

check_added_lines() {
  local diff_cmd="$1" bad=''
  bad="$(eval "$diff_cmd" \
        | grep -E '^\+' | grep -vE '^\+\+\+' \
        | grep -iE "$INCIDENT_WORDS" \
        | grep -E '20[0-9]{2}-[0-9]{2}-[0-9]{2}' || true)"
  if [ -n "$bad" ]; then
    note "an added line pairs incident language with a date:"
    printf '%s\n' "$bad" | sed 's/^/    /' >&2
    printf '  This repo is PUBLIC. The date is the pointer — state the RULE, not when it was learned.\n' >&2
    printf '  The history goes in docs/ (no remote) or a private security advisory.\n' >&2
  else
    ok "no incident narrative in added lines"
  fi
}

case "${1:-}" in
  --message)
    f="${2:?--message needs the message file}"
    check_message_text "$(cat "$f")"
    check_length "$f"
    ;;
  --staged)
    check_added_lines "git diff --cached -- . ':(exclude)scripts/claim-check.sh' ':(exclude)scripts/claim-check.test.sh'"
    ;;
  --branch)
    base="${2:?--branch needs a base ref}"
    check_added_lines "git diff $base...HEAD -- . ':(exclude)scripts/claim-check.sh' ':(exclude)scripts/claim-check.test.sh'"
    ;;
  *) echo "usage: $0 --message <file> | --staged | --branch <base>" >&2; exit 2 ;;
esac

exit "$fail"
