#!/usr/bin/env bash
# Self-test for the provider-fault / model-fault distinction (#386).
# A 429 used to surface as "planner never produced valid PlanOutput JSON" — a
# claim about output the model never produced, pointing at the one fix (rewrite
# the brief, re-open the roster ruling) that could not possibly help.
# Runs the REAL adw_modules/agent_pi.py against a stub `pi` replaying the event
# sequence recorded in the run that produced the ticket, and the REAL
# adw_modules/agents.py parse path over the result (python3 stdlib only — the
# factory's deps are uv-managed at run time, never CI's concern).
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

OUT="$(python3 - "$ROOT" <<'PY'
import importlib, json, os, shutil, sys, tempfile, types
from pathlib import Path

root = Path(sys.argv[1])
failures = []
def check(name, cond, detail=""):
    print(("ok " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)

work = Path(tempfile.mkdtemp())

# ── the recorded 429 turn, copied verbatim from the run that produced #386 ────
# (adw_data/sessions/f674922c/planner/raw_output.jsonl — an errored turn carries
# empty content, a stopReason of "error", and the upstream status as errorMessage.)
UPSTREAM = '429: {"code":"1302","message":"Rate limit reached for requests"}'
ERRORED = {"role": "assistant", "content": [], "api": "openai-completions",
           "provider": "zai", "model": "glm-5.3",
           "usage": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0,
                     "totalTokens": 0, "cost": {"input": 0, "output": 0, "cacheRead": 0,
                                                "cacheWrite": 0, "total": 0}},
           "stopReason": "error", "timestamp": 1787201871994, "errorMessage": UPSTREAM}
CLEAN = {"role": "assistant",
         "content": [{"type": "text", "text": '{"status":"success"}'}],
         "api": "openai-completions", "provider": "zai", "model": "glm-5.3",
         "usage": {"input": 10, "output": 5, "cacheRead": 0, "cacheWrite": 0,
                   "totalTokens": 15, "cost": {"total": 0.1}},
         "stopReason": "stop", "timestamp": 1787201871995}

def stream(*messages):
    """The lines pi writes for one run: a turn per attempt, then the settle."""
    lines = [{"type": "agent_start"}]
    for message in messages:
        lines += [{"type": "turn_start"},
                  {"type": "message_start", "message": message},
                  {"type": "message_end", "message": message},
                  {"type": "turn_end", "message": message, "toolResults": []}]
    settled = messages[-1].get("stopReason") != "error"
    lines += [{"type": "agent_end", "messages": list(messages), "willRetry": False},
              {"type": "auto_retry_end", "success": settled, "attempt": len(messages),
               **({} if settled else {"finalError": UPSTREAM})},
              {"type": "agent_settled"}]
    return "\n".join(json.dumps(line) for line in lines) + "\n"

# ── harness: the REAL agent_pi.py and agents.py, with stub siblings ──────────
# Both real modules sit in ONE stub package: they are the two halves of the same
# journey — the run that came back empty, and the parse that had to explain why.
pkg = work / "adw_modules"
pkg.mkdir()
(pkg / "__init__.py").write_text("")
for sibling in ("permissions", "prompts"):
    (pkg / f"{sibling}.py").write_text("")
(pkg / "utils.py").write_text(
    "import datetime, os\n"
    "def now_iso():\n    return datetime.datetime.now().isoformat()\n"
    "def operator_env():\n    return dict(os.environ)\n"
    "def new_id(n=8):\n    return chr(120) * n\n")
# Stub data_types: attribute bags with the same field names and defaults, so the
# modules under test are the only real code in the picture.
(pkg / "data_types.py").write_text("""
class _Base:
    _defaults = {}
    def __init__(self, **kw):
        self.__dict__.update(self._defaults)
        self.__dict__.update(kw)
    def model_dump(self): return dict(self.__dict__)
    def model_dump_json(self, **kw): return "{}"
class AgentCall(_Base): pass
class AgentConfig(_Base): pass
class EnvelopeBase(_Base): pass
class EventRecord(_Base): pass
class GateCheck(_Base): pass
class GateReport(_Base): pass
class Phase(_Base): pass
class PiRequest(_Base): pass
class SSSFConfig(_Base): pass
class UsageBreakdown(_Base):
    _defaults = {"total_tokens": 0, "total_cost": 0.0}
    def add_turn(self, usage, total_tokens): pass
    def merge(self, other): pass
class PiResult(_Base):
    _defaults = {"text": "", "returncode": 0, "session_id": "", "tokens": 0,
                 "cost": 0.0, "context_tokens": 0, "context_window": 0,
                 "provider_error": ""}
    def __init__(self, **kw):
        super().__init__(**kw)
        self.usage = UsageBreakdown()
""")
shutil.copy(root / "adws/adw_modules/agent_pi.py", pkg / "agent_pi.py")
shutil.copy(root / "adws/adw_modules/agents.py", pkg / "agents.py")
sys.modules["yaml"] = types.SimpleNamespace(safe_load=lambda *a, **k: {})

# A stub `pi` that answers --list-models (so resolve_model resolves) and
# otherwise replays whatever event stream the test planted for it.
stub = work / "pi"
stub.write_text("""#!/usr/bin/env python3
import os, sys
if "--list-models" in sys.argv:
    print("PROVIDER MODEL CONTEXT")
    print("zai glm-5.3 200K")
    sys.exit(0)
sys.stdout.write(open(os.environ["STUB_PI_STREAM"]).read())
""")
stub.chmod(0o755)
os.environ["PI_PATH"] = str(stub)
os.environ["PI_MODELS_PATH"] = str(work / "models.json")
(work / "models.json").write_text(json.dumps(
    {"providers": {"zai": {"models": [{"id": "glm-5.3", "contextWindow": 200000}]}}}))

sys.path.insert(0, str(work))
agent_pi = importlib.import_module("adw_modules.agent_pi")

def pi_run(text):
    (work / "stream.jsonl").write_text(text)
    os.environ["STUB_PI_STREAM"] = str(work / "stream.jsonl")
    request = agent_pi.PiRequest(
        prompt="p", system_prompt="s", model="zai/glm-5.3", thinking="medium",
        session_id="sssf-test", session_dir=str(work / "sessions"),
        raw_output_path=str(work / "raw_output.jsonl"), tools=None,
        extensions=[], cwd=str(work))
    return agent_pi.run(request)

# Three errored attempts and nothing else — the auto-retries pi runs, exhausted.
result = pi_run(stream(ERRORED, ERRORED, ERRORED))
check("all-error run: the upstream status rides the result",
      result.provider_error == UPSTREAM, repr(result.provider_error))
check("all-error run: no content came back", result.text == "", repr(result.text))
# Control: the same code path on a clean turn must leave the field empty, or
# every run would look like a transport fault.
result_ok = pi_run(stream(CLEAN))
check("clean run: no provider error recorded",
      result_ok.provider_error == "" and result_ok.text == '{"status":"success"}',
      repr((result_ok.provider_error, result_ok.text)))
# Control: an errored attempt FOLLOWED by a good one is a recovered run.
result_recovered = pi_run(stream(ERRORED, CLEAN))
check("recovered run: a later clean turn clears the error",
      result_recovered.provider_error == "" and result_recovered.text,
      repr(result_recovered.provider_error))

# ── the REAL agents.py parse path over those results ─────────────────────────
agents = importlib.import_module("adw_modules.agents")

class PlanOutput:
    """Stands in for the declared output type — the real one is pydantic."""
    model_fields = {"status": None, "summary": None}
    @staticmethod
    def model_validate(payload):
        if "summary" not in payload:
            raise ValueError("summary is required")
        return PlanOutput()

class Run:
    cfg = types.SimpleNamespace(agents=[types.SimpleNamespace(name="planner",
                                                              model="zai/glm-5.3")])
    console = types.SimpleNamespace(retry=lambda *a, **k: None)
    tracer = types.SimpleNamespace(envelope_row=lambda *a, **k: None)
    session_dir = work

phase = types.SimpleNamespace(params=types.SimpleNamespace(owner="planner"))
call = types.SimpleNamespace(output_type=PlanOutput, gates=[])

def parse(result, module=None):
    """Returns (raised exception or None, correction sends the phase burned)."""
    sends = []
    def send(prompt):
        sends.append(prompt)
        return result                       # a refusing provider keeps refusing
    try:
        (module or agents)._parse_with_retries(Run(), phase, call, result, send)
        return None, len(sends)
    except Exception as error:
        return error, len(sends)

Result = agent_pi.PiResult

# THE ticket: an all-error, empty-content attempt sequence.
error, sends = parse(Result(text="", provider_error=UPSTREAM))
check("429 does not raise the parse-failure class",
      "never produced valid" not in str(error), str(error))
check("429 raises ProviderFailure", isinstance(error, agents.ProviderFailure), repr(error))
check("the raised error names the upstream status verbatim",
      UPSTREAM in str(error), str(error))
check("the raised error names the roster model that never ran",
      "zai/glm-5.3" in str(error), str(error))
check("no correction is sent into a refusing provider", sends == 0, str(sends))

# Opposite direction: a response that parses but fails the schema still raises
# the parse error, or the fix would just relabel every failure.
error, sends = parse(Result(text='{"status": "success"}'))
check("schema-invalid response still raises the parse failure",
      isinstance(error, RuntimeError) and not isinstance(error, agents.ProviderFailure)
      and "never produced valid PlanOutput JSON" in str(error), repr(error))
check("schema-invalid response still spends its correction attempts",
      sends == agents.JSON_FIX_ATTEMPTS, str(sends))

# Emptiness ALONE, with no provider error, is a model fault and stays one.
error, _ = parse(Result(text="", provider_error=""))
check("empty response with no provider error is still a parse failure",
      not isinstance(error, agents.ProviderFailure)
      and "never produced valid PlanOutput JSON" in str(error), repr(error))

# The guard sits in front of the happy path, not across it.
error, _ = parse(Result(text='{"status": "success", "summary": "did it"}'))
check("a valid envelope still parses", error is None, repr(error))

# ── can-fail control: strip the guard, the reported defect returns ───────────
source = (root / "adws/adw_modules/agents.py").read_text()
stripped = source.replace("if result.provider_error and not result.text:", "if False:")
check("the can-fail control actually perturbs the guard", stripped != source)
(pkg / "agents_stripped.py").write_text(stripped)
agents_stripped = importlib.import_module("adw_modules.agents_stripped")
error, _ = parse(Result(text="", provider_error=UPSTREAM), agents_stripped)
check("without the guard, a 429 is reported as invalid model output again",
      "never produced valid PlanOutput JSON" in str(error), str(error))

print("FAILURES=" + str(len(failures)))
PY
)"
printf '%s\n' "$OUT" | sed -n 's/^ok /  ok    /p;s/^FAIL /  FAIL  /p'
pass=$((pass + $(printf '%s\n' "$OUT" | grep -c '^ok ')))
fail=$((fail + $(printf '%s\n' "$OUT" | grep -c '^FAIL ')))
printf '%s\n' "$OUT" | grep -q '^FAILURES=' \
  || { bad "python block did not complete"; printf '%s\n' "$OUT" | tail -20; }

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
