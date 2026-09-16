#!/usr/bin/env bash
set -euo pipefail

# Read-only takeover gate. The Python standard library keeps JSON emission
# deterministic without adding jq as another handoff prerequisite.
python3 - <<'PY'
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
from typing import Any


SCHEMA_VERSION = 2
REPOSITORY = "ariefsaid/gordi-mos"
MANIFEST_RELATIVE = pathlib.Path("takeover/mvp-remediation-checkpoint.json")
MANDATORY_FILES = {
    ("docs", "superpowers/plans/2026-09-16-mvp-remediation-takeover.md"),
    ("docs", "superpowers/plans/2026-09-15-mvp-quantitative-ui-remediation.md"),
    ("docs", "reviews/mvp-ui-quantitative/current/ASSESSMENT.md"),
    ("docs", "reviews/mvp-ui-quantitative/current/mockup-authority.json"),
    ("skills", "skill-overrides/handoff/SKILL.md"),
}
MANDATORY_TOOLS = {"node", "npm", "python3", "uv", "supabase", "docker", "gh", "pi"}

# The private manifest can add exact branch patterns for prepared work. This public
# fallback only recognizes the repository's generated lane namespaces: MVP,
# handoff, design-baseline/design-audit, quantitative design, Café Books, and
# numeric detached review snapshots. A user branch outside `codex/`/`feat/`, or a
# worktree outside `.claude/worktrees/` with one of these names, stays unrelated.
PROJECT_BRANCH_PATTERN = re.compile(
    r"^(?:codex|feat)/(?:"
    r"mvp(?:[-/].+)?|"
    r"design-baseline(?:[-/].+)?|"
    r"design-audit(?:[-/].+)?|"
    r"handoff(?:[-/].+)?|"
    r"cafe-books(?:[-/].+)?|"
    r"ui-quantitative(?:[-/].+)?|"
    r"review-[0-9]+(?:-(?:base|quality|security|spec|design|[0-9a-f]{8,40}))?"
    r")$"
)
PROJECT_WORKTREE_PATTERN = re.compile(
    r"^(?:"
    r"mvp(?:[-/].+)?|"
    r"design-baseline(?:[-/].+)?|"
    r"design-audit(?:[-/].+)?|"
    r"handoff(?:[-/].+)?|"
    r"cafe-books(?:[-/].+)?|"
    r"ui-quantitative(?:[-/].+)?|"
    r"review-[0-9]+(?:-(?:base|quality|security|spec|design|[0-9a-f]{8,40}))?"
    r")$"
)


def deterministic_failure(_exc_type: type[BaseException], _exc: BaseException, _tb: Any) -> None:
    """Fail closed without leaking malformed input or a Python traceback."""
    output = {
        "schemaVersion": SCHEMA_VERSION,
        "ready": False,
        "devSha": None,
        "originDevSha": None,
        "requiredFiles": [],
        "activeWork": [],
        "privateRoots": {
            "docs": {"source": "unverified", "status": "unverified"},
            "skills": {"source": "unverified", "status": "unverified"},
        },
        "toolchain": {"status": "unverified", "tools": {}},
        "database": {"status": "unverified"},
        "tracker": {"issue": 855, "state": None, "status": "unverified"},
        "provider": {"staticStatus": "unverified", "liveStatus": "unverified", "liveProbeTimestamp": None},
        "checkpoint": {"manifest": str(MANIFEST_RELATIVE), "status": "invalid"},
        "blockers": ["checkpoint-invalid"],
        "nextAction": "Repair the private MVP remediation checkpoint manifest.",
    }
    print(json.dumps(output, sort_keys=True, separators=(",", ":")))
    print("MVP handoff blocked (1): checkpoint-invalid. Next: Repair the private MVP remediation checkpoint manifest.", file=sys.stderr)


sys.excepthook = deterministic_failure


def command(argv: list[str], cwd: pathlib.Path | None = None) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            argv,
            cwd=cwd,
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return subprocess.CompletedProcess(argv, 127, "", type(exc).__name__)


def git(args: list[str], cwd: pathlib.Path) -> str | None:
    result = command(["git", "--no-optional-locks", *args], cwd)
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def git_success(args: list[str], cwd: pathlib.Path) -> bool:
    return command(["git", "--no-optional-locks", *args], cwd).returncode == 0


def worktree_clean_status(worktree: pathlib.Path | None) -> str:
    if worktree is None:
        return "not-present"
    result = command(
        ["git", "--no-optional-locks", "status", "--porcelain", "--untracked-files=normal"],
        worktree,
    )
    if result.returncode != 0:
        return "unverified"
    return "clean" if result.stdout == "" else "dirty"


def add_blocker(blockers: list[str], blocker: str) -> None:
    if blocker not in blockers:
        blockers.append(blocker)


def safe_relative(value: Any) -> pathlib.Path | None:
    if not isinstance(value, str) or not value:
        return None
    path = pathlib.PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts:
        return None
    return pathlib.Path(*path.parts)


def file_digest(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tool_version(name: str) -> str | None:
    if name == "python3":
        return ".".join(str(part) for part in sys.version_info[:3])
    result = command([name, "--version"])
    if result.returncode != 0:
        return None
    line = result.stdout.splitlines()[:1] or result.stderr.splitlines()[:1]
    return line[0].strip()[:120] if line else "present"


def next_action_for(blocker: str) -> str:
    actions = {
        "not-a-git-workspace": "Run this command from a Gordi MOS Git checkout.",
        "primary-not-on-dev": "Switch the primary public checkout to dev.",
        "public-checkout-dirty": "Clean or preserve the primary public checkout changes.",
        "origin-dev-missing": "Restore the existing local origin/dev ref.",
        "dev-behind-origin": "Fast-forward local dev to the existing origin/dev ref.",
        "dev-ahead-of-origin": "Reconcile local dev with origin/dev before takeover.",
        "dev-diverged-from-origin": "Reconcile the divergent dev and origin/dev refs.",
        "checkpoint-missing": "Restore the private MVP remediation checkpoint manifest.",
        "checkpoint-invalid": "Repair the private MVP remediation checkpoint manifest.",
        "checkpoint-schema-unsupported": "Regenerate the checkpoint with schema version 2.",
        "checkpoint-dev-sha-stale": "Regenerate the checkpoint for the current dev SHA.",
        "required-private-file-missing": "Restore the first missing private handoff file.",
        "required-private-file-digest-mismatch": "Reconcile the first changed private handoff file and refresh its digest.",
        "active-mvp-work-remains": "Finish or record a verified disposition for the discovered MVP work.",
        "mvp-work-unrecorded": "Record a verified disposition for each discovered MVP branch or worktree.",
        "mvp-disposition-unverified": "Repair the first unverified MVP work disposition.",
        "mvp-worktree-dirty": "Clean or preserve the changes in the first dirty retained MVP worktree.",
        "required-tool-missing": "Install the first missing required handoff tool.",
        "node-major-mismatch": "Activate Node major 22 before takeover.",
        "database-prerequisites-unsafe": "Restore the recorded local database environment and lock wrapper prerequisites.",
        "tracker-unverified": "Restore read-only GitHub access and verify issue #855.",
        "tracker-state-mismatch": "Reconcile issue #855 state with the checkpoint.",
        "provider-static-unqualified": "Restore the recorded provider's static qualification.",
        "provider-live-unqualified": "Complete and record the provider live qualification probe.",
        "baseline-assessment-invalid": "Restore the completed historical RED baseline assessment record.",
        "final-remediation-checkpoint-invalid": "Reconcile the final assessment with the completed remediation checkpoint.",
    }
    return actions.get(blocker, "Repair the first reported blocker and run the preflight again.")


blockers: list[str] = []
invocation = pathlib.Path.cwd()
common_dir_text = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], invocation)
if common_dir_text is None:
    add_blocker(blockers, "not-a-git-workspace")
    primary = invocation
else:
    primary = pathlib.Path(common_dir_text).resolve().parent

docs_override = os.environ.get("GORDI_DOCS_ROOT")
skills_override = os.environ.get("GORDI_SKILL_ROOT")
docs_root = pathlib.Path(docs_override).resolve() if docs_override else primary / "docs"
skills_root = pathlib.Path(skills_override).resolve() if skills_override else primary / ".claude"
private_roots = {
    "docs": {"source": "override" if docs_override else "default", "status": "present" if docs_root.is_dir() else "missing"},
    "skills": {"source": "override" if skills_override else "default", "status": "present" if skills_root.is_dir() else "missing"},
}

branch = git(["branch", "--show-current"], primary)
dev_sha = git(["rev-parse", "HEAD"], primary)
origin_dev_sha = git(["rev-parse", "origin/dev"], primary)
dirty = git(["status", "--porcelain", "--untracked-files=normal"], primary)
if branch != "dev":
    add_blocker(blockers, "primary-not-on-dev")
if dirty is None or dirty != "":
    add_blocker(blockers, "public-checkout-dirty")
if origin_dev_sha is None:
    add_blocker(blockers, "origin-dev-missing")
elif dev_sha is not None and dev_sha != origin_dev_sha:
    counts = git(["rev-list", "--left-right", "--count", "HEAD...origin/dev"], primary)
    try:
        ahead, behind = (int(value) for value in (counts or "").split())
    except (TypeError, ValueError):
        ahead, behind = 1, 1
    if ahead and behind:
        add_blocker(blockers, "dev-diverged-from-origin")
    elif ahead:
        add_blocker(blockers, "dev-ahead-of-origin")
    else:
        add_blocker(blockers, "dev-behind-origin")

manifest_path = docs_root / MANIFEST_RELATIVE
manifest: dict[str, Any] = {}
manifest_status = "missing"
if not manifest_path.is_file():
    add_blocker(blockers, "checkpoint-missing")
else:
    try:
        loaded = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(loaded, dict):
            raise ValueError("manifest must be an object")
        manifest = loaded
        manifest_status = "valid"
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError):
        manifest_status = "invalid"
        add_blocker(blockers, "checkpoint-invalid")

manifest_schema = manifest.get("schemaVersion")
if manifest_status == "valid" and (type(manifest_schema) is not int or manifest_schema != SCHEMA_VERSION):
    manifest_status = "unsupported"
    add_blocker(blockers, "checkpoint-schema-unsupported")

expected_dev_sha = manifest.get("expectedDevSha") if isinstance(manifest.get("expectedDevSha"), str) else None
if manifest_status == "valid" and not re.fullmatch(r"[0-9a-f]{40}", expected_dev_sha or ""):
    add_blocker(blockers, "checkpoint-invalid")
if manifest_status == "valid" and expected_dev_sha != dev_sha:
    add_blocker(blockers, "checkpoint-dev-sha-stale")

required_files: list[dict[str, Any]] = []
required_spec = manifest.get("requiredFiles", [])
if not isinstance(required_spec, list):
    required_spec = []
    if manifest_status == "valid":
        add_blocker(blockers, "checkpoint-invalid")

roots = {"docs": docs_root, "skills": skills_root}
recorded_file_keys: set[tuple[str, str]] = set()
recorded_file_digests: dict[tuple[str, str], str] = {}
for item in required_spec:
    root_name = item.get("root") if isinstance(item, dict) else None
    relative_value = item.get("path") if isinstance(item, dict) else None
    expected_digest = item.get("sha256") if isinstance(item, dict) else None
    relative = safe_relative(relative_value)
    root_valid = isinstance(root_name, str) and root_name in roots
    digest_valid = isinstance(expected_digest, str) and re.fullmatch(r"[0-9a-f]{64}", expected_digest) is not None
    record = {
        "root": root_name if root_valid else "invalid",
        "path": relative_value if isinstance(relative_value, str) else "invalid",
        "sha256": expected_digest if isinstance(expected_digest, str) else None,
        "status": "invalid",
    }
    if not root_valid or relative is None or not digest_valid:
        add_blocker(blockers, "checkpoint-invalid")
    else:
        recorded_file_keys.add((root_name, relative_value))
        recorded_file_digests[(root_name, relative_value)] = expected_digest
        candidate = roots[root_name] / relative
        if not candidate.is_file():
            record["status"] = "missing"
            add_blocker(blockers, "required-private-file-missing")
        else:
            actual_digest = file_digest(candidate)
            record["status"] = "matched" if actual_digest == expected_digest else "mismatch"
            if actual_digest != expected_digest:
                add_blocker(blockers, "required-private-file-digest-mismatch")
    required_files.append(record)

if manifest_status == "valid" and not required_files:
    add_blocker(blockers, "checkpoint-invalid")
if manifest_status == "valid" and not MANDATORY_FILES.issubset(recorded_file_keys):
    add_blocker(blockers, "checkpoint-invalid")

active_work: list[dict[str, Any]] = []
mvp_spec = manifest.get("mvpWork")
if not isinstance(mvp_spec, dict):
    mvp_spec = {}
    if manifest_status == "valid":
        add_blocker(blockers, "checkpoint-invalid")

pattern_spec = mvp_spec.get("branchPatterns")
compiled_patterns: list[re.Pattern[str]] = []
if not isinstance(pattern_spec, list) or not pattern_spec:
    add_blocker(blockers, "checkpoint-invalid")
    pattern_spec = []
for pattern in pattern_spec:
    if not isinstance(pattern, str) or len(pattern) > 200 or not pattern.startswith("^") or not pattern.endswith("$"):
        add_blocker(blockers, "checkpoint-invalid")
        continue
    try:
        compiled_patterns.append(re.compile(pattern))
    except re.error:
        add_blocker(blockers, "checkpoint-invalid")

branch_inventory: dict[str, str] = {}
branch_lines = git(["for-each-ref", "--format=%(refname:short)%00%(objectname)", "refs/heads"], primary)
for line in (branch_lines or "").splitlines():
    parts = line.split("\0", 1)
    if len(parts) == 2 and parts[0] and re.fullmatch(r"[0-9a-f]{40}", parts[1]):
        branch_inventory[parts[0]] = parts[1]

worktree_inventory: dict[str, pathlib.Path] = {}
worktree_head_inventory: dict[str, str] = {}
detached_worktree_inventory: list[tuple[pathlib.Path, str]] = []
worktree_text = git(["worktree", "list", "--porcelain"], primary)
worktree_record: dict[str, str] = {}
for line in [*(worktree_text or "").splitlines(), ""]:
    if not line:
        worktree_path = worktree_record.get("worktree")
        worktree_head = worktree_record.get("HEAD")
        branch_ref = worktree_record.get("branch", "")
        if (
            branch_ref.startswith("refs/heads/")
            and worktree_path
            and worktree_head
            and re.fullmatch(r"[0-9a-f]{40}", worktree_head)
        ):
            branch_name = branch_ref.removeprefix("refs/heads/")
            worktree_inventory[branch_name] = pathlib.Path(worktree_path).resolve()
            worktree_head_inventory[branch_name] = worktree_head
        elif (
            worktree_path
            and worktree_head
            and re.fullmatch(r"[0-9a-f]{40}", worktree_head)
            and "detached" in worktree_record
        ):
            detached_worktree_inventory.append((pathlib.Path(worktree_path).resolve(), worktree_head))
        worktree_record = {}
        continue
    key, _, value = line.partition(" ")
    if value:
        worktree_record[key] = value
    elif key == "detached":
        worktree_record[key] = ""

def owned_branch(name: str) -> bool:
    return any(pattern.fullmatch(name) for pattern in compiled_patterns) or PROJECT_BRANCH_PATTERN.fullmatch(name) is not None


def worktree_relative_path(worktree: pathlib.Path) -> pathlib.PurePosixPath | None:
    try:
        relative = worktree.relative_to(primary)
    except ValueError:
        return None
    return pathlib.PurePosixPath(*relative.parts)


def owned_worktree(worktree: pathlib.Path) -> bool:
    relative = worktree_relative_path(worktree)
    return (
        relative is not None
        and len(relative.parts) == 3
        and relative.parts[:2] == (".claude", "worktrees")
        and PROJECT_WORKTREE_PATTERN.fullmatch(relative.parts[-1]) is not None
    )


discovered_owned = {name: sha for name, sha in branch_inventory.items() if owned_branch(name)}
for branch_name, actual_worktree in worktree_inventory.items():
    if owned_worktree(actual_worktree):
        discovered_owned.setdefault(branch_name, branch_inventory.get(branch_name) or worktree_head_inventory.get(branch_name))
item_spec = mvp_spec.get("items")
if not isinstance(item_spec, list):
    add_blocker(blockers, "checkpoint-invalid")
    item_spec = []

recorded_branches: set[str] = set()
for item in item_spec:
    if not isinstance(item, dict):
        add_blocker(blockers, "checkpoint-invalid")
        continue
    branch_name = item.get("branch")
    expected_sha = item.get("expectedSha")
    worktree_value = item.get("worktreePath")
    disposition = item.get("disposition")
    integrated_sha = item.get("integratedDevSha")
    disposition_evidence = item.get("dispositionEvidence")
    relative_worktree = safe_relative(worktree_value)
    branch_valid = isinstance(branch_name, str) and bool(branch_name) and owned_branch(branch_name)
    sha_valid = isinstance(expected_sha, str) and re.fullmatch(r"[0-9a-f]{40}", expected_sha) is not None
    disposition_valid = isinstance(disposition, str) and disposition in {"active", "merged", "disposed"}
    if (
        not branch_valid
        or not sha_valid
        or relative_worktree is None
        or not disposition_valid
        or branch_name in recorded_branches
    ):
        add_blocker(blockers, "checkpoint-invalid")
        continue
    recorded_branches.add(branch_name)
    ref_sha = branch_inventory.get(branch_name)
    expected_worktree = (primary / relative_worktree).resolve()
    actual_worktree = worktree_inventory.get(branch_name)
    ref_status = "matched" if ref_sha == expected_sha else ("missing" if ref_sha is None else "mismatch")
    worktree_status = "present" if actual_worktree == expected_worktree else ("missing" if actual_worktree is None else "mismatch")
    clean_status = worktree_clean_status(actual_worktree)
    record = {
        "branch": branch_name,
        "expectedSha": expected_sha,
        "disposition": disposition,
        "worktreePath": worktree_value,
        "refStatus": ref_status,
        "worktreeStatus": worktree_status,
        "worktreeCleanStatus": clean_status,
    }
    if disposition == "active":
        active_work.append(record)
        add_blocker(blockers, "active-mvp-work-remains")
    elif disposition == "merged":
        integrated_valid = (
            isinstance(integrated_sha, str)
            and re.fullmatch(r"[0-9a-f]{40}", integrated_sha) is not None
            and git_success(["merge-base", "--is-ancestor", integrated_sha, "HEAD"], primary)
            and git_success(["merge-base", "--is-ancestor", expected_sha, integrated_sha], primary)
        )
        if clean_status == "dirty":
            record["dispositionStatus"] = "blocked-dirty-worktree"
            active_work.append(record)
            add_blocker(blockers, "mvp-worktree-dirty")
        elif (
            not integrated_valid
            or ref_status == "mismatch"
            or worktree_status == "mismatch"
            or clean_status == "unverified"
        ):
            record["disposition"] = "unverified"
            active_work.append(record)
            add_blocker(blockers, "mvp-disposition-unverified")
    elif disposition == "disposed":
        disposed_valid = (
            isinstance(disposition_evidence, str)
            and bool(disposition_evidence.strip())
            and ref_sha is None
            and actual_worktree is None
        )
        if not disposed_valid:
            record["disposition"] = "unverified"
            active_work.append(record)
            add_blocker(blockers, "mvp-disposition-unverified")

for branch_name in sorted(set(discovered_owned) - recorded_branches):
    actual_worktree = worktree_inventory.get(branch_name)
    relative_worktree = worktree_relative_path(actual_worktree) if actual_worktree is not None else None
    worktree_value = (
        str(relative_worktree)
        if relative_worktree is not None
        else ("outside-primary" if actual_worktree is not None else None)
    )
    expected_sha = discovered_owned[branch_name] or worktree_head_inventory.get(branch_name)
    active_work.append(
        {
            "branch": branch_name,
            "expectedSha": expected_sha,
            "disposition": "unrecorded",
            "worktreePath": worktree_value,
            "inventorySource": "local-ref" if owned_branch(branch_name) else "worktree-path",
            "refStatus": "present" if branch_name in branch_inventory else "missing",
            "worktreeStatus": "present" if actual_worktree is not None else "missing",
            "worktreeCleanStatus": worktree_clean_status(actual_worktree),
        }
    )
    add_blocker(blockers, "mvp-work-unrecorded")

for actual_worktree, head_sha in sorted(detached_worktree_inventory, key=lambda value: str(value[0])):
    if not owned_worktree(actual_worktree):
        continue
    relative_worktree = worktree_relative_path(actual_worktree)
    worktree_value = str(relative_worktree) if relative_worktree is not None else "outside-primary"
    active_work.append(
        {
            "branch": None,
            "expectedSha": head_sha,
            "disposition": "unrecorded",
            "worktreePath": worktree_value,
            "inventorySource": "detached-worktree",
            "refStatus": "not-applicable",
            "worktreeStatus": "present",
            "worktreeCleanStatus": worktree_clean_status(actual_worktree),
        }
    )
    add_blocker(blockers, "mvp-work-unrecorded")

toolchain_spec = manifest.get("toolchain", {})
if not isinstance(toolchain_spec, dict):
    toolchain_spec = {}
    add_blocker(blockers, "checkpoint-invalid")
required_tools = toolchain_spec.get("requiredExecutables", [])
if not isinstance(required_tools, list):
    required_tools = []
    add_blocker(blockers, "checkpoint-invalid")
if not MANDATORY_TOOLS.issubset({name for name in required_tools if isinstance(name, str)}):
    add_blocker(blockers, "checkpoint-invalid")
tool_versions: dict[str, dict[str, Any]] = {}
for name in required_tools:
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_.+-]+", name):
        add_blocker(blockers, "checkpoint-invalid")
        continue
    present = shutil.which(name) is not None
    tool_versions[name] = {"present": present, "version": tool_version(name) if present else None}
    if not present:
        add_blocker(blockers, "required-tool-missing")

required_node_major = toolchain_spec.get("nodeMajor")
if type(required_node_major) is not int:
    add_blocker(blockers, "checkpoint-invalid")
node_version = tool_versions.get("node", {}).get("version")
node_match = re.search(r"(?:^|\D)(\d+)(?:\.|$)", node_version or "")
node_major = int(node_match.group(1)) if node_match else None
if required_node_major != 22 or node_major != 22:
    add_blocker(blockers, "node-major-mismatch")
toolchain = {
    "requiredNodeMajor": 22,
    "nodeMajor": node_major,
    "status": "ready" if required_tools and all(value["present"] for value in tool_versions.values()) and node_major == 22 else "mismatch",
    "tools": tool_versions,
}

database_spec = manifest.get("database", {})
if not isinstance(database_spec, dict):
    database_spec = {}
    add_blocker(blockers, "checkpoint-invalid")
env_relative = safe_relative(database_spec.get("envFile"))
lock_relative = safe_relative(database_spec.get("lockWrapper"))
if env_relative is None or lock_relative is None:
    add_blocker(blockers, "checkpoint-invalid")
env_present = bool(env_relative and (primary / env_relative).is_file())
lock_present = bool(lock_relative and os.access(primary / lock_relative, os.X_OK))
database_safe = env_present and lock_present
if not database_safe:
    add_blocker(blockers, "database-prerequisites-unsafe")
database = {
    "status": "safe" if database_safe else "unsafe",
    "envFile": {"path": str(env_relative) if env_relative else None, "status": "present" if env_present else "missing"},
    "lockWrapper": {"path": str(lock_relative) if lock_relative else None, "status": "executable" if lock_present else "missing"},
    "lockInspection": "not-acquired-read-only",
}

issue_spec = manifest.get("issue", {})
if not isinstance(issue_spec, dict):
    issue_spec = {}
    add_blocker(blockers, "checkpoint-invalid")
issue_number = issue_spec.get("number", 855)
required_issue_state = issue_spec.get("requiredState", "OPEN")
if type(issue_number) is not int or not isinstance(required_issue_state, str) or issue_number != 855 or required_issue_state != "OPEN":
    add_blocker(blockers, "checkpoint-invalid")
tracker = {"issue": issue_number, "state": None, "status": "unverified"}
gh_present = shutil.which("gh") is not None
if issue_number == 855 and gh_present:
    gh_result = command(["gh", "issue", "view", "855", "--repo", REPOSITORY, "--json", "number,state,url"])
    if gh_result.returncode == 0:
        try:
            issue = json.loads(gh_result.stdout)
            if issue.get("number") == 855 and isinstance(issue.get("state"), str):
                tracker["state"] = issue["state"]
                tracker["status"] = "verified"
        except (json.JSONDecodeError, AttributeError):
            pass
if tracker["status"] != "verified":
    add_blocker(blockers, "tracker-unverified")
elif tracker["state"] != required_issue_state:
    add_blocker(blockers, "tracker-state-mismatch")

provider_spec = manifest.get("provider", {})
if not isinstance(provider_spec, dict):
    provider_spec = {}
    add_blocker(blockers, "checkpoint-invalid")
static_status = provider_spec.get("staticStatus")
live_status = provider_spec.get("liveStatus")
probe_timestamp = provider_spec.get("liveProbeTimestamp")
if (
    not isinstance(static_status, str)
    or static_status not in {"qualified", "pending", "unverified"}
    or not isinstance(live_status, str)
    or live_status not in {"qualified", "pending", "unverified"}
):
    add_blocker(blockers, "checkpoint-invalid")
if probe_timestamp is not None and not isinstance(probe_timestamp, str):
    add_blocker(blockers, "checkpoint-invalid")
provider = {
    "staticStatus": static_status if isinstance(static_status, str) else "unverified",
    "liveStatus": live_status if isinstance(live_status, str) else "unverified",
    "liveProbeTimestamp": probe_timestamp if isinstance(probe_timestamp, str) else None,
}
if provider["staticStatus"] != "qualified":
    add_blocker(blockers, "provider-static-unqualified")
if provider["liveStatus"] != "qualified" or not provider["liveProbeTimestamp"]:
    add_blocker(blockers, "provider-live-unqualified")

assessment_spec = manifest.get("assessment", {})
if not isinstance(assessment_spec, dict):
    assessment_spec = {}
    add_blocker(blockers, "checkpoint-invalid")
baseline_spec = assessment_spec.get("baseline")
final_spec = assessment_spec.get("final")
if not isinstance(baseline_spec, dict):
    baseline_spec = {}
    add_blocker(blockers, "checkpoint-invalid")
if not isinstance(final_spec, dict):
    final_spec = {}
    add_blocker(blockers, "checkpoint-invalid")

baseline = {
    "sessionId": baseline_spec.get("sessionId") if isinstance(baseline_spec.get("sessionId"), str) else None,
    "candidateSha": baseline_spec.get("candidateSha") if isinstance(baseline_spec.get("candidateSha"), str) else None,
    "status": baseline_spec.get("status") if isinstance(baseline_spec.get("status"), str) else "unverified",
    "filePath": baseline_spec.get("filePath") if isinstance(baseline_spec.get("filePath"), str) else None,
    "fileSha256": baseline_spec.get("fileSha256") if isinstance(baseline_spec.get("fileSha256"), str) else None,
}
baseline_file_key = ("docs", "reviews/mvp-ui-quantitative/current/ASSESSMENT.md")
baseline_valid = (
    baseline["status"] == "completed-red"
    and bool(baseline["sessionId"])
    and re.fullmatch(r"[0-9a-f]{40}", baseline["candidateSha"] or "") is not None
    and baseline["filePath"] == baseline_file_key[1]
    and baseline["fileSha256"] == recorded_file_digests.get(baseline_file_key)
)
if not baseline_valid:
    add_blocker(blockers, "baseline-assessment-invalid")

final_assessment = {
    "sessionId": final_spec.get("sessionId") if isinstance(final_spec.get("sessionId"), str) else None,
    "candidateSha": final_spec.get("candidateSha") if isinstance(final_spec.get("candidateSha"), str) else None,
    "status": final_spec.get("status") if isinstance(final_spec.get("status"), str) else "unverified",
}
remediation_spec = manifest.get("remediation")
if not isinstance(remediation_spec, dict):
    remediation_spec = {}
    add_blocker(blockers, "checkpoint-invalid")
remediation_status = remediation_spec.get("status")
if remediation_status == "in-progress":
    final_valid = (
        final_assessment["status"] == "pending"
        and final_assessment["sessionId"] is None
        and final_assessment["candidateSha"] is None
    )
elif remediation_status == "complete":
    final_valid = (
        final_assessment["status"] == "completed"
        and bool(final_assessment["sessionId"])
        and final_assessment["candidateSha"] == expected_dev_sha
    )
else:
    final_valid = False
if not final_valid:
    add_blocker(blockers, "final-remediation-checkpoint-invalid")

if "checkpoint-invalid" in blockers and manifest_status == "valid":
    manifest_status = "invalid"

checkpoint = {
    "manifest": str(MANIFEST_RELATIVE),
    "status": manifest_status,
    "expectedDevSha": expected_dev_sha,
    "assessment": {
        "baseline": baseline,
        "final": final_assessment,
    },
    "remediation": {"status": remediation_status if isinstance(remediation_status, str) else "unverified"},
}

ready = not blockers
next_action = "Begin MVP remediation takeover." if ready else next_action_for(blockers[0])
output = {
    "schemaVersion": SCHEMA_VERSION,
    "ready": ready,
    "devSha": dev_sha,
    "originDevSha": origin_dev_sha,
    "requiredFiles": required_files,
    "activeWork": active_work,
    "privateRoots": private_roots,
    "toolchain": toolchain,
    "database": database,
    "tracker": tracker,
    "provider": provider,
    "checkpoint": checkpoint,
    "blockers": blockers,
    "nextAction": next_action,
}

print(json.dumps(output, sort_keys=True, separators=(",", ":")))
if ready:
    print("MVP handoff ready. Begin the remediation takeover.", file=sys.stderr)
else:
    print(f"MVP handoff blocked ({len(blockers)}): {blockers[0]}. Next: {next_action}", file=sys.stderr)
raise SystemExit(0 if ready else 1)
PY
