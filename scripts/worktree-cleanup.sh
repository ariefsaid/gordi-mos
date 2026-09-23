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
# "Merged" = ancestry OR patch-content-already-upstream (this repo squash-merges every PR, so
# a shipped branch's tip is never an ancestor — see is_merged() below).
# Fail closed: a failed `git fetch --prune origin` aborts the sweep (a stale origin/<target>
# must never drive removals), and a DIRTY worktree (uncommitted/untracked work) is kept, not
# force-removed. (Ignored files don't count — traces under adws/adw_data/ are gitignored and
# archived below.)
# Detached review worktrees (review-* carry NO `branch` line in `git worktree list --porcelain`)
# are swept purely by age under `.claude/worktrees/`; adws/adw_data/archive/ is pruned past 90 days.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# The main tree is the PARENT OF THE COMMON GIT DIR — not `git rev-parse --show-toplevel`, which
# is wherever the sweep was INVOKED from (#635: run from a linked worktree, the real main checkout
# was evaluated like any other worktree and listed "-> remove"; git refused, but only by luck).
# Realpath both sides: git prints resolved paths while callers may sit behind symlinks (macOS
# /var → /private/var), so raw string compares misfire in both directions.
real_of() { (cd "$1" 2>/dev/null && pwd -P) || printf '%s\n' "$1"; }
MAIN_TREE="$(real_of "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")")"
FROM_TREE="$(real_of "$(git rev-parse --show-toplevel)")"

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
  # Archive into the MAIN tree — never the invoking toplevel (#637: run from a linked
  # worktree, `--show-toplevel` pointed INTO that worktree, which is never removed, so the
  # evidence rotted in a throwaway tree). Same seam as the #635 main-tree derivation.
  dest="$MAIN_TREE/adws/adw_data/archive/$(basename "$path")"
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

# Uncommitted/untracked work is unrecoverable once the worktree is gone — never remove a tree
# that still holds it.
dirty() { [ -n "$(git -C "$1" status --porcelain 2>/dev/null)" ]; }

# This repo squash-merges every PR, so a shipped branch's tip is never an ancestor of the
# target — ancestry alone would keep every worktree forever. Fall back to patch-content
# equivalence: build a throwaway commit carrying the branch's CURRENT tree on top of the
# branch/target merge-base, then ask `git cherry` whether that one patch already exists
# upstream. Comparing a single synthetic commit (not each real commit individually) is what
# makes this work across a multi-commit branch that a PR squashed into one — per-commit cherry
# would show every real commit as unmatched even though their combined effect landed. It also
# folds in the empty "wip: claim" divergence-guard commit for free: an empty commit changes
# no tree, so it changes nothing about the branch's current tree either.
is_merged() {
  local branch="$1" target="$2" mb synth cherry_out
  git merge-base --is-ancestor "$branch" "origin/$target" 2>/dev/null && return 0
  mb="$(git merge-base "origin/$target" "$branch" 2>/dev/null)" || return 1
  [ -n "$mb" ] || return 1
  synth="$(git commit-tree "$branch^{tree}" -p "$mb" -m _ 2>/dev/null)" || return 1
  [ -n "$synth" ] || return 1
  # Fail closed on the destructive path: a FAILED cherry (nonzero exit) must read as "not
  # merged", never as "no + lines" — checking only `grep` on cherry's stdout would let a
  # cherry error (empty stdout, exit nonzero) pass as merged and drive `branch -D`.
  cherry_out="$(git cherry "origin/$target" "$synth" 2>/dev/null)" || return 1
  [ -z "$(printf '%s\n' "$cherry_out" | grep '^+')" ]
}

PROTECTED="main dev staging"
CURRENT="$(git branch --show-current)"

echo "== cleanup vs origin/$TARGET =="
# Fail closed: the merge-base checks run against origin/$TARGET — pruning against a STALE
# origin/$TARGET could delete live work. A failed fetch aborts the whole sweep.
if ! git fetch --prune origin >/dev/null 2>&1; then
  echo "worktree-cleanup: 'git fetch --prune origin' failed — aborting removals" >&2
  exit 1
fi

# 1. Remove worktrees: merged branch worktrees plus detached .claude/worktrees/ past max-age.
git worktree list --porcelain | awk '
  /^worktree / { w = substr($0,10); ref = "" }
  /^branch /   { ref = substr($0,8) }
  /^HEAD /     { next }
  /^$/         { print (ref == "" ? w "|DETACHED" : w "|" ref); w = ""; ref = ""; next }
  END          { if (w != "") print (ref == "" ? w "|DETACHED" : w "|" ref) }
' | while IFS='|' read -r path ref; do
  [ "$(real_of "$path")" = "$MAIN_TREE" ] && continue  # never the main tree (#635: common git dir, not cwd)
  [ "$(real_of "$path")" = "$FROM_TREE" ] && continue  # never the tree the sweep itself runs from
  case "$ref" in
    refs/heads/*)
      br="${ref#refs/heads/}"
      if is_merged "$br" "$TARGET"; then
        if dirty "$path"; then
          echo "  worktree (dirty, kept): $path [$br]"
          continue
        fi
        archive_or_keep "$path" || continue
        echo "  worktree (merged): $path [$br] -> remove"
        # No --force: the dirty guard above already filtered; a plain remove refuses anything
        # questionable instead of destroying it.
        git worktree remove "$path" 2>/dev/null || true
      fi
      ;;
    DETACHED)
      # No branch line — a review/dispatch worktree. Sweep only those under .claude/worktrees/
      # that are older than the cutoff; same archive/fail-closed rules as branch worktrees.
      case "$path" in
        *.claude/worktrees/*)
          if find "$path" -maxdepth 0 -type d -mmin +$((MAX_AGE_DAYS * 1440)) | grep -q .; then
            if dirty "$path"; then
              echo "  worktree (dirty, kept): $path"
              continue
            fi
            archive_or_keep "$path" || continue
            echo "  worktree (detached, >${MAX_AGE_DAYS}d old): $path -> remove"
            git worktree remove "$path" 2>/dev/null || true
          fi
          ;;
      esac
      ;;
  esac
done
git worktree prune

# 4. Prune adws/adw_data/archive entries older than 90 days (AC-562-4).
# MAIN_TREE, not the invoking toplevel (#637 — same seam as the archive destination).
archive_root="$MAIN_TREE/adws/adw_data/archive"
if [ -d "$archive_root" ]; then
  find "$archive_root" -mindepth 1 -maxdepth 1 -type d -mmin +$((90 * 1440)) 2>/dev/null | while read -r d; do
    echo "  archive (pruned, >90d old): $d"
    rm -rf "$d"
  done
fi

# 2. Delete LOCAL branches merged into the target (skip protected + current + still checked
# out in a kept worktree — `git branch -D` refuses a checked-out branch and would abort the
# sweep under set -e).
checked_out="$(git worktree list --porcelain | sed -n 's/^branch //p' | sed 's#^refs/heads/##')"
for br in $(git for-each-ref --format='%(refname:short)' refs/heads/); do
  case " $PROTECTED $CURRENT " in *" $br "*) continue;; esac
  if printf '%s\n' "$checked_out" | grep -Fxq "$br"; then
    echo "  local branch (kept, still checked out): $br"
    continue
  fi
  if is_merged "$br" "$TARGET"; then
    echo "  local branch (merged): $br -> delete"
    git branch -D "$br" >/dev/null
  fi
done

# 3. Optionally delete REMOTE branches merged into the target.
if [ "$REMOTE" = "--remote" ]; then
  for br in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/ | sed 's#^origin/##'); do
    case " $PROTECTED HEAD " in *" $br "*) continue;; esac
    if is_merged "origin/$br" "$TARGET"; then
      echo "  remote branch (merged): origin/$br -> delete"
      git push origin --delete "$br" >/dev/null 2>&1 || true
    fi
  done
fi

echo "== done. Remaining branches: =="
git branch
