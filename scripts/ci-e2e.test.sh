#!/usr/bin/env bash
# Self-test for scripts/ci-e2e.sh — the fair-use door for the CI e2e lane. `gh` is faked on PATH;
# every refusal case asserts the dispatch was NOT made, and the happy path asserts the log line.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/ci-e2e.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
today="$(date -u +%Y-%m-%d)"
yesterday="$(python3 -c 'import datetime as d; print((d.datetime.now(d.timezone.utc)-d.timedelta(days=1)).strftime("%Y-%m-%d"))')"

# Fake gh. State is files under $FAKE: <repo>-<status> (lines printed for an active-run listing),
# mos-created (createdAt lines), mos-url, fail-list (make every read fail), dispatch-calls (writes).
FAKE="$tmp/fake"; mkdir -p "$FAKE" "$tmp/bin"
cat > "$tmp/bin/gh" <<'EOF'
#!/usr/bin/env bash
args=" $* "
[ ! -e "$FAKE/fail-list" ] || { echo "boom" >&2; exit 1; }
repo=mos; case "$args" in *" -R ariefsaid/PMO "*) repo=pmo ;; esac
case "$1 $2" in
  "workflow run") printf '%s\n' "$*" >> "$FAKE/dispatch-calls"; exit 0 ;;
  "run list")
    for s in in_progress queued; do
      case "$args" in *" --status $s "*) cat "$FAKE/$repo-$s" 2>/dev/null; exit 0 ;; esac
    done
    case "$args" in
      *createdAt*) cat "$FAKE/$repo-created" 2>/dev/null ;;
      *" --branch "*) cat "$FAKE/$repo-url" 2>/dev/null ;;
    esac
    exit 0 ;;
esac
exit 0
EOF
chmod +x "$tmp/bin/gh"
export FAKE PATH="$tmp/bin:$PATH" CI_E2E_LOG="$tmp/ci-e2e.log" CI_E2E_URL_WAIT=0

reset() { rm -f "$FAKE"/* "$CI_E2E_LOG"; }
run() { bash "$SCRIPT" "$@" >"$tmp/out" 2>&1; }   # rc in $?
loglines() { [ -f "$CI_E2E_LOG" ] && wc -l < "$CI_E2E_LOG" | tr -d ' ' || echo 0; }
dispatches() { [ -f "$FAKE/dispatch-calls" ] && wc -l < "$FAKE/dispatch-calls" | tr -d ' ' || echo 0; }
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }
# refuses NAME RC-WANT ARGS… — nonzero rc, no dispatch, no log line added
refuses() {
  local name="$1" want="$2"; shift 2
  local before; before="$(loglines)"
  run "$@"; local rc=$?
  local n; n="$(dispatches)"
  local after; after="$(loglines)"
  if [ "$rc" -eq "$want" ] && [ "$n" = 0 ] && [ "$before" = "$after" ]; then ok "$name"
  else bad "$name — rc=$rc (want $want), dispatches=$n, log ${before} to ${after}"; fi
}

# ── usage
reset; refuses "no args refused (usage)" 2
reset; refuses "non-numeric PR refused" 2 feat/x abc
reset; refuses "empty --bugfix-proof text refused" 2 feat/x 12 --bugfix-proof ""
reset; refuses "unknown flag refused" 2 feat/x 12 --force

# ── 1. in-flight runs in EITHER repo
reset; echo "https://x/mos/1 some-branch" > "$FAKE/mos-in_progress"; refuses "MOS run in progress refuses" 1 feat/x 12
grep -q 'https://x/mos/1' "$tmp/out" && ok "refusal names the running run" || bad "refusal does not print what is running"
reset; echo "https://x/mos/2 some-branch" > "$FAKE/mos-queued"; refuses "MOS run queued refuses" 1 feat/x 12
reset; echo "https://x/pmo/3 other" > "$FAKE/pmo-in_progress"; refuses "PMO run in progress refuses (other repo)" 1 feat/x 12
grep -q 'https://x/pmo/3' "$tmp/out" && ok "PMO refusal names the running run" || bad "PMO refusal does not print what is running"
reset; echo "https://x/pmo/4 other" > "$FAKE/pmo-queued"; refuses "PMO run queued refuses (other repo)" 1 feat/x 12
reset; touch "$FAKE/fail-list"; refuses "unreadable queue refuses (fails closed)" 1 feat/x 12

# ── 2. daily cap
reset; printf '%sT01:00:00Z\n%sT02:00:00Z\n%sT03:00:00Z\n' "$today" "$today" "$today" > "$FAKE/mos-created"
refuses "4th dispatch of the day refuses without --owner-ok" 1 feat/x 12
grep -q 'owner' "$tmp/out" && ok "cap refusal names the owner-OK route" || bad "cap refusal does not mention --owner-ok"
refuses "--bugfix-proof does not lift the daily cap" 1 feat/x 12 --bugfix-proof "bug"
run feat/x 12 --owner-ok "go ahead, one more"; rc=$?
[ "$rc" -eq 0 ] && [ "$(dispatches)" = 1 ] && ok "--owner-ok lifts the daily cap" || bad "--owner-ok did not dispatch (rc=$rc)"
awk -F'\t' '$4=="owner-ok" && $5=="go ahead, one more"{f=1} END{exit !f}' "$CI_E2E_LOG" && ok "owner-ok line carries the quoted words" || bad "owner-ok log line wrong"
reset; printf '%sT01:00:00Z\n%sT02:00:00Z\n%sT03:00:00Z\n' "$yesterday" "$yesterday" "$yesterday" > "$FAKE/mos-created"
run feat/x 12; [ $? -eq 0 ] && ok "yesterday's dispatches do not count toward today's cap" || bad "yesterday's dispatches were counted"
reset; printf '%sT01:00:00Z\n%sT02:00:00Z\n' "$today" "$today" > "$FAKE/mos-created"
run feat/x 12; [ $? -eq 0 ] && ok "3rd dispatch of the day is allowed" || bad "3rd dispatch of the day refused"

# ── 3. one run per PR
reset; printf '2020-01-01T00:00:00Z\tmos\tfeat/x#12\tnormal\t-\n' > "$CI_E2E_LOG"
refuses "second dispatch for the same PR refuses" 1 feat/x 12
grep -q 'bugfix-proof' "$tmp/out" && ok "second-run refusal names the bugfix-proof route" || bad "second-run refusal does not name --bugfix-proof"
run feat/x 12 --bugfix-proof "sort broke the list; fixed in list.ts"; rc=$?
[ "$rc" -eq 0 ] && [ "$(dispatches)" = 1 ] && ok "--bugfix-proof allows the second run" || bad "--bugfix-proof did not dispatch (rc=$rc)"
awk -F'\t' '$3=="feat/x#12" && $4=="bugfix-proof" && $5 ~ /sort broke/{f=1} END{exit !f}' "$CI_E2E_LOG" && ok "bugfix-proof line logged with the reason" || bad "bugfix-proof log line wrong"
reset; printf '2020-01-01T00:00:00Z\tmos\tfeat/x#12\tnormal\t-\n' > "$CI_E2E_LOG"
run feat/x 12 --owner-ok "yes rerun it"; [ $? -eq 0 ] && ok "--owner-ok allows the second run" || bad "--owner-ok did not allow the second run"
reset; printf '2020-01-01T00:00:00Z\tmos\tfeat/x#11\tnormal\t-\n2020-01-01T00:00:00Z\tpmo\tfeat/x#12\tnormal\t-\n' > "$CI_E2E_LOG"
run feat/x 12; [ $? -eq 0 ] && ok "another PR's, or PMO's, dispatch does not block this PR" || bad "unrelated log lines blocked the dispatch"

# ── happy path + log line
reset; echo "https://x/mos/9 feat/x" > "$FAKE/mos-url"
run feat/x 12; rc=$?
[ "$rc" -eq 0 ] && ok "happy path exits 0" || bad "happy path rc=$rc"
grep -q -- '--ref feat/x' "$FAKE/dispatch-calls" && grep -q 'workflow run integration.yml' "$FAKE/dispatch-calls" \
  && ok "dispatches integration.yml on the branch" || bad "dispatch call wrong: $(cat "$FAKE/dispatch-calls" 2>/dev/null)"
[ "$(dispatches)" = 1 ] && ok "exactly one dispatch" || bad "dispatch count $(dispatches)"
[ "$(wc -l < "$CI_E2E_LOG" | tr -d ' ')" = 1 ] && ok "exactly one log line" || bad "log line count wrong"
line="$(cat "$CI_E2E_LOG")"
printf '%s' "$line" | grep -Eq "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z	mos	feat/x#12	normal	-$" \
  && ok "log line is <UTC ts>\\tmos\\t<branch>#<pr>\\tnormal\\t-" || bad "log line malformed: $line"
grep -q 'run: https://x/mos/9' "$tmp/out" && ok "prints the run URL when available" || bad "run URL not printed"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
