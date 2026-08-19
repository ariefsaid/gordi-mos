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
      zai/glm-5.3|zai/glm-4.7|openai-codex/gpt-5.6-terra|openai-codex/gpt-5.6-luna) ;;
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

grep -v '"zai/glm-5.3":' adws/adw_modules/git_helper.py > "$tmp/gh-unmapped.py"
check_config "$CONFIG" "$tmp/gh-unmapped.py" >/dev/null \
  && bad "checker missed a roster model with no attribution trailer row (#343)" \
  || ok "checker catches a roster model with no attribution trailer row (#343)"

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
         "mos-app/package.json"]
PROTECTED = sorted(set(p for pat in patterns for p in [probe(pat)]) | set(FLOOR))
ALLOWED = sorted(["scripts/some-new-loader.py", "mos-app/src/probe357.tsx",
                  "mos-app/package-lock.json"])

try:
    def git(*a): subprocess.run(["git", *a], cwd=scratch, check=True, capture_output=True)
    SEED = "seed content\n"
    for p in PROTECTED:
        f = scratch / p; f.parent.mkdir(parents=True, exist_ok=True); f.write_text(SEED)
    git("init", "-q"); git("add", "-A")
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "seed")
    run = types.SimpleNamespace(repo_root=str(scratch), cfg=cfg)
    before = P.snapshot(run)
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

python3 "$tmp/harness.py" "$PWD" "$CONFIG" allowed >/dev/null \
  && ok "builder deliverables in general scripts//mos-app/ + lockfile allowed by enforce() (#357)" \
  || bad "a builder deliverable outside the control surfaces was refused (#357)"
python3 "$tmp/harness.py" "$PWD" "$CONFIG" breach >/dev/null \
  && ok "every protected pattern's probe + floor control paths rolled back + refused (#357)" \
  || bad "a protected pattern or floor control path was NOT refused/rolled back (#357)"

# prove the boundary checks can fail, both directions
awk '{print} /^  protected_files:/{print "    - scripts/**"}' "$CONFIG" > "$tmp/broad.yaml"
check_config "$tmp/broad.yaml" >/dev/null && bad "checker missed a re-broadened scripts/ entry (#357)" \
  || ok "checker catches a re-broadened scripts/ entry (#357)"
python3 "$tmp/harness.py" "$PWD" "$tmp/broad.yaml" allowed >/dev/null \
  && bad "harness missed the broad-scripts/ rollback (the #349 failure) (#357)" \
  || ok "harness goes red on the old broad-scripts/ behavior (#349 failure) (#357)"
grep -v 'scripts/pre-pr-verify.sh' "$CONFIG" > "$tmp/unguarded.yaml"
python3 "$tmp/harness.py" "$PWD" "$tmp/unguarded.yaml" breach >/dev/null \
  && bad "harness missed a control script losing protection (#357)" \
  || ok "harness goes red when a control script loses protection (#357)"
grep -v -- '- mos-app/package.json' "$CONFIG" > "$tmp/nogatecmd.yaml"
python3 "$tmp/harness.py" "$PWD" "$tmp/nogatecmd.yaml" breach >/dev/null \
  && bad "harness missed the gate-command definition losing protection (#357)" \
  || ok "harness goes red when the gate-command definition loses protection (#357)"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
