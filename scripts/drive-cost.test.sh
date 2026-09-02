#!/usr/bin/env bash
# Self-test for scripts/drive-cost.sh — offline: fixture sessions dir + fixture reviews dir
# + a stub gh on PATH returning canned JSON, with DRIVE_COST_NOW pinned (same pattern as
# drive-decay.test.sh). Covers: one row parses fully; missing reviews dir → "?" cells and
# exit 0; same-family flag fires; totals/median; the slug anchor (639 ≠ 6390); every gh
# failure mode fails closed (pr list / pr view / comment query, 1000-cap, unparsable payload);
# absent data stays "?" (no claim comment, missing additions/deletions) — never a guessed 0.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/drive-cost.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
t() { if [ "$2" -eq 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
      else fail=$((fail+1)); printf '  FAIL  %s — got:\n%s\n' "$1" "$out"; fi; }

# ── fixtures ───────────────────────────────────────────────────────────────────
NOW=2026-09-05T12:00:00Z
mkdir -p "$tmp/bin"
cat > "$tmp/bin/gh" <<EOF
#!/usr/bin/env bash
[ "\${GH_STUB_FAIL:-0}" = 1 ] && exit 1
case "\$1 \$2" in
  "pr list")
    [ "\${GH_STUB_LIMIT:-0}" = 1 ] && { cat "$tmp/prs-1000.json"; exit 0; }
    cat "$tmp/prs.json" ;;
  "pr view")
    [ "\${GH_STUB_FAIL_VIEW:-0}" = 1 ] && exit 1
    [ "\${GH_STUB_BAD_META:-0}" = 1 ] && { echo 'not-json'; exit 0; }
    if [ "\${GH_STUB_NO_LOC:-0}" = 1 ] && [ "\$3" = 640 ]; then
      printf '%s\n' '{"mergedAt":"2026-09-05T09:00:00Z","body":""}' # additions/deletions absent → "?", never 0
      exit 0
    fi
    cat "$tmp/view-\$3.json" ;;
  api\ *)
    [ "\${GH_STUB_FAIL_API:-0}" = 1 ] && exit 1
    [ "\${GH_NO_CLAIM:-0}" = 1 ] && { echo '[]'; exit 0; }
    n="\$(printf '%s' "\$*" | grep -oE '[0-9]+' | tail -1)"
    if [ "\$n" = 639 ]; then
      cat "$tmp/comments-639-page1.json" "$tmp/comments-639-page2.json"
    else
      cat "$tmp/comments-\$n.json" 2>/dev/null || echo '[]'
    fi ;;
  *) exit 9 ;;
esac
EOF
chmod +x "$tmp/bin/gh"
# exactly gh's --limit cap: equality is ambiguous (more may exist) → the script must refuse
jq -n '[range(1000) | {number:(7000+.),title:"bulk #7000",headRefName:"feat/7000-bulk",mergedAt:"2026-09-05T10:00:00Z"}]' > "$tmp/prs-1000.json"

cat > "$tmp/prs.json" <<'EOF'
[
 {"number":641,"title":"fix(db): applied-path lexer blanks nested block comments (#640)","headRefName":"feat/640-lexer-window","mergedAt":"2026-09-04T18:00:00Z"},
 {"number":640,"title":"feat(drive): per-PR cost table for the exit report (#639)","headRefName":"feat/639-drive-cost-table","mergedAt":"2026-09-05T09:00:00Z"}
]
EOF
printf '%s\n' '{"additions":210,"deletions":15,"mergedAt":"2026-09-05T09:00:00Z","body":""}' > "$tmp/view-640.json"
printf '%s\n' '{"additions":50,"deletions":8,"mergedAt":"2026-09-04T18:00:00Z","body":"Closes #640."}' > "$tmp/view-641.json"
cat > "$tmp/comments-639-page1.json" <<'EOF'
[
 {"created_at":"2026-09-05T01:00:00Z","body":"noise — not a claim"},
 {"created_at":"2026-09-05T06:00:00Z","body":"In flight (drive, 2026-09-05): a later claim on page 1"}
]
EOF
cat > "$tmp/comments-639-page2.json" <<'EOF'
[
 {"created_at":"2026-09-05T05:48:00Z","body":"In flight (drive, 2026-09-05): factory lane, branch feat/639-drive-cost-table. Do not re-dispatch."}
]
EOF
printf '%s\n' '[{"created_at":"2026-09-03T14:00:00Z","body":"In flight (drive, 2026-09-03): factory lane, branch feat/640-lexer-window. Do not re-dispatch."}]' > "$tmp/comments-640.json"

# sessions: 1360 tokens under the issue-639 slug, 340 under issue-640, plus a 6390 slug
# that must NOT match issue 639 (anchored slug match)
mkdir -p "$tmp/sessions/--Users-x-Coding-gordi-mos-.claude-worktrees-639--" \
         "$tmp/sessions/--Users-x-Coding-gordi-mos-.claude-worktrees-6390--" \
         "$tmp/sessions/--Users-x-Coding-gordi-mos-.claude-worktrees-640--"
printf '{"usage":{"totalTokens":1100}}\n{"usage":{"totalTokens":260}}\n' > "$tmp/sessions/--Users-x-Coding-gordi-mos-.claude-worktrees-639--/a.jsonl"
printf '{"usage":{"totalTokens":9999}}\n' > "$tmp/sessions/--Users-x-Coding-gordi-mos-.claude-worktrees-6390--/x.jsonl"
printf '{"usage":{"totalTokens":340}}\n' > "$tmp/sessions/--Users-x-Coding-gordi-mos-.claude-worktrees-640--/a.jsonl"

mkdir -p "$tmp/reviews"
cat > "$tmp/reviews/feat-639-drive-cost-table.md" <<'EOF'
# Review — feat/639-drive-cost-table @ abc1234

Builder: anthropic/claude-sonnet-4-5 (dispatched subagent). Reviewer: opus-subagent
(same harness/family, pi reviewers down). Round 2 — confirm; Round 1's refusal:
feat-639-drive-cost-table.round1.md.

## spec
Reviewer: opus-subagent (spec)
Verdict: MERGE

## code-quality
Reviewer: opus-subagent (code-quality)
Verdict: MERGE

## security
Reviewer: opus-subagent (security)
Verdict: MERGE
EOF
printf '%s\n' '# Round 1 — refusal (findings repaired in the canonical confirm)' > "$tmp/reviews/feat-639-drive-cost-table.round1.md"
cat > "$tmp/reviews/feat-640-lexer-window.md" <<'EOF'
# Review — feat/640-lexer-window @ 25ba02be

Builder: openai-codex/gpt-5.6-luna (fall-through from the bitdeer rung). Reviewer: zai/glm-5.3-flash (cross-family), full three-lens pass.

## spec
Reviewer: zai/glm-5.3-flash (spec)
Verdict: MERGE WITH CHANGES

## code-quality
Reviewer: zai/glm-5.3-flash (code-quality)
Verdict: MERGE
EOF

# ── the table ──────────────────────────────────────────────────────────────────
export PATH="$tmp/bin:$PATH"
out="$(PI_SESSIONS_DIR="$tmp/sessions" REVIEWS_DIR="$tmp/reviews" DRIVE_COST_NOW=$NOW bash "$SCRIPT" 24)"; rc=$?
[ "$rc" -eq 0 ]; t "exits 0 on good data" $?
printf '%s' "$out" | grep -qF 'Claude subagent tokens are not metered anywhere — those rows show "–", not 0.'
t "fixed unmetered-tokens header note present" $?
printf '%s' "$out" | grep -qF '| PR | issue(s) | builder | reviewer(s) | rounds | verdict path | LOC | pi tokens | claim→merge |'
t "table header row present" $?
printf '%s' "$out" | grep -qF '| #640 | #639 | anthropic/claude-sonnet-4-5 | opus-subagent ⚠same-family | 2 | M | +210/-15 | – | 3.2h |'
t "row 1 parses fully: builder/reviewer/rounds/verdict/LOC/pi/clock + same-family flag" $?
printf '%s' "$out" | grep -qF '| #641 | #640 | openai-codex/gpt-5.6-luna | zai/glm-5.3-flash | 1 | MWC→M | +50/-8 | 340 | 28.0h |'
t "row 2 parses fully: cross-family, numeric pi tokens, verdict path MWC→M" $?
printf '%s' "$out" | grep -qF 'Totals: 2 PRs, +260/-23 LOC, 1.7k pi tokens (pi-metered only), median claim→merge 15.6h, same-family 1/2 rows.'
t "totals: LOC sum, pi floor, median clock, same-family count" $?
! printf '%s' "$out" | grep -q 9999
t "6390 slug excluded from issue 639's pi sum (anchored match)" $?

# missing reviews dir → "?" cells, still exit 0
out="$(PI_SESSIONS_DIR="$tmp/sessions" REVIEWS_DIR="$tmp/no-reviews" DRIVE_COST_NOW=$NOW bash "$SCRIPT" 24)"; rc=$?
{ [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -qF '| #640 | #639 | ? | ? | ? | ? | +210/-15 | 1.4k | 3.2h |'; }
t "missing reviews dir → ? cells, pi floor kept, exit 0" $?
printf '%s' "$out" | grep -qF 'same-family 0/2 rows.'; t "no same-family flags when builders unknown" $?

out="$(PI_SESSIONS_DIR="$tmp/sessions" REVIEWS_DIR="$tmp/reviews" DRIVE_COST_NOW=$NOW bash "$SCRIPT" 1)"; rc=$?
{ [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q "no PRs merged to dev in the last 1h"; }
t "empty window reports and exits 0" $?

out="$(GH_STUB_FAIL=1 PI_SESSIONS_DIR="$tmp/sessions" DRIVE_COST_NOW=$NOW bash "$SCRIPT" 24 2>&1)"; rc=$?
[ "$rc" -ne 0 ]; t "gh failure exits nonzero (fail closed)" $?

# ── delta round (#639 review): every gh failure fails closed; absent data never reads 0 ──
out="$(GH_STUB_LIMIT=1 PI_SESSIONS_DIR="$tmp/sessions" REVIEWS_DIR="$tmp/reviews" DRIVE_COST_NOW=$NOW bash "$SCRIPT" 24 2>&1)"; rc=$?
{ [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q '1000-PR cap'; }
t "pr list at the 1000 cap fails closed (list may be truncated)" $?

out="$(GH_STUB_FAIL_VIEW=1 PI_SESSIONS_DIR="$tmp/sessions" REVIEWS_DIR="$tmp/reviews" DRIVE_COST_NOW=$NOW bash "$SCRIPT" 24 2>&1)"; rc=$?
{ [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q 'gh pr view 641 failed'; }
t "per-PR gh pr view failure fails closed, names the PR" $?

out="$(GH_STUB_FAIL_API=1 PI_SESSIONS_DIR="$tmp/sessions" REVIEWS_DIR="$tmp/reviews" DRIVE_COST_NOW=$NOW bash "$SCRIPT" 24 2>&1)"; rc=$?
{ [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q 'issue 640 failed'; }
t "claim-comment query failure fails closed, names the issue" $?

out="$(GH_NO_CLAIM=1 PI_SESSIONS_DIR="$tmp/sessions" REVIEWS_DIR="$tmp/reviews" DRIVE_COST_NOW=$NOW bash "$SCRIPT" 24)"; rc=$?
{ [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -qF '| #640 | #639 | anthropic/claude-sonnet-4-5 | opus-subagent ⚠same-family | 2 | M | +210/-15 | – | ? |'; }
t "no In flight comment → clock '?' (data, not failure), exit 0" $?

out="$(GH_STUB_NO_LOC=1 PI_SESSIONS_DIR="$tmp/sessions" REVIEWS_DIR="$tmp/reviews" DRIVE_COST_NOW=$NOW bash "$SCRIPT" 24)"; rc=$?
{ [ "$rc" -eq 0 ] \
    && printf '%s' "$out" | grep -qF '| #640 | #639 | anthropic/claude-sonnet-4-5 | opus-subagent ⚠same-family | 2 | M | +?/-? | – | 3.2h |' \
    && printf '%s' "$out" | grep -qF 'Totals: 2 PRs, +50/-8 LOC,'; }
t "missing additions/deletions → '?' cell (never 0); totals sum knowns only" $?

out="$(GH_STUB_BAD_META=1 PI_SESSIONS_DIR="$tmp/sessions" REVIEWS_DIR="$tmp/reviews" DRIVE_COST_NOW=$NOW bash "$SCRIPT" 24 2>&1)"; rc=$?
{ [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q 'pr 641 payload unparsable'; }
t "unparsable pr-view payload fails closed (jq failure)" $?

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
