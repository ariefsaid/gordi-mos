#!/usr/bin/env -S uv run
# /// script
# dependencies = ["pydantic", "python-dotenv", "pyyaml", "rich"]
# ///
"""ADW Design Audit — the milestone judgment pass (OD-WAY-55) run as a factory chain.

Usage:
    uv run adws/adw_design_audit.py <scope.md> [--base-url http://localhost:5173/mos/]
                                    [--config adws/adw_sssf_config/sssf.config.yaml]
                                    [--adw-id a1b2c3d4] [--auditor fe_reviewer]

Phases: engineer(request) -> code(record_scope: trace record) -> fe_reviewer(audit)
        -> code(verdict: trace record)

The design gate runs at two speeds (OD-WAY-55, amending DD-WAY-32): per change the
guard suites only — automatic, code, cannot be forgotten; at a milestone boundary
(one signed brief completing) THIS chain runs the judgment pass over the milestone's
touched surfaces plus connected screens. It never runs per-ticket.

No plan phase — the scope IS the plan. The scope file is recorded on the trace as a
code phase (the same shape as findings-mode `reuse_plan` in adw_simple_sdlc), then
handed to the auditor as the previous envelope. One agent phase runs the layered
battery per the design-reviewer contract: guard suites confirmed green (the auditor
may run the named guard test files, read-only), then census / interaction-contract
conformance / the artifacts the judgment layer rests on — all over FRESH renders,
driven with agent-browser against an already-running dev server.

The Director starts that server BEFORE the run (`npm run dev` from `mos-app/`) and
passes `--base-url`. The chain never boots vite itself — factory worktrees carry no
.env, so a chain-started server renders an unauthenticated husk and every verdict on
it would be void. Non-localhost base URLs are refused outright: the audit drives a
local render, never staging or production.

No commit phases. The audit writes only the session trace — screenshots and audit.md
live in the session dir (docs-split rule: documentary artifacts never land in this
public tree), and its findings become tickets or findings fix-runs
(`adw_simple_sdlc.py --findings`), never commits here. Still binding from DD-WAY-32:
never self-score — this chain produces layer 0-2 artifacts and the per-surface
verdict; the Director's cross-family judgment and the owner's milestone review sit
above it — and a verdict without artifacts is void, which the gates enforce
mechanically (audit.md and every screenshot must live under this run's session dir;
every surface needs both width classes — desktop and ≤390px phone — declared in its
screenshot filenames; a failing surface must carry findings).

Scope file format (markdown; refused when missing or empty of surfaces):
    free prose anywhere; every line beginning "- " names ONE surface, e.g.
        - /work — Work destination (list, filters, needs-attention)
    The auditor echoes each such line verbatim (minus the "- ") as a `surface` id —
    the scope-coverage gate holds it to that — and ADDS entries for connected
    screens it judges affected.

Exit code: 0 only when every audited surface passes. A failing audit is a completed,
accepted-as-work chain whose RUN acceptance fails — same two-question split as
adw_simple_sdlc's red suite: the phase did its job; the milestone is not clean.
"""

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from adw_modules import agents, gates, git_helper, session
from adw_modules.data_types import (AgentCall, AuditOutput, GateReport,
                                    PhaseParams, PlanOutput)

DEFAULT_BASE_URL = "http://localhost:5173/mos/"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
WIDTH_CLASSES = ("desktop", "phone")   # phone = ≤390px viewport, per the contract

# The exact shape session.py mints (utils.new_id(8) -> token_hex): 8 lowercase hex
# chars. --adw-id becomes a filesystem path component under the sessions dir, so
# anything else is refused BEFORE a session exists — an id is opaque, never a path.
# Same validation adw_simple_sdlc applies to --from-adw-id.
_ADW_ID = re.compile(r"^[0-9a-f]{8}$")

AUDIT_PROMPT = """\
This is the MILESTONE DESIGN AUDIT (OD-WAY-55) — the judgment pass over a completed
milestone, not a build review. There is no builder, no diff, and no plan.md: the
scope below IS the plan, and the previous envelope records it.

Dev server: ALREADY RUNNING at {base_url} — the engineer started it. Do NOT start,
stop, restart, or rebuild it (no `npm run dev`, no vite, no builds). Drive that URL
with agent-browser exactly as your contract describes.

## Scope — audit every surface listed, plus connected screens
Echo each scope line verbatim (minus the leading "- ") as that surface's `surface`
id. Add extra `surfaces` entries for connected screens you judge affected — a
milestone's blast radius is wider than its diff.

{scope}

## The battery, per your contract
0. Confirm the guard suites green over the scoped surfaces — you may run the named
   guard test files (read-only; they change nothing tracked). A red guard is a
   failing verdict for its surface, not a reason to stop auditing the rest.
1. Census battery on FRESH renders of each surface — every number, control, state,
   geometry measurement, affordance, copy string enumerated in audit.md.
2. Interaction-contract conformance DRIVEN with real clicks/keys per the contract's
   classes — never judged from source or a screenshot.
3. The judgment layer is NOT yours to score — your artifacts and screenshots feed
   it. Never self-score taste/intent; report what you measured and saw.

## Artifacts (a verdict without artifacts is void)
- Screenshots per surface — populated state at desktop AND ≤390px phone width at
  minimum — under <context_handoff_dir>/screenshots/, named
  `<surface-slug>-desktop.png` and `<surface-slug>-phone.png` (the gate requires
  BOTH width classes in every surface's filenames; capture phone at ≤390px for
  real). Every screenshot must be from THIS run's session dir; stale or
  repo-committed images are void.
- The audit report at <context_handoff_dir>/audit.md: findings grouped
  Critical / Important / Minor, each citing surface + the violated token /
  contract rule / job story, per your contract's Report section.

## REPORT SHAPE OVERRIDE — AuditOutput, not ReviewOutput
This run's Report JSON is `AuditOutput`. IGNORE the ReviewOutput example later in
this message (it belongs to the build-review chain). Respond with ONLY:

{{
  "status": "success",
  "summary": "<one sentence: N of M surfaces pass>",
  "approved": <true ONLY when every surface verdict is "pass">,
  "surfaces": [
    {{"surface": "<scope line verbatim>", "verdict": "pass" | "fail",
      "screenshots": ["<path under the session dir>"]}}
  ],
  "findings": [
    {{"surface": "<the surface id it was seen on>",
      "severity": "critical" | "important" | "minor",
      "finding": "<what is wrong, as rendered>",
      "rule": "<the violated token / contract rule / job story>"}}
  ],
  "audit_path": "<context_handoff_dir>/audit.md",
  "artifacts": ["<context_handoff_dir>/audit.md", "<every screenshot path>"],
  "notes_for_next_agent": "<what a findings fix-run must address, or how to verify>"
}}

A "fail" surface must carry at least one finding naming it; a critical finding
forces its surface to "fail". You change nothing in the repo, and this chain
commits nothing — findings become tickets or fix-runs.
"""


# ── refusals (before any session exists) ─────────────────────────────────────

def _read_scope(scope_path: str) -> tuple[Path, str, list[str]]:
    """The scope file, its text, and the surfaces it lists — or a refusal."""
    scope_file = Path(scope_path)
    if not scope_file.is_file():
        raise SystemExit(f"scope file not found: {scope_path} — the scope IS the "
                         f"plan; this chain refuses to audit without one")
    text = scope_file.read_text()
    surfaces = [line.strip()[2:].strip() for line in text.splitlines()
                if line.strip().startswith("- ") and line.strip()[2:].strip()]
    if not surfaces:
        raise SystemExit(f"scope file lists no surfaces: {scope_path} — every "
                         f'audited surface is a line beginning "- "')
    return scope_file, text, surfaces


def _validate_base_url(base_url: str) -> str:
    """Localhost only: the audit drives a local render, never a deployed one."""
    parsed = urlparse(base_url)
    if parsed.username is not None or parsed.password is not None:
        # Refused FIRST, and the URL is deliberately not echoed: credentials in a
        # URL must reach neither the trace log nor the agent prompt.
        raise SystemExit(
            "--base-url refused: it carries userinfo (credentials@host). A local "
            "dev server needs none, and secrets must never reach the trace or the "
            "prompt — pass a bare localhost URL.")
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or host not in LOCAL_HOSTS:
        raise SystemExit(
            f"--base-url {base_url!r} refused: the audit drives an already-running "
            f"LOCAL dev server only (host must be one of {sorted(LOCAL_HOSTS)}). "
            f"Start it yourself — `npm run dev` from mos-app/ — and point --base-url "
            f"at it; this chain never audits staging or production.")
    return base_url


def _validate_adw_id(cfg, adw_id: str | None) -> str | None:
    """--adw-id joins a session BY PATH under the sessions dir, so it is held to
    the exact shape the runner mints (utils.new_id(8)) plus containment — the
    same validation adw_simple_sdlc applies to --from-adw-id."""
    if adw_id is None:
        return None
    if not _ADW_ID.fullmatch(adw_id):
        raise SystemExit(f"--adw-id {adw_id!r} is not a session id "
                         f"(8 hex chars, as the runner mints them)")
    sessions = (Path(cfg.defaults.data_dir) / "sessions").resolve()
    path = (sessions / adw_id).resolve()
    if sessions not in path.parents:      # defense in depth behind the format check
        raise SystemExit(f"--adw-id {adw_id!r} is not a session id "
                         f"(resolves outside the sessions dir)")
    return adw_id


# ── gates (chain-local: they verify AuditOutput's claims, nothing else uses them) ──

def _inside(path: str, root: Path) -> bool:
    resolved = Path(path).resolve()
    return root.resolve() in resolved.parents


def audit_artifacts_exist(envelope, run) -> GateReport:
    """A verdict without artifacts is void (DD-WAY-32) — enforced, not trusted.

    audit.md must exist non-empty UNDER THIS RUN'S session dir — a pre-existing
    report outside the run is not this run's audit. Every surface must carry
    screenshots that exist under the session dir too (a path outside it is not a
    fresh render, whatever the auditor claims), covering BOTH width classes:
    filenames must carry "desktop" and "phone" (phone = ≤390px viewport). The
    width class is a declaration in the name — the smallest honest mechanism the
    harness can hold a path to; capturing phone at ≤390px for real stays the
    contract's obligation on the auditor.
    """
    report = GateReport()
    session_root = Path(run.session_dir)
    audit_path = str(getattr(envelope, "audit_path", "") or "")
    p = Path(audit_path) if audit_path else None
    ok = (bool(p) and p.is_file() and p.stat().st_size > 0
          and _inside(audit_path, session_root))
    report.check("audit.md", ok,
                 f"exists in the session dir, {p.stat().st_size}B" if ok
                 else "audit_path missing, empty, or outside this run's session dir "
                      "— the audit report must be this run's own")
    for surface in getattr(envelope, "surfaces", []):
        shots = list(getattr(surface, "screenshots", []))
        if not shots:
            report.check(f"screenshots: {surface.surface}", False,
                         "no screenshot — a verdict without artifacts is void")
            continue
        for shot in shots:
            fresh = Path(shot).is_file() and _inside(shot, session_root)
            report.check(f"screenshot: {shot}", fresh,
                         "fresh render in the session dir" if fresh
                         else "missing, or outside this run's session dir — only fresh renders count")
        names = [Path(shot).name.lower() for shot in shots]
        for width_class in WIDTH_CLASSES:
            covered = any(width_class in name for name in names)
            report.check(f"{width_class} render: {surface.surface}", covered,
                         "declared" if covered
                         else f"no screenshot filename carries {width_class!r} — both "
                              f"width classes are required (phone = ≤390px)")
    return report


def audit_verdict_consistent(envelope, run) -> GateReport:
    """The verdict must agree with the findings written next to it.

    Same idea as gates.verdict_consistent, per-surface: a failing surface with no
    finding, an approval over a failing surface, a rejection naming no failing
    surface, or a critical finding on a "pass" surface are claims the harness can
    refute without any design judgment.
    """
    report = GateReport()
    surfaces = list(getattr(envelope, "surfaces", []))
    findings = list(getattr(envelope, "findings", []))
    approved = bool(getattr(envelope, "approved", False))
    failing = [s.surface for s in surfaces if s.verdict == "fail"]
    passing = {s.surface for s in surfaces if s.verdict == "pass"}

    report.check("at least one surface audited", bool(surfaces),
                 f"{len(surfaces)} surface(s)" if surfaces
                 else "no surfaces in the envelope — nothing was audited")
    for surface in failing:
        count = sum(1 for f in findings if f.surface == surface)
        report.check(f"failing surface carries findings: {surface}", count > 0,
                     f"{count} finding(s)" if count
                     else "verdict is fail but no finding names this surface")
    report.check("approved vs surface verdicts", not (approved and failing),
                 "no failing surface" if not failing
                 else f"{len(failing)} failing surface(s) while approved=true"
                 if approved else f"{len(failing)} failing surface(s), not approved")
    report.check("rejection names a failing surface", approved or bool(failing),
                 "verdict is supported" if approved or failing
                 else "approved=false but every surface verdict is pass")
    critical_on_pass = sorted({f.surface for f in findings
                               if f.severity == "critical" and f.surface in passing})
    report.check("critical findings force a fail verdict", not critical_on_pass,
                 "none on passing surfaces" if not critical_on_pass
                 else f"critical finding(s) on passing surface(s): {', '.join(critical_on_pass)}")
    return report


def scope_covered(scoped: list[str]):
    """Gate factory: every scoped surface must appear in the audited surfaces.

    Connected screens ADD entries; nothing scoped may silently drop out — a
    skipped surface is an unaudited surface wearing a green run.
    """
    def gate(envelope, run) -> GateReport:
        report = GateReport()
        audited = {s.surface for s in getattr(envelope, "surfaces", [])}
        for surface in scoped:
            report.check(f"scope covered: {surface}", surface in audited,
                         "audited" if surface in audited
                         else "scoped surface missing from the audit — echo the scope line verbatim")
        return report
    gate.__name__ = "scope_covered"
    return gate


# ── the chain ────────────────────────────────────────────────────────────────

def main(scope_path: str, config: str = "adws/adw_sssf_config/sssf.config.yaml",
         adw_id: str | None = None, base_url: str = DEFAULT_BASE_URL,
         auditor: str = "fe_reviewer") -> int:
    # Refusals first: no session, no trace, until the inputs are auditable.
    scope_file, scope_text, scoped = _read_scope(scope_path)
    base_url = _validate_base_url(base_url)
    cfg = agents.load_config(config)
    adw_id = _validate_adw_id(cfg, adw_id)
    agents.validate(cfg, [auditor])
    run = session.ensure(cfg, adw_id)

    with run.phase(PhaseParams(name="request", kind="engineer", owner=run.engineer,
                               description="Capture the milestone audit ask: which scope, "
                                           "against which running server, on which tree")) as ph:
        ph.log(input=f"design audit of {scope_file} against {base_url}",
               scope=str(scope_file), base_url=base_url, surfaces=len(scoped),
               tree=git_helper.short_sha("HEAD"))

    # OD-WAY-55: no plan phase — the scope IS the plan. Recorded on the trace the
    # way findings mode records reuse_plan, then handed over as the previous
    # envelope, so the auditor and the trace read the same document.
    scope_envelope = PlanOutput(
        status="success",
        summary=f"Milestone design-audit scope: {len(scoped)} surface(s) from {scope_file}",
        artifacts=[str(scope_file)],
        notes_for_next_agent="The scope is the plan — audit every listed surface "
                             "plus the connected screens you judge affected.")
    with run.phase(PhaseParams(name="record_scope", kind="code", owner="git",
                               description="The scope IS the plan (OD-WAY-55): record it on the "
                                           "trace like findings-mode reuse_plan — no planner runs")) as ph:
        ph.log(scope=str(scope_file), surfaces=" | ".join(scoped),
               note="scope file recorded on the trace; no plan phase — the scope is the plan")

    with run.phase(PhaseParams(name="audit", kind="agent", owner=auditor, retries=1,
                               description="Run the layered judgment battery over fresh renders "
                                           "of every scoped surface plus connected screens")) as ph:
        audit = ph.call(AgentCall(
            output_type=AuditOutput,
            prompt=AUDIT_PROMPT.format(base_url=base_url, scope=scope_text),
            previous=scope_envelope,
            gates=[gates.artifacts_exist, audit_artifacts_exist,
                   audit_verdict_consistent, scope_covered(scoped)]))

    with run.phase(PhaseParams(name="verdict", kind="code", owner="git",
                               description="Put the per-surface verdicts and findings on the trace — "
                                           "findings become tickets or fix-runs, never commits here")) as ph:
        failing = [s.surface for s in audit.surfaces if s.verdict == "fail"]
        ph.log(approved=audit.approved,
               surfaces=f"{len(audit.surfaces)} audited ({len(scoped)} scoped)",
               failing=", ".join(failing) or "none",
               findings=len(audit.findings), audit=audit.audit_path)

    return run.finish(accepted=audit.approved,
                      reason="the audit found failing surfaces — route the findings "
                             "into tickets or a findings fix-run")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scope",
                        help='path to the milestone scope file — surfaces as "- " lines; '
                             "the scope IS the plan (OD-WAY-55)")
    parser.add_argument("--config", default="adws/adw_sssf_config/sssf.config.yaml")
    parser.add_argument("--adw-id", default=None, help="join or pin an existing session")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL,
                        help="already-running LOCAL dev server (the engineer starts it; "
                             "localhost only — this chain never boots vite itself)")
    parser.add_argument("--auditor", default="fe_reviewer",
                        help="roster agent for the audit phase (design-reviewer contract)")
    args = parser.parse_args()
    sys.exit(main(args.scope, args.config, args.adw_id, args.base_url, args.auditor))
