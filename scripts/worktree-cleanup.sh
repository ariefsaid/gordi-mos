#!/usr/bin/env bash
# worktree-cleanup.sh — sweep merged agent worktrees + branches.
#
# Worktree-isolated agents are the DEFAULT dispatch mode (see docs/agents/factory.md § Executor routing
# §Multi-agent). Each agent commits to its own `worktree-agent-<id>` branch in a
# throwaway worktree. After the Director merges that work, the worktree + branch are
# dead weight. This sweeps them.
#
# Usage:
#   scripts/worktree-cleanup.sh            # prune worktrees + delete LOCAL branches merged into dev
#   scripts/worktree-cleanup.sh <target>   # ...merged into <target> instead of dev
#   scripts/worktree-cleanup.sh <target> --remote   # also delete merged REMOTE branches
#
# Protected (never deleted): main, dev, staging, and the branch currently checked out.
# ponytail: only ever deletes MERGED branches — unmerged work is left alone, by design.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

TARGET="${1:-dev}"
REMOTE="${2:-}"
PROTECTED="main dev staging"
CURRENT="$(git branch --show-current)"

echo "== cleanup vs origin/$TARGET =="
git fetch --prune origin >/dev/null 2>&1 || true

# 1. Remove worktrees whose branch is already merged into the target.
git worktree list --porcelain | awk '/^worktree /{w=$2} /^branch /{print w" "$2}' | \
while read -r path ref; do
  br="${ref#refs/heads/}"
  [ "$path" = "$(git rev-parse --show-toplevel)" ] && continue   # never the main tree
  if git merge-base --is-ancestor "$br" "origin/$TARGET" 2>/dev/null; then
    # Archive factory run traces BEFORE removal — they are the milestone review's evidence and
    # live worktree-local (factory.md says archive-first; nothing enforced it until now).
    if [ -d "$path/adws/adw_data/sessions" ]; then
      dest="$(git rev-parse --show-toplevel)/adws/adw_data/archive/$(basename "$path")"
      mkdir -p "$dest"
      # Fail closed: traces are the milestone review's evidence — a failed archive KEEPS the
      # worktree rather than force-removing what it just failed to save.
      if cp -R "$path/adws/adw_data/sessions" "$dest/" \
         && { [ ! -f "$path/adws/adw_data/sssf.db" ] || cp "$path/adws/adw_data/sssf.db" "$dest/"; }; then
        echo "  traces archived (sessions + sssf.db): $path -> $dest"
      else
        echo "  ✗ trace archive FAILED for $path — keeping the worktree" >&2
        continue
      fi
    fi
    echo "  worktree (merged): $path [$br] -> remove"
    git worktree remove --force "$path" 2>/dev/null || true
  fi
done
git worktree prune

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
