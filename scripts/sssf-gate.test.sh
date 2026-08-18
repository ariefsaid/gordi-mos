#!/usr/bin/env bash
# Self-test for the factory's grown gate + chain exit contract (#336).
# Owns: FAC-004 (pgTAP conditional on supabase/ changes; cheap-first skip) and
# FAC-005 (fix-round exhaustion exits without committing) at the unit layer.
# Runs the REAL adw_modules/quality.py and adws/adw_simple_sdlc.py with stub
# siblings (python3 stdlib only — no pydantic/yaml installed here, on purpose:
# the factory's deps are uv-managed at run time, never CI's concern).
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

# Static contracts that need no import at all.
grep -q 'supabase db reset && supabase test db' adws/adw_modules/quality.py \
  && ok "pgtap chains reset+test inside ONE lock hold (single bash -c string)" \
  || bad "pgtap reset+test are not chained in one db-lock hold"
grep -q 'with-db-lock.sh' adws/adw_modules/quality.py \
  && ok "pgtap rides the db lock" || bad "pgtap does not use scripts/with-db-lock.sh"
grep -q 'with-test-lock.sh' adws/adw_modules/quality.py \
  && ok "unit suite rides the test lock" || bad "test block does not use scripts/with-test-lock.sh"
grep -q 'cd mos-app && npm' adws/adw_modules/quality.py \
  && ok "gate commands run in mos-app" || bad "gate commands do not target mos-app"
grep -q 'Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>' adws/adw_modules/git_helper.py \
  && ok "runner commits carry the MOS trailer" || bad "git_helper.py lacks the MOS commit trailer"
grep -q 'contract declared but not found' adws/adw_modules/agents.py \
  && ok "declared-but-missing contract refuses in validate() (FAC-002 seam)" \
  || bad "agents.py validate() lacks the missing-contract refusal"

OUT="$(python3 - "$ROOT" <<'PY'
import contextlib, importlib.util, shutil, subprocess, sys, tempfile, types
from pathlib import Path

root = Path(sys.argv[1])
failures = []
def check(name, cond, detail=""):
    print(("ok " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)

# ── harness: import the REAL quality.py with stub siblings ────────────────────
work = Path(tempfile.mkdtemp())
pkg = work / "adw_modules"
pkg.mkdir()
(pkg / "__init__.py").write_text("")
(pkg / "utils.py").write_text(
    "import datetime, os\n"
    "def now_iso():\n    return datetime.datetime.now().isoformat()\n"
    "def operator_env():\n    return dict(os.environ)\n")
(pkg / "data_types.py").write_text("""
class _Base:
    def __init__(self, **kw):
        self.__dict__.update(kw)
    def model_dump(self):
        return dict(self.__dict__)
class EventRecord(_Base): pass
class QualityCheckSpec(_Base): pass
class QualityCheckResult(_Base): pass
class QualityResult(_Base): pass
class VerifyOutput(_Base): pass
""")
shutil.copy(root / "adws/adw_modules/quality.py", pkg / "quality.py")
sys.path.insert(0, str(work))
quality = importlib.import_module("adw_modules.quality")

# a scratch git repo so the REAL _touches_db runs the real git commands
repo = work / "repo"
repo.mkdir()
subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
subprocess.run(["git", "config", "user.email", "t@t"], cwd=repo, check=True)
subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
(repo / "a.txt").write_text("x")
subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
subprocess.run(["git", "commit", "-qm", "init"], cwd=repo, check=True)

class Run:
    repo_root = repo

calls = []
def block(name, passed=True):
    def fake(run):
        calls.append(name)
        return quality.QualityCheckResult(
            name=name, area="frontend", operation="lint", command=name,
            returncode=0 if passed else 1, passed=passed, duration_seconds=0.0,
            output_artifact=f"{name}.log", output_tail=f"{name} output tail")
    return fake

def compose(tc=True, li=True, te=True, pg=True):
    calls.clear()
    quality.typecheck = block("typecheck", tc)
    quality.lint = block("lint", li)
    quality.test = block("test", te)
    quality.pgtap = block("pgtap", pg)
    return quality.run_tests(Run())

# FAC-004: clean tree — no supabase change → no pgtap; order is cheap-first
r = compose()
check("green run, no supabase change: pgtap skipped",
      calls == ["typecheck", "lint", "test"] and r.passed, str(calls))

# FAC-004: a supabase/ change → pgtap runs
(repo / "supabase").mkdir()
(repo / "supabase" / "mig.sql").write_text("select 1;")
r = compose()
check("green run, supabase touched: pgtap runs last",
      calls == ["typecheck", "lint", "test", "pgtap"] and r.passed, str(calls))

# cheap-first: red typecheck skips the heavy blocks entirely
r = compose(tc=False)
check("red typecheck: suite and pgtap never run",
      calls == ["typecheck", "lint"] and not r.passed, str(calls))
check("failure carries the block's verbatim output tail",
      any("typecheck output tail" in f for f in r.failures), str(r.failures))

# red suite: pgtap not reached even with supabase touched
r = compose(te=False)
check("red suite: pgtap never runs", calls == ["typecheck", "lint", "test"] and not r.passed, str(calls))

# run_quality (the census used by adw_quality / adw_plan_build_test_quality):
# same real blocks, cheap-first order, conditional pgtap — and it runs EVERYTHING
# even on failure (collect-all contract), unlike the early-stopping gate.
calls.clear()
quality.typecheck = block("typecheck", False)
quality.lint = block("lint")
quality.test = block("test")
quality.build = block("build")
quality.pgtap = block("pgtap")
r = quality.run_quality(Run())
check("run_quality: cheap-first order, pgtap on supabase change, all blocks despite failure",
      calls == ["typecheck", "lint", "test", "build", "pgtap"] and not r.passed, str(calls))

# _touches_db is the real function against the real repo
check("_touches_db true on supabase/ change", quality._touches_db(Run()) is True)
subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
subprocess.run(["git", "commit", "-qm", "supabase in baseline"], cwd=repo, check=True)
check("_touches_db false on a clean tree", quality._touches_db(Run()) is False)

# ── FAC-005: run the REAL chain file with stub modules — exhaustion must not commit ──
class Envelope:
    def __init__(self, **kw):
        self.status = "success"; self.summary = "s"; self.artifacts = ["p"]
        self.commit_message = "msg"; self.approved = True
        self.__dict__.update(kw)
    def model_dump_json(self, **kw): return "{}"

committed = []
phases = []
class Ph:
    def __init__(self, params): self.params = params
    def call(self, agent_call):
        name = self.params.kw["name"]
        if name.startswith("review"): return Envelope(approved=REVIEW_APPROVED)
        return Envelope()
    def log(self, **kw): pass
class PhaseCtx:
    def __init__(self, run, params): self.run, self.params = run, params
    def __enter__(self):
        phases.append(self.params.kw["name"]); return Ph(self.params)
    def __exit__(self, *a): return False
class FakeRun:
    engineer = "t"; adw_id = "test"
    def phase(self, params): return PhaseCtx(self, params)
    def finish(self, accepted, reason=""):
        self.accepted = accepted; return 0 if accepted else 1

fake_run = FakeRun()
class Params:
    def __init__(self, **kw): self.kw = kw
def mod(name, **attrs):
    m = types.ModuleType(name); [setattr(m, k, v) for k, v in attrs.items()]; return m

class ChangeSetBase:
    label = "b"; commit = "c" * 7; reason = "r"
changeset = types.SimpleNamespace(base=ChangeSetBase(), files=[], untracked=[], insertions=1,
                                  deletions=0, diff_path="d", empty=False)
QUALITY_GREEN = False
stub_quality = mod("adw_modules.quality",
    run_tests=lambda run: types.SimpleNamespace(
        passed=QUALITY_GREEN, checks=[], failures=[] if QUALITY_GREEN else ["test: red"], artifacts=[]),
    as_envelope=lambda result, what: Envelope())
stub_git = mod("adw_modules.git_helper",
    rev=lambda ref="HEAD": "base", short_sha=lambda ref="HEAD": "abc1234",
    commit_all=lambda msg: (committed.append(msg), "abc1234")[1])
stubs = {
    "adw_modules": mod("adw_modules"),
    "adw_modules.agents": mod("adw_modules.agents",
                              load_config=lambda p: "cfg", validate=lambda cfg, req: None),
    "adw_modules.changes": mod("adw_modules.changes",
                               capture=lambda run, cc: changeset, as_envelope=lambda cs, notes: Envelope()),
    "adw_modules.gates": mod("adw_modules.gates",
                             artifacts_exist=1, files_non_empty=2, diff_matches_claims=3,
                             verdict_consistent=4),
    "adw_modules.git_helper": stub_git,
    "adw_modules.quality": stub_quality,
    "adw_modules.session": mod("adw_modules.session", ensure=lambda cfg, adw_id: fake_run),
    "adw_modules.utils": mod("adw_modules.utils", resolve_prompt=lambda p: p),
    "adw_modules.data_types": mod("adw_modules.data_types",
                                  AgentCall=lambda **kw: types.SimpleNamespace(**kw),
                                  BuildOutput=Envelope, ChangeCapture=lambda **kw: None,
                                  DocumentOutput=Envelope, PhaseParams=Params,
                                  PlanOutput=Envelope, ReviewOutput=Envelope),
}
sys.modules.update(stubs)
spec = importlib.util.spec_from_file_location("adw_simple_sdlc", root / "adws/adw_simple_sdlc.py")
sdlc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sdlc)

# exhaustion: quality always red → 3 fix rounds, then exit WITHOUT any commit
REVIEW_APPROVED = True
phases.clear(); committed.clear()
rc = sdlc.main("do a thing")
fixes = [p for p in phases if p.startswith("fix_")]
check("exhausted run exits non-zero and unaccepted", rc == 1 and fake_run.accepted is False)
check("exactly 3 fix rounds ran", len(fixes) == 3, str(phases))
check("NO commit landed on exhaustion (plan+docs are trace-recorded, code never green)",
      committed == [], str(committed))

# control — the zero-commit assertion can fail: a green run commits exactly once (commit_build)
QUALITY_GREEN = True
stub_quality.run_tests = lambda run: types.SimpleNamespace(passed=True, checks=[], failures=[], artifacts=[])
phases.clear(); committed.clear()
rc = sdlc.main("do a thing")
check("green run accepted", rc == 0 and fake_run.accepted is True)
check("green run commits exactly once (commit_build; plan and docs stay trace-only)",
      len(committed) == 1, str(committed))

shutil.rmtree(work, ignore_errors=True)
sys.exit(1 if failures else 0)
PY
)"
status=$?
printf '%s\n' "$OUT" | sed 's/^/  /'
if [ $status -eq 0 ]; then
  ok "python harness: all composition/chain checks passed"
else
  bad "python harness reported failures"
fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
