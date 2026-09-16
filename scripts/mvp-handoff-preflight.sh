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


SCHEMA_VERSION = 1
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
        "checkpoint-schema-unsupported": "Regenerate the checkpoint with schema version 1.",
        "checkpoint-dev-sha-stale": "Regenerate the checkpoint for the current dev SHA.",
        "required-private-file-missing": "Restore the first missing private handoff file.",
        "required-private-file-digest-mismatch": "Reconcile the first changed private handoff file and refresh its digest.",
        "active-mvp-work-remains": "Finish or explicitly dispose the active MVP branches recorded in the checkpoint.",
        "required-tool-missing": "Install the first missing required handoff tool.",
        "node-major-mismatch": "Activate Node major 22 before takeover.",
        "database-prerequisites-unsafe": "Restore the recorded local database environment and lock wrapper prerequisites.",
        "tracker-unverified": "Restore read-only GitHub access and verify issue #855.",
        "tracker-state-mismatch": "Reconcile issue #855 state with the checkpoint.",
        "provider-static-unqualified": "Restore the catalogued GLM provider route.",
        "provider-live-unqualified": "Complete and record the GLM live qualification probe.",
        "assessment-candidate-stale": "Produce a current assessment session bound to the checkpoint dev SHA.",
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
if manifest_status == "valid" and manifest_schema != SCHEMA_VERSION:
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
for item in required_spec:
    root_name = item.get("root") if isinstance(item, dict) else None
    relative_value = item.get("path") if isinstance(item, dict) else None
    expected_digest = item.get("sha256") if isinstance(item, dict) else None
    relative = safe_relative(relative_value)
    record = {
        "root": root_name if root_name in roots else "invalid",
        "path": relative_value if isinstance(relative_value, str) else "invalid",
        "sha256": expected_digest if isinstance(expected_digest, str) else None,
        "status": "invalid",
    }
    if root_name not in roots or relative is None or not re.fullmatch(r"[0-9a-f]{64}", expected_digest or ""):
        add_blocker(blockers, "checkpoint-invalid")
    else:
        recorded_file_keys.add((root_name, relative_value))
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
active_spec = manifest.get("activeMvpBranches", [])
if not isinstance(active_spec, list):
    active_spec = []
    if manifest_status == "valid":
        add_blocker(blockers, "checkpoint-invalid")
for item in active_spec:
    if not isinstance(item, dict):
        add_blocker(blockers, "checkpoint-invalid")
        continue
    branch_name = item.get("branch")
    expected_sha = item.get("expectedSha")
    worktree_value = item.get("worktreePath")
    relative_worktree = safe_relative(worktree_value)
    if (
        not isinstance(branch_name, str)
        or not branch_name
        or not re.fullmatch(r"[0-9a-f]{40}", expected_sha or "")
        or relative_worktree is None
    ):
        add_blocker(blockers, "checkpoint-invalid")
    ref_sha = git(["rev-parse", str(branch_name)], primary) if isinstance(branch_name, str) else None
    worktree_exists = bool(relative_worktree and (primary / relative_worktree).is_dir())
    active_work.append(
        {
            "branch": branch_name,
            "expectedSha": expected_sha,
            "status": item.get("status", "active"),
            "worktreePath": worktree_value,
            "refStatus": "matched" if ref_sha == expected_sha else ("missing" if ref_sha is None else "mismatch"),
            "worktreeStatus": "present" if worktree_exists else "missing",
        }
    )
if active_work:
    add_blocker(blockers, "active-mvp-work-remains")

toolchain_spec = manifest.get("toolchain", {})
if not isinstance(toolchain_spec, dict):
    toolchain_spec = {}
required_tools = toolchain_spec.get("requiredExecutables", [])
if not isinstance(required_tools, list):
    required_tools = []
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
env_relative = safe_relative(database_spec.get("envFile"))
lock_relative = safe_relative(database_spec.get("lockWrapper"))
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
issue_number = issue_spec.get("number", 855)
required_issue_state = issue_spec.get("requiredState", "OPEN")
if issue_number != 855 or required_issue_state != "OPEN":
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
provider = {
    "route": provider_spec.get("route"),
    "staticStatus": provider_spec.get("staticStatus", "unverified"),
    "liveStatus": provider_spec.get("liveStatus", "unverified"),
    "liveProbeTimestamp": provider_spec.get("liveProbeTimestamp"),
}
if provider["route"] != "zai/glm-5.3-flash" or provider["staticStatus"] != "catalogued":
    add_blocker(blockers, "provider-static-unqualified")
if provider["liveStatus"] != "qualified" or not provider["liveProbeTimestamp"]:
    add_blocker(blockers, "provider-live-unqualified")

assessment_spec = manifest.get("assessment", {})
if not isinstance(assessment_spec, dict):
    assessment_spec = {}
assessment_current = (
    assessment_spec.get("status") == "current"
    and assessment_spec.get("candidateSha") == expected_dev_sha
    and isinstance(assessment_spec.get("sessionId"), str)
    and bool(assessment_spec.get("sessionId"))
)
if not assessment_current:
    add_blocker(blockers, "assessment-candidate-stale")

if "checkpoint-invalid" in blockers and manifest_status == "valid":
    manifest_status = "invalid"

checkpoint = {
    "manifest": str(MANIFEST_RELATIVE),
    "status": manifest_status,
    "expectedDevSha": expected_dev_sha,
    "assessment": {
        "sessionId": assessment_spec.get("sessionId"),
        "candidateSha": assessment_spec.get("candidateSha"),
        "status": assessment_spec.get("status", "unverified"),
    },
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
