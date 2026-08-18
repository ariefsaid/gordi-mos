#!/usr/bin/env bash
# audit-staleness.sh — the coverage-staleness SIGNAL for the Standing Audit Program.
#
# Reads docs/audits/surfaces.json and, per surface, compares the surface's pinned
# generation baseline (lockedAt) against what has changed since — both committed
# (lockedAt..HEAD) and the working tree — to classify each surface:
#
#   FRESH        locked, and nothing in its pathSet has changed since the lock.
#   STALE-PINNED locked WITH pins, and its pathSet changed → the diff is regression-
#                covered by the pins; a green pin run means the change is fine, a red
#                one means re-audit that dimension. (A signal, not a gate.)
#   DUE          never locked (no gen battery yet), OR a generation bump is in flight,
#                OR changed with NO pins → owes its once-per-generation battery.
#
# Staleness is demoted to a signal (plan §cadence): stale + pins-green = fine; the
# hard merge teeth are the pre-pr-verify lane + the review roster (pre-merge-check.sh
# never existed in CI — DD-WAY-31). This script never fails the
# build — it always exits 0 and just reports. Fast: jq + git, no server, no node.
#
# Usage:
#   bash scripts/audit-staleness.sh            # full report
#   bash scripts/audit-staleness.sh --stale    # only STALE-PINNED + DUE rows
#   bash scripts/audit-staleness.sh --quiet     # tallies only

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
REG="docs/audits/surfaces.json"

if [[ ! -f "$REG" ]]; then
  echo "ERROR: $REG not found — the coverage register is missing." >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required by audit-staleness.sh." >&2
  exit 2
fi

MODE="full"
case "${1:-}" in
  --stale) MODE="stale" ;;
  --quiet) MODE="quiet" ;;
  "") ;;
  *) echo "unknown arg: $1 (use --stale | --quiet)" >&2; exit 2 ;;
esac

# Uncommitted (working-tree + staged + untracked) changes, computed once.
WORKTREE_CHANGES="$( { git diff --name-only HEAD; git diff --name-only --cached; \
  git ls-files --others --exclude-standard; } 2>/dev/null | sort -u || true )"

# Does any file in $1 (newline list) match any glob in the surface's pathSet ($2..)?
# bash [[ == ]] globbing: '*' spans '/' too, so 'dir/**' and 'name.*' both match as
# intended without needing extglob or a regex translation.
matches_pathset() {
  local changed="$1"; shift
  local f g
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    for g in "$@"; do
      # shellcheck disable=SC2053
      [[ "$f" == $g ]] && return 0
    done
  done <<< "$changed"
  return 1
}

n_fresh=0; n_stale=0; n_due=0
report=""

# Stream each surface as a compact TSV line: id \t lockedAt \t bumped \t due \t npins \t pathSetJSON
while IFS=$'\t' read -r id lockedAt bumped due npins pathset_json; do
  pathset=()
  while IFS= read -r p; do [[ -n "$p" ]] && pathset+=("$p"); done < <(echo "$pathset_json" | jq -r '.[]')

  status=""; note=""
  if [[ "$lockedAt" == "null" || -z "$lockedAt" ]]; then
    status="DUE"; note="never locked — owes gen battery"
  elif [[ "$bumped" == "true" ]]; then
    status="DUE"; note="generation bump in flight — re-battery + re-lock owed"
  else
    committed="$(git diff --name-only "${lockedAt}..HEAD" 2>/dev/null || true)"
    changed="$(printf '%s\n%s\n' "$committed" "$WORKTREE_CHANGES" | sort -u)"
    if matches_pathset "$changed" "${pathset[@]}"; then
      if [[ "$npins" -gt 0 ]]; then
        status="STALE-PINNED"; note="pathSet changed since lock — verify the ${npins} pin(s) cover the diff"
      else
        status="DUE"; note="changed since lock but NO pins — re-audit needed"
      fi
    else
      status="FRESH"; note="locked @ ${lockedAt}, no change in pathSet"
    fi
  fi

  case "$status" in
    FRESH) n_fresh=$((n_fresh+1)) ;;
    STALE-PINNED) n_stale=$((n_stale+1)) ;;
    DUE) n_due=$((n_due+1)) ;;
  esac

  if [[ "$MODE" == "quiet" ]]; then continue; fi
  if [[ "$MODE" == "stale" && "$status" == "FRESH" ]]; then continue; fi
  report+="$(printf '  %-13s %-24s %s\n' "$status" "$id" "$note")"$'\n'
done < <(jq -r '.surfaces[] | [.id, (.lockedAt // "null"), (.bumped|tostring), (.due|tostring), (.pins|length|tostring), (.pathSet|tojson)] | @tsv' "$REG")

echo ""
echo "audit-staleness — coverage register $REG"
echo ""
if [[ "$MODE" != "quiet" ]]; then
  printf '%s' "$report"
  echo ""
fi
echo "  FRESH ${n_fresh}   STALE-PINNED ${n_stale}   DUE ${n_due}"
echo ""
exit 0
