"""Low-level git operations for code phases. All low-level logic lives in adw_modules."""

from __future__ import annotations

import subprocess
from pathlib import Path


def _git(*args: str) -> str:
    result = subprocess.run(["git", *args], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def current_branch() -> str:
    return _git("rev-parse", "--abbrev-ref", "HEAD")


def create_branch(name: str) -> str:
    _git("checkout", "-b", name)
    return name


def is_repo() -> bool:
    result = subprocess.run(["git", "rev-parse", "--git-dir"],
                            capture_output=True, text=True)
    return result.returncode == 0


def repo_root() -> Path:
    """Absolute root of the codebase — where agents are spawned to work.

    The git toplevel when there is one, else the process cwd (ADWs run fine in a
    non-git dir; only a commit phase requires a repo). Always absolute, so it is
    safe to hand to a subprocess regardless of where the ADW was launched from.
    """
    if is_repo():
        return Path(_git("rev-parse", "--show-toplevel")).resolve()
    return Path.cwd().resolve()


# MOS (#336, #343): every commit the runner lands carries ONE attribution trailer,
# appended in code so no agent's commit_message has to remember it. #343: the
# trailer names the model that ACTUALLY built the change — the chain passes the
# executing builder's configured roster model, and this table (the single place
# substrate → attribution lives) maps it to a name/email. A model with no row,
# and a caller that names no model at all, gets the neutral factory line:
# honest over specific — never attribute a model that did not build.
SUBSTRATE_ATTRIBUTION: dict[str, tuple[str, str]] = {
    "zai/glm-5.3": ("GLM-5.3", "noreply@z.ai"),
    "zai/glm-4.7": ("GLM-4.7", "noreply@z.ai"),
    "openai-codex/gpt-5.6-terra": ("GPT-5.6 Terra", "noreply@openai.com"),
    "openai-codex/gpt-5.6-luna": ("GPT-5.6 Luna", "noreply@openai.com"),
}
FALLBACK_ATTRIBUTION = ("SSSF factory agent", "factory@sssf.invalid")


def commit_trailer(model: str | None = None) -> str:
    """The single trailer line attributing a commit to the model that built it."""
    name, email = SUBSTRATE_ATTRIBUTION.get(model or "", FALLBACK_ATTRIBUTION)
    return f"Co-Authored-By: {name} <{email}>"


def commit_all(message: str, model: str | None = None) -> str:
    """Stage the working tree and commit it. Returns the new short sha.

    `model` is the executing builder's roster model (e.g. "zai/glm-5.3") — it
    decides the attribution trailer. A caller that passes none gets the neutral
    fallback, never a named model that did not build. The guard keeps the
    message to a single Co-Authored-By line.
    """
    if not is_repo():
        raise RuntimeError(
            "not a git repository — a commit phase needs one. Run `git init` in the "
            "repo root (and make a first commit) before running an ADW that commits.")
    _git("add", "-A")
    if not _git("status", "--porcelain"):
        raise RuntimeError("nothing to commit — the preceding phases changed no files")
    if "Co-Authored-By:" not in message:
        message = f"{message}\n\n{commit_trailer(model)}"
    _git("commit", "-m", message)
    return _git("rev-parse", "--short", "HEAD")


def changed_files() -> list[str]:
    out = _git("status", "--porcelain")
    return [line[3:] for line in out.splitlines() if line]


# ── diff plumbing (composed into a ChangeSet by documentation.py) ────────────

def ref_exists(ref: str) -> bool:
    """True when `ref` resolves to a commit. Never raises — this is a question."""
    result = subprocess.run(["git", "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"],
                            capture_output=True, text=True)
    return result.returncode == 0


def rev(ref: str = "HEAD") -> str:
    return _git("rev-parse", ref)


def short_sha(ref: str = "HEAD") -> str:
    return _git("rev-parse", "--short", ref)


def merge_base(ref: str, other: str = "HEAD") -> str:
    """The commit where `ref` and `other` diverged — the honest base of a branch.

    On the base branch itself this returns HEAD, which makes the diff exactly
    "what is not committed yet". Off it, the diff is the whole branch plus the
    working tree. One command covers both cases, so no ADW has to branch on it.
    """
    return _git("merge-base", ref, other)


def is_dirty() -> bool:
    return bool(_git("status", "--porcelain"))


def untracked_files() -> list[str]:
    out = _git("ls-files", "--others", "--exclude-standard")
    return [line for line in out.splitlines() if line]


def diff_files(base: str) -> list[str]:
    """Tracked files that differ between `base` and the working tree."""
    out = _git("diff", "--name-only", base)
    return [line for line in out.splitlines() if line]


def diff_stat(base: str) -> str:
    return _git("diff", "--stat", base)


def diff_counts(base: str) -> tuple[int, int]:
    """(insertions, deletions) across the diff. Binary files count as neither."""
    insertions = deletions = 0
    for line in _git("diff", "--numstat", base).splitlines():
        added, removed, *_ = line.split("\t")
        if added.isdigit():
            insertions += int(added)
        if removed.isdigit():
            deletions += int(removed)
    return insertions, deletions


def diff_text(base: str) -> str:
    return _git("diff", base)
