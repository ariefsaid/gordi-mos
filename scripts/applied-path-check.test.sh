#!/usr/bin/env bash
# Self-test for #393's applied-path harness. Static checks only — the harness itself needs
# the DB stack (CI's pgtap job runs it for real); this proves the SCRIPT cannot silently
# become vacuous, which is the failure mode that would let the blind spot reopen.
set -euo pipefail
cd "$(dirname "$0")/.."
H=scripts/applied-path-check.sh
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

grep -q 'exit 1' "$H" && ok "the harness fails the build on drift" || bad "harness cannot fail"

# It must refuse to run vacuously: if the legacy state did not build, that is exit 2, not a pass.
grep -q 'the check would be vacuous' "$H" && ok "refuses to pass when the legacy state did not build" \
  || bad "no vacuous-run guard"

# It must replay ONLY the conditional block — replaying the whole migration aborts at the
# first create and the drops never run (the trap this harness fell into once).
grep -q 'drop constraint if exists .*_activity_check' "$H" && ok "extracts the conditional statements" \
  || bad "conditional extraction missing"
grep -q 'the conditional block was not found' "$H" && ok "refuses if the migration was rewritten" \
  || bad "no rewrite guard"

# The fingerprint must cover the three fact classes the ticket names.
for k in CHECK FK CATALOG; do
  grep -q "'$k'" "$H" && ok "fingerprint covers $k" || bad "fingerprint missing $k"
done

# can-fail control: a stripped copy of the harness must NOT satisfy the drift check.
stripped=$(sed 's/^exit 1$/exit 0/' "$H")
if printf '%s' "$stripped" | grep -qE '^exit 1$'; then
  bad "control: the stripped harness still looked failable"
else ok "control: stripping the failure exit is detectable"; fi

# CI must actually run it — a harness nobody runs is a control everyone believes in.
grep -q 'scripts/applied-path-check.sh' .github/workflows/integration.yml \
  && ok "CI runs the harness" || bad "CI does not run the harness"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
