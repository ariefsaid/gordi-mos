#!/usr/bin/env bash
# Self-test for the MOS factory roster config (#336) — FR-007's explicit-pin rule
# and the substrate ruling, machine-decidable only. Every agent pins model:
# explicitly from the allowed substrate set; banned substrates absent; contracts
# under agents/; protected_files cover the control surfaces but NOT general
# scripts/ (#357 — a blanket entry rolled back builder deliverables), proven
# against the runner's real permissions.enforce(); the two-places header names
# the sibling record. Proves itself able to fail by re-running the same checks
# against perturbed fixtures.
set -uo pipefail
cd "$(dirname "$0")/.."
CONFIG="adws/adw_sssf_config/sssf.config.yaml"
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

# check_config <file> [<git_helper.py>] — prints nothing, returns nonzero with
# reasons on stdout on violation.
check_config() {
  local cfg="$1" gh="${2:-adws/adw_modules/git_helper.py}" bad_out=""
  # 1. every roster slot pins model: explicitly (FR-007 — no defaults inheritance)
  local names models
  names=$(grep -c '^  - name: ' "$cfg")
  models=$(awk '/^  - name: /{n++; m=0} /^    model: /{m=1; k++} END{print k}' "$cfg")
  [ "$names" -eq "$models" ] || bad_out+="only $models of $names agents pin model: explicitly\n"
  # 2. allowed substrates only — a whitelist on every model: line, so any banned
  #    provider (openrouter, fireworks, upstream's google default, …) is caught here
  while read -r m; do
    case "$m" in
      zai/glm-5.3-flash|openai-codex/gpt-5.6-luna|bitdeer/deepseek-ai/DeepSeek-V4-Flash) ;;
      *) bad_out+="model not in the ruled substrate set: $m\n" ;;
    esac
  done < <(grep -E '^ *model: ' "$cfg" | awk '{print $2}')
  # 3. contract paths live under agents/
  while read -r c; do
    case "$c" in agents/*.md) ;; *) bad_out+="contract outside agents/: $c\n" ;; esac
  done < <(grep -E '^ *contract: ' "$cfg" | awk '{print $2}')
  # 4. protected_files cover the control surfaces (NFR-002, boundary per #357)
  local p
  for p in 'adws/**' 'agents/**' '.githooks/**' '.github/**' 'scripts/vendor-*' \
           'scripts/with-*-lock.sh' 'scripts/lib/**' scripts/pre-pr-verify.sh \
           scripts/factory-preflight.py \
           scripts/setup-hooks.sh 'scripts/audit-*.sh' 'scripts/*.test.sh' \
           'scripts/agent-git-shim/**' mos-app/package.json mos-app/vite.config.ts \
           mos-app/playwright.config.ts mos-app/tsconfig.json mos-app/eslint.config.js \
           mos-app/.stylelintrc.json; do
    grep -qF -- "- $p" "$cfg" || bad_out+="protected_files missing: $p\n"
  done
  # 4b. and NOT the whole of scripts/ — a blanket entry is the #357 regression:
  #     it rolls back builder deliverables that live in scripts/ by convention
  grep -Eq '^[[:space:]]*-[[:space:]]*scripts/(\*\*)?[[:space:]]*(#|$)' "$cfg" \
    && bad_out+="protected_files re-broadened to all of scripts/ (#357)\n"
  # 5. two-places rule names the sibling record
  grep -q 'docs/agents/pi-delegation.md' "$cfg" || bad_out+="header does not name docs/agents/pi-delegation.md\n"
  # 6. every roster model has an attribution row in git_helper (#343) — a commit
  #    must be able to name the model that built it, so a substrate ruling that
  #    adds a model here must add its trailer mapping there too
  while read -r m; do
    grep -qF "\"$m\":" "$gh" || bad_out+="model with no attribution trailer row in git_helper: $m\n"
  done < <(grep -E '^ *model: ' "$cfg" | awk '{print $2}' | sort -u)
  [ -z "$bad_out" ] || { printf '%b' "$bad_out"; return 1; }
}

if OUT=$(check_config "$CONFIG"); then
  ok "roster config passes all substrate/pin/protection checks"
else
  bad "roster config violates the ruled shape:"
  printf '%s\n' "$OUT" | sed 's/^/        /'
fi

# ── prove the checker can fail: perturbed fixtures must each go red ──────────
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

sed 's|model: zai/glm-5.3|model: openrouter/free-model|' "$CONFIG" > "$tmp/banned.yaml"
check_config "$tmp/banned.yaml" >/dev/null && bad "checker missed a banned substrate" \
  || ok "checker catches a banned substrate"

awk 'BEGIN{done=0} {if (!done && /^    model: /) {done=1; next} print}' "$CONFIG" > "$tmp/unpinned.yaml"
check_config "$tmp/unpinned.yaml" >/dev/null && bad "checker missed an unpinned agent" \
  || ok "checker catches an agent without an explicit model pin"

sed 's|- agents/\*\*|- dropped/**|' "$CONFIG" > "$tmp/unprot.yaml"
check_config "$tmp/unprot.yaml" >/dev/null && bad "checker missed dropped protected_files entry" \
  || ok "checker catches a dropped protected_files entry"

sed 's|contract: agents/|contract: elsewhere/|' "$CONFIG" > "$tmp/contract.yaml"
check_config "$tmp/contract.yaml" >/dev/null && bad "checker missed an out-of-tree contract path" \
  || ok "checker catches a contract path outside agents/"

grep -v '"zai/glm-5.3-flash":' adws/adw_modules/git_helper.py > "$tmp/gh-unmapped.py"
check_config "$CONFIG" "$tmp/gh-unmapped.py" >/dev/null \
  && bad "checker missed a roster model with no attribution trailer row (#343)" \
  || ok "checker catches a roster model with no attribution trailer row (#343)"

# ── pre-flight parser scope: only defaults.protected_files is authoritative ──
cat > "$tmp/scope-fixture.py" <<'PYEOF'
import importlib.util
import io
import sys
from contextlib import redirect_stderr
from pathlib import Path

spec = importlib.util.spec_from_file_location("factory_preflight", "scripts/factory-preflight.py")
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)
config = Path(sys.argv[1])
config.write_text("other:\n  protected_files: []\ndefaults:\n  protected_files:\n    - defaults-only/**\n# A column-0 comment is still inside the defaults block.\n    - defaults-second/**\n")
globs, _ = preflight.load_config(Path.cwd(), config)
assert globs == ["defaults-only/**", "defaults-second/**"], globs
real_globs, _ = preflight.load_config(
    Path.cwd(), Path("adws/adw_sssf_config/sssf.config.yaml"))
assert real_globs and "adws/**" in real_globs, real_globs
config.write_text("defaults:\n  protected_files: null\n")
err = io.StringIO()
with redirect_stderr(err):
    globs, _ = preflight.load_config(Path.cwd(), config)
assert "null/unreadable" in err.getvalue(), err.getvalue()
PYEOF
python3 "$tmp/scope-fixture.py" "$tmp/scope.yaml" >/dev/null 2>&1
[ "$?" -eq 0 ] && ok "pre-flight reads protected_files only from defaults and explains null fallback" \
  || bad "pre-flight incorrectly accepts an earlier protected_files key or mislabels null fallback"

# ── #357 permission boundary: the runner's REAL matcher + enforce() ──────────
# A scratch git repo seeds the control surfaces, a simulated unrestricted
# builder (writes: None) makes changes, and the real permissions.enforce()
# judges them against the actual config's protected_files. Coverage is
# GENERATED from the config: every protected pattern gets one concrete probe
# path derived from it (a pattern edit cannot silently lose its refusal
# proof), plus a spec-pinned FLOOR of control paths that must stay refused
# no matter how the list is rewritten. Allowed near-misses prove the other
# direction: general scripts/ and mos-app/ deliverables, and the lockfile.
cat > "$tmp/harness.py" <<'PYEOF'
import shutil, subprocess, sys, tempfile, types
from pathlib import Path
repo_root, config_path, scenario = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, repo_root)
import yaml
from adws.adw_modules import permissions as P

if len(sys.argv) > 4:
    # can-fail controls (#357): re-open one closed hole and expect the matching
    # attack scenario to go red — strip-no-renames re-enables the rename
    # collapse, strip-z re-enables C-quoted paths dodging the patterns,
    # force-text re-applies universal-newline translation (what text=True
    # subprocess reads did to \r in filenames), strip-ctl-cap disables the
    # control-byte breach-by-definition cap.
    mode = sys.argv[4]
    _orig_git = P._git
    if mode == "force-text":
        P._git = lambda args, cwd: _orig_git(args, cwd).replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    elif mode == "strip-ctl-cap":
        P._control_bytes = lambda path: False
    else:
        _strip = {"strip-no-renames": "--no-renames", "strip-z": "-z"}[mode]
        P._git = lambda args, cwd: _orig_git([a for a in args if a != _strip], cwd)

raw = yaml.safe_load(Path(config_path).read_text())
patterns = raw["defaults"]["protected_files"]
cfg = types.SimpleNamespace(defaults=types.SimpleNamespace(
    protected_files=patterns, data_dir=raw["defaults"]["data_dir"]))
builder = types.SimpleNamespace(name="builder", writes=None)
scratch = Path(tempfile.mkdtemp(prefix="sssf357-"))
def die(msg): print(f"harness: {msg}"); shutil.rmtree(scratch, ignore_errors=True); sys.exit(1)

def probe(pattern):
    """One concrete path the pattern protects — derived, then verified
    against the runner's own matcher so a derivation bug cannot go vacuous."""
    if pattern.endswith("/**"):  path = pattern[:-2] + "__probe357__"
    elif pattern.endswith("/"):  path = pattern + "__probe357__"
    else:                        path = pattern.replace("**", "probe357/deep") \
                                               .replace("*", "probe357").replace("?", "x")
    if not P._matches(path, pattern):
        die(f"probe derivation failed: {path!r} does not match {pattern!r}")
    return path

# Spec-pinned floor: real control paths that must be refused regardless of how
# protected_files is rewritten — dropping any pattern that covers one goes red.
FLOOR = ["scripts/pre-pr-verify.sh", "adws/adw_modules/quality.py",
         ".github/workflows/guards.yml", "scripts/agent-git-shim.test.sh",
         "mos-app/package.json", "mos-app/tsconfig.app.json",
         "mos-app/tsconfig.e2e.json", "mos-app/tsconfig.node.json"]
PROTECTED = sorted(set(p for pat in patterns for p in [probe(pat)]) | set(FLOOR))
ALLOWED = sorted(["scripts/some-new-loader.py", "mos-app/src/probe357.tsx",
                  "mos-app/package-lock.json"])

try:
    def git(*a): subprocess.run(["git", *a], cwd=scratch, check=True, capture_output=True)
    SEED = "seed content\n"
    for p in PROTECTED:
        f = scratch / p; f.parent.mkdir(parents=True, exist_ok=True); f.write_text(SEED)
    QTRACKED = "scripts/audit-tr\tacked357.sh"          # tab in a tracked name
    QNEW = ["scripts/audit-ta\tb357.sh", 'scripts/audit-qu"ote357.sh',
            "scripts/audit-c\rr357.sh"]                 # \r would be newline-translated by text-mode reads
    QCAP = "mos-app/src/we\rird357.tsx"                 # \r OUTSIDE every pattern — only the control-byte cap refuses it
    if scenario == "quoted":
        f = scratch / QTRACKED; f.parent.mkdir(parents=True, exist_ok=True); f.write_text(SEED)
    git("init", "-q"); git("add", "-A")
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "seed")
    run = types.SimpleNamespace(repo_root=str(scratch), cfg=cfg)
    before = P.snapshot(run)
    if scenario.startswith("rename"):
        # The collapse attack (#357): a staged `git mv` of a protected file.
        # With rename detection on, numstat folds both halves into one
        # "dir/{old => new}" pseudo-path that matches no pattern. "rename"
        # moves the gate config aside to a WRITABLE name — the protected
        # source must be named + restored; the arrival is an ordinary allowed
        # write. "rename_protected" moves it to a name another pattern covers
        # — BOTH halves must be named and rolled back, tree left clean.
        src = "mos-app/vite.config.ts" if scenario == "rename" else "scripts/pre-pr-verify.sh"
        dst = "mos-app/vite.config.old357.ts" if scenario == "rename" else "scripts/audit-evil357.sh"
        git("mv", src, dst)
        try:
            P.enforce(run, None, builder, before)
            die(f"rename of {src} raised no breach — the collapse attack succeeded")
        except P.PermissionBreach as e:
            msg = str(e)
            if src not in msg: die(f"breach does not name the renamed-away {src}")
            if (scratch / src).read_text() != SEED: die(f"{src} not restored from HEAD")
            if scenario == "rename_protected":
                if dst not in msg: die(f"breach does not name the protected arrival {dst}")
                if (scratch / dst).exists(): die(f"protected arrival {dst} not removed")
                status = subprocess.run(["git", "status", "--porcelain"], cwd=scratch,
                                        capture_output=True, text=True).stdout
                if status.strip(): die(f"tree not clean after rollback:\n{status}")
        shutil.rmtree(scratch, ignore_errors=True); sys.exit(0)
    if scenario == "quoted":
        # The C-quoting hole (#357): without -z, git quotes any path holding a
        # tab/quote/backslash, so the fingerprint key arrives as
        # '"scripts/audit-e\\tvil.sh"' — quotes included — and matches no
        # protected pattern. All three files here sit under scripts/audit-*.sh:
        # a tracked tab-name tampered, and two created (tab, double quote).
        (scratch / QTRACKED).write_text("builder tampered\n")
        f = scratch / QCAP; f.parent.mkdir(parents=True, exist_ok=True)
        for p in [*QNEW, QCAP]: (scratch / p).write_text("evil\n")
        try:
            P.enforce(run, None, builder, before)
            die("no breach — C-quoted paths slipped past the protected patterns")
        except P.PermissionBreach as e:
            msg = str(e)
            for p in [QTRACKED, *QNEW, QCAP]:
                if p not in msg: die(f"breach does not name {p!r} verbatim")
            if (scratch / QTRACKED).read_text() != SEED: die(f"{QTRACKED!r} not restored")
            for p in [*QNEW, QCAP]:
                if (scratch / p).exists(): die(f"created {p!r} not deleted")
            status = subprocess.run(["git", "status", "--porcelain"], cwd=scratch,
                                    capture_output=True, text=True).stdout
            if status.strip(): die(f"tree not clean after rollback:\n{status}")
        shutil.rmtree(scratch, ignore_errors=True); sys.exit(0)
    for p in ALLOWED:
        f = scratch / p; f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text("builder deliverable\n")
    if scenario == "breach":
        for p in PROTECTED: (scratch / p).write_text("builder tampered\n")
    if scenario == "allowed":
        try:
            touched = P.enforce(run, None, builder, before)
        except P.PermissionBreach as e:
            die(f"builder deliverable REFUSED: {e}")
        if touched != ALLOWED: die(f"unexpected touched set: {touched}")
        for p in ALLOWED:
            if not (scratch / p).exists(): die(f"allowed file rolled back: {p}")
    else:
        try:
            P.enforce(run, None, builder, before)
            die("no breach raised — protected paths were writable")
        except P.PermissionBreach as e:
            msg = str(e)
            for p in PROTECTED:
                if p not in msg: die(f"breach does not name {p}")
                if (scratch / p).read_text() != SEED: die(f"{p} not rolled back")
            for p in ALLOWED:
                if p in msg: die(f"allowed deliverable wrongly named as breach: {p}")
                if not (scratch / p).exists(): die(f"allowed deliverable rolled back: {p}")
finally:
    shutil.rmtree(scratch, ignore_errors=True)
PYEOF

# The harness drives the REAL permissions.py, whose import chain reaches
# pydantic (via data_types.py), and the harness itself needs yaml. CI's guard
# runner provisions no python deps, so resolve them here — NEVER skip the
# harness: a skipped control is exactly the failure mode this test exists to
# kill. Plain python3 when it already has the deps (dev machines), else uv
# with inline deps, else a scratch venv via pip. A provisioning failure falls
# through to the harness checks going red, never to a silent pass.
if python3 -c 'import pydantic, yaml' 2>/dev/null; then
  PY() { python3 "$@"; }
elif command -v uv >/dev/null 2>&1; then
  PY() { uv run --no-project --quiet --with pydantic --with pyyaml python "$@"; }
else
  python3 -m venv "$tmp/venv" && "$tmp/venv/bin/pip" install --quiet pydantic pyyaml \
    || bad "could not provision harness deps (no uv; venv/pip failed) (#357)"
  PY() { "$tmp/venv/bin/python" "$@"; }
fi

PY "$tmp/harness.py" "$PWD" "$CONFIG" allowed >/dev/null \
  && ok "builder deliverables in general scripts//mos-app/ + lockfile allowed by enforce() (#357)" \
  || bad "a builder deliverable outside the control surfaces was refused (#357)"
PY "$tmp/harness.py" "$PWD" "$CONFIG" breach >/dev/null \
  && ok "every protected pattern's probe + floor control paths rolled back + refused (#357)" \
  || bad "a protected pattern or floor control path was NOT refused/rolled back (#357)"
PY "$tmp/harness.py" "$PWD" "$CONFIG" rename >/dev/null \
  && ok "rename-aside of a protected file refused + restored (collapse attack closed) (#357)" \
  || bad "rename-aside collapse attack not caught (#357)"
PY "$tmp/harness.py" "$PWD" "$CONFIG" rename_protected >/dev/null \
  && ok "protected-to-protected rename: both halves named + rolled back, tree clean (#357)" \
  || bad "protected-to-protected rename not fully caught/rolled back (#357)"
PY "$tmp/harness.py" "$PWD" "$CONFIG" quoted >/dev/null \
  && ok "tab/quote-named files under a protected pattern named verbatim + rolled back (#357)" \
  || bad "a C-quoted path slipped past enforcement (#357)"

# prove the boundary checks can fail, both directions
awk '{print} /^  protected_files:/{print "    - scripts/**"}' "$CONFIG" > "$tmp/broad.yaml"
check_config "$tmp/broad.yaml" >/dev/null && bad "checker missed a re-broadened scripts/ entry (#357)" \
  || ok "checker catches a re-broadened scripts/ entry (#357)"
PY "$tmp/harness.py" "$PWD" "$tmp/broad.yaml" allowed >/dev/null \
  && bad "harness missed the broad-scripts/ rollback (the #349 failure) (#357)" \
  || ok "harness goes red on the old broad-scripts/ behavior (#349 failure) (#357)"
grep -v 'scripts/pre-pr-verify.sh' "$CONFIG" > "$tmp/unguarded.yaml"
PY "$tmp/harness.py" "$PWD" "$tmp/unguarded.yaml" breach >/dev/null \
  && bad "harness missed a control script losing protection (#357)" \
  || ok "harness goes red when a control script loses protection (#357)"
grep -v -- '- mos-app/package.json' "$CONFIG" > "$tmp/nogatecmd.yaml"
PY "$tmp/harness.py" "$PWD" "$tmp/nogatecmd.yaml" breach >/dev/null \
  && bad "harness missed the gate-command definition losing protection (#357)" \
  || ok "harness goes red when the gate-command definition loses protection (#357)"
PY "$tmp/harness.py" "$PWD" "$CONFIG" rename strip-no-renames >/dev/null \
  && bad "harness missed the rename collapse with --no-renames stripped (#357)" \
  || ok "harness goes red without --no-renames (collapse attack works again) (#357)"
PY "$tmp/harness.py" "$PWD" "$CONFIG" quoted strip-z >/dev/null \
  && bad "harness missed the C-quoting hole with -z stripped (#357)" \
  || ok "harness goes red without -z (C-quoted paths dodge the patterns again) (#357)"
PY "$tmp/harness.py" "$PWD" "$CONFIG" quoted force-text >/dev/null \
  && bad "harness missed the CR newline-translation hole with text-mode forced (#357)" \
  || ok "harness goes red with text-mode translation forced (CR paths dodge again) (#357)"
PY "$tmp/harness.py" "$PWD" "$CONFIG" quoted strip-ctl-cap >/dev/null \
  && bad "harness missed the control-byte cap being stripped (#357)" \
  || ok "harness goes red without the control-byte cap (non-pattern CR path permitted) (#357)"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
