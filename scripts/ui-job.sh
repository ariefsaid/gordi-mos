#!/bin/zsh
# ui-job.sh <model> <name> <prompt-file> <area>   (from the redesign folder's run-proof.sh)
# Runs a build job through run.sh, then refuses to call it done until the proof exists:
#   docs/ui-checks/<area>/shots/*-390.png and *-1440.png newer than the job start
#   docs/ui-checks/<area>/checks.json newer than the job start with "pass": true — written by
#   `SHOT_PORT=<port> node mos-app/scripts/ui-check/check.mjs <area> [pages]`: signed-in screenshots, axe serious/critical,
#   horizontal scroll, phone targets, one h1, and the Impeccable detector (also writes detect.json).
# The builder's own critique no longer counts as proof; the independent critique comes after (one fresh Sol session).
# Missing proof = the job is re-run once with the gap named. Still missing = exit 2, not "done".
model=$1 name=$2 prompt=$3 area=$4
export CHECK_IGNORE=${CHECK_IGNORE:-}   # known exclusions from the brief (see check.mjs); empty = none
dir=${0:A:h}; root=${dir:h}; jobs=$root/docs/ui-jobs; mkdir -p $jobs; shots=$root/docs/ui-checks/$area/shots; chk=$root/docs/ui-checks/$area/checks.json
[[ -n $area ]] || { echo "usage: ui-job.sh <model> <name> <prompt-file> <area>" >&2; exit 1; }
mkdir -p $shots
stamp=$(mktemp); touch $stamp
missing() {
  local gaps=()
  (( $(find $shots -name '*-390.png' -newer $stamp 2>/dev/null | wc -l) > 0 )) || gaps+=("no new *-390.png in docs/ui-checks/$area/shots")
  (( $(find $shots -name '*-1440.png' -newer $stamp 2>/dev/null | wc -l) > 0 )) || gaps+=("no new *-1440.png in docs/ui-checks/$area/shots")
  if [[ ! -f $chk || ! $chk -nt $stamp ]]; then gaps+=("no fresh docs/ui-checks/$area/checks.json (run: SHOT_PORT=<your port> node $root/mos-app/scripts/ui-check/check.mjs $area <pages you changed>)")
  elif ! grep -q '"pass": true' $chk; then gaps+=("docs/ui-checks/$area/checks.json fails: fix every axe, layout and detector finding it lists (detect.json has the detector detail), then rerun check.mjs")
  fi
  print -l $gaps
}
for pass in 1 2; do
  $dir/ui-job-run.sh $model $name $prompt || exit $?
  gaps=("${(@f)$(missing)}")
  [[ -z ${gaps// } ]] && { echo "[run-proof] $(date +%H:%M) done with proof" >> $jobs/$name.log; exit 0; }
  echo "[run-proof] $(date +%H:%M) not done: ${(j:; :)gaps}" >> $jobs/$name.log
  (( pass == 2 )) && exit 2
  fix=$(mktemp); printf 'The job is not done. Missing proof: %s. Produce it now; do not redo finished work.\n' "${(j:; :)gaps}" > $fix
  prompt=$fix
done
