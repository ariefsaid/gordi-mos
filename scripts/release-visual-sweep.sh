#!/usr/bin/env bash
# Capture changed, manifest-backed routes at 390/768/1440 for an independent rendered review.
#
# Usage: scripts/release-visual-sweep.sh (<base-ref> <head-ref> | --routes <comma-list>) --base-url <localhost-url> [--persona <email>] [--out <docs-dir>]
# RELEASE8 example command: scripts/release-visual-sweep.sh --routes /cafe,/cafe/production,/cafe/transfer,/cafe/waste,/cafe/receive,/cafe/request,/cafe/count,/cafe/items,/cafe/receive/issues,/cafe/receive/review,/cafe/request/review,/cafe/review --persona dewi.dev@example.test --base-url http://localhost:5173/ --out docs/reviews/release8-cafe-visual
#
# Persona mode uses the dev-seed login and skips audit-owned per-route fixture provisioning.
# This release packet reuses the quantitative audit's manifest fixtures and rendered geometry,
# visible-content, and control collectors. The audit's change-gate compares failure baselines; it
# does not discover a release's changed routes or include a 768px capture, so this wrapper derives
# manifest route scope from the ref diff and asks the same collectors for those three widths. Run
# from the exact, clean candidate checkout with its owned local app server and seeded Gordi Sample
# data. Default output is written to docs/reviews/release-<head-label>-visual/ in the main checkout.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: scripts/release-visual-sweep.sh (<base-ref> <head-ref> | --routes <comma-list>) --base-url <localhost-url> [--persona <email>] [--out <docs-dir>]

Capture diff-affected routes or explicit app paths at 390, 768, and 1440 pixels. Exactly one
scope mode is required. --persona signs in as a dev-seed persona ending in .dev@example.test and
skips audit-owned per-route fixture provisioning. The checked-out HEAD must be clean; diff mode
also requires HEAD to equal <head-ref>. Output is limited to docs/ in the main checkout. This
command does not reset or migrate the database.
EOF
}

fail() { printf 'release-visual-sweep: %s\n' "$1" >&2; exit 2; }

base_url=""
out_arg=""
routes_arg=""
persona_email=""
routes_seen=0
persona_seen=0
positionals=()
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
    --persona)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      [ "$persona_seen" -eq 0 ] || fail '--persona may be specified only once'
      persona_seen=1
      persona_email="$2"
      shift 2
      ;;
    --routes)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      [ "$routes_seen" -eq 0 ] || fail '--routes may be specified only once'
      routes_seen=1
      routes_arg="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*) fail "unknown option: $1" ;;
    *) positionals+=("$1"); shift ;;
  esac
done
if [ "$routes_seen" -eq 1 ]; then
  [ "${#positionals[@]}" -eq 0 ] && [ -n "$routes_arg" ] || fail 'provide exactly one scope mode: refs OR --routes <comma-list>'
  mode=routes
  base_ref=""
  head_ref=""
else
  [ "${#positionals[@]}" -eq 2 ] || fail 'provide exactly one scope mode: <base-ref> <head-ref> OR --routes <comma-list>'
  mode=diff
  base_ref="${positionals[0]}"
  head_ref="${positionals[1]}"
fi
if [ "$persona_seen" -eq 1 ]; then
  [ -n "$persona_email" ] || fail '--persona requires an email'
  [[ "$persona_email" == *.dev@example.test ]] || fail '--persona email must end with .dev@example.test'
fi
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
current_sha="$(git rev-parse --verify HEAD 2>/dev/null)" || fail 'unable to resolve checked-out HEAD'
[ -z "$(git status --porcelain --untracked-files=all)" ] || fail 'candidate worktree must be clean'
if [ "$mode" = diff ]; then
  base_sha="$(git rev-parse --verify --quiet --end-of-options "${base_ref}^{commit}" 2>/dev/null)" \
    || fail "ref '$base_ref' does not resolve to a commit"
  head_sha="$(git rev-parse --verify --quiet --end-of-options "${head_ref}^{commit}" 2>/dev/null)" \
    || fail "ref '$head_ref' does not resolve to a commit"
  [ "$current_sha" = "$head_sha" ] || fail 'checked-out HEAD must equal <head-ref>'
  changed_paths="$(git diff --name-only --diff-filter=ACMRTD "$base_sha" "$head_sha" -- \
    'mos-app/src' 'mos-app/e2e/design-quality/manifest-cells' 'mos-app/e2e/design-quality/manifest.ts' \
    'mos-app/e2e/design-quality/measurements.ts' 'mos-app/e2e/design-quality/runtime.ts' \
    'mos-app/e2e/design-quality/report.ts' 'mos-app/e2e/design-quality/change-gate.ts')"
  [ -n "$changed_paths" ] || fail 'no app or quantitative-audit files changed between the refs'
else
  base_sha=""
  head_sha="$current_sha"
  changed_paths=""
fi

manifest_routes="$(cd "$root/mos-app" && node --experimental-strip-types --input-type=module - <<'NODE'
import { DESIGN_QUALITY_MANIFEST, MVP_ROUTES } from './e2e/design-quality/manifest.ts'
const fixtureRoutes = [...new Set(DESIGN_QUALITY_MANIFEST.cells
  .filter((cell) => cell.state === 'default' && cell.status === 'covered')
  .map((cell) => cell.route))]
process.stdout.write(JSON.stringify({ routes: MVP_ROUTES, fixtureRoutes }))
NODE
)" || fail 'could not load the quantitative audit route manifest'

scratch="$(mktemp -d "${TMPDIR:-/tmp}/release-visual-sweep.XXXXXX")" || fail 'could not create a temporary evidence directory'
cleanup() { rm -rf "$scratch"; }
trap cleanup EXIT HUP INT TERM
printf '%s\n' "$changed_paths" > "$scratch/changed-paths.txt"
printf '%s\n' "$manifest_routes" > "$scratch/manifest-routes.json"
python3 - "$mode" "$routes_arg" "$scratch/changed-paths.txt" "$scratch/manifest-routes.json" "$scratch/scope.json" "$base_sha" "$head_sha" <<'PY'
import json
import pathlib
import sys

mode, routes_arg, changed_path_file, manifest_path, output_path, base_sha, head_sha = sys.argv[1:]
changed = [
    line for line in pathlib.Path(changed_path_file).read_text().splitlines()
    if line and not any(marker in pathlib.PurePosixPath(line).name for marker in ('.test.', '.spec.'))
]
contract = json.loads(pathlib.Path(manifest_path).read_text())
if not isinstance(contract, dict) or not isinstance(contract.get('routes'), list) or not contract['routes']:
    raise SystemExit('release-visual-sweep: quantitative route manifest is empty or invalid')
manifest_routes = contract['routes']
fixture_routes = set(contract.get('fixtureRoutes', []))

if mode == 'routes':
    app_route_sources = {
        '/cafe': '/cafe',
        '/cafe/production': '/cafe',
        '/cafe/transfer': '/cafe',
        '/cafe/waste': '/cafe/stock',
        '/cafe/receive': '/cafe',
        '/cafe/request': '/cafe',
        '/cafe/count': '/cafe/review',
        '/cafe/items': '/cafe/stock',
        '/cafe/receive/issues': '/cafe/review',
        '/cafe/receive/review': '/cafe/review',
        '/cafe/request/review': '/cafe/review',
        '/cafe/review': '/cafe/review',
    }
    requested = [route.strip() for route in routes_arg.split(',')]
    if not requested or any(not route for route in requested):
        raise SystemExit('release-visual-sweep: --routes requires a non-empty comma-list of app paths')
    if len(set(requested)) != len(requested):
        raise SystemExit('release-visual-sweep: --routes cannot contain duplicate app paths')
    mapping = {}
    for app_path in requested:
        if app_path not in app_route_sources:
            raise SystemExit(f'release-visual-sweep: unknown app route: {app_path}')
        manifest_route = app_route_sources[app_path]
        if manifest_route not in manifest_routes:
            raise SystemExit(f'release-visual-sweep: app route has no quantitative manifest mapping: {app_path} -> {manifest_route}')
        if manifest_route not in fixture_routes:
            raise SystemExit(f'release-visual-sweep: app route has no covered default fixture: {app_path} -> {manifest_route}')
        mapping[app_path] = manifest_route
    routes = requested
else:
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
        'mos-app/src/pages/cafe-waste-page.tsx': ['/cafe/stock'],
        'mos-app/src/pages/cafe-count-page.tsx': ['/cafe/review'],
        'mos-app/src/pages/cafe-receive-page.tsx': ['/cafe'],
        'mos-app/src/pages/cafe-request-page.tsx': ['/cafe'],
        'mos-app/src/pages/cafe-item-settings-page.tsx': ['/cafe/stock'],
        'mos-app/src/pages/cafe-receipt-issues-page.tsx': ['/cafe/review'],
        'mos-app/src/pages/cafe-receipt-review-page.tsx': ['/cafe/review'],
        'mos-app/src/pages/cafe-request-review-page.tsx': ['/cafe/review'],
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
            all_routes = True
        elif path.startswith('mos-app/src/'):
            all_routes = True
    if all_routes:
        selected.update(manifest_routes)
    unknown = sorted(selected.difference(manifest_routes))
    if unknown:
        raise SystemExit('release-visual-sweep: changed routes have no quantitative audit fixture: ' + ', '.join(unknown))
    missing_fixtures = sorted(selected.difference(fixture_routes))
    if missing_fixtures:
        raise SystemExit('release-visual-sweep: changed routes have no covered default fixture: ' + ', '.join(missing_fixtures))
    routes = [route for route in manifest_routes if route in selected]
    if not routes:
        raise SystemExit('release-visual-sweep: diff did not identify any manifest-backed UI routes')
    mapping = {route: route for route in routes}

pathlib.Path(output_path).write_text(json.dumps({
    'mode': mode,
    'baseSha': base_sha or None,
    'headSha': head_sha,
    'routes': routes,
    'manifestRoutes': mapping,
    'widths': [390, 768, 1440],
}, indent=2) + '\n')
PY

common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || fail 'could not resolve the main checkout'
main_root="$(cd "$(dirname "$common_dir")" && pwd)"
if [ -n "$out_arg" ]; then
  case "$out_arg" in
    /*) requested_out="$out_arg" ;;
    *) requested_out="$main_root/$out_arg" ;;
  esac
else
  label="${head_ref:-$head_sha}"
  label="${label##*/}"
  label="$(printf '%s' "$label" | tr -cs '[:alnum:]._-' '-' | sed 's/^-*//;s/-*$//')"
  [ -n "$label" ] || label=commit
  requested_out="$main_root/docs/reviews/release-$label-visual"
fi
out_dir="$(python3 - "$main_root" "$requested_out" <<'PY'
import pathlib
import sys

main_root = pathlib.Path(sys.argv[1]).resolve()
docs_root = (main_root / 'docs').resolve()
output = pathlib.Path(sys.argv[2]).resolve()
try:
    output.relative_to(docs_root)
except ValueError:
    raise SystemExit(1)
if output == docs_root:
    raise SystemExit(1)
print(output)
PY
)" || fail '--out must resolve under the main checkout docs/'
if [ -e "$out_dir" ]; then
  [ -d "$out_dir" ] || fail "output path is not a directory: $out_dir"
  [ -z "$(find "$out_dir" -mindepth 1 -print -quit)" ] || fail 'output directory is not empty; refusing to overwrite review evidence'
fi

runner="$root/mos-app/scripts/release-visual-sweep.mjs"
[ -f "$runner" ] || fail 'render runner is missing'
runner_args=(--base-url "$base_url" --head "$head_sha" --scope "$scratch/scope.json" --out "$scratch/evidence")
[ "$mode" = diff ] && runner_args+=(--base "$base_sha")
[ "$persona_seen" -eq 1 ] && runner_args+=(--persona "$persona_email")
(
  cd "$root/mos-app"
  "$root/scripts/with-db-lock.sh" node "$root/mos-app/node_modules/vite-node/vite-node.mjs" "$runner" "${runner_args[@]}"
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

lines = [f"HEAD: {scope['headSha']}"]
if results.get('persona'):
    lines.append(f"PERSONA: {results['persona']} (audit per-route fixture provisioning skipped)")
if scope.get('baseSha'):
    lines.append(f"BASE: {scope['baseSha']}")
lines.extend([
    '',
    'Counts are raw collector totals and are not baseline-classified.',
    '',
    '| Route | Width | Horizontal overflow (count / max px) | Clipped text | Phone tap targets <44px (390px only) | Screenshot |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
])
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
