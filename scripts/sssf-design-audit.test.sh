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
grep -q 'run_tests\|quality' adws/adw_design_audit.py \
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
import importlib.util, sys, tempfile, types
from pathlib import Path

root = Path(sys.argv[1])
failures = []
def check(name, cond, detail=""):
    print(("ok " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)

work = Path(tempfile.mkdtemp())

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
    engineer = "t"; adw_id = "test"
    session_dir = work / "session"
    def phase(self, params): return PhaseCtx(params)
    def finish(self, accepted, reason=""):
        self.accepted = accepted; return 0 if accepted else 1
fake_run = FakeRun()
FakeRun.session_dir.mkdir(parents=True)

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
                                  short_sha=lambda ref="HEAD": "abc1234"),
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
check("scope envelope handed to the auditor as previous",
      previous_seen and str(scope) in previous_seen[-1].artifacts, str(previous_seen))

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
check("audit AgentCall wires all four gates", len(wired) == 4,
      str([getattr(g, "__name__", g) for g in wired]))
viol = [v for g in wired for v in g(sneaky, run).violations]
check("the wired gates refuse the inconsistent envelope", bool(viol), "no violations")

# proven able to fail: a perturbed copy with the verdict gate dropped from the
# AgentCall lets the same envelope sail through — so the wiring, not just the
# gate function, is what this test holds.
src = (root / "adws/adw_design_audit.py").read_text()
needle = "audit_verdict_consistent, scope_covered(scoped)]"
check("perturbation anchor present in the chain source", needle in src)
perturbed_path = work / "adw_design_audit_perturbed.py"
perturbed_path.write_text(src.replace(needle, "scope_covered(scoped)]"))
spec2 = importlib.util.spec_from_file_location("adw_design_audit_perturbed", perturbed_path)
pert = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(pert)
gates_seen.clear()
pert.main(str(scope), base_url="http://localhost:5173/mos/")
pert_wired = gates_seen[-1]
pert_viol = [v for g in pert_wired for v in g(sneaky, run).violations]
check("wiring check can fail: verdict gate dropped -> the bad envelope passes the call's gates",
      len(pert_wired) == 3 and not pert_viol,
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
