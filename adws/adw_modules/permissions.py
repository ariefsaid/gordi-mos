"""What an agent may CHANGE, enforced in code after the fact.

`tools:` is a capability list, not a sandbox, and two holes make it
unenforceable on its own:

  * `bash` runs anything. A builder handed bash to run a test suite can also
    run `git checkout adws/` — which is not hypothetical: one did, discarding
    uncommitted changes to the very quality check it was about to be judged by.
  * `write` reaches any path, not just the one report file an agent was given
    it for. A reviewer configured with "no edit, so it cannot quietly fix"
    could still rewrite the code it was reviewing.

So permission is verified the way every other claim in this system is —
after the fact, against the repo itself. `snapshot()` fingerprints the working
tree's change-set before an agent runs; `enforce()` compares it afterwards and
fails the phase if the agent touched anything outside its allowlist.

Comparing change-sets, rather than watching for writes, is what catches the
`git checkout` case: a path that was modified before the agent ran and is clean
afterwards has been reverted, and a reversion is a modification. Appearing,
disappearing, and changing all count.

A breach is NOT a gate violation. Gates are for work an agent can be asked to
redo; a breach cannot be corrected by re-prompting, because the write already
happened. It aborts the phase and names every offending path.

Two keys drive it, both in sssf.config.yaml:
    defaults.protected_files   paths no agent may touch unless it names them itself
    agents[].writes      None = unrestricted · [] = read-only · [...] = only these
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

from .data_types import AgentConfig, SSSFConfig


class PermissionBreach(RuntimeError):
    """An agent modified a path it was not permitted to modify."""


def _git(args: list[str], cwd) -> bytes:
    """Run git and return raw stdout BYTES.

    Bytes on purpose (#357): `text=True` applies universal-newline translation,
    which rewrites a `\\r` inside a filename to `\\n` — the fingerprint key then
    names a path that does not exist, so matching or rollback acts on the wrong
    name and the real file survives. Callers that parse paths decode each one
    at the edge with utf-8/surrogateescape: round-trippable for non-UTF-8
    names (argv and os calls re-encode them byte-exactly), no translation
    anywhere.
    """
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True)
    return result.stdout if result.returncode == 0 else b""


def snapshot(run) -> dict[str, str]:
    """Fingerprint every path the working tree currently differs on.

    Tracked files carry their numstat counts, so an edit to an already-dirty
    file still registers as a change. Untracked files are listed by name.
    Gitignored paths never appear, which is why the session runtime under
    `data_dir` — where handoff files legitimately land — needs no special case.

    `--no-renames` is load-bearing (#357): with rename detection on, a staged
    `git mv old new` collapses into ONE numstat pseudo-path ("dir/{old => new}")
    that matches no protected pattern — an agent could rename a protected file
    aside and drop a replacement without either real path ever being checked.
    Detection off, the two halves appear as a deletion and an addition, and
    each is matched on its own.

    `-z` is load-bearing too (#357): without it git C-quotes any path holding
    a tab, quote, backslash, or control byte — the fingerprint key arrives as
    `"scripts/audit-e\\tvil.sh"`, quotes included, which matches no protected
    pattern, so the file survives enforcement. NUL-separated output delivers
    every path verbatim, no unquoting code to get wrong. With -z a numstat
    record is `added TAB deleted TAB path NUL`, so the path is everything
    after the second tab (a name may itself contain tabs).
    """
    fingerprints: dict[str, str] = {}
    for record in _git(["diff", "HEAD", "--numstat", "--no-renames", "-z"],
                       run.repo_root).split(b"\0"):
        fields = record.split(b"\t", 2)
        if len(fields) == 3 and fields[2]:
            path = fields[2].decode("utf-8", "surrogateescape")
            fingerprints[path] = f"{fields[0].decode()},{fields[1].decode()}"
    for raw in _git(["ls-files", "--others", "--exclude-standard", "-z"],
                    run.repo_root).split(b"\0"):
        if raw:
            fingerprints[raw.decode("utf-8", "surrogateescape")] = "untracked"
    return fingerprints


def changed_paths(before: dict[str, str], after: dict[str, str]) -> list[str]:
    """Every path whose state differs — appeared, vanished, or was rewritten."""
    return sorted({p for p in set(before) | set(after)
                   if before.get(p) != after.get(p)})


def _glob(pattern: str) -> re.Pattern:
    """Translate a pattern, with `*` stopping at a path separator.

    fnmatch would let `*` cross `/`, which quietly widens every pattern:
    `adws/adw_*.py` would match `adws/adw_data/sessions/x/y.py` as well as the
    ADW scripts it means. `**` is the way to say "cross directories".
    """
    out, i = [], 0
    while i < len(pattern):
        char = pattern[i]
        if pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif char == "*":
            out.append("[^/]*")
            i += 1
        elif char == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(char))
            i += 1
    return re.compile("".join(out))


def _matches(path: str, pattern: str) -> bool:
    if pattern.endswith("/"):                      # directory prefix
        return path.startswith(pattern)
    if "*" in pattern or "?" in pattern:
        return _glob(pattern).fullmatch(path) is not None
    return path == pattern


def always_writable(cfg: SSSFConfig) -> list[str]:
    """The session runtime, which EVERY agent must be able to write.

    `context_handoff/` is the one place agents hand work to each other, and an
    agent's own prompts, raw_output.jsonl, and envelope.json land beside it.
    Scout writes its findings there, the reviewer its review, the planner its
    plan — a read-only agent is read-only with respect to the REPO, never with
    respect to its own report.

    This is granted from `data_dir` rather than left to .gitignore. The runtime
    is normally ignored, so it never even appears in a snapshot — but an agent's
    ability to record its work must not hang on a gitignore entry that someone
    can delete or that a changed `data_dir` can outgrow.
    """
    return [cfg.defaults.data_dir.rstrip("/") + "/"]


def _control_bytes(path: str) -> bool:
    """True when the path smuggles control characters (< 0x20).

    No legitimate path in this repo contains a tab, newline, carriage return,
    or escape byte — every historical use of one here was an attempt to slip
    past pattern matching or output parsing (#357). Rather than proving each
    representation layer safe case by case, the whole class is a breach by
    definition: such a path is never permitted, for any agent.
    """
    return any(ord(ch) < 0x20 for ch in path)


def permitted(path: str, agent: AgentConfig, cfg: SSSFConfig) -> bool:
    """Session runtime first, then the agent's own list, then what is protected."""
    if _control_bytes(path):
        return False
    if any(_matches(path, p) for p in always_writable(cfg)):
        return True
    if any(_matches(path, p) for p in (agent.writes or [])):
        return True                      # naming a path is what unlocks a protected one
    if any(_matches(path, p) for p in cfg.defaults.protected_files):
        return False
    return agent.writes is None          # None = unrestricted, [] = no repo writes


def _roll_back(run, path: str, before: dict[str, str], after: dict[str, str]) -> str:
    """Undo one unauthorized change. Returns a word describing what happened.

    Only changes the agent INTRODUCED are undone. A path that was already dirty
    when the agent started is left exactly as it is: the operator had
    uncommitted work there, and discarding it to tidy up would be the same harm
    this module exists to prevent, committed by the cleanup instead of the agent.
    """
    if path in before:
        # Already dirty beforehand. If it is gone from the diff now, the agent
        # reverted an engineer's uncommitted work and the content is not ours
        # to reconstruct — say so loudly rather than pretend it was handled.
        return "REVERTED-BY-AGENT (uncommitted work lost, cannot restore)" \
            if path not in after else "left as-is (was already modified)"
    if after.get(path) == "untracked":
        try:
            (Path(run.repo_root) / path).unlink()
            return "deleted"
        except OSError as error:
            return f"could not delete ({error})"
    # Restore from HEAD, not from the index: a STAGED change — either half of a
    # `git mv`, or any `git add`ed edit — has already tampered the index, so an
    # index-restore (`git checkout -- path`) would reinstate the agent's version
    # (or fail outright on the staged-delete half of a rename).
    in_head = subprocess.run(["git", "cat-file", "-e", f"HEAD:{path}"],
                             cwd=run.repo_root, capture_output=True).returncode == 0
    if in_head:
        result = subprocess.run(["git", "checkout", "HEAD", "--", path],
                                cwd=run.repo_root, capture_output=True, text=True)
        return "rolled back" if result.returncode == 0 else "could not roll back"
    # Tracked in the index but absent from HEAD: a staged addition (e.g. the
    # arrival half of a rename). Unstage it, then remove it from disk.
    subprocess.run(["git", "rm", "-q", "--cached", "--force", "--", path],
                   cwd=run.repo_root, capture_output=True)
    try:
        (Path(run.repo_root) / path).unlink()
        return "unstaged + deleted"
    except OSError as error:
        return f"unstaged, could not delete ({error})"


def enforce(run, phase, agent: AgentConfig, before: dict[str, str]) -> list[str]:
    """Compare the tree against `before`; undo and raise if the agent overstepped.

    Returns the paths it legitimately changed, so the trace records what an
    agent actually touched rather than only what it claimed in its envelope.

    Detection alone would leave the repo holding the unauthorized change while
    reporting a failure, so anything the agent introduced outside its allowlist
    is rolled back before the phase dies. What it cannot undo, it names.
    """
    after = snapshot(run)
    touched = changed_paths(before, after)
    breaches = [p for p in touched if not permitted(p, agent, run.cfg)]
    if not breaches:
        return touched

    outcomes = {p: _roll_back(run, p, before, after) for p in breaches}
    scope = ("read-only" if agent.writes == []
             else f"limited to {agent.writes}" if agent.writes
             else f"barred from {run.cfg.defaults.protected_files}")
    detail = "\n".join(f"  - {p} — {outcome}" for p, outcome in outcomes.items())
    raise PermissionBreach(
        f"{agent.name} is {scope} but modified {len(breaches)} path(s):\n{detail}")
