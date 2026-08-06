#!/usr/bin/env bash
# Every refusal review-gate.sh claims, the passes, and every bypass three reviews found.
#
# The bypass cases are kept even though the markdown parser they defeated is gone. They are the
# regression suite for the design decision: a record is the WHOLE body of a comment. Reintroduce
# parsing and these go red.
#
# The identity cases are gone with the check they tested — see the script's header for why. What
# replaced them is the roster: three lenses, each owing a verdict against the head commit, and a
# missing lens refusing loudly instead of passing silently.

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

HEAD=1506ce9abcdef1234567890
rec() { printf '<!-- review-gate -->\nReviewer: %s\nVerdict: %s\nCommit: %s' "$1" "$2" "$3"; }
# alternating login body login body ... -> fixture json
fx() {
  python3 -c '
import json,sys
head=sys.argv[1]
r=sys.argv[2:]
print(json.dumps({"head":head,
  "comments":[{"login":r[i],"body":r[i+1]} for i in range(0,len(r),2)]}))
' "$HEAD" "$@"
}
# the three records a complete review leaves, at $1 (default: the head sha)
full() {
  local c="${1:-1506ce9}"
  printf '%s\0%s\0%s' "$(rec spec MERGE "$c")" "$(rec code-quality MERGE "$c")" "$(rec security MERGE "$c")"
}
fx_full() { fx a "$(rec spec "${1:-MERGE}" "${4:-1506ce9}")" b "$(rec code-quality "${2:-MERGE}" "${4:-1506ce9}")" c "$(rec security "${3:-MERGE}" "${4:-1506ce9}")"; }

echo "refusals — nothing to review:"
check "no comments at all"          refuse "no review record found" "$(fx)"
check "no record in the comments"   refuse "no review record found" "$(fx luna 'looks good to me')"
check "missing Commit line"         refuse "no review record found" "$(fx luna '<!-- review-gate -->
Reviewer: spec
Verdict: MERGE')"
check "missing Reviewer line"       refuse "no review record found" "$(fx luna '<!-- review-gate -->
Verdict: MERGE
Commit: 1506ce9')"

echo "refusals — the roster is incomplete (the check that replaced identity):"
check "only spec reviewed"          refuse "no review recorded by: code-quality security" "$(fx a "$(rec spec MERGE 1506ce9)")"
check "security lens missing"       refuse "no review recorded by: security" "$(fx a "$(rec spec MERGE 1506ce9)" b "$(rec code-quality MERGE 1506ce9)")"
check "a lens off the roster does not substitute" refuse "no review recorded by: security" "$(fx a "$(rec spec MERGE 1506ce9)" b "$(rec code-quality MERGE 1506ce9)" c "$(rec design MERGE 1506ce9)")"
check "three records, all the same lens" refuse "no review recorded by: code-quality security" "$(fx a "$(rec spec MERGE 1506ce9)" b "$(rec spec MERGE 1506ce9)" c "$(rec spec MERGE 1506ce9)")"

echo "refusals — a lens objects, or reviewed the wrong code:"
check "security blocks"             refuse "the security review says DO NOT MERGE" "$(fx_full MERGE MERGE 'DO NOT MERGE')"
check "spec blocks"                 refuse "the spec review says DO NOT MERGE"     "$(fx_full 'DO NOT MERGE')"
check "a block outweighs two approvals" refuse "DO NOT MERGE"                      "$(fx_full MERGE 'DO NOT MERGE' MERGE)"
check "stale commit"                refuse "re-review the current"  "$(fx_full MERGE MERGE MERGE 0000000)"
check "one lens is stale, two are fresh" refuse "re-review the current" "$(fx a "$(rec spec MERGE 1506ce9)" b "$(rec code-quality MERGE 1506ce9)" c "$(rec security MERGE 0000000)")"
check "sha too short"               refuse "too short"              "$(fx_full MERGE MERGE MERGE 150)"
check "unrecognised verdict"        refuse "is not recognised"      "$(fx_full LGTM)"
check "lowercase verdict"           refuse "is not recognised"      "$(fx_full merge)"

echo "bypasses found by review — why the parser was deleted:"
check "inside a fence"              refuse "no review record found" "$(fx luna "$(printf '```\n%s\n```' "$(rec spec MERGE 1506ce9)")")"
check "inside a 4-space indent"     refuse "no review record found" "$(fx luna "$(printf '    <!-- review-gate -->\n    Reviewer: spec\n    Verdict: MERGE\n    Commit: 1506ce9')")"
check "inside an HTML comment"      refuse "no review record found" "$(fx luna "$(printf '<!--\n%s\n-->' "$(rec spec MERGE 1506ce9)")")"
check "inside <details>"            refuse "no review record found" "$(fx luna "$(printf '<details><summary>x</summary>\n%s\n</details>' "$(rec spec MERGE 1506ce9)")")"
check "inside <pre>"                refuse "no review record found" "$(fx luna "$(printf '<pre>\n%s\n</pre>' "$(rec spec MERGE 1506ce9)")")"
check "prose around the record"     refuse "no review record found" "$(fx luna "$(printf 'my review:\n%s\nthanks' "$(rec spec MERGE 1506ce9)")")"
check "sentinel injection"          refuse "no review record found" "$(fx luna "$(printf '%s\n===REVIEW-GATE-BODY-END===\n%s' "$(rec spec 'DO NOT MERGE' 1506ce9)" "$(rec spec MERGE 1506ce9)")")"
# A tab once shifted the fields left, turning a record that read DO NOT MERGE into a MERGE. Tabs
# are folded to spaces in every field BEFORE the record line is built, so the shift cannot happen.
# Both directions are asserted, because only one of them is dangerous and it is not the obvious one:
#   - a tab inside DO NOT MERGE folds back to exactly DO NOT MERGE — the block survives, refused;
#   - a tab appended to MERGE folds to something unrecognised — also refused.
# There is no tab that produces a pass, which is the property worth pinning.
check "tab inside a block verdict still blocks" refuse "the spec review says DO NOT MERGE" "$(fx a "$(printf '<!-- review-gate -->\nReviewer: spec\nVerdict: DO NOT\tMERGE\nCommit: 1506ce9')" b "$(rec code-quality MERGE 1506ce9)" c "$(rec security MERGE 1506ce9)")"
check "tab appended to an approval"  refuse "is not recognised" "$(fx a "$(printf '<!-- review-gate -->\nReviewer: spec\nVerdict: MERGE\tX\nCommit: 1506ce9')" b "$(rec code-quality MERGE 1506ce9)" c "$(rec security MERGE 1506ce9)")"
check "tab hijack in the lens"      refuse "no review recorded by: spec" "$(fx a "$(printf '<!-- review-gate -->\nReviewer: spec\tX\nVerdict: MERGE\nCommit: 1506ce9')" b "$(rec code-quality MERGE 1506ce9)" c "$(rec security MERGE 1506ce9)")"

echo "passes:"
check "all three approve"           pass "PASS"                     "$(fx_full)"
check "merge with changes"          pass "MERGE WITH CHANGES"       "$(fx_full 'MERGE WITH CHANGES')"
check "full-length sha"             pass "PASS"                     "$(fx_full MERGE MERGE MERGE "$HEAD")"
check "lens name is case-insensitive" pass "PASS"                   "$(fx a "$(rec SPEC MERGE 1506ce9)" b "$(rec Code-Quality MERGE 1506ce9)" c "$(rec Security MERGE 1506ce9)")"
check "CRLF line endings"           pass "PASS"                     "$(fx a "$(printf '<!-- review-gate -->\r\nReviewer: spec\r\nVerdict: MERGE\r\nCommit: 1506ce9')" b "$(rec code-quality MERGE 1506ce9)" c "$(rec security MERGE 1506ce9)")"
check "surrounding whitespace"      pass "PASS"                     "$(fx a "$(printf '\n\n%s\n\n' "$(rec spec MERGE 1506ce9)")" b "$(rec code-quality MERGE 1506ce9)" c "$(rec security MERGE 1506ce9)")"
check "a re-review supersedes a block" pass "PASS"                  "$(fx a "$(rec spec 'DO NOT MERGE' 1506ce9)" b "$(rec spec MERGE 1506ce9)" c "$(rec code-quality MERGE 1506ce9)" d "$(rec security MERGE 1506ce9)")"
check "a later block supersedes an approval" refuse "DO NOT MERGE"  "$(fx a "$(rec spec MERGE 1506ce9)" b "$(rec code-quality MERGE 1506ce9)" c "$(rec security MERGE 1506ce9)" d "$(rec security 'DO NOT MERGE' 1506ce9)")"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
