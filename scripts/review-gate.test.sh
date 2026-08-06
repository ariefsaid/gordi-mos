#!/usr/bin/env bash
# Exercises every refusal review-gate.sh claims to make, plus the cases that must pass.
#
# A gate nobody has watched fail is a belief, not a control. The previous attempt (PR #240) was
# green on a ledger reading "reviewed by me, the author" and on a change with every axis DEFERRED —
# nobody had ever run it against a case that should have been refused. So each refusal below is
# asserted by its exit code AND by the message, and the happy paths are asserted too, because a
# gate that refuses everything is just as useless.

set -uo pipefail
cd "$(dirname "$0")/.."
GATE=scripts/review-gate.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

# $1 name · $2 expected(pass|refuse) · $3 expected message fragment ('' when none) · $4 json
check() {
  local name="$1" expect="$2" want="$3" json="$4" out rc
  printf '%s' "$json" > "$tmp/f.json"
  out=$(REVIEW_GATE_FIXTURE="$tmp/f.json" bash "$GATE" 2>&1); rc=$?
  if [[ "$expect" == "pass" && $rc -eq 0 ]] || [[ "$expect" == "refuse" && $rc -ne 0 ]]; then
    if [[ -z "$want" || "$out" == *"$want"* ]]; then
      pass=$((pass+1)); printf '  ok    %s\n' "$name"; return
    fi
    fail=$((fail+1)); printf '  FAIL  %s — right outcome, wrong message\n        got: %s\n' "$name" "$out"; return
  fi
  fail=$((fail+1)); printf '  FAIL  %s — expected %s, got rc=%d\n        %s\n' "$name" "$expect" "$rc" "$out"
}

rec() { # reviewer verdict commit -> a record block
  printf '<!-- review-gate -->\nReviewer: %s\nVerdict: %s\nCommit: %s\n' "$1" "$2" "$3"
}
payload() { # body, comments... -> fixture json
  local body="$1"; shift
  jq -n --arg a asaid --arg h 1506ce9abcdef1234567890 --arg b "$body" \
     --args '{author:$a, head:$h, bodies: ([$b] + $ARGS.positional)}' "$@"
}

echo "review-gate refusals:"
check "no record at all"            refuse "no review record found"      "$(payload 'just a PR body')"
check "explicit block"              refuse "DO NOT MERGE"                "$(payload '' "$(rec luna 'DO NOT MERGE' 1506ce9)")"
check "self-review, exact"          refuse "is the PR author"            "$(payload '' "$(rec asaid MERGE 1506ce9)")"
check "self-review, embedded"       refuse "is the PR author"            "$(payload '' "$(rec 'asaid via pi' MERGE 1506ce9)")"
check "self-review, different case" refuse "is the PR author"            "$(payload '' "$(rec ASAID MERGE 1506ce9)")"
check "stale review"                refuse "re-review the current code"  "$(payload '' "$(rec luna MERGE 0000000)")"
check "unrecognised verdict"        refuse "is not recognised"           "$(payload '' "$(rec luna LGTM 1506ce9)")"
check "verdict 'not applicable'"    refuse "is not recognised"           "$(payload '' "$(rec luna 'not applicable' 1506ce9)")"
# A record missing its Commit line never completes, so it is not a record at all rather than a
# record with a missing field. That is the fail-closed reading: a half-written block must not count
# as an approval, and the message should say a valid record is absent, not quibble about one field.
check "no commit named"             refuse "no review record found"      "$(payload '' "$(printf '<!-- review-gate -->\nReviewer: luna\nVerdict: MERGE\n')")"
check "sha too short to identify"   refuse "too short"                   "$(payload '' "$(rec luna MERGE 150)")"
check "marker but empty record"     refuse "no review record found"      "$(payload '' '<!-- review-gate -->')"

echo "review-gate passes:"
check "clean approval in a comment" pass "PASS"                          "$(payload '' "$(rec luna MERGE 1506ce9)")"
check "approval in the PR body"     pass "PASS"                          "$(payload "$(rec luna MERGE 1506ce9)")"
check "merge with changes"          pass "MERGE WITH CHANGES"            "$(payload '' "$(rec luna 'MERGE WITH CHANGES' 1506ce9)")"
check "full-length sha"             pass "PASS"                          "$(payload '' "$(rec luna MERGE 1506ce9abcdef1234567890)")"
# Newest record wins, in both directions — a re-review must be able to clear an earlier block, and
# a later block must be able to overturn an earlier approval.
check "block then approve"          pass "PASS"                          "$(payload '' "$(rec luna 'DO NOT MERGE' 1506ce9)" "$(rec gpt MERGE 1506ce9)")"
check "approve then block"          refuse "DO NOT MERGE"                "$(payload '' "$(rec luna MERGE 1506ce9)" "$(rec gpt 'DO NOT MERGE' 1506ce9)")"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
