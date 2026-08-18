#!/usr/bin/env bash
# audit-register.sh — the Director's one-liners over the coverage register.
#
# The ONLY sanctioned way to mutate docs/audits/surfaces.json's lifecycle state,
# and the single source that regenerates docs/audits/REGISTER.md (the human view).
# REGISTER.md is GENERATED — never hand-edit it; run `render` (or any mutation,
# which re-renders automatically) so the two halves cannot drift.
#
# Usage:
#   bash scripts/audit-register.sh status [<surface-id>]     # print row(s); no mutation
#   bash scripts/audit-register.sh bump  <surface-id>        # open a redesign lane:
#                                                            #   generation++, bumped=true
#   bash scripts/audit-register.sh lock  <surface-id> [commit] [ratifiedBy]
#                                                            # post-ratify: set lockedAt,
#                                                            #   clear bumped+due, set auditedAt
#   bash scripts/audit-register.sh render                    # regenerate REGISTER.md only
#
# JSON mutation goes through python3 (safe encoding); REGISTER.md is generated from
# the same python so the view never drifts from the machine half.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
REG="docs/audits/surfaces.json"
OUT="docs/audits/REGISTER.md"

if [[ ! -f "$REG" ]]; then
  echo "ERROR: $REG not found." >&2
  exit 2
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required by audit-register.sh." >&2
  exit 2
fi

CMD="${1:-}"

render() {
  python3 - "$REG" "$OUT" <<'PY'
import json, sys, datetime
reg_path, out_path = sys.argv[1], sys.argv[2]
with open(reg_path) as f:
    reg = json.load(f)

surfaces = reg["surfaces"]
dims = reg.get("dimensions", [])
gda = reg.get("globalDueAxes", [])

def status_of(s):
    if s.get("lockedAt") in (None, "null"):
        return "DUE"
    if s.get("bumped"):
        return "BUMPED"
    return "LOCKED"

L = []
w = L.append
w("# Audit Coverage Register — Gordi MOS V3")
w("")
w("> **GENERATED FILE — do not hand-edit.** Rendered from `docs/audits/surfaces.json` by")
w("> `scripts/audit-register.sh render`. Mutate lifecycle state with `audit-register.sh")
w("> {bump|lock}`; read staleness with `scripts/audit-staleness.sh`. This is the coverage")
w("> authority named in `CLAUDE.md` / `AGENTS.md`: a UI merge requires its surface **locked**")
w("> or explicitly **bumped** (enforced by the pre-pr-verify lane + the review roster —")
w("> `pre-merge-check.sh` never existed in CI, DD-WAY-31).")
w("")
w("The register gives design coverage a **denominator** (every surface below), a **memory**")
w("(generation + locked commit), and disciplined re-audit triggers (generation bump / pin")
w("insufficiency / milestone Luna) — so \"what else is un-audited?\" is a query, not a discovery.")
w("Full model: `docs/plans/wise-discovering-frog.md`; per-dimension owning checks:")
w("`docs/quality-model.md`.")
w("")
w(f"**Generated:** {reg.get('generatedAt','')} · **backfill baseline:** `{reg.get('backfillBaseline','')}` · "
  f"**surfaces:** {len(surfaces)} · **dimensions:** {len(dims)}")
w("")
n_due = sum(1 for s in surfaces if status_of(s) == "DUE")
n_bump = sum(1 for s in surfaces if status_of(s) == "BUMPED")
n_lock = sum(1 for s in surfaces if status_of(s) == "LOCKED")
w(f"**Lifecycle tally:** LOCKED {n_lock} · BUMPED {n_bump} · DUE {n_due}")
w("")
w("## Global due axes (apply to EVERY surface)")
w("")
for a in gda:
    w(f"- **{a['axis']}** — {a['note']}")
w("")
w("## Surfaces")
w("")
w("| Surface | Routes | Status | Gen | audited@ | locked@ | Pins | Persona-differs | Due axes |")
w("|---|---|---|---|---|---|---|---|---|")
def cell(x):
    return (x or "").replace("|", "\\|").replace("\n", " ")
for s in surfaces:
    st = status_of(s)
    routes = ", ".join(f"`{r}`" for r in s.get("routes", []))
    pd = s.get("personaDiffers")
    pd_txt = "; ".join(f"{k}: {v}" for k, v in pd.items()) if pd else "—"
    due_txt = "; ".join(s.get("dueAxes", [])) or "—"
    pins = s.get("pins", [])
    pins_txt = str(len(pins)) if pins else "0"
    w("| {name} | {routes} | {st} | {gen} | {aud} | {lck} | {pins} | {pd} | {due} |".format(
        name=cell(s.get("name", s["id"])),
        routes=cell(routes),
        st=st,
        gen=s.get("generation", 1),
        aud=("`%s`" % s["auditedAt"]) if s.get("auditedAt") else "—",
        lck=("`%s`" % s["lockedAt"]) if s.get("lockedAt") not in (None, "null") else "—",
        pins=pins_txt,
        pd=cell(pd_txt),
        due=cell(due_txt),
    ))
w("")
w("## DUE — surfaces owing their first (or a re-opened) generation battery")
w("")
for s in surfaces:
    if status_of(s) in ("DUE", "BUMPED"):
        tag = "BUMPED" if status_of(s) == "BUMPED" else "DUE"
        w(f"- **{s.get('name', s['id'])}** [`{s['id']}`] — {tag}: " + ("; ".join(s.get("dueAxes", [])) or "owes battery"))
w("")
w("## Cross-cutting dimensions (not surfaces — full-matrix audits of record)")
w("")
w("| Dimension | audited@ | Ledger | Outstanding |")
w("|---|---|---|---|")
for d in dims:
    w("| {name} | {aud} | `{led}` | {due} |".format(
        name=cell(d.get("name", d["id"])),
        aud=("`%s`" % d["auditedAt"]) if d.get("auditedAt") else "—",
        led=d.get("ledger", ""),
        due=cell("; ".join(d.get("dueAxes", [])) or "—"),
    ))
w("")
w("## Backfill provenance")
w("")
w(reg.get("backfillNote", ""))
w("")
w("*Per-surface findings link to `docs/plans/2026-07-23-census-sweep-r2.md` and the money/")
w("kitchen/cafe lanes. The staleness signal is computed, never remembered:")
w("`bash scripts/audit-staleness.sh`.*")
w("")

with open(out_path, "w") as f:
    f.write("\n".join(L))
print(f"rendered {out_path} ({len(surfaces)} surfaces, {len(dims)} dimensions)")
PY
}

mutate() {
  # $1 = surface id, $2 = python snippet operating on variable `s` (the surface dict)
  local sid="$1"; local snippet="$2"
  python3 - "$REG" "$sid" <<PY
import json, sys
reg_path, sid = sys.argv[1], sys.argv[2]
with open(reg_path) as f:
    reg = json.load(f)
found = None
for s in reg["surfaces"]:
    if s["id"] == sid:
        found = s
        break
if found is None:
    sys.stderr.write("ERROR: no surface with id '%s'\n" % sid)
    sys.exit(3)
s = found
${snippet}
with open(reg_path, "w") as f:
    json.dump(reg, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("mutated surface '%s'" % sid)
PY
}

case "$CMD" in
  status)
    sid="${2:-}"
    python3 - "$REG" "$sid" <<'PY'
import json, sys
reg = json.load(open(sys.argv[1]))
sid = sys.argv[2]
def st(s):
    if s.get("lockedAt") in (None, "null"): return "DUE"
    return "BUMPED" if s.get("bumped") else "LOCKED"
rows = [s for s in reg["surfaces"] if (not sid or s["id"] == sid)]
if sid and not rows:
    sys.stderr.write("no surface '%s'\n" % sid); sys.exit(3)
for s in rows:
    print(f"[{st(s):6}] {s['id']:24} gen{s.get('generation',1)}  "
          f"audited@{s.get('auditedAt') or '-'}  locked@{s.get('lockedAt') or '-'}  "
          f"pins={len(s.get('pins',[]))}")
    for a in s.get("dueAxes", []):
        print(f"           due: {a}")
PY
    ;;
  bump)
    sid="${2:?usage: audit-register.sh bump <surface-id>}"
    mutate "$sid" 's["generation"] = int(s.get("generation",1)) + 1
s["bumped"] = True
s["due"] = True'
    render
    echo "BUMPED '$sid' — generation opened. Run the gen battery, then: audit-register.sh lock $sid <commit>"
    ;;
  lock)
    sid="${2:?usage: audit-register.sh lock <surface-id> [commit] [ratifiedBy]}"
    commit="${3:-HEAD}"
    commit="$(git rev-parse --short "$commit")"
    ratifier="${4:-Director}"
    RATIFIER="$ratifier" COMMIT="$commit" mutate "$sid" 'import os
c = os.environ["COMMIT"]; r = os.environ["RATIFIER"]
s["lockedAt"] = c
if not s.get("auditedAt"):
    s["auditedAt"] = c
s["ratifiedBy"] = r
s["bumped"] = False
s["due"] = False
# A lock resolves the "never audited / owes its (re-)battery" markers; genuine
# remaining-axis DUEs (persona / dimension / state gaps) persist and are kept.
s["dueAxes"] = [a for a in s.get("dueAxes", [])
                if "NEVER AUDITED" not in a
                and "owes" not in a.lower()
                and "IN FLIGHT" not in a]'
    render
    echo "LOCKED '$sid' @ $commit (ratifiedBy=$ratifier)."
    ;;
  render)
    render
    ;;
  ""|-h|--help|help)
    sed -n '2,26p' "$0"
    ;;
  *)
    echo "unknown command: $CMD (use status|bump|lock|render)" >&2
    exit 2
    ;;
esac
