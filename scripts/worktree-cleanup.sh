#!/usr/bin/env bash
# worktree-cleanup.sh — sweep merged agent worktrees + branches.
#
# Worktree-isolated agents are the DEFAULT dispatch mode (docs/agents/factory.md § Executor
# routing). Each agent works in a throwaway worktree under `.claude/worktrees/` (DD-WAY-46).
# After the Director merges that work, the worktree + branch are
# dead weight. This sweeps them.
#
# Usage:
#   scripts/worktree-cleanup.sh            # prune worktrees + delete LOCAL branches merged into dev
#   scripts/worktree-cleanup.sh <target>    # ...merged into <target> instead of dev
#   scripts/worktree-cleanup.sh <target> --remote   # also delete merged REMOTE branches
#   scripts/worktree-cleanup.sh <target> --max-age-days N  # detached .claude/worktrees/ older than N (default 2)
#
# Protected (never deleted): main, dev, staging, and the branch currently checked out.
# ponytail: only ever deletes MERGED branches — unmerged work is left alone, by design.
# Detached review worktrees (review-* carry NO `branch` line in `git worktree list --porcelain`)
# are swept purely by age under `.claude/worktrees/`; adws/adw_data/archive/ is pruned past 90 days.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

TARGET="dev"
REMOTE=""
MAX_AGE_DAYS=2
while [ $# -gt 0 ]; do
  case "$1" in
    --max-age-days) MAX_AGE_DAYS="${2:-2}"; shift 2 ;;
    --remote) REMOTE="--remote"; shift ;;
    --*) echo "worktree-cleanup: unknown flag: $1" >&2; exit 1 ;;
    *) TARGET="$1"; shift ;;
  esac
done

# Archive factory run traces BEFORE removal — they are the milestone review's evidence and
# live worktree-local (factory.md says archive-first; nothing enforced it until now).
# Fail closed: traces are the evidence — a failed archive KEEPS the worktree rather than
# force-removing what it just failed to save.
archive_or_keep() {
  local path="$1" dest ok
  [ -d "$path/adws/adw_data/sessions" ] || ls "$path"/adws/adw_data/sssf.db* >/dev/null 2>&1 || return 0
  dest="$(git rev-parse --show-toplevel)/adws/adw_data/archive/$(basename "$path")"
  mkdir -p "$dest"
  ok=1
  [ ! -d "$path/adws/adw_data/sessions" ] || cp -R "$path/adws/adw_data/sessions" "$dest/" || ok=0
  if ls "$path"/adws/adw_data/sssf.db* >/dev/null 2>&1; then
    cp "$path"/adws/adw_data/sssf.db* "$dest/" || ok=0
  fi
  if [ "$ok" = 0 ]; then
    echo "  ✗ trace archive FAILED for $path — keeping the worktree" >&2
    return 1
  fi
  echo "  traces archived (sessions + sssf.db): $path -> $dest"
  return 0
}

PROTECTED="main dev staging"
CURRENT="$(git branch --show-current)"

echo "== cleanup vs origin/$TARGET =="
git fetch --prune origin >/dev/null 2>&1 || true

# 1. Remove worktrees: merged branch worktrees plus detached .claude/worktrees/ past max-age.
git worktree list --porcelain | awk '
  /^worktree / { w = substr($0,10); ref = "" }
  /^branch /   { ref = substr($0,8) }
  /^HEAD /     { next }
  /^$/         { print (ref == "" ? w "|DETACHED" : w "|" ref); w = ""; ref = ""; next }
  END          { if (w != "") print (ref == "" ? w "|DETACHED" : w "|" ref) }
' | while IFS='|' read -r path ref; do
  [ "$path" = "$(git rev-parse --show-toplevel)" ] && continue   # never the main tree
  case "$ref" in
    refs/heads/*)
      br="${ref#refs/heads/}"
      if git merge-base --is-ancestor "$br" "origin/$TARGET" 2>/dev/null; then
        archive_or_keep "$path" || continue
        echo "  worktree (merged): $path [$br] -> remove"
        git worktree remove --force "$path" 2>/dev/null || true
      fi
      ;;
    DETACHED)
      # No branch line — a review/dispatch worktree. Sweep only those under .claude/worktrees/
      # that are older than the cutoff; same archive/fail-closed rules as branch worktrees.
      case "$path" in
        *.claude/worktrees/*)
          if find "$path" -maxdepth 0 -type d -mmin +$((MAX_AGE_DAYS * 1440)) | grep -q .; then
            archive_or_keep "$path" || continue
            echo "  worktree (detached, >${MAX_AGE_DAYS}d old): $path -> remove"
            git worktree remove --force "$path" 2>/dev/null || true
          fi
          ;;
      esac
      ;;
  esac
done
git worktree prune

# 4. Prune adws/adw_data/archive entries older than 90 days (AC-562-4).
archive_root="$(git rev-parse --show-toplevel)/adws/adw_data/archive"
if [ -d "$archive_root" ]; then
  find "$archive_root" -mindepth 1 -maxdepth 1 -type d -mmin +$((90 * 1440)) 2>/dev/null | while read -r d; do
    echo "  archive (pruned, >90d old): $d"
    rm -rf "$d"
  done
fi

# 2. Delete LOCAL branches merged into the target (skip protected + current).
for br in $(git for-each-ref --format='%(refname:short)' refs/heads/); do
  case " $PROTECTED $CURRENT " in *" $br "*) continue;; esac
  if git merge-base --is-ancestor "$br" "origin/$TARGET" 2>/dev/null; then
    echo "  local branch (merged): $br -> delete"
    git branch -D "$br" >/dev/null
  fi
done

# 3. Optionally delete REMOTE branches merged into the target.
if [ "$REMOTE" = "--remote" ]; then
  for br in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/ | sed 's#^origin/##'); do
    case " $PROTECTED HEAD " in *" $br "*) continue;; esac
    if git merge-base --is-ancestor "origin/$br" "origin/$TARGET" 2>/dev/null; then
      echo "  remote branch (merged): origin/$br -> delete"
      git push origin --delete "$br" >/dev/null 2>&1 || true
    fi
  done
fi

echo "== done. Remaining branches: =="
git branch
