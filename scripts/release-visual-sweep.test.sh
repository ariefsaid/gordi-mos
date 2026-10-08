#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
script="$repo_root/scripts/release-visual-sweep.sh"
if [ ! -x "$script" ]; then
  echo 'FAIL: release visual sweep command is missing or not executable' >&2
  exit 1
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fixture="$tmp/fixture"
mkdir -p "$fixture/mos-app/src/pages" "$fixture/mos-app/scripts" "$fixture/docs" "$fixture/scripts" "$tmp/bin"
: > "$fixture/mos-app/scripts/release-visual-sweep.mjs"
cat > "$fixture/scripts/with-db-lock.sh" <<'LOCK'
#!/usr/bin/env bash
set -euo pipefail
export MOS_DB_LOCK_HELD=1
exec "$@"
LOCK
chmod +x "$fixture/scripts/with-db-lock.sh"

runner_source="$repo_root/mos-app/scripts/release-visual-sweep.mjs"
grep -Fq "import globalSetup from '../e2e/global-setup.ts'" "$runner_source" || {
  echo 'FAIL: sweep does not reuse Playwright global setup' >&2; exit 1;
}
grep -Fq 'await globalSetup()' "$runner_source" || {
  echo 'FAIL: sweep does not provision Playwright personas before measuring' >&2; exit 1;
}
grep -Fq "import globalTeardown from '../e2e/global-teardown.ts'" "$runner_source" || {
  echo 'FAIL: sweep does not reuse Playwright global teardown' >&2; exit 1;
}
grep -Fq 'with-db-lock.sh' "$script" || {
  echo 'FAIL: sweep does not hold the shared database lock' >&2; exit 1;
}
cd "$fixture"
git init -q
git config user.email test@example.invalid
git config user.name 'Visual sweep test'
printf 'base\n' > mos-app/src/pages/tasks-layout.tsx
git add .
git commit -qm base
base_ref="$(git rev-parse HEAD)"
printf 'head\n' > mos-app/src/pages/tasks-layout.tsx
git add .
git commit -qm head
head_ref="$(git rev-parse HEAD)"

cat > "$tmp/bin/node" <<'NODE_STUB'
#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -eq 3 ] && [ "$3" = "-" ]; then
  python3 - <<'PY'
import json, os
routes = ['/work/tasks', '/work/signals', '/inbox', '/cafe', '/cafe/plan', '/cafe/review', '/cafe/stock', '/cafe/pushes']
fixtures = os.environ.get('TEST_FIXTURE_ROUTES', ','.join(routes)).split(',')
print(json.dumps({'routes': routes, 'fixtureRoutes': fixtures}))
PY
  exit 0
fi
runner=""
scope=""
out=""
head=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    */release-visual-sweep.mjs) runner="$1"; shift ;;
    --scope) scope="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --head) head="$2"; shift 2 ;;
    *) shift ;;
  esac
done
[ -n "$runner" ] && [ -n "$scope" ] && [ -n "$out" ] && [ -n "$head" ]
[ "${MOS_DB_LOCK_HELD:-}" = 1 ] || { echo 'runner started without the shared DB lock' >&2; exit 1; }
python3 - "$scope" "$out" "$head" "$TEST_SCOPE_CAPTURE" <<'PY'
import json, pathlib, sys
scope_path, output_dir, head, capture = sys.argv[1:]
scope = json.loads(pathlib.Path(scope_path).read_text())
assert scope['headSha'] == head
assert scope['routes'], scope['routes']
if scope.get('mode') == 'diff':
    assert scope['routes'] == ['/work/tasks'], scope['routes']
pathlib.Path(capture).write_text(json.dumps(scope))
root = pathlib.Path(output_dir)
(root / 'screenshots').mkdir(parents=True)
rows = []
for route in scope['routes']:
  slug = route.strip('/').replace('/', '-') or 'home'
  for width in (390, 768, 1440):
    name = f'{slug}-{width}.png'
    (root / 'screenshots' / name).write_bytes(b'fixture screenshot')
    rows.append({
        'route': route, 'width': width, 'overflowCount': 0,
        'maxHorizontalOverflowPx': 0, 'clippedTextCount': 1, 'smallTapTargetCount': 2 if width == 390 else 0,
        'screenshot': f'screenshots/{name}',
    })
(root / 'sweep-results.json').write_text(json.dumps({'headSha': head, 'rows': rows}))
PY
NODE_STUB
chmod +x "$tmp/bin/node"
export PATH="$tmp/bin:$PATH"
export TEST_SCOPE_CAPTURE="$tmp/observed-scope.json"

if "$script" "$base_ref" "$head_ref" > "$tmp/missing-url.out" 2>&1; then
  echo 'FAIL: accepted missing --base-url' >&2; exit 1
fi
grep -q -- '--base-url is required' "$tmp/missing-url.out"

if "$script" "$base_ref" "$head_ref" --base-url https://example.invalid/ > "$tmp/remote-url.out" 2>&1; then
  echo 'FAIL: accepted a non-localhost URL' >&2; exit 1
fi
grep -q 'must point to localhost' "$tmp/remote-url.out"

if "$script" no-such-base "$head_ref" --base-url http://localhost:1234/ > "$tmp/bad-ref.out" 2>&1; then
  echo 'FAIL: accepted a ref that does not resolve' >&2; exit 1
fi
grep -q 'ref .* does not resolve' "$tmp/bad-ref.out"
if "$script" "$base_ref" no-such-head --base-url http://localhost:1234/ > "$tmp/bad-head.out" 2>&1; then
  echo 'FAIL: accepted a head ref that does not resolve' >&2; exit 1
fi
grep -q 'ref .* does not resolve' "$tmp/bad-head.out"

out="$fixture/docs/output"
"$script" "$base_ref" "$head_ref" --base-url http://localhost:1234/ --out "$out" > "$tmp/run.out"
expected_head="HEAD: $head_ref"
[ "$(head -n 1 "$out/summary.md")" = "$expected_head" ] || {
  echo 'FAIL: summary.md does not start with the expected HEAD line' >&2; exit 1;
}
grep -q '| /work/tasks | 390 |' "$out/summary.md"
grep -q '| /work/tasks | 768 |' "$out/summary.md"
grep -q '| /work/tasks | 1440 |' "$out/summary.md"
grep -q 'Counts are raw collector totals and are not baseline-classified.' "$out/summary.md"
grep -q 'Phone tap targets <44px (390px only)' "$out/summary.md"
grep -q '| /work/tasks | 768 | 0 / 0px | 1 | 0 |' "$out/summary.md"
grep -q '| /work/tasks | 1440 | 0 / 0px | 1 | 0 |' "$out/summary.md"
python3 - "$TEST_SCOPE_CAPTURE" <<'PY'
import json, pathlib, sys
assert json.loads(pathlib.Path(sys.argv[1]).read_text())['routes'] == ['/work/tasks']
PY
[ "$(find "$out/screenshots" -type f -name '*.png' | wc -l | tr -d ' ')" = 3 ] || {
  echo 'FAIL: expected three copied screenshots' >&2; exit 1;
}
rm -rf "$out"

routes_out="$fixture/docs/routes"
cafe_routes='/cafe,/cafe/production,/cafe/transfer,/cafe/waste,/cafe/receive,/cafe/request,/cafe/count,/cafe/items,/cafe/receive/issues,/cafe/receive/review,/cafe/request/review,/cafe/review'
if ! "$script" --routes "$cafe_routes" --base-url http://localhost:1234/ --out "$routes_out" > "$tmp/routes.out" 2>&1; then
  echo 'FAIL: --routes did not build the requested app-route scope' >&2; cat "$tmp/routes.out" >&2; exit 1
fi
python3 - "$TEST_SCOPE_CAPTURE" <<'PY'
import json, pathlib, sys
scope = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert scope['mode'] == 'routes'
assert scope['routes'] == ['/cafe', '/cafe/production', '/cafe/transfer', '/cafe/waste', '/cafe/receive', '/cafe/request', '/cafe/count', '/cafe/items', '/cafe/receive/issues', '/cafe/receive/review', '/cafe/request/review', '/cafe/review']
assert scope['manifestRoutes']['/cafe/production'] == '/cafe'
assert scope['manifestRoutes']['/cafe/waste'] == '/cafe/stock'
assert scope['manifestRoutes']['/cafe/count'] == '/cafe/review'
assert scope['manifestRoutes']['/cafe/receive/review'] == '/cafe/review'
PY
[ "$(find "$routes_out/screenshots" -type f -name '*.png' | wc -l | tr -d ' ')" = 36 ] || {
  echo 'FAIL: route mode did not capture all route/width pairs' >&2; exit 1;
}
rm -rf "$routes_out"

if "$script" "$base_ref" "$head_ref" --routes /cafe --base-url http://localhost:1234/ > "$tmp/both-modes.out" 2>&1; then
  echo 'FAIL: accepted both invocation modes' >&2; exit 1
fi
grep -q 'exactly one' "$tmp/both-modes.out"
if "$script" --base-url http://localhost:1234/ > "$tmp/neither-mode.out" 2>&1; then
  echo 'FAIL: accepted neither invocation mode' >&2; exit 1
fi
grep -q 'exactly one' "$tmp/neither-mode.out"

if "$script" --routes /cafe/not-a-route --base-url http://localhost:1234/ --out "$fixture/docs/unknown" > "$tmp/unknown-route.out" 2>&1; then
  echo 'FAIL: accepted an unknown app route' >&2; exit 1
fi
grep -q 'unknown app route' "$tmp/unknown-route.out"

if TEST_FIXTURE_ROUTES=/work/tasks "$script" --routes /cafe/production --base-url http://localhost:1234/ --out "$fixture/docs/fixtureless" > "$tmp/fixtureless.out" 2>&1; then
  echo 'FAIL: accepted a mapped route without an audit fixture' >&2; exit 1
fi
grep -q 'no covered default fixture' "$tmp/fixtureless.out"

if "$script" "$base_ref" "$head_ref" --base-url http://localhost:1234/ --out "$fixture/outside-docs" > "$tmp/outside-docs.out" 2>&1; then
  echo 'FAIL: accepted output outside the main checkout docs/' >&2; exit 1
fi
grep -q 'must resolve under the main checkout docs/' "$tmp/outside-docs.out"
printf 'release-visual-sweep self-test: PASS\n'
