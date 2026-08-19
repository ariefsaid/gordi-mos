#!/usr/bin/env bash
# Self-test for the factory's grown gate + chain exit contract (#336).
# Owns: FAC-004 (pgTAP conditional on supabase/ changes; cheap-first skip),
# FAC-005 (fix-round exhaustion exits without committing), the #343 attribution
# trailer (derived from the executing builder's roster model, honest fallback),
# and the findings-rerun mode (--findings skips planning, reuses the prior
# session's recorded plan, links the runs) — all at the unit layer.
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
grep -q 'def commit_trailer' adws/adw_modules/git_helper.py \
  && ok "runner derives the attribution trailer from the builder's model (#343)" \
  || bad "git_helper.py lacks commit_trailer derivation (#343)"
grep -q 'Co-Authored-By: Claude Fable 5' adws/adw_modules/git_helper.py \
  && bad "git_helper still hardcodes a single-substrate trailer (#343 regression)" \
  || ok "no hardcoded single-substrate trailer remains in git_helper (#343)"
grep -q 'contract declared but not found' adws/adw_modules/agents.py \
  && ok "declared-but-missing contract refuses in validate() (FAC-002 seam)" \
  || bad "agents.py validate() lacks the missing-contract refusal"
# #343: every chain that commits passes its executing builder's model — all four
# chains have exactly one builder at commit time, so none may fall back silently.
for chain in adw_plan_build adw_plan_build_test adw_plan_build_test_quality; do
  grep -q 'commit_all(message, model=builder_model)' "adws/${chain}.py" \
    && ok "${chain}.py commits with the builder's model (#343)" \
    || bad "${chain}.py commits without the builder's model — silent neutral fallback (#343)"
done

OUT="$(python3 - "$ROOT" <<'PY'
import contextlib, importlib.util, json, os, shutil, subprocess, sys, tempfile, types
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

# ── #343: the REAL git_helper derives the trailer from the builder's model ────
spec_gh = importlib.util.spec_from_file_location("real_git_helper",
                                                root / "adws/adw_modules/git_helper.py")
gh = importlib.util.module_from_spec(spec_gh)
spec_gh.loader.exec_module(gh)

check("glm builder derives the z.ai trailer",
      gh.commit_trailer("zai/glm-5.3") == "Co-Authored-By: GLM-5.3 <noreply@z.ai>",
      gh.commit_trailer("zai/glm-5.3"))
check("luna derives the openai trailer",
      gh.commit_trailer("openai-codex/gpt-5.6-luna")
      == "Co-Authored-By: GPT-5.6 Luna <noreply@openai.com>")
fallback = gh.commit_trailer("someprovider/unmapped-model")
check("unmapped substrate gets the neutral factory line — no vendor model named",
      fallback == "Co-Authored-By: SSSF factory agent <factory@sssf.invalid>", fallback)
check("a call naming no model gets the same honest fallback",
      gh.commit_trailer() == fallback)

# the real commit path: the landed commit names the model that built it — the
# exact #343 defect, so this check is RED on the old hardcoded-trailer code.
grepo = work / "grepo"
grepo.mkdir()
subprocess.run(["git", "init", "-q"], cwd=grepo, check=True)
subprocess.run(["git", "config", "user.email", "t@t"], cwd=grepo, check=True)
subprocess.run(["git", "config", "user.name", "t"], cwd=grepo, check=True)
(grepo / "f.txt").write_text("x")
cwd_before = os.getcwd()
try:
    os.chdir(grepo)
    gh.commit_all("feat: a glm-built change", model="zai/glm-5.3")
finally:
    os.chdir(cwd_before)
body = subprocess.run(["git", "log", "-1", "--format=%B"], cwd=grepo,
                      capture_output=True, text=True).stdout
check("landed commit carries the builder-model trailer",
      "Co-Authored-By: GLM-5.3 <noreply@z.ai>" in body, body)
check("landed commit never attributes a model that did not build",
      "anthropic" not in body, body)
check("exactly one trailer line", body.count("Co-Authored-By:") == 1, body)

# a builder-supplied trailer must NOT survive: the derived line is the only
# attribution, enforced in code — a message arriving WITH a bogus trailer lands
# with exactly the derived one.
def land(msg, filename):
    (grepo / filename).write_text(filename)
    prev = os.getcwd()
    try:
        os.chdir(grepo)
        gh.commit_all(msg, model="zai/glm-5.3")
    finally:
        os.chdir(prev)
    return subprocess.run(["git", "log", "-1", "--format=%B"], cwd=grepo,
                          capture_output=True, text=True).stdout

body = land("feat: x\n\nCo-Authored-By: Someone Else <bogus@example.com>", "g.txt")
check("builder-supplied bogus trailer is stripped; derived one appended",
      "bogus@example.com" not in body
      and "Co-Authored-By: GLM-5.3 <noreply@z.ai>" in body
      and body.count("Co-Authored-By:") == 1, body)
body = land("feat: y\n\nCo-Authored-By: A <a@x.invalid>\nCo-Authored-By: B <b@x.invalid>",
            "h.txt")
check("two bogus trailers both stripped; exactly the derived line lands",
      "x.invalid" not in body
      and "Co-Authored-By: GLM-5.3 <noreply@z.ai>" in body
      and body.count("Co-Authored-By:") == 1, body)

# proven-can-fail: drop the mapping row (a broken derivation) → the same
# attribution predicate goes red; restore → green again.
saved = gh.SUBSTRATE_ATTRIBUTION.pop("zai/glm-5.3")
check("attribution check can fail: with the row dropped, GLM attribution disappears",
      "GLM-5.3" not in gh.commit_trailer("zai/glm-5.3"))
gh.SUBSTRATE_ATTRIBUTION["zai/glm-5.3"] = saved
check("restored mapping derives GLM again",
      "GLM-5.3" in gh.commit_trailer("zai/glm-5.3"))

# ── FAC-005: run the REAL chain file with stub modules — exhaustion must not commit ──
class Envelope:
    def __init__(self, **kw):
        self.status = "success"; self.summary = "s"; self.artifacts = ["p"]
        self.commit_message = "msg"; self.approved = True
        self.__dict__.update(kw)
    def model_dump_json(self, **kw): return "{}"
    @classmethod
    def model_validate(cls, data): return cls(**data)

committed = []
phases = []
prompts_seen = []
logs = []
class Ph:
    def __init__(self, params): self.params = params
    def call(self, agent_call):
        name = self.params.kw["name"]
        prompts_seen.append((name, agent_call.prompt))
        if name.startswith("review"): return Envelope(approved=REVIEW_APPROVED)
        return Envelope()
    def log(self, **kw): logs.append((self.params.kw["name"], kw))
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
    commit_all=lambda msg, model=None: (committed.append((msg, model)), "abc1234")[1])
# a cfg with a real data_dir, so findings mode can read a prior session's plan
datadir = work / "adw_data"
cfg_obj = types.SimpleNamespace(defaults=types.SimpleNamespace(data_dir=str(datadir)))
validated = []
stubs = {
    "adw_modules": mod("adw_modules"),
    "adw_modules.agents": mod("adw_modules.agents",
                              load_config=lambda p: cfg_obj,
                              validate=lambda cfg, req: validated.append(list(req)),
                              resolve=lambda cfg, name: types.SimpleNamespace(model="zai/glm-5.3")),
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
check("commit carries the executing builder's model for attribution (#343)",
      committed and committed[0][1] == "zai/glm-5.3", str(committed))
# control for the findings-mode assertions below: a NORMAL run plans — the
# "no planner phase" predicate is proven able to fail right here.
check("normal run enters through the plan phase",
      "plan" in phases and "commit_plan" in phases, str(phases))

# ── findings mode: skip planning, reuse the prior plan, link the sessions ─────
prior_dir = datadir / "sessions" / "ab12cd34" / "planner"
prior_dir.mkdir(parents=True)
(prior_dir / "envelope.json").write_text(json.dumps({
    "status": "success", "summary": "the prior plan",
    "artifacts": ["adws/adw_data/sessions/ab12cd34/context_handoff/plan.md"],
    "commit_message": ""}))

phases.clear(); committed.clear(); prompts_seen.clear(); logs.clear(); validated.clear()
rc = sdlc.main(None, findings="finding A: the trailer names the wrong model",
               from_adw_id="ab12cd34")
check("findings run accepted end-to-end", rc == 0 and fake_run.accepted is True)
check("findings run NEVER runs the planner — no plan/commit_plan phase in the trace",
      "plan" not in phases and "commit_plan" not in phases, str(phases))
check("findings run records the plan reuse before build",
      phases[:3] == ["request", "reuse_plan", "build"], str(phases))
check("planner excluded from roster validation in findings mode",
      validated and "planner" not in validated[-1], str(validated))
build_prompts = [p for name, p in prompts_seen if name == "build"]
check("build prompt is the findings, framed against the existing plan",
      build_prompts and "finding A: the trailer names the wrong model" in build_prompts[0]
      and "existing plan" in build_prompts[0], str(build_prompts))
request_logs = [kw for name, kw in logs if name == "request"]
check("request record links the prior session (prior_adw_id logged)",
      request_logs and request_logs[0].get("prior_adw_id") == "ab12cd34", str(request_logs))
check("findings run still commits exactly once, attributed to the builder model",
      len(committed) == 1 and committed[0][1] == "zai/glm-5.3", str(committed))

# a prior id with no recorded plan refuses the run before anything spawns
try:
    sdlc.main(None, findings="x", from_adw_id="deadbeef")
    check("missing prior plan refuses the run", False, "SystemExit not raised")
except SystemExit as e:
    check("missing prior plan refuses the run", "no recorded plan" in str(e), str(e))

# --from-adw-id is a filesystem path component: anything but a runner-minted
# session id (8 hex chars) is refused BEFORE any file read. A plan envelope is
# planted OUTSIDE the sessions dir so a traversal that slipped through would
# actually be read — the refusal check fails loudly on vulnerable code.
outside = work / "outside" / "planner"
outside.mkdir(parents=True)
(outside / "envelope.json").write_text(json.dumps({
    "status": "success", "summary": "planted outside the sessions dir",
    "artifacts": ["x"], "commit_message": ""}))
for evil in ("../../outside", "/etc", "ab12cd34/../../../outside", "AB12CD34"):
    try:
        rc = sdlc.main(None, findings="x", from_adw_id=evil)
        check(f"traversal --from-adw-id refused before any read: {evil!r}",
              False, f"run proceeded, rc={rc}")
    except SystemExit as e:
        check(f"traversal --from-adw-id refused before any read: {evil!r}",
              "not a session id" in str(e), str(e))

# round caps unchanged: a red findings run still exhausts at 3 fix rounds, no commit
QUALITY_GREEN = False
stub_quality.run_tests = lambda run: types.SimpleNamespace(
    passed=False, checks=[], failures=["test: red"], artifacts=[])
phases.clear(); committed.clear()
rc = sdlc.main(None, findings="finding B", from_adw_id="ab12cd34")
check("red findings run: same 3-round cap, exits unaccepted with zero commits",
      rc == 1 and len([p for p in phases if p.startswith("fix_")]) == 3 and committed == [],
      str(phases) + str(committed))

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
