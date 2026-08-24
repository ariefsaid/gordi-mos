#!/usr/bin/env bash
# Self-test for the timed-out quality check (#389).
# A check that blew its budget used to kill the runner with
# `TypeError: can't concat str to bytes` — `TimeoutExpired` carries the raw
# bytes read before the kill while the other stream carries None, and the two
# were concatenated into output_tail. The reported cause was a broken runner;
# the real one was a 300s budget, and the partial output that would have said
# which never reached the builder.
# Runs the REAL adw_modules/quality.py `_run` against real subprocesses
# (python3 stdlib only — the factory's deps are uv-managed at run time, never
# CI's concern).
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

OUT="$(python3 - "$ROOT" <<'PY'
import importlib, json, shutil, sys, tempfile, types
from pathlib import Path

root = Path(sys.argv[1])
failures = []
def check(name, cond, detail=""):
    print(("ok " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)

# ── harness: import the REAL quality.py with stub siblings ───────────────────
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

notes = []
class Run:
    adw_id = "t"
    repo_root = work
    context_handoff_dir = work / "handoff"
    phases = [types.SimpleNamespace(seq=1, phase_id="p1")]
    console = types.SimpleNamespace(note=notes.append)
    tracer = types.SimpleNamespace(event=lambda record: None)

def spec(name, script, seconds):
    return quality.QualityCheckSpec(
        name=name, area="frontend", operation="test",
        argv=["bash", "-c", script], timeout_seconds=seconds)

def run(module, name, script, seconds):
    """(result, exception) — the runner must never be the thing that raises."""
    notes.clear()
    try:
        return module._run(spec(name, script, seconds), Run()), None
    except Exception as error:
        return None, error

def encodable(text):
    """Serializable at all — a lone surrogate is not, which is how #389 would
    have travelled one file downstream instead of being fixed."""
    try:
        text.encode("utf-8")
        return True
    except UnicodeEncodeError:
        return False

# ── the ticket: a check that sleeps past its budget ──────────────────────────
# stdout AND stderr are both written before the kill, so both halves of the
# concatenation are exercised — the observed crash only had one of them.
SLEEPER = 'echo partial-stdout; echo partial-stderr >&2; sleep 30'
result, error = run(quality, "typecheck", SLEEPER, 1)
check("a timed-out check does not raise", error is None, repr(error))
if result is not None:
    check("timed-out check reports failed",
          result.passed is False and result.returncode == 124,
          repr((result.passed, result.returncode)))
    check("the reason names the budget it exceeded",
          "exceeded its 1s budget" in result.output_tail, repr(result.output_tail))
    check("the reason names the check that blew it",
          "typecheck exceeded" in result.output_tail, repr(result.output_tail))
    check("partial stdout survives into output_tail",
          result.output_tail.startswith("partial-stdout"), repr(result.output_tail))
    check("partial stderr survives into output_tail",
          "partial-stderr" in result.output_tail, repr(result.output_tail))
    artifact = Path(result.output_artifact).read_text()
    check("the full log artifact carries the partial output too, decoded",
          "partial-stdout" in artifact and "partial-stderr" in artifact
          and "b'" not in artifact, repr(artifact))
    check("the console line says timeout, not just exit 124",
          any("timed out at its 1s budget" in note for note in notes), repr(notes))

# Non-UTF-8 bytes: a kill can cut a multi-byte sequence in half, and a strict
# decode would swap the TypeError for a UnicodeDecodeError — same defect, new
# spelling. The byte has to survive into the log AND the tail has to stay
# serializable, or the crash just moves to whoever encodes the envelope next.
result, error = run(quality, "lint", r'printf "caf\xe9-partial"; sleep 30', 1)
check("a half-written multi-byte sequence does not raise either",
      error is None, repr(error))
if result is not None:
    check("the undecodable byte survives byte-exactly in the log artifact",
          b"caf\xe9-partial" in Path(result.output_artifact).read_bytes(),
          repr(Path(result.output_artifact).read_bytes()))
    # What model_dump_json does to the envelope this tail rides in.
    check("the tail an agent receives is still UTF-8 encodable",
          encodable(result.output_tail), repr(result.output_tail))
    check("the undecodable byte is replaced in the travelling copy",
          "caf�-partial" in result.output_tail, repr(result.output_tail))

# ── opposite direction: a normally-failing check is untouched ────────────────
result, error = run(quality, "test", 'echo out; echo err >&2; exit 1', 30)
check("a normal failure still raises nothing", error is None, repr(error))
if result is not None:
    check("a normal failure keeps its own exit code",
          result.passed is False and result.returncode == 1,
          repr((result.passed, result.returncode)))
    check("a normal failure's tail is its output VERBATIM, no timeout wording",
          result.output_tail == "out\nerr\n", repr(result.output_tail))
    check("a normal failure's console line is unchanged",
          any(note.startswith("quality test: failed ") and "exit 1," in note
              for note in notes), repr(notes))

result, error = run(quality, "build", 'echo fine', 30)
check("a passing check still passes",
      error is None and result.passed is True and result.output_tail == "fine\n",
      repr((error, result and result.output_tail)))

# ── review finding: a check that exits NORMALLY while emitting non-UTF-8 ─────
# text=True alone decodes the normal return with strict errors, so this raised
# UnicodeDecodeError INSIDE subprocess.run — caught by neither except clause,
# runner dead with no result. errors="surrogateescape" on the run call is the fix.
result, error = run(quality, "typecheck", 'printf "caf\\xe9-done"; exit 1', 30)
check("a normal exit with a non-UTF-8 byte returns a RESULT, not a dead runner",
      error is None and result is not None, repr(error))
if result is not None:
    check("its exit code and partial text survive the escape",
          result.returncode == 1 and "-done" in result.output_tail,
          repr((result.returncode, result.output_tail)))

# can-fail control for it: strip errors="surrogateescape" from the run call and
# the same command must kill the runner again (the check could have missed it).
src_esc = (root / "adws/adw_modules/quality.py").read_text()
stripped_esc = src_esc.replace('errors="surrogateescape",\n            timeout=spec.timeout_seconds', 'timeout=spec.timeout_seconds')
check("the escape control actually perturbs the run call", stripped_esc != src_esc)
(pkg / "quality_noescape.py").write_text(stripped_esc)
noescape_module = importlib.import_module("adw_modules.quality_noescape")
try:
    result, error = run(noescape_module, "typecheck", 'printf "caf\\xe9-done"; exit 1', 30)
    died = error is not None and "UnicodeDecodeError" in (type(error).__name__ + str(error))
except UnicodeDecodeError:
    died = True
check("control: without the escape, the normal-exit path dies again (the check can fail)", died)

# ── can-fail control: strip the normalisation, the reported defect returns ───
source = (root / "adws/adw_modules/quality.py").read_text()
stripped = source.replace("isinstance", "False and isinstance")
check("the can-fail control actually perturbs the normalisation", stripped != source)
(pkg / "quality_stripped.py").write_text(stripped)
stripped_module = importlib.import_module("adw_modules.quality_stripped")
result, error = run(stripped_module, "typecheck", SLEEPER, 1)
check("without the normalisation, a timeout kills the runner with a TypeError",
      isinstance(error, TypeError) and "concat" in str(error), repr(error))
check("without the normalisation, no result reaches the builder at all",
      result is None, repr(result))
# The control must be surgical: the normal path is unaffected by it, so the
# green above is the normalisation and not some other difference.
result, error = run(stripped_module, "test", 'echo out; echo err >&2; exit 1', 30)
check("the control leaves the normal-failure path identical",
      error is None and result.output_tail == "out\nerr\n",
      repr((error, result and result.output_tail)))

# The other two encode edges get their own controls, because normalising the
# decode alone left the runner dying in two more places on the same input —
# which is how this test earned its keep.
UNDECODABLE = r'printf "caf\xe9-partial"; sleep 30'
loose_write = source.replace('encoding="utf-8", errors="surrogateescape",', "")
check("the artifact-write control actually perturbs the write", loose_write != source)
(pkg / "quality_loose_write.py").write_text(loose_write)
result, error = run(importlib.import_module("adw_modules.quality_loose_write"),
                    "lint", UNDECODABLE, 1)
check("without the matching handler, writing the log kills the runner",
      isinstance(error, UnicodeEncodeError), repr(error))

raw_tail = source.replace("return text.encode", "return text  #")
check("the envelope control actually perturbs the tail", raw_tail != source)
(pkg / "quality_raw_tail.py").write_text(raw_tail)
result, error = run(importlib.import_module("adw_modules.quality_raw_tail"),
                    "lint", UNDECODABLE, 1)
check("without _envelope_safe, the tail an agent receives cannot be serialized",
      error is None and not encodable(result.output_tail),
      repr((error, result and result.output_tail)))

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
