#!/bin/zsh
# ui-job-run.sh <model> <name> <prompt-file>   (from the redesign folder's run.sh; called by ui-job.sh)
# Keeps the agent's session on disk (docs/ui-jobs/<name>.jsonl). Treats 15 min without session
# activity (or no session file 15 min after start) as a hang: kills and resumes, so no work is lost.
model=$1 name=$2 prompt=$3
dir=${0:A:h}; jobs=${dir:h}/docs/ui-jobs; mkdir -p $jobs; sess=$jobs/$name.jsonl; log=$jobs/$name.log
task="$(cat $prompt)"
for attempt in 1 2 3 4 5 6 7 8; do
  if [[ -s $sess ]]; then msg="Continue the same task from where you stopped. Your earlier work is in this session and in files on disk; do not redo finished parts."
  else msg=$task; fi
  pi -p --model $model ${=PI_EXTRA} --session $sess "$msg" >> $log 2>&1 &
  pid=$! start=$(date +%s)
  while kill -0 $pid 2>/dev/null; do
    sleep 30
    last=$start; [[ -f $sess ]] && last=$(stat -f %m $sess); (( last < start )) && last=$start
    idle=$(( $(date +%s) - last ))
    if (( idle > 900 )); then echo "[run.sh] $(date +%H:%M) hang: ${idle}s silent, restarting (attempt $attempt)" >> $log; kill $pid; break; fi
  done
  wait $pid 2>/dev/null; code=$?
  (( code == 0 )) && { echo "[run.sh] $(date +%H:%M) done" >> $log; exit 0; }
  echo "[run.sh] $(date +%H:%M) failed (code $code), retry in $((attempt*60))s" >> $log; sleep $((attempt*60))
done
echo "[run.sh] gave up after 8 attempts" >> $log; exit 1
