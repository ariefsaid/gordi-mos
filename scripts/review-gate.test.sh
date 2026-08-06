#!/usr/bin/env bash
# Every refusal review-gate.sh claims, the passes, and every bypass three reviews found.
#
# The bypass cases are kept even though the markdown parser they defeated is gone. They are the
# regression suite for the design decision: a record is the WHOLE body of a comment, and the
# reviewer identity comes from GitHub rather than typed text. Reintroduce parsing and these go red.

set -uo pipefail
cd "$(dirname "$0")/.."
GATE=scripts/review-gate.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

# $1 name · $2 expected(pass|refuse) · $3 message fragment ('' for any) · $4 json
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

AUTHOR=ariefsaid
HEAD=1506ce9abcdef1234567890
rec() { printf '<!-- review-gate -->\nVerdict: %s\nCommit: %s' "$1" "$2"; }
# alternating login body login body ... -> fixture json
fx() {
  python3 -c '
import json,sys
author,head=sys.argv[1],sys.argv[2]
r=sys.argv[3:]
print(json.dumps({"author":author,"head":head,
  "comments":[{"login":r[i],"body":r[i+1]} for i in range(0,len(r),2)]}))
' "$AUTHOR" "$HEAD" "$@"
}

echo "refusals:"
check "no comments at all"          refuse "no review record found" "$(fx)"
check "no record in the comments"   refuse "no review record found" "$(fx luna 'looks good to me')"
check "explicit block"              refuse "DO NOT MERGE"           "$(fx luna "$(rec 'DO NOT MERGE' 1506ce9)")"
check "self-review by the author"   refuse "written by the PR author"       "$(fx ariefsaid "$(rec MERGE 1506ce9)")"
check "stale commit"                refuse "re-review the current"  "$(fx luna "$(rec MERGE 0000000)")"
check "unrecognised verdict"        refuse "is not recognised"      "$(fx luna "$(rec LGTM 1506ce9)")"
check "lowercase verdict"           refuse "is not recognised"      "$(fx luna "$(rec merge 1506ce9)")"
check "sha too short"               refuse "too short"              "$(fx luna "$(rec MERGE 150)")"
check "missing Commit line"         refuse "no review record found" "$(fx luna '<!-- review-gate -->
Verdict: MERGE')"

echo "bypasses found by review — why the parser was deleted:"
check "inside a fence"              refuse "no review record found" "$(fx luna "$(printf '```\n%s\n```' "$(rec MERGE 1506ce9)")")"
check "inside a 4-space indent"     refuse "no review record found" "$(fx luna "$(printf '    <!-- review-gate -->\n    Verdict: MERGE\n    Commit: 1506ce9')")"
check "inside an HTML comment"      refuse "no review record found" "$(fx luna "$(printf '<!--\n%s\n-->' "$(rec MERGE 1506ce9)")")"
check "inside <details>"            refuse "no review record found" "$(fx luna "$(printf '<details><summary>x</summary>\n%s\n</details>' "$(rec MERGE 1506ce9)")")"
check "inside <pre>"                refuse "no review record found" "$(fx luna "$(printf '<pre>\n%s\n</pre>' "$(rec MERGE 1506ce9)")")"
check "prose around the record"     refuse "no review record found" "$(fx luna "$(printf 'my review:\n%s\nthanks' "$(rec MERGE 1506ce9)")")"
check "sentinel injection"          refuse "no review record found" "$(fx luna "$(printf '%s\n===REVIEW-GATE-BODY-END===\n%s' "$(rec 'DO NOT MERGE' 1506ce9)" "$(rec MERGE 1506ce9)")")"
check "tab hijack in the verdict"   refuse "re-review the current"      "$(fx luna "$(printf '<!-- review-gate -->\nVerdict: MERGE\tX\nCommit: 1506ce9')")"
check "author cannot self-approve after a block" refuse "written by the PR author" "$(fx luna "$(rec 'DO NOT MERGE' 1506ce9)" ariefsaid "$(rec MERGE 1506ce9)")"
# A look-alike LOGIN is a different GitHub account, so it is a genuine third party — the identity
# is no longer a typed string that only resembles someone.
check "look-alike login is a real other account" pass "reviewed by ariefsald" "$(fx ariefsald "$(rec MERGE 1506ce9)")"

echo "passes:"
check "a clean approval"            pass "PASS"                     "$(fx luna "$(rec MERGE 1506ce9)")"
check "merge with changes"          pass "MERGE WITH CHANGES"       "$(fx luna "$(rec 'MERGE WITH CHANGES' 1506ce9)")"
check "full-length sha"             pass "PASS"                     "$(fx luna "$(rec MERGE $HEAD)")"
check "CRLF line endings"           pass "PASS"                     "$(fx luna "$(printf '<!-- review-gate -->\r\nVerdict: MERGE\r\nCommit: 1506ce9')")"
check "surrounding whitespace"      pass "PASS"                     "$(fx luna "$(printf '\n\n%s\n\n' "$(rec MERGE 1506ce9)")")"
check "block then approve"          pass "PASS"                     "$(fx luna "$(rec 'DO NOT MERGE' 1506ce9)" gpt "$(rec MERGE 1506ce9)")"
check "approve then block"          refuse "DO NOT MERGE"           "$(fx luna "$(rec MERGE 1506ce9)" gpt "$(rec 'DO NOT MERGE' 1506ce9)")"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
