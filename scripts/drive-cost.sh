#!/usr/bin/env bash
# Per-PR cost table for the /drive §9 exit report (#639): one markdown row per PR merged
# to dev in the window, reconstructed from sources that already exist —
#   docs/reviews/<branch>.md                  builder / reviewer(s) / rounds / verdict path
#   ~/.pi/agent/sessions/<slug>/*.jsonl       pi tokens (slug carries the issue number; the
#                                             drive-burn grep sums every matching slug)
#   gh pr view + first "In flight" comment    LOC ± and claim→merge wall clock
#
#   scripts/drive-cost.sh [hours]             (default 24)
#
# PI_SESSIONS_DIR overrides the sessions root, REVIEWS_DIR the reviews dir (both self-test;
# a worktree may have no docs/reviews — those cells print "?" and the row still lands).
# Heuristics, never guesses: builder/reviewer come only from labeled "Builder:"/"Reviewer:"
# prose; anything absent prints "?". Same-family flags a row whose builder and reviewer both
# resolve to anthropic (sonnet/opus/claude), openai (openai/codex/gpt), or z.ai/glm.
# KNOWN GAP (stated in the output header): Claude subagent tokens are metered nowhere, so a
# row with anthropic-family agents shows "–" in the pi cell — unknown, not 0.
# Unlike drive-burn's 24h session window, pi cells sum EVERY session under the issue's slugs:
# per-PR cost, so a long build's early sessions aren't dropped by the report window.
# No merged PRs / missing dirs = report and exit 0. Any gh/jq failure = exit 1 (fail closed):
# a list at gh's 1000-PR cap, a failed pr view / comment query, or an unparsable payload refuses
# to report rather than printing a partially-guessed table. Absent data is not failure — no
# review file, no "In flight" comment, no additions/deletions on the payload all print "?".
# Self-test: scripts/drive-cost.test.sh
set -uo pipefail

hours="${1:-24}"
case "$hours" in ''|*[!0-9]*) echo "✗ drive-cost: hours must be a number" >&2; exit 1;; esac
root="${PI_SESSIONS_DIR:-$HOME/.pi/agent/sessions}"
reviews="${REVIEWS_DIR:-docs/reviews}"
now="${DRIVE_COST_NOW:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
now_e="$(jq -rn --arg t "$now" 'try ($t | fromdateiso8601) catch empty')"
[ -n "$now_e" ] || { echo "✗ drive-cost: unparsable now ($now)" >&2; exit 1; }
cutoff=$((now_e - hours * 3600))

family() { # model-ish string → anthropic | openai | z.ai/glm | ? — the brief's three families, nothing more
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    *claude*|*sonnet*|*opus*|*anthropic*) printf 'anthropic' ;;
    *openai*|*codex*|*gpt*)               printf 'openai' ;;
    *glm*|*zai*|*z.ai*)                   printf 'z.ai/glm' ;;
    *)                                    printf '?' ;;
  esac
}

fmt_num() { # 1700 → 1.7k
  awk -v n="$1" 'BEGIN { if (n >= 1000000) printf "%.1fM", n/1000000
                         else if (n >= 1000) printf "%.1fk", n/1000
                         else printf "%d", n }'
}

pi_tokens() { # issue number → totalTokens summed over every session slug anchored on it
  local issue="$1" raw d
  local dirs
  dirs=()
  while IFS= read -r -d '' d; do dirs+=("$d"); done \
    < <(find "$root" -maxdepth 1 -mindepth 1 -type d -name "*-${issue}--" -print0 2>/dev/null)
  [ "${#dirs[@]}" -gt 0 ] || { printf 0; return; }
  # drive-burn's extraction: files intact via -exec cat {} + (xargs split on spaces), grep not jq
  raw="$(find "${dirs[@]}" -name '*.jsonl' -exec cat {} + 2>/dev/null \
    | grep -oE '"totalTokens":[0-9]+' | cut -d: -f2)"
  [ -n "$raw" ] || { printf 0; return; }
  printf '%s\n' "$raw" | awk '{s+=$1} END {printf "%d", s+0}'
}

limit=1000 # gh's hard cap for --limit: a full page may hide more PRs — unknowable, so refuse
prs="$(gh pr list --state merged --base dev --limit "$limit" --json number,title,headRefName,mergedAt 2>/dev/null)" \
  || { echo "✗ drive-cost: gh pr list failed" >&2; exit 1; }
count="$(printf '%s' "$prs" | jq 'length')" \
  || { echo "✗ drive-cost: pr list payload unparsable" >&2; exit 1; }
[ "$count" -ge "$limit" ] \
  && { echo "✗ drive-cost: gh pr list hit the ${limit}-PR cap — dev history may be truncated; refusing to report" >&2; exit 1; }
window="$(printf '%s' "$prs" | jq -c --argjson cutoff "$cutoff" \
  '[.[] | select((.mergedAt | fromdateiso8601) >= $cutoff)] | sort_by(.mergedAt)')" \
  || { echo "✗ drive-cost: pr list payload unparsable" >&2; exit 1; }
[ "$window" = "[]" ] && { echo "no PRs merged to dev in the last ${hours}h"; exit 0; }

rows=""
loc_add=0; loc_del=0; pi_total=0; sf=0; n=0
clocks=""
while IFS=$'\t' read -r num title branch; do
  n=$((n + 1))
  meta="$(gh pr view "$num" --json additions,deletions,mergedAt,body 2>/dev/null)" \
    || { echo "✗ drive-cost: gh pr view $num failed" >&2; exit 1; }
  body="$(printf '%s' "$meta" | jq -r '.body // ""')" \
    || { echo "✗ drive-cost: pr $num payload unparsable" >&2; exit 1; }
  # missing additions/deletions print "?" — 0 is real data (an empty diff), absence is not
  read -r add del merged_e < <(printf '%s' "$meta" \
    | jq -r '[(.additions // "?"), (.deletions // "?"), (.mergedAt | fromdateiso8601)] | @tsv') \
    || { echo "✗ drive-cost: pr $num payload unparsable" >&2; exit 1; }

  # issue refs: #N in title/body, else leading digits in the branch name (feat/639-…)
  refs="$(printf '%s\n%s\n' "$title" "$body" | grep -oE '#[0-9]+' | grep -oE '[0-9]+' | sort -nu)"
  [ -z "$refs" ] && refs="$(printf '%s\n' "$branch" | grep -oE '(^|/)[0-9]+' | tr -d '/' | sort -u)"
  issues="?"
  [ -n "$refs" ] && issues="$(printf '#%s\n' $refs | awk 'NR>1 {printf "+"} {printf "%s", $0}')"

  # review artifact: branch slashes become dashes (docs/reviews/feat-639-x.md)
  bf="$reviews/${branch//\//-}.md"
  builder="?"; reviewers="?"; rounds="?"; vpath="?"
  if [ -f "$bf" ]; then
    # parens die first (annotated model names), then sentence/continuation cuts — gpt-5.6 keeps its dot
    norm='s/ \([^)]*\)//g; s/[—,].*$//; s/\. .*$//; s/\.$//; s/[[:space:]]*$//'
    builder="$(grep -m1 'Builder:' "$bf" | sed -E 's/^.*Builder:[[:space:]]*//; '"$norm"'')"
    [ -n "$builder" ] || builder="?"
    reviewers="$(grep 'Reviewer:' "$bf" | sed -E 's/^.*Reviewer:[[:space:]]*//; '"$norm" | sort -u)"
    [ -n "$reviewers" ] || reviewers="?"
    rounds=1
    for r in $(grep -oE 'Round [0-9]+' "$bf" | awk '{print $2}'); do
      [ "$r" -gt "$rounds" ] && rounds=$r
    done
    for f in "$reviews/${branch//\//-}".round*.md; do
      [ -e "$f" ] || continue
      k="${f##*.round}"; k="${k%.md}"
      case "$k" in ''|*[!0-9]*) continue;; esac
      [ $((k + 1)) -gt "$rounds" ] && rounds=$((k + 1))
    done
    vpath="$(grep -E '^Verdict:' "$bf" | sed -E 's/^Verdict:[[:space:]]*//' \
      | awk '{ if ($0 == "MERGE WITH CHANGES") print "MWC"; else if ($0 == "DO NOT MERGE") print "DNM";
              else if ($0 == "MERGE") print "M"; else if ($0 == "REQUEST CHANGES") print "RC";
              else print substr($0, 1, 14) }' \
      | awk 'p != $0 {print} {p = $0}' \
      | awk 'NR>1 {printf "→"} {printf "%s", $0}')"
    [ -n "$vpath" ] || vpath="?"
  fi

  # same-family: builder's family matches any reviewer's — both unknown never flags
  bfam="$(family "$builder")"; flag=""
  if [ "$bfam" != "?" ]; then
    while IFS= read -r r; do
      [ -z "$r" ] && continue
      [ "$(family "$r")" = "$bfam" ] && { flag=" ⚠same-family"; sf=$((sf + 1)); break; }
    done <<EOF
$reviewers
EOF
  fi
  reviewers_cell="$(printf '%s\n' "$reviewers" | awk 'NR>1 {printf ", "} {printf "%s", $0}')$flag"

  # pi cell: any anthropic-family agent on the row → "–" (subagent spend unmetered; a number would read complete)
  claude=0
  [ "$(family "$builder")" = "anthropic" ] && claude=1
  if [ "$claude" = 0 ]; then
    while IFS= read -r r; do
      [ -z "$r" ] && continue
      [ "$(family "$r")" = "anthropic" ] && { claude=1; break; }
    done <<EOF
$reviewers
EOF
  fi
  pisum=0
  for i in $refs; do pisum=$((pisum + $(pi_tokens "$i"))); done
  pi_total=$((pi_total + pisum))
  [ "$claude" = 1 ] && pi_cell="–" || pi_cell="$(fmt_num "$pisum")"

  # claim→merge: earliest "In flight" comment across the row's issues
  claim_min=""
  for i in $refs; do
    comments="$(gh api --paginate "repos/{owner}/{repo}/issues/$i/comments" 2>/dev/null | jq -s 'add')" \
      || { echo "✗ drive-cost: gh api comments for issue $i failed" >&2; exit 1; }
    c="$(printf '%s' "$comments" | jq -r '[.[] | select((.body // "") | test("In flight")) | .created_at] | sort | .[0] // empty')" \
      || { echo "✗ drive-cost: claim comments for issue $i unparsable" >&2; exit 1; }
    [ -n "$c" ] || continue
    ce="$(jq -rn --arg t "$c" 'try ($t | fromdateiso8601) catch empty')"
    if [ -n "$ce" ] && { [ -z "$claim_min" ] || [ "$ce" -lt "$claim_min" ]; }; then claim_min=$ce; fi
  done
  if [ -n "$claim_min" ]; then
    clock="$(awk -v s="$((merged_e - claim_min))" 'BEGIN {printf "%.1fh", s/3600}')"
    clocks="$clocks $((merged_e - claim_min))"
  else
    clock="?"
  fi

  rows="${rows}| #$num | $issues | $builder | $reviewers_cell | $rounds | $vpath | +$add/-$del | $pi_cell | $clock |"$'\n'
  [ "$add" != "?" ] && loc_add=$((loc_add + add)) # totals are sums of knowns; "?" never counts as 0
  [ "$del" != "?" ] && loc_del=$((loc_del + del))
done < <(printf '%s' "$window" | jq -r '.[] | [.number, .title, .headRefName] | @tsv')

clock_cell="–"
if [ -n "$clocks" ]; then
  clock_cell="$(printf '%s\n' $clocks | sort -n | awk \
    '{a[NR] = $1} END { if (NR % 2) m = a[(NR + 1) / 2]; else m = (a[NR/2] + a[NR/2 + 1]) / 2;
                        printf "%.1fh", m/3600 }')"
fi

printf '## Per-PR cost table — dev merges, last %sh\n' "$hours"
printf 'Claude subagent tokens are not metered anywhere — those rows show "–", not 0.\n\n'
printf '| PR | issue(s) | builder | reviewer(s) | rounds | verdict path | LOC | pi tokens | claim→merge |\n'
printf '|----|----------|---------|-------------|--------|--------------|-----|-----------|-------------|\n'
printf '%s' "$rows"
printf '\nTotals: %d PRs, +%d/-%d LOC, %s pi tokens (pi-metered only), median claim→merge %s, same-family %d/%d rows.\n' \
  "$n" "$loc_add" "$loc_del" "$(fmt_num "$pi_total")" "$clock_cell" "$sf" "$n"
