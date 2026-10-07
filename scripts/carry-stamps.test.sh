#!/usr/bin/env bash
# Self-test for scripts/carry-stamps.sh — pure rebases carry all four stamps; ANY content
# change refuses; unbound stamps refuse.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/carry-stamps.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
G() { git -C "$tmp/r" -c user.email=t@t -c user.name=t "$@"; }
# Every carry judges against origin/dev (pinned); mirror the test repo's dev there first.
carry() { git -C "$1" update-ref refs/remotes/origin/dev dev; (cd "$1" && bash "$SCRIPT" "$2" origin/dev); }
t() { if [ "$2" -eq 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
     else fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; fi; }

git init -q -b dev "$tmp/r"
echo base > "$tmp/r/a"; G add a; G commit -qm base
G checkout -qb feat
echo one > "$tmp/r/b"; G add b; G commit -qm "one"
echo two > "$tmp/r/c"; G add c; G commit -qm "two"
OLD="$(G rev-parse HEAD)"
gd="$(G rev-parse --absolute-git-dir)"
printf '%s' "$OLD" > "$gd/pre-pr-verify-ok"
for l in spec code-quality security; do printf '%s %s rev now art\n' "$OLD" "$l" > "$gd/independent-review-$l-ok"; done

# dev moves; pure rebase
G checkout -q dev; echo moved > "$tmp/r/d"; G add d; G commit -qm moved
G checkout -q feat; G rebase -q dev
NEW="$(G rev-parse HEAD)"
carry "$tmp/r" "$OLD" >/dev/null 2>&1; t "pure rebase carries" $?
[ "$(cat "$gd/pre-pr-verify-ok")" = "$NEW" ]; t "verify stamp moved to new head" $?
[ "$(awk '{print $1}' "$gd/independent-review-security-ok")" = "$NEW" ]; t "lens stamp moved" $?

# content change during 'rebase' → refuse
OLD2="$NEW"
G commit -q --amend -m "one (edited)" --allow-empty 2>/dev/null || true
echo tampered >> "$tmp/r/b"; G add b; G commit -qm "tamper"
G rebase -q dev 2>/dev/null || true
if carry "$tmp/r" "$OLD" >/dev/null 2>&1; then
  fail=$((fail+1)); printf '  FAIL  changed content must refuse\n'
else pass=$((pass+1)); printf '  ok    changed content refuses\n'; fi

rm -f "$gd/pre-pr-verify-ok" "$gd"/independent-review-*-ok
if carry "$tmp/r" "$OLD2" >/dev/null 2>&1; then
  fail=$((fail+1)); printf '  FAIL  no bound stamps must refuse\n'
else pass=$((pass+1)); printf '  ok    no bound stamps refuses\n'; fi

# Adversarial subjects: " = " in a commit MESSAGE must never satisfy the marker field.
git init -q -b dev "$tmp/r2"
G2() { git -C "$tmp/r2" -c user.email=t@t -c user.name=t "$@"; }
echo base > "$tmp/r2/a"; G2 add a; G2 commit -qm base
G2 checkout -qb feat
echo one > "$tmp/r2/b"; G2 add b; G2 commit -qm "add config = value parsing"
OLD3="$(G2 rev-parse HEAD)"
gd2="$(G2 rev-parse --absolute-git-dir)"
printf '%s' "$OLD3" > "$gd2/pre-pr-verify-ok"
for l in spec code-quality security; do printf '%s %s rev now art\n' "$OLD3" "$l" > "$gd2/independent-review-$l-ok"; done
G2 checkout -q dev; echo moved > "$tmp/r2/d"; G2 add d; G2 commit -qm moved
G2 checkout -q feat; G2 rebase -q dev
echo sneaky > "$tmp/r2/e"; G2 add e; G2 commit -qm "wire mapping: key = val lookup"
if carry "$tmp/r2" "$OLD3" >/dev/null 2>&1; then
  fail=$((fail+1)); printf '  FAIL  new commit with \" = \" subject must refuse\n'
else pass=$((pass+1)); printf '  ok    new commit with \" = \" subject refuses (field-anchored)\n'; fi
G2 reset -q --hard HEAD~1
echo tampered >> "$tmp/r2/b"; G2 add b; G2 commit -q --amend -m "add config = value parsing (edited)"
if carry "$tmp/r2" "$OLD3" >/dev/null 2>&1; then
  fail=$((fail+1)); printf '  FAIL  amended commit with \" = \" subject must refuse\n'
else pass=$((pass+1)); printf '  ok    amended commit with \" = \" subject refuses\n'; fi

# A rename-only migration renumber on top of the stamped tip carries; anything else in it refuses.
git init -q -b dev "$tmp/r3"
G3() { git -C "$tmp/r3" -c user.email=t@t -c user.name=t "$@"; }
mkdir -p "$tmp/r3/supabase/migrations"; echo base > "$tmp/r3/a"; G3 add a; G3 commit -qm base
G3 checkout -qb feat
echo 'select 1;' > "$tmp/r3/supabase/migrations/20261007009600_x.sql"; G3 add -A; G3 commit -qm "add migration"
OLD4="$(G3 rev-parse HEAD)"; gd3="$(G3 rev-parse --absolute-git-dir)"
stamp3() { printf '%s' "$1" > "$gd3/pre-pr-verify-ok"; for l in spec code-quality security; do printf '%s %s rev now art\n' "$1" "$l" > "$gd3/independent-review-$l-ok"; done; }
stamp3 "$OLD4"
G3 mv supabase/migrations/20261007009600_x.sql supabase/migrations/20261007009800_x.sql; G3 commit -qm "renumber migration"
carry "$tmp/r3" "$OLD4" >/dev/null 2>&1; t "rename-only migration renumber carries" $?
[ "$(cat "$gd3/pre-pr-verify-ok")" = "$(G3 rev-parse HEAD)" ]; t "renumber: stamp moved to new head" $?
OLD5="$(G3 rev-parse HEAD)"; stamp3 "$OLD5"
G3 mv supabase/migrations/20261007009800_x.sql supabase/migrations/20261007009900_y.sql; G3 commit -qm "rename slug too"
if carry "$tmp/r3" "$OLD5" >/dev/null 2>&1; then fail=$((fail+1)); printf '  FAIL  a rename that changes more than the version must refuse\n'
else pass=$((pass+1)); printf '  ok    a rename that changes more than the version refuses\n'; fi
G3 reset -q --hard "$OLD5"; stamp3 "$OLD5"
G3 mv supabase/migrations/20261007009800_x.sql supabase/migrations/20261007009900_x.sql; echo 'select 2;' > "$tmp/r3/supabase/migrations/20261007009900_x.sql"; G3 add -A; G3 commit -qm "renumber + edit"
if carry "$tmp/r3" "$OLD5" >/dev/null 2>&1; then fail=$((fail+1)); printf '  FAIL  a renumber that edits content must refuse\n'
else pass=$((pass+1)); printf '  ok    a renumber that edits content refuses\n'; fi

# A renumber that swaps two migrations' order, or changes a file mode, refuses.
G3 reset -q --hard "$OLD5"; echo 'select 3;' > "$tmp/r3/supabase/migrations/20261007009850_z.sql"; G3 add -A; G3 commit -qm "second migration"
OLD6="$(G3 rev-parse HEAD)"; stamp3 "$OLD6"
G3 mv supabase/migrations/20261007009800_x.sql supabase/migrations/20261007009990_x.sql
G3 mv supabase/migrations/20261007009850_z.sql supabase/migrations/20261007009950_z.sql; G3 commit -qm "swap order"
if carry "$tmp/r3" "$OLD6" >/dev/null 2>&1; then fail=$((fail+1)); printf '  FAIL  a renumber that swaps order must refuse\n'
else pass=$((pass+1)); printf '  ok    a renumber that swaps order refuses\n'; fi
G3 reset -q --hard "$OLD6"; stamp3 "$OLD6"
G3 mv supabase/migrations/20261007009850_z.sql supabase/migrations/20261007009900_z.sql; chmod +x "$tmp/r3/supabase/migrations/20261007009900_z.sql"; G3 add -A; G3 commit -qm "renumber + chmod"
if carry "$tmp/r3" "$OLD6" >/dev/null 2>&1; then fail=$((fail+1)); printf '  FAIL  a renumber with a mode change must refuse\n'
else pass=$((pass+1)); printf '  ok    a renumber with a mode change refuses\n'; fi

# Two renumber commits that together swap the order refuse.
G3 reset -q --hard "$OLD6"; stamp3 "$OLD6"
G3 mv supabase/migrations/20261007009800_x.sql supabase/migrations/20261007009990_x.sql; G3 commit -qm "renumber x"
G3 mv supabase/migrations/20261007009850_z.sql supabase/migrations/20261007009950_z.sql; G3 commit -qm "renumber z"
if carry "$tmp/r3" "$OLD6" >/dev/null 2>&1; then fail=$((fail+1)); printf '  FAIL  a swap split across two renumber commits must refuse\n'
else pass=$((pass+1)); printf '  ok    a swap split across two renumber commits refuses\n'; fi

# Merging dev into the stamped tip (the house rule: merge, never rebase) carries when the merge
# is exactly git's own clean merge; a merge that also edits something refuses.
git init -q -b dev "$tmp/r4"
G4() { git -C "$tmp/r4" -c user.email=t@t -c user.name=t "$@"; }
echo base > "$tmp/r4/a"; G4 add a; G4 commit -qm base
G4 checkout -qb feat; echo f > "$tmp/r4/f"; G4 add f; G4 commit -qm feat
OLD7="$(G4 rev-parse HEAD)"; gd4="$(G4 rev-parse --absolute-git-dir)"
stamp4() { printf '%s' "$1" > "$gd4/pre-pr-verify-ok"; for l in spec code-quality security; do printf '%s %s rev now art\n' "$1" "$l" > "$gd4/independent-review-$l-ok"; done; }
stamp4 "$OLD7"
G4 checkout -q dev; echo d > "$tmp/r4/d"; G4 add d; G4 commit -qm "dev moves"; G4 checkout -q feat
G4 merge -q --no-edit dev
carry "$tmp/r4" "$OLD7" >/dev/null 2>&1; t "a clean merge of dev carries" $?
[ "$(cat "$gd4/pre-pr-verify-ok")" = "$(G4 rev-parse HEAD)" ]; t "merge: stamp moved to the merge commit" $?
G4 reset -q --hard "$OLD7"; stamp4 "$OLD7"
G4 merge -q --no-commit dev >/dev/null; echo sneaky >> "$tmp/r4/f"; G4 add f; G4 commit -qm "merge with an edit"
if carry "$tmp/r4" "$OLD7" >/dev/null 2>&1; then fail=$((fail+1)); printf '  FAIL  a merge that also edits must refuse\n'
else pass=$((pass+1)); printf '  ok    a merge that also edits refuses\n'; fi

# The base ref is pinned: any other ref refuses (the same clean merge carries against origin/dev).
G4 reset -q --hard "$OLD7"; stamp4 "$OLD7"; G4 merge -q --no-edit dev >/dev/null 2>&1
if (cd "$tmp/r4" && bash "$SCRIPT" "$OLD7" dev) >/dev/null 2>&1; then fail=$((fail+1)); printf '  FAIL  a free base ref must refuse\n'
else pass=$((pass+1)); printf '  ok    a base ref other than origin/dev or origin/main refuses\n'; fi
carry "$tmp/r4" "$OLD7" >/dev/null 2>&1; t "the same merge carries against origin/dev" $?
# Supabase applies migrations in filename order: a renumber to a longer version that sorts first refuses.
G3 reset -q --hard "$OLD6"; stamp3 "$OLD6"
G3 mv supabase/migrations/20261007009850_z.sql supabase/migrations/100000000000000_z.sql; G3 commit -qm "longer version"
if carry "$tmp/r3" "$OLD6" >/dev/null 2>&1; then fail=$((fail+1)); printf '  FAIL  a renumber that reorders by text must refuse\n'
else pass=$((pass+1)); printf '  ok    a renumber off the 14-digit format refuses\n'; fi
# Renaming a migration the base already has is never a renumber.
G3 reset -q --hard "$OLD6"; G3 checkout -q dev; mkdir -p "$tmp/r3/supabase/migrations"; echo 'select 0;' > "$tmp/r3/supabase/migrations/20261007000001_base.sql"; G3 add -A; G3 commit -qm "dev migration"
G3 checkout -q feat; G3 merge -q --no-edit dev >/dev/null 2>&1; OLD8="$(G3 rev-parse HEAD)"; stamp3 "$OLD8"
G3 mv supabase/migrations/20261007000001_base.sql supabase/migrations/20261007000002_base.sql; G3 commit -qm "rename a dev migration"
if carry "$tmp/r3" "$OLD8" >/dev/null 2>&1; then fail=$((fail+1)); printf '  FAIL  renaming a base migration must refuse\n'
else pass=$((pass+1)); printf '  ok    renaming a migration the base already has refuses\n'; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
