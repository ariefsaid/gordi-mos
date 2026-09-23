#!/usr/bin/env bash
# Self-test for the milestone design-audit chain (#350, OD-WAY-55).
# Owns, at the unit layer: the chain refuses a missing/empty scope file, any
# non-localhost --base-url, any --base-url carrying userinfo (credentials never
# reach the trace or the prompt), and any --adw-id that is not a runner-minted
# session id (8 hex chars + sessions-dir containment) — all BEFORE a session
# exists; the scope rides the trace as a code phase (the scope IS the plan — no
# planner); the chain never commits and never boots vite; the chain-local gates
# can actually fail — artifacts (audit.md AND screenshots session-dir-contained,
# both width classes per surface), per-surface verdict consistency, and scope
# coverage each proven red and green; and the gates are WIRED into the
# AgentCall, proven by a perturbed copy with a gate dropped letting a bad
# envelope pass.
# Runs the REAL adws/adw_design_audit.py with stub siblings (python3 stdlib only,
# no live model calls — same harness pattern as sssf-gate.test.sh).
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

# Static contracts that need no import at all.
grep -q 'commit_all' adws/adw_design_audit.py \
  && bad "audit chain reaches for commit_all — it must never commit" \
  || ok "audit chain has no commit path (findings become tickets/fix-runs, not commits)"
grep -q 'run_tests\|quality_block' adws/adw_design_audit.py \
  && bad "audit chain wires the quality gate — guard suites are the auditor's read-only step" \
  || ok "audit chain runs no quality block (the auditor confirms guards itself, read-only)"
grep -q 'never audits staging' adws/adw_design_audit.py \
  && ok "localhost-only refusal present (worktrees lack .env; Director starts the server)" \
  || bad "localhost-only base-url refusal missing from the chain"
grep -q 'sssf-design-audit.test.sh' .github/workflows/guards.yml \
  && ok "self-test registered in the guard lane (guards.yml)" \
  || bad "scripts/sssf-design-audit.test.sh is not registered in .github/workflows/guards.yml"
grep -q 'adw_design_audit.py' adws/PORT-MANIFEST.md \
  && ok "chain has its PORT-MANIFEST row" \
  || bad "adws/adw_design_audit.py has no row in adws/PORT-MANIFEST.md"
grep -q 'adw_design_audit.py' scripts/vendor-sssf.test.sh \
  && ok "chain listed as a deviation in the vendor conformance test" \
  || bad "adw_design_audit.py missing from scripts/vendor-sssf.test.sh DEVIATED list"

OUT="$(python3 - "$ROOT" <<'PY'
import hashlib, importlib.util, json, subprocess, sys, tempfile, types
from pathlib import Path

root = Path(sys.argv[1])
failures = []
def check(name, cond, detail=""):
    print(("ok " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)

work = Path(tempfile.mkdtemp())

def stable(value):
    if isinstance(value, list): return [stable(item) for item in value]
    if isinstance(value, dict): return {key: stable(value[key]) for key in sorted(value)}
    return value

def lane_digest(payload):
    volatile = {"candidateSha", "candidate_sha", "sessionId", "session_id", "auditId", "adwId",
                "auditMode", "verificationBase", "mergeBaseSha", "screenshots", "paths", "build",
                "outputPath", "artifactPath", "artifactDigest", "digest", "complete", "count"}
    measured = {key: value for key, value in payload.items() if key not in volatile}
    return hashlib.sha256(json.dumps(stable(measured), ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()

def snapshot_digest(payload):
    return hashlib.sha256(json.dumps(stable({key: value for key, value in payload.items() if key != "digest"}), ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()

# ── stub siblings (the REAL chain file runs; nothing else does) ───────────────
class GateReport:
    def __init__(self):
        self.checks = []
    def check(self, item, okay, note=""):
        self.checks.append((item, bool(okay), note))
        return self
    @property
    def violations(self):
        return [f"{i}: {n or 'failed'}" for i, o, n in self.checks if not o]
    @property
    def passed(self):
        return not self.violations

class Envelope:
    def __init__(self, **kw):
        self.status = "success"; self.summary = "s"; self.artifacts = []
        self.notes_for_next_agent = ""
        self.__dict__.update(kw)

class Params:
    def __init__(self, **kw): self.kw = kw

phases, logs, prompts_seen, previous_seen, gates_seen, sessions_started = [], [], [], [], [], []
class Ph:
    def __init__(self, params): self.params = params
    def call(self, agent_call):
        prompts_seen.append((self.params.kw["name"], agent_call.prompt))
        previous_seen.append(agent_call.previous)
        gates_seen.append(list(agent_call.gates))
        return AUDIT_ENVELOPE
    def log(self, **kw): logs.append((self.params.kw["name"], kw))
class PhaseCtx:
    def __init__(self, params): self.params = params
    def __enter__(self):
        phases.append(self.params.kw["name"]); return Ph(self.params)
    def __exit__(self, *a): return False
class FakeRun:
    engineer = "t"; adw_id = "ab12cd34"
    session_dir = work / "session"
    context_handoff_dir = session_dir / "context_handoff"
    def phase(self, params): return PhaseCtx(params)
    def finish(self, accepted, reason=""):
        self.accepted = accepted; return 0 if accepted else 1
fake_run = FakeRun()
FakeRun.context_handoff_dir.mkdir(parents=True)

def mod(name, **attrs):
    m = types.ModuleType(name); [setattr(m, k, v) for k, v in attrs.items()]; return m

validated = []
cfg_obj = types.SimpleNamespace(defaults=types.SimpleNamespace(data_dir=str(work / "adw_data")))
sys.modules.update({
    "adw_modules": mod("adw_modules"),
    "adw_modules.agents": mod("adw_modules.agents",
                              load_config=lambda p: cfg_obj,
                              validate=lambda cfg, req: validated.append(list(req))),
    "adw_modules.gates": mod("adw_modules.gates", artifacts_exist=lambda e, r: GateReport()),
    "adw_modules.git_helper": mod("adw_modules.git_helper",
                                  short_sha=lambda ref="HEAD": "abc1234",
                                  rev=lambda ref="HEAD": "a" * 40),
    "adw_modules.session": mod("adw_modules.session",
                               ensure=lambda cfg, adw_id: (sessions_started.append(adw_id),
                                                           fake_run)[1]),
    "adw_modules.data_types": mod("adw_modules.data_types",
                                  AgentCall=lambda **kw: types.SimpleNamespace(**kw),
                                  AuditOutput=Envelope, GateReport=GateReport,
                                  PhaseParams=Params, PlanOutput=Envelope),
})
spec = importlib.util.spec_from_file_location("adw_design_audit",
                                              root / "adws/adw_design_audit.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

# The browser lane is intentionally stubbed, but its exact artifact contract is
# real: create the complete, SHA/session-stamped handoff so the chain gate can be
# exercised without a server, database, or model call.
quant_root = FakeRun.context_handoff_dir
quant_artifacts = tuple(audit.QUANTITATIVE_ARTIFACTS)
check("fixture receipt is registered in the ADW quantitative artifact contract",
      "fixture-receipt.json" in quant_artifacts)
check("visible content is registered in the ADW quantitative artifact contract",
      "visible-content.csv" in quant_artifacts)
check("control consistency is registered in the ADW quantitative artifact contract",
      "control-consistency.csv" in quant_artifacts)
candidate_sha = "a" * 40
for artifact in quant_artifacts:
    target = quant_root / artifact
    if artifact == "mockup-diff":
        target.mkdir(parents=True, exist_ok=True)
        (target / "status.json").write_text(json.dumps({
            "candidateSha": candidate_sha, "sessionId": FakeRun.adw_id,
            "status": "pass", "comparisons": [{
                "surface": "work", "status": "pass", "score": 0.9,
                "build": "/tmp/render.png", "missingRegions": [],
                "contradictedRegions": []}], "complete": True, "count": 1,
            "digest": "0" * 64,
        }))
    elif artifact == "manifest.json":
        rendered = subprocess.run([
            "node", "--experimental-strip-types", "--input-type=module", "-e",
            "import {manifestForArtifact} from './mos-app/e2e/design-quality/manifest.ts'; "
            f"console.log(JSON.stringify(manifestForArtifact('{candidate_sha}', '{FakeRun.adw_id}')))"
        ], cwd=root, check=True, capture_output=True, text=True).stdout
        target.write_text(rendered)
    elif artifact == "fixture-receipt.json":
        target.write_text(json.dumps({
            "candidateSha": candidate_sha, "sessionId": FakeRun.adw_id,
            "namespace": f"design-audit-{FakeRun.adw_id}",
            "created": [], "cleanup": [],
            "unrelatedSentinelsPreserved": True,
            "binding": "0" * 64,
            "sentinels": [], "ownedDatabaseIds": [],
            "ownedAuthUsers": [],
            "ownedAuthUserIds": [], "remainingAuthUserIds": [],
            "cleanupOnFailure": {"attempted": False, "completed": True}}))
    elif artifact == "impeccable.json":
        payload = {
            "candidateSha": candidate_sha, "sessionId": FakeRun.adw_id,
            "status": "pass", "scannedFiles": ["src/app.tsx"], "findings": [],
            "auditMode": "change-gate", "complete": True, "count": 1,
            "failures": [], "allFailures": [], "inheritedFailures": [], "newFailures": [],
        }
        payload["digest"] = lane_digest(payload)
        target.write_text(json.dumps(payload))
    elif artifact.endswith("-summary.json"):
        payload = {
            "candidateSha": candidate_sha, "sessionId": FakeRun.adw_id,
            "auditMode": "change-gate", "automaticChecksPassed": True,
            "complete": True, "failures": [], "allFailures": [], "inheritedFailures": [], "newFailures": [],
        }
        if artifact == "quantitative-summary.json":
            payload.update({"geometryRows": 1, "visibleContentRows": 1, "count": 2})
        elif artifact == "control-consistency-summary.json":
            payload.update({"rows": 1, "count": 1})
        elif artifact == "contrast-summary.json":
            payload.update({"rows": 1, "count": 1})
        elif artifact == "anti-slop-summary.json":
            payload.update({"cells": 1, "count": 1})
        elif artifact == "axe-summary.json":
            payload.update({"scans": [{"cellId": "tasks-default-desktop", "status": "pass"}], "count": 1})
        payload["digest"] = lane_digest(payload)
        target.write_text(json.dumps(payload))
    elif artifact == "gate-log.txt":
        target.write_text(
            f"# candidate_sha={candidate_sha}\n# session_id={FakeRun.adw_id}\n"
            "browser_status=0\nfixture_status=0\nchain_status=not-run\n")
    elif artifact == "control-consistency.csv":
        import csv
        manifest = json.loads((quant_root / "manifest.json").read_text())
        cells = [cell for cell in manifest["cells"]
                 if cell["status"] == "covered" and cell.get("stateContract")]
        fields = ["authority", "cellId", "component", "kind", "measured",
                  "observed", "passed", "selector", "size", "state", "variant"]
        with target.open("w", newline="") as handle:
            handle.write(f"# candidate_sha={candidate_sha}\n# session_id={FakeRun.adw_id}\n")
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            for cell in cells:
                writer.writerow({
                    "authority": "issue #856 fixture denominator", "cellId": cell["id"],
                    "component": "all-controls", "kind": "population",
                    "measured": json.dumps({"populationSize": 1, "boundedChoicePopulation": 0,
                                            "nativeSelectPopulation": 0}),
                    "observed": "true", "passed": "true", "selector": "__cell__",
                    "size": "all", "state": "default", "variant": "population"})
                writer.writerow({
                    "authority": "DESIGN.md button contract", "cellId": cell["id"],
                    "component": "button", "kind": "control",
                    "measured": json.dumps({"populationSize": 1, "height": 32, "radius": 8,
                                            "borderWidth": 1, "foreground": "rgb(20,20,20)",
                                            "background": "rgb(255,255,255)", "textContrast": 18,
                                            "boundaryContrast": 3.1}),
                    "observed": "true", "passed": "true", "selector": "main button",
                    "size": "control-32", "state": "default", "variant": "outline"})
            for state in ("disabled", "error"):
                writer.writerow({
                    "authority": "issue #856 state population", "cellId": cells[0]["id"],
                    "component": "all-controls", "kind": "control-state",
                    "measured": json.dumps({"state": state, "populationSize": 1}),
                    "observed": "true", "passed": "true", "selector": "__population__",
                    "size": "all", "state": state, "variant": "state-face"})
    elif artifact == "visible-content.csv":
        import csv
        manifest = json.loads((quant_root / "manifest.json").read_text())
        with target.open("w", newline="") as handle:
            handle.write(f"# candidate_sha={candidate_sha}\n# session_id={FakeRun.adw_id}\n")
            writer = csv.DictWriter(handle, fieldnames=[
                "cellId", "kind", "measured", "observed", "passed", "selector",
            ])
            writer.writeheader()
            for cell in manifest["cells"]:
                if cell["status"] != "covered" or not cell.get("stateContract"):
                    continue
                shared = {"cellId": cell["id"], "observed": "true", "passed": "true", "selector": "main h1"}
                writer.writerow({**shared, "kind": "text-truncation", "measured": json.dumps({
                    "scrollWidth": 100, "clientWidth": 100, "lineClamp": "none",
                    "textOverflow": "clip", "fullValuePathExercised": False})})
                writer.writerow({**shared, "kind": "viewport-occlusion", "measured": json.dumps({
                    "intersectionRatio": 0, "centerCovered": False,
                    "fullyReachable": True, "persistentBandCount": 0})})
                if cell["viewport"] == "phone-390x844":
                    writer.writerow({**shared, "kind": "touch-separation", "measured": json.dumps({
                        "width": 44, "height": 44, "nearestDistance": None, "populationSize": 1})})
    else:
        target.write_text(
            f"# candidate_sha={candidate_sha}\n# session_id={FakeRun.adw_id}\n"
            "status\nobserved\n")
(quant_root / "session.json").write_text(json.dumps({
    "candidateSha": candidate_sha,
    "sessionId": FakeRun.adw_id,
    "auditMode": "mvp-assessment",
    "browserExitStatus": 0,
    "fixtureExitStatus": 0,
    "chainExitStatus": "not-run",
    "quantitativeArtifacts": [str(quant_root / artifact) for artifact in quant_artifacts],
}))

def surface(name, verdict, shots):
    return types.SimpleNamespace(surface=name, verdict=verdict, screenshots=shots)
def finding(surf, severity="critical", text="broken"):
    return types.SimpleNamespace(surface=surf, severity=severity, finding=text, rule="")

# ── refusals: all BEFORE any session exists ───────────────────────────────────
try:
    audit.main(str(work / "no-such-scope.md"))
    check("missing scope file refused", False, "run proceeded")
except SystemExit as e:
    check("missing scope file refused", "scope file not found" in str(e), str(e))

empty_scope = work / "empty-scope.md"
empty_scope.write_text("# a milestone\n\nprose only, no surface lines\n")
try:
    audit.main(str(empty_scope))
    check("scope with no surfaces refused", False, "run proceeded")
except SystemExit as e:
    check("scope with no surfaces refused", "lists no surfaces" in str(e), str(e))

scope = work / "scope.md"
scope.write_text("# Milestone X scope\n"
                 "- /work — Work destination (list, filters)\n"
                 "- /home — Home needs-attention row\n")
for evil in ("http://ops.gordi.example:5173/mos/", "https://staging.example/mos/",
             "ftp://localhost:21/", "http://localhost.evil.example/"):
    try:
        audit.main(str(scope), base_url=evil)
        check(f"non-localhost base-url refused: {evil}", False, "run proceeded")
    except SystemExit as e:
        check(f"non-localhost base-url refused: {evil}", "refused" in str(e), str(e))

# userinfo: refused even on a localhost host, and the secret must appear NOWHERE
for creds_url in ("http://admin:s3cretpw@localhost:5173/mos/",
                  "http://s3cretpw@127.0.0.1:5173/"):
    try:
        audit.main(str(scope), base_url=creds_url)
        check("base-url with userinfo refused", False, "run proceeded")
    except SystemExit as e:
        check(f"base-url with userinfo refused: {creds_url.split('@')[1]}",
              "userinfo" in str(e), str(e))
        check("refusal message never echoes the credential", "s3cretpw" not in str(e), str(e))

# --adw-id is a path component under the sessions dir: only the runner-minted
# shape (8 hex chars) is accepted, refused BEFORE a session exists otherwise
for evil_id in ("../../outside", "/etc", "ab12cd34/../../../outside", "AB12CD34", "deadbeefcafe"):
    try:
        audit.main(str(scope), adw_id=evil_id)
        check(f"hostile --adw-id refused: {evil_id!r}", False, "run proceeded")
    except SystemExit as e:
        check(f"hostile --adw-id refused: {evil_id!r}", "not a session id" in str(e), str(e))
check("every refusal happened before a session existed", sessions_started == [],
      str(sessions_started))

# ── green run: localhost accepted, scope rides the trace, right phases ────────
shots_dir = FakeRun.session_dir / "context_handoff" / "screenshots"
shots_dir.mkdir(parents=True)
work_d, work_p = shots_dir / "work-desktop.png", shots_dir / "work-phone.png"
home_d, home_p = shots_dir / "home-desktop.png", shots_dir / "home-phone.png"
for f in (work_d, work_p, home_d, home_p):
    f.write_bytes(b"png")
audit_md = FakeRun.session_dir / "context_handoff" / "audit.md"
audit_md.write_text("# audit\nfindings...")

AUDIT_ENVELOPE = Envelope(
    approved=True, audit_path=str(audit_md),
    surfaces=[surface("/work — Work destination (list, filters)", "pass",
                      [str(work_d), str(work_p)]),
              surface("/home — Home needs-attention row", "pass",
                      [str(home_d), str(home_p)])],
    findings=[], artifacts=[str(audit_md), str(work_d), str(work_p)])

phases.clear(); logs.clear(); prompts_seen.clear(); previous_seen.clear()
rc = audit.main(str(scope), base_url="http://127.0.0.1:5173/mos/", adw_id="ab12cd34")
check("clean audit accepted (rc 0; valid runner-shaped --adw-id passes)",
      rc == 0 and fake_run.accepted is True and sessions_started == ["ab12cd34"])
check("phase list: request -> record_scope -> audit -> verdict, nothing else",
      phases == ["request", "record_scope", "audit", "verdict"], str(phases))
check("fe_reviewer is the roster slot validated", validated[-1] == ["fe_reviewer"],
      str(validated))
scope_logs = [kw for name, kw in logs if name == "record_scope"]
check("scope trace phase records the scope file and its surfaces",
      scope_logs and str(scope) in scope_logs[0].get("scope", "")
      and "/work" in scope_logs[0].get("surfaces", ""), str(scope_logs))
check("scope trace phase says the scope IS the plan (no planner)",
      scope_logs and "no plan phase" in scope_logs[0].get("note", ""), str(scope_logs))
audit_prompts = [p for name, p in prompts_seen if name == "audit"]
check("audit prompt carries the base url, the scope text, and the AuditOutput override",
      audit_prompts and "http://127.0.0.1:5173/mos/" in audit_prompts[0]
      and "- /work — Work destination (list, filters)" in audit_prompts[0]
      and "AuditOutput" in audit_prompts[0], str(audit_prompts)[:400])
check("audit prompt forbids booting the server (already running)",
      audit_prompts and "ALREADY RUNNING" in audit_prompts[0])
check("MVP prompt requires complete evidence and preserves strict gaps",
      audit_prompts and "MVP-ASSESSMENT" in audit_prompts[0]
      and "Missing requested states" in audit_prompts[0]
      and "untested" in audit_prompts[0])
check("scope envelope handed to the auditor as previous",
      previous_seen and str(scope) in previous_seen[-1].artifacts, str(previous_seen))

# A syntactically valid non-object session payload is malformed evidence, not a
# reason for the orchestration process to crash before its gates can report it.
session_path = quant_root / "session.json"
valid_session_payload = session_path.read_text()
session_path.write_text("[]")
prompts_seen.clear()
try:
    malformed_rc = audit.main(str(scope), base_url="http://localhost:5173/mos/")
    malformed_prompts = [p for name, p in prompts_seen if name == "audit"]
    check("non-object session metadata reaches the audit gates without crashing",
          malformed_rc == 0 and malformed_prompts
          and "MVP-ASSESSMENT" in malformed_prompts[0])
except Exception as exc:
    check("non-object session metadata reaches the audit gates without crashing", False, repr(exc))
finally:
    session_path.write_text(valid_session_payload)

# ── failing verdict: the chain completes, the RUN is not accepted ─────────────
AUDIT_ENVELOPE = Envelope(
    approved=False, audit_path=str(audit_md),
    surfaces=[surface("/work — Work destination (list, filters)", "fail",
                      [str(work_d), str(work_p)]),
              surface("/home — Home needs-attention row", "pass",
                      [str(home_d), str(home_p)])],
    findings=[finding("/work — Work destination (list, filters)")],
    artifacts=[str(audit_md)])
phases.clear(); logs.clear()
rc = audit.main(str(scope), base_url="http://localhost:5173/mos/")
check("failing audit exits 1, unaccepted — findings become tickets/fix-runs",
      rc == 1 and fake_run.accepted is False)
check("failing audit still runs every phase (the audit itself succeeded)",
      phases == ["request", "record_scope", "audit", "verdict"], str(phases))
verdict_logs = [kw for name, kw in logs if name == "verdict"]
check("verdict trace phase names the failing surface",
      verdict_logs and "/work" in verdict_logs[0].get("failing", ""), str(verdict_logs))

# ── the gates, red AND green (proven able to fail) ────────────────────────────
run = types.SimpleNamespace(session_dir=FakeRun.session_dir)
both = [str(work_d), str(work_p)]
good = Envelope(approved=False, audit_path=str(audit_md),
                surfaces=[surface("/work", "fail", both)],
                findings=[finding("/work")])

# artifacts gate
check("artifacts gate green: audit.md + both width classes under the session dir",
      audit.audit_artifacts_exist(good, run).passed)
r = audit.audit_artifacts_exist(Envelope(approved=False, audit_path=str(work / "gone.md"),
                                         surfaces=[surface("/work", "fail", both)],
                                         findings=[finding("/work")]), run)
check("artifacts gate RED: missing audit.md", not r.passed, str(r.violations))
outside_md = work / "outside-audit.md"
outside_md.write_text("# a perfectly real report, from somewhere else")
r = audit.audit_artifacts_exist(Envelope(approved=False, audit_path=str(outside_md),
                                         surfaces=[surface("/work", "fail", both)],
                                         findings=[finding("/work")]), run)
check("artifacts gate RED: existing audit.md OUTSIDE the session dir is not this run's report",
      not r.passed, str(r.violations))
r = audit.audit_artifacts_exist(Envelope(approved=False, audit_path=str(audit_md),
                                         surfaces=[surface("/work", "fail", [])],
                                         findings=[finding("/work")]), run)
check("artifacts gate RED: surface with no screenshot (verdict without artifacts is void)",
      not r.passed, str(r.violations))
stale = work / "stale-desktop.png"; stale.write_bytes(b"png")   # exists, but OUTSIDE the session dir
r = audit.audit_artifacts_exist(Envelope(approved=False, audit_path=str(audit_md),
                                         surfaces=[surface("/work", "fail", [str(stale), str(work_p)])],
                                         findings=[finding("/work")]), run)
check("artifacts gate RED: screenshot outside the session dir is not a fresh render",
      not r.passed, str(r.violations))
r = audit.audit_artifacts_exist(Envelope(approved=False, audit_path=str(audit_md),
                                         surfaces=[surface("/work", "fail", [str(work_d)])],
                                         findings=[finding("/work")]), run)
check("artifacts gate RED: desktop only — the ≤390px phone class is missing",
      not r.passed, str(r.violations))
check("artifacts gate names the missing width class",
      any("phone" in v for v in r.violations), str(r.violations))

# verdict-consistency gate
check("verdict gate green: failing surface with a finding, not approved",
      audit.audit_verdict_consistent(good, run).passed)
r = audit.audit_verdict_consistent(Envelope(approved=False,
                                            surfaces=[surface("/work", "fail", ["x"])],
                                            findings=[]), run)
check("verdict gate RED: failing surface with no finding", not r.passed, str(r.violations))
r = audit.audit_verdict_consistent(Envelope(approved=True,
                                            surfaces=[surface("/work", "fail", ["x"])],
                                            findings=[finding("/work")]), run)
check("verdict gate RED: approved over a failing surface", not r.passed, str(r.violations))
r = audit.audit_verdict_consistent(Envelope(approved=False,
                                            surfaces=[surface("/work", "pass", ["x"])],
                                            findings=[]), run)
check("verdict gate RED: rejection with every surface passing", not r.passed, str(r.violations))
r = audit.audit_verdict_consistent(Envelope(approved=True, surfaces=[], findings=[]), run)
check("verdict gate RED: no surfaces audited at all", not r.passed, str(r.violations))
r = audit.audit_verdict_consistent(Envelope(approved=True,
                                            surfaces=[surface("/work", "pass", ["x"])],
                                            findings=[finding("/work", "critical")]), run)
check("verdict gate RED: critical finding on a passing surface", not r.passed, str(r.violations))
r = audit.audit_verdict_consistent(Envelope(approved=True,
                                            surfaces=[surface("/work", "pass", ["x"])],
                                            findings=[finding("/work", "minor")]), run)
check("verdict gate green: minor finding may ride a passing surface", r.passed, str(r.violations))

# scope-coverage gate
gate = audit.scope_covered(["/work", "/home"])
r = gate(Envelope(surfaces=[surface("/work", "pass", ["x"])]), run)
check("scope gate RED: a scoped surface silently dropped", not r.passed, str(r.violations))
r = gate(Envelope(surfaces=[surface("/work", "pass", ["x"]),
                            surface("/home", "pass", ["x"]),
                            surface("/inbox (connected)", "pass", ["x"])]), run)
check("scope gate green: full scope covered, connected screens may add entries",
      r.passed, str(r.violations))

# quantitative artifact gate — exact candidate/session binding and completeness
check("quantitative gate green: complete handoff carries the current SHA and session",
      audit.audit_quantitative_artifacts(good, run).passed)
session_path = quant_root / "session.json"
session_payload = json.loads(session_path.read_text())
session_payload.update({
    "auditMode": "mvp-assessment",
    "browserExitStatus": 0,
    "chainExitStatus": "not-run",
})
session_path.write_text(json.dumps(session_payload))
(quant_root / "quantitative-summary.json").write_text(json.dumps({
    "candidateSha": candidate_sha,
    "sessionId": FakeRun.adw_id,
    "auditMode": "mvp-assessment",
    "automaticChecksPassed": True,
    "complete": True, "failures": [], "allFailures": [], "inheritedFailures": [], "newFailures": [],
    "geometryRows": 1, "visibleContentRows": 1, "count": 2,
}))
summary_payload = json.loads((quant_root / "quantitative-summary.json").read_text())
summary_payload["digest"] = lane_digest(summary_payload)
(quant_root / "quantitative-summary.json").write_text(json.dumps(summary_payload))
r = audit.audit_quantitative_artifacts(good, run)
check("quantitative gate green for an MVP evidence handoff",
      r.passed, str(r.violations))
missing_artifact = quant_root / "contrast.csv"
missing_artifact.unlink()
r = audit.audit_quantitative_artifacts(good, run)
check("quantitative gate RED: missing census artifact", not r.passed, str(r.violations))
missing_artifact.write_text(
    f"# candidate_sha={candidate_sha}\n# session_id={FakeRun.adw_id}\n"
    "status\nobserved\n")
session_payload["candidateSha"] = "b" * 40
session_path.write_text(json.dumps(session_payload))
r = audit.audit_quantitative_artifacts(good, run)
check("quantitative gate RED: session from a different candidate SHA", not r.passed,
      str(r.violations))
session_payload["candidateSha"] = candidate_sha
session_path.write_text(json.dumps(session_payload))
r = audit.audit_quantitative_artifacts(good, run)
check("quantitative gate green after stale-SHA mutation is removed", r.passed,
      str(r.violations))

# Python ADW binding independently reads the fixed Git blob.  A poisoned
# working-tree copy and an old filesystem baseline cannot affect this result.
binding_repo = Path(tempfile.mkdtemp())
def binding_git(*args):
    return subprocess.run(["git", *args], cwd=binding_repo, check=True,
                          capture_output=True, text=True).stdout.strip()
binding_git("init", "-q")
binding_git("config", "user.email", "test@example.invalid")
binding_git("config", "user.name", "test")
(binding_repo / "mos-app/src").mkdir(parents=True)
(binding_repo / "mos-app/e2e/design-quality").mkdir(parents=True)
(binding_repo / "mos-app/src/product.ts").write_text("base\n")
(binding_repo / "mos-app/e2e/design-quality/manifest.ts").write_text("manifest\n")
binding_git("add", ".")
binding_git("commit", "-qm", "product")
binding_product_sha = binding_git("rev-parse", "HEAD")
binding_manifest_digest = hashlib.sha256(b"manifest\n").hexdigest()
binding_snapshot = {
    "kind": audit.AUTOMATIC_FAILURE_BASELINE_KIND,
    "version": audit.AUTOMATIC_FAILURE_BASELINE_VERSION,
    "source": {"productSha": binding_product_sha, "harnessSha": binding_product_sha,
                "sessionId": "a1b2c3d4", "manifestDigest": binding_manifest_digest},
    "failures": [], "untestedCellIds": [],
    "lanes": {name: {"complete": True, "count": 1, "digest": "0" * 64}
              for name in audit.AUTOMATIC_FAILURE_LANES},
}
binding_snapshot["digest"] = snapshot_digest(binding_snapshot)
binding_path = binding_repo / audit.AUTOMATIC_FAILURE_BASELINE_PATH
binding_path.write_text(json.dumps(binding_snapshot, separators=(",", ":")) + "\n")
binding_git("add", ".")
binding_git("commit", "-qm", "reviewed snapshot")
binding_base_sha = binding_git("rev-parse", "HEAD")
(binding_repo / "mos-app/src/product.ts").write_text("candidate\n")
binding_git("add", ".")
binding_git("commit", "-qm", "candidate")
binding_candidate_sha = binding_git("rev-parse", "HEAD")
binding_git("update-ref", "refs/remotes/origin/dev", binding_base_sha)
binding_run = types.SimpleNamespace(candidate_sha=binding_candidate_sha, repo_root=binding_repo)
binding_session = {"auditMode": "change-gate", "verificationBase": "origin/dev",
                   "mergeBaseSha": binding_base_sha,
                   "snapshotBlobDigest": hashlib.sha256(binding_path.read_bytes()).hexdigest()}
binding_report = audit.GateReport()
audit._exact_base_binding(binding_run, binding_session, binding_report)
check("ADW Git binding accepts the reviewed merge-base blob", binding_report.passed,
      str(binding_report.violations))
binding_path.write_text("poisoned working tree\n")
poisoned_report = audit.GateReport()
audit._exact_base_binding(binding_run, binding_session, poisoned_report)
check("ADW Git binding rejects a poisoned working-tree snapshot", not poisoned_report.passed
      and any("worktree" in violation for violation in poisoned_report.violations),
      str(poisoned_report.violations))
bad_session = dict(binding_session, snapshotBlobDigest="f" * 64,
                   baselineEvidenceDir=str(work / "forged-baseline"))
bad_report = audit.GateReport()
audit._exact_base_binding(binding_run, bad_session, bad_report)
check("ADW Git binding rejects legacy filesystem baseline and digest mutation",
      not bad_report.passed, str(bad_report.violations))

# ── the gates are WIRED into the AgentCall, not just unit-tested ──────────────
# A bad envelope that ONLY the verdict gate catches: artifacts all real (both
# width classes, session dir), full scope covered — but approved=true over a
# failing surface that carries no finding.
sneaky = Envelope(approved=True, audit_path=str(audit_md),
                  surfaces=[surface("/work — Work destination (list, filters)", "fail",
                                    [str(work_d), str(work_p)]),
                            surface("/home — Home needs-attention row", "pass",
                                    [str(home_d), str(home_p)])],
                  findings=[])

AUDIT_ENVELOPE = Envelope(
    approved=True, audit_path=str(audit_md),
    surfaces=[surface("/work — Work destination (list, filters)", "pass",
                      [str(work_d), str(work_p)]),
              surface("/home — Home needs-attention row", "pass",
                      [str(home_d), str(home_p)])],
    findings=[], artifacts=[str(audit_md)])
phases.clear(); gates_seen.clear()
audit.main(str(scope), base_url="http://localhost:5173/mos/")
wired = gates_seen[-1]
check("audit AgentCall wires all five gates", len(wired) == 5,
      str([getattr(g, "__name__", g) for g in wired]))
viol = [v for g in wired for v in g(sneaky, run).violations]
check("the wired gates refuse the inconsistent envelope", bool(viol), "no violations")

# proven able to fail: a perturbed copy with the verdict gate dropped from the
# AgentCall lets the same envelope sail through — so the wiring, not just the
# gate function, is what this test holds.
src = (root / "adws/adw_design_audit.py").read_text()
needle = "audit_quantitative_artifacts, audit_verdict_consistent,\n                   scope_covered(scoped)]"
check("perturbation anchor present in the chain source", needle in src)
perturbed_path = work / "adw_design_audit_perturbed.py"
perturbed_path.write_text(src.replace(needle, "audit_quantitative_artifacts, scope_covered(scoped)]"))
spec2 = importlib.util.spec_from_file_location("adw_design_audit_perturbed", perturbed_path)
pert = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(pert)
gates_seen.clear()
pert.main(str(scope), base_url="http://localhost:5173/mos/")
pert_wired = gates_seen[-1]
pert_viol = [v for g in pert_wired for v in g(sneaky, run).violations]
check("wiring check can fail: verdict gate dropped -> the bad envelope passes the call's gates",
      len(pert_wired) == 4 and not pert_viol,
      f"{len(pert_wired)} gate(s), violations: {pert_viol}")

sys.exit(1 if failures else 0)
PY
)"
status=$?
printf '%s\n' "$OUT" | sed 's/^/  /'
if [ $status -eq 0 ]; then
  ok "python harness: all chain/gate checks passed"
else
  bad "python harness reported failures"
fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
