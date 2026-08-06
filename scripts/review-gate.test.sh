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
# The REAL identities: login `ariefsaid`, display name `asaid`. The first version of these fixtures
# used `asaid` as the author login — so the production value was never exercised, and `asaid`, the
# name on every commit in this repo, passed the self-review check. Fixtures must carry the real
# thing or they test a world that does not exist.
payload() { # body, comments... -> fixture json
  local body="$1"; shift
  jq -n --arg a ariefsaid --arg an asaid --arg h 1506ce9abcdef1234567890 --arg b "$body" \
     --args '{author:$a, authorName:$an, head:$h, bodies: ([$b] + $ARGS.positional)}' "$@"
}
fenced() { printf '```\n%s```\n' "$(rec "$1" "$2" "$3")"; }

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
check "no commit named"             refuse "incomplete"      "$(payload '' "$(printf '<!-- review-gate -->\nReviewer: luna\nVerdict: MERGE\n')")"
check "sha too short to identify"   refuse "too short"                   "$(payload '' "$(rec luna MERGE 150)")"
check "marker but empty record"     refuse "incomplete"      "$(payload '' '<!-- review-gate -->')"

# ── Bypasses found by review, each demonstrated before it was closed ───────────────────────────
# 1. A fenced block is documentation. #289's OWN body carried the format example and the gate read
#    it as an approval — it refused only because that example's sha was stale.
check "fenced example in the body"  refuse "no review record found"      "$(payload "here is the format:
$(fenced luna MERGE 1506ce9)")"
check "fenced example in a comment" refuse "no review record found"      "$(payload '' "$(fenced luna MERGE 1506ce9)")"
check "tilde-fenced example"        refuse "no review record found"      "$(payload '' "$(printf '~~~\n%s~~~\n' "$(rec luna MERGE 1506ce9)")")"
# 2. A malformed NEWEST record must refuse, not silently fall back to an older approval — otherwise
#    a reviewer who typos one field has their block discarded.
check "newest malformed after MERGE"    refuse "incomplete" "$(payload '' "$(rec luna MERGE 1506ce9)" "$(printf '<!-- review-gate -->\nReviewer: gpt\nVerdict: DO NOT MERGE\n')")"
check "newest typo'd field after MERGE" refuse "incomplete" "$(payload '' "$(rec luna MERGE 1506ce9)" "$(printf '<!-- review-gate -->\nReviewer: gpt\nVerdict: DO NOT MERGE\nCommmit: 1506ce9\n')")"
# 3. A record must live in ONE body, fields consecutive — a marker here and fields there is an
#    approval nobody wrote.
check "record split across comments" refuse "incomplete"     "$(payload '' '<!-- review-gate -->' "$(printf 'Reviewer: luna\nVerdict: MERGE\nCommit: 1506ce9\n')")"
check "prose between the fields"     refuse "incomplete"                 "$(payload '' "$(printf '<!-- review-gate -->\nReviewer: luna\nsome prose\nVerdict: MERGE\nCommit: 1506ce9\n')")"
# 4. The author's DISPLAY NAME is as much them as their login. `asaid` is on every commit here.
check "reviewer is the display name" refuse "is the PR author"           "$(payload '' "$(rec asaid MERGE 1506ce9)")"
check "display name embedded"        refuse "is the PR author"           "$(payload '' "$(rec 'asaid via pi' MERGE 1506ce9)")"
check "reviewer is the login"        refuse "is the PR author"           "$(payload '' "$(rec ariefsaid MERGE 1506ce9)")"
# 5. An unknown author must fail closed, or the self-review check silently does nothing.
check "author cannot be determined"  refuse "refusing rather than skipping" \
  "$(jq -n --arg h 1506ce9abcdef1234567890 --arg c "$(rec asaid MERGE 1506ce9)" '{author:"", authorName:"", head:$h, bodies:[$c]}')"
# 6. Writing ABOUT the gate must not trip it. Found live on #289: the body explained the format
#    with an inline mention, which opened a record that could never complete — the gate refused its
#    own documentation. The marker only counts when it stands alone on its line.
check "inline prose mention"         refuse "no review record found" "$(payload 'A `<!-- review-gate -->` block goes in a comment. See the docs.')"
check "prose mention + real record"  pass   "PASS"                   "$(payload 'Mentioning `<!-- review-gate -->` inline here.' "$(rec luna MERGE 1506ce9)")"
# A near-miss that must still PASS — the check is a substring match, so guard against over-refusal.
check "reviewer merely resembles"    pass "PASS"                         "$(payload '' "$(rec 'not-a-said' MERGE 1506ce9)")"

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
