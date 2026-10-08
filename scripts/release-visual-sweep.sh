#!/usr/bin/env bash
# Capture changed, manifest-backed routes at 390/768/1440 for an independent rendered review.
#
# Usage: scripts/release-visual-sweep.sh <base-ref> <head-ref> --base-url <localhost-url> [--out <dir>]
#
# This release packet reuses the quantitative audit's manifest fixtures and rendered geometry,
# visible-content, and control collectors. The audit's change-gate compares failure baselines; it
# does not discover a release's changed routes or include a 768px capture, so this wrapper derives
# manifest route scope from the ref diff and asks the same collectors for those three widths. Run
# from the exact, clean candidate checkout with its owned local app server and seeded Gordi Sample
# data. Default output is written to docs/reviews/release-<head-label>-visual/ in the main checkout.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: scripts/release-visual-sweep.sh <base-ref> <head-ref> --base-url <localhost-url> [--out <dir>]

Capture routes affected by the ref diff at 390, 768, and 1440 pixels. Requires the checked-out
HEAD to equal <head-ref>, a clean worktree, and an owned local app server. Output is a summary.md
and screenshots; this command does not reset or migrate the database.
EOF
}

fail() { printf 'release-visual-sweep: %s\n' "$1" >&2; exit 2; }

[ "$#" -ge 2 ] || { usage; exit 2; }
base_ref="$1"
head_ref="$2"
shift 2
base_url=""
out_arg=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --base-url)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      base_url="$2"
      shift 2
      ;;
    --out)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      out_arg="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*) fail "unknown option: $1" ;;
    *) fail "unexpected argument: $1" ;;
  esac
done
[ -n "$base_url" ] || fail '--base-url is required and must point to localhost'

base_url_info="$(python3 - "$base_url" <<'PY'
import sys
from urllib.parse import urlparse

value = sys.argv[1]
parsed = urlparse(value)
host = (parsed.hostname or '').lower()
if (parsed.scheme not in {'http', 'https'}
    or host not in {'localhost', '127.0.0.1', '::1'}
    or parsed.username is not None or parsed.password is not None
    or parsed.path not in {'', '/'} or parsed.query or parsed.fragment):
    raise SystemExit(1)
try:
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
except ValueError:
    raise SystemExit(1)
print(f'{host}\t{port}')
PY
)" || fail '--base-url must point to localhost without credentials, a path, query, or fragment'

root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail 'run from inside the candidate repository'
cd "$root"
base_sha="$(git rev-parse --verify --quiet --end-of-options "${base_ref}^{commit}" 2>/dev/null)" \
  || fail "ref '$base_ref' does not resolve to a commit"
head_sha="$(git rev-parse --verify --quiet --end-of-options "${head_ref}^{commit}" 2>/dev/null)" \
  || fail "ref '$head_ref' does not resolve to a commit"
current_sha="$(git rev-parse --verify HEAD 2>/dev/null)" || fail 'unable to resolve checked-out HEAD'
[ "$current_sha" = "$head_sha" ] || fail 'checked-out HEAD must equal <head-ref>'
[ -z "$(git status --porcelain --untracked-files=all)" ] || fail 'candidate worktree must be clean'

changed_paths="$(git diff --name-only --diff-filter=ACMRTD "$base_sha" "$head_sha" -- \
  'mos-app/src' 'mos-app/e2e/design-quality/manifest-cells' 'mos-app/e2e/design-quality/manifest.ts' \
  'mos-app/e2e/design-quality/measurements.ts' 'mos-app/e2e/design-quality/runtime.ts' \
  'mos-app/e2e/design-quality/report.ts' 'mos-app/e2e/design-quality/change-gate.ts')"
[ -n "$changed_paths" ] || fail 'no app or quantitative-audit files changed between the refs'

manifest_routes="$(cd "$root/mos-app" && node --experimental-strip-types --input-type=module - <<'NODE'
import { MVP_ROUTES } from './e2e/design-quality/manifest.ts'
process.stdout.write(JSON.stringify(MVP_ROUTES))
NODE
)" || fail 'could not load the quantitative audit route manifest'

scratch="$(mktemp -d "${TMPDIR:-/tmp}/release-visual-sweep.XXXXXX")" || fail 'could not create a temporary evidence directory'
cleanup() { rm -rf "$scratch"; }
trap cleanup EXIT HUP INT TERM
printf '%s\n' "$changed_paths" > "$scratch/changed-paths.txt"
printf '%s\n' "$manifest_routes" > "$scratch/manifest-routes.json"
python3 - "$scratch/changed-paths.txt" "$scratch/manifest-routes.json" "$scratch/scope.json" "$base_sha" "$head_sha" <<'PY'
import json
import pathlib
import sys

changed_path_file, manifest_path, output_path, base_sha, head_sha = sys.argv[1:]
changed = [
    line for line in pathlib.Path(changed_path_file).read_text().splitlines()
    if line and not any(marker in pathlib.PurePosixPath(line).name for marker in ('.test.', '.spec.'))
]
manifest_routes = json.loads(pathlib.Path(manifest_path).read_text())
if not isinstance(manifest_routes, list) or not manifest_routes:
    raise SystemExit('release-visual-sweep: quantitative route manifest is empty or invalid')

route_sources = {
    'mos-app/src/pages/tasks-layout.tsx': ['/work/tasks'],
    'mos-app/src/pages/tasks-page.tsx': ['/work/tasks'],
    'mos-app/src/pages/task-detail.tsx': ['/work/tasks'],
    'mos-app/src/pages/task-create.tsx': ['/work/tasks'],
    'mos-app/src/pages/signals-archive-page.tsx': ['/work/signals'],
    'mos-app/src/pages/inbox-page.tsx': ['/inbox'],
    'mos-app/src/pages/cafe-opening-page.tsx': ['/cafe'],
    'mos-app/src/pages/kitchen-log-page.tsx': ['/cafe'],
    'mos-app/src/pages/kitchen-plan-page.tsx': ['/cafe/plan'],
    'mos-app/src/pages/kitchen-review-page.tsx': ['/cafe/review'],
    'mos-app/src/pages/kitchen-stock-page.tsx': ['/cafe/stock'],
    'mos-app/src/pages/kitchen-pushes-page.tsx': ['/cafe/pushes'],
    'mos-app/e2e/design-quality/manifest-cells/tasks.ts': ['/work/tasks'],
    'mos-app/e2e/design-quality/manifest-cells/signals.ts': ['/work/signals'],
    'mos-app/e2e/design-quality/manifest-cells/inbox.ts': ['/inbox'],
    'mos-app/e2e/design-quality/manifest-cells/cafe.ts': ['/cafe', '/cafe/plan', '/cafe/review', '/cafe/stock', '/cafe/pushes'],
}
all_routes = False
selected = set()
for path in changed:
    if path in route_sources:
        selected.update(route_sources[path])
    elif (path.startswith('mos-app/src/pages/')
          and '/' not in path[len('mos-app/src/pages/'):]
          and path.endswith(('.tsx', '.ts'))):
        raise SystemExit(f'release-visual-sweep: changed page has no real-data manifest route mapping: {path}')
    elif path.startswith('mos-app/src/components/tasks/'):
        selected.add('/work/tasks')
    elif path.startswith('mos-app/src/components/signals/'):
        selected.add('/work/signals')
    elif path.startswith('mos-app/src/components/inbox/'):
        selected.add('/inbox')
    elif path.startswith(('mos-app/src/components/cafe/', 'mos-app/src/components/kitchen/')):
        selected.update(route for route in manifest_routes if route.startswith('/cafe'))
    elif path.startswith('mos-app/e2e/design-quality/manifest-cells/'):
        all_routes = True
    elif path == 'mos-app/e2e/design-quality/manifest.ts' or path.startswith('mos-app/e2e/design-quality/'):
        all_routes = True
    elif path.startswith('mos-app/src/pages/') and '/' in path[len('mos-app/src/pages/'):]:
        # Nested page modules share their owning top-level route component.
        all_routes = True
    elif path.startswith('mos-app/src/'):
        # Shared shell, UI, styles, and behavior can affect any manifest-backed route.
        all_routes = True

if all_routes:
    selected.update(manifest_routes)
unknown = sorted(selected.difference(manifest_routes))
if unknown:
    raise SystemExit('release-visual-sweep: changed routes have no quantitative audit fixture: ' + ', '.join(unknown))
routes = [route for route in manifest_routes if route in selected]
if not routes:
    raise SystemExit('release-visual-sweep: diff did not identify any manifest-backed UI routes')
pathlib.Path(output_path).write_text(json.dumps({
    'baseSha': base_sha,
    'headSha': head_sha,
    'routes': routes,
    'widths': [390, 768, 1440],
}, indent=2) + '\n')
PY

if [ -n "$out_arg" ]; then
  case "$out_arg" in
    /*) out_dir="$out_arg" ;;
    *) out_dir="$root/$out_arg" ;;
  esac
else
  common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || fail 'could not resolve the main checkout'
  main_root="$(cd "$(dirname "$common_dir")" && pwd)"
  label="${head_ref##*/}"
  label="$(printf '%s' "$label" | tr -cs '[:alnum:]._-' '-' | sed 's/^-*//;s/-*$//')"
  [ -n "$label" ] || label=commit
  out_dir="$main_root/docs/reviews/release-$label-visual"
fi
if [ -e "$out_dir" ]; then
  [ -d "$out_dir" ] || fail "output path is not a directory: $out_dir"
  [ -z "$(find "$out_dir" -mindepth 1 -print -quit)" ] || fail 'output directory is not empty; refusing to overwrite review evidence'
fi

runner="$root/mos-app/scripts/release-visual-sweep.mjs"
[ -f "$runner" ] || fail 'render runner is missing'
(
  cd "$root/mos-app"
  node --experimental-strip-types "$runner" \
    --base-url "$base_url" --base "$base_sha" --head "$head_sha" \
    --scope "$scratch/scope.json" --out "$scratch/evidence"
) || fail 'render sweep failed; no review packet was published'

python3 - "$scratch/evidence/sweep-results.json" "$scratch/scope.json" "$scratch/evidence" "$scratch/summary.md" <<'PY'
import json
import pathlib
import sys

results_path, scope_path, evidence_dir, summary_path = map(pathlib.Path, sys.argv[1:])
results = json.loads(results_path.read_text())
scope = json.loads(scope_path.read_text())
if results.get('headSha') != scope['headSha']:
    raise SystemExit('release-visual-sweep: rendered results are not bound to requested HEAD')
rows = results.get('rows')
expected = {(route, width) for route in scope['routes'] for width in scope['widths']}
actual = {(row.get('route'), row.get('width')) for row in rows or []}
if actual != expected or len(rows or []) != len(expected):
    raise SystemExit('release-visual-sweep: rendered evidence does not cover each requested route and width exactly once')

lines = [
    f"HEAD: {scope['headSha']}",
    f"BASE: {scope['baseSha']}",
    '',
    '| Route | Width | Horizontal overflow (count / max px) | Clipped text | Tap targets <44px | Screenshot |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
]
for row in sorted(rows, key=lambda item: (scope['routes'].index(item['route']), scope['widths'].index(item['width']))):
    relative = pathlib.PurePosixPath(row.get('screenshot', ''))
    if relative.is_absolute() or '..' in relative.parts or not relative.parts or relative.parts[0] != 'screenshots':
        raise SystemExit('release-visual-sweep: screenshot path is outside the evidence directory')
    screenshot = evidence_dir.joinpath(*relative.parts)
    if not screenshot.is_file():
        raise SystemExit(f'release-visual-sweep: screenshot is missing for {row["route"]} at {row["width"]}px')
    for field in ('overflowCount', 'maxHorizontalOverflowPx', 'clippedTextCount', 'smallTapTargetCount'):
        if not isinstance(row.get(field), int) or row[field] < 0:
            raise SystemExit(f'release-visual-sweep: invalid {field} for {row["route"]} at {row["width"]}px')
    overflow = f"{row['overflowCount']} / {row['maxHorizontalOverflowPx']}px"
    lines.append(
        f"| {row['route']} | {row['width']} | {overflow} | {row['clippedTextCount']} | "
        f"{row['smallTapTargetCount']} | [screenshot]({relative.as_posix()}) |"
    )
summary_path.write_text('\n'.join(lines) + '\n')
PY

mkdir -p "$out_dir/screenshots"
cp -R "$scratch/evidence/screenshots/." "$out_dir/screenshots/"
cp "$scratch/summary.md" "$out_dir/summary.md"
printf 'Visual sweep saved: %s\n' "$out_dir"
printf 'Summary: %s/summary.md\n' "$out_dir"
