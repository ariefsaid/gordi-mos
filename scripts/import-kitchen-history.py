#!/usr/bin/env python3
"""Kitchen-app history import (issue #349, ruling OD-WAY-57).

Copies the incumbent kitchen app's machine records — the two captured streams' plans
and logs — from a Teable-shaped JSON export into ops.kitchen_plans / ops.kitchen_logs
on the squashed baseline. History lands APPROVED and final, marked
source='teable_import', with its ERP posting history (posted_to_esb, esb_doc_num,
posted_at) carried verbatim — and it is NEVER re-enqueued: nothing this tool emits
writes integrations.esb_push, and the sole enqueuer (ops.approve_kitchen_log) refuses
anything not Submitted (P0003), so an imported row can never reach the outbox at any
layer. There is no paper transcription here: only the machine records move.

Resolution rules (the ruling's "keyed by ERP identifier, never by name"):
  * items resolve through the canonical catalog by esb_bom_id (fallback
    esb_product_detail_id_porsi), org-scoped, requiring EXACTLY ONE match — zero or
    ambiguous rows are REPORTED, never guessed;
  * branches resolve in SQL by shared.branches.code (rumah_rames / radiant); the
    incumbent's labels map structurally (DD-WAY-13: labels are presentation):
    Production → produce; "Transfer to Bungur"/"Transfer to RRS" → transfer to
    rumah_rames (the no-op); "Transfer to Radiant"/"Transfer to GGS" → radiant;
  * people columns (submitted_by / reviewed_by / plan_by) land NULL — people carry
    no ERP identifier and name-matching is what the ruling forbids (AC-011);
  * batch_id lands NULL on every imported log — Teable's shared batch ids cannot
    fit the unique (org_id, batch_id); the import never posts, so it mints nothing.

Usage:
  python3 scripts/import-kitchen-history.py \\
      --wip wip.json --logs logs.json --plans plans.json \\
      --db-url postgresql://postgres:postgres@127.0.0.1:44322/postgres
  --dry-run prints the exact SQL that would run (no database contact; the same text
  is what a real run sends to psql, so there is zero drift between the two).

Export shape: re-dump the old app's tables via its Teable API (GET
/api/table/<tid>/record pages, concatenating each table's records arrays). Each
file is either a bare JSON array or {"records": [...]}; each record is
{"id": ..., "createdTime"?: ISO, "fields": {...}}.

OWNER GATE: running against staging/production is a Director/owner-gated operation
outside this tool's default posture — it refuses any non-local database URL unless
--allow-remote is passed explicitly. Real environment coordinates never belong in
this file or its test (public repo; the self-test uses db.example.invalid).

Exit codes: 0 clean · 2 usage/guard/export errors (nothing loaded) · 3 rows skipped
or unresolved (unless --allow-unresolved).

Python 3 stdlib only — precedent: scripts/reporting_snapshot.py.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

JAKARTA = ZoneInfo("Asia/Jakarta")
# Deterministic PKs: uuid5 of the Teable record id, so re-running the same export is
# a strict no-op (ON CONFLICT DO NOTHING below does the rest).
NS = uuid.uuid5(uuid.NAMESPACE_URL, "https://ops.gordi.id/mos#kitchen-history-import")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

# The incumbent's three labels + two legacy aliases (the old app's normalize_action_type),
# mapped to the stored model: (action, destination branch code). 'Transfer to Bungur' is the
# no-op (destination = origin Rumah Rames); Bungur/RRS and Radiant/GGS are the same branches
# under old names. Anything else is reported, never guessed.
ACTION_MAP = {
    "Production": ("produce", None),
    "Transfer to Bungur": ("transfer", "rumah_rames"),
    "Transfer to Radiant": ("transfer", "radiant"),
    "Transfer to RRS": ("transfer", "rumah_rames"),
    "Transfer to GGS": ("transfer", "radiant"),
}


def die(msg: str, code: int = 2) -> None:
    print(f"import-kitchen-history: {msg}", file=sys.stderr)
    sys.exit(code)


# ── export loading ────────────────────────────────────────────────────────────────────────────

def load_records(path: str, kind: str) -> list[dict]:
    try:
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
    except FileNotFoundError:
        die(f"--{kind} file not found: {path}")
    except json.JSONDecodeError as exc:
        die(f"--{kind} file is not valid JSON ({path}): {exc}")
    records = doc if isinstance(doc, list) else doc.get("records") if isinstance(doc, dict) else None
    if not isinstance(records, list):
        die(f"--{kind} file must be a JSON array or an object with a 'records' array ({path})")
    return records


# ── field extraction ──────────────────────────────────────────────────────────────────────────

class ParseSkip(Exception):
    """A record that cannot be carried faithfully — reported, never guessed."""


def _fromiso(raw: object) -> datetime | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    s = raw.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


# The old app's iso_to_jakarta_date, verbatim in spirit: Teable stores midnight-Jakarta
# as ~17:00Z on the prior day, so the calendar date is recovered in Asia/Jakarta.
def iso_to_jakarta_date(raw: object) -> str | None:
    dt = _fromiso(raw)
    return dt.astimezone(JAKARTA).date().isoformat() if dt else None


def iso_ts(raw: object) -> str | None:
    dt = _fromiso(raw)
    return dt.isoformat() if dt else None


def wip_link_id(raw: object) -> str | None:
    if isinstance(raw, dict) and isinstance(raw.get("id"), str):
        return raw["id"]
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                return item["id"]
        return None
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return None


def as_text(raw: object) -> str | None:
    if raw is None:
        return None
    return raw if isinstance(raw, str) else str(raw)


# ── record parsing ────────────────────────────────────────────────────────────────────────────

def parse_common(rec: object, kind: str, wip_index: dict[str, dict | None]) -> tuple[str, str | None, str, str, str | None, str]:
    """(src_id, created_at, log_date, action, dest_code, wip_link_id) for a log-or-plan record."""
    if not isinstance(rec, dict) or not isinstance(rec.get("id"), str) or not isinstance(rec.get("fields"), dict):
        raise ParseSkip("malformed record (no id or fields)")
    src_id = rec["id"]
    fields = rec["fields"]

    log_date = iso_to_jakarta_date(fields.get("date"))
    if log_date is None:
        raise ParseSkip(f"missing or unparseable date: {fields.get('date')!r}")

    label = as_text(fields.get("action_type"))
    if label not in ACTION_MAP:
        raise ParseSkip(f"unknown action_type '{label}'")
    action, dest_code = ACTION_MAP[label]

    link = wip_link_id(fields.get("wip_item"))
    wip = wip_index.get(link)
    if wip is None:
        raise ParseSkip(f"wip link {link!r} not present in the wip export")

    return src_id, iso_ts(rec.get("createdTime")), log_date, action, dest_code, link


def esb_keys(fields: dict, wip_index: dict[str, dict | None]) -> tuple[str | None, str | None]:
    wip = wip_index.get(wip_link_id(fields.get("wip_item")))
    if wip is None:
        return None, None
    # pd_porsi only when bom is null — bom is the primary ERP identifier.
    bom = wip.get("esb_bom_id")
    return bom, None if bom else wip.get("esb_product_detail_id_porsi")


def parse_log(rec: object, wip_index: dict[str, dict | None]) -> dict:
    src_id, created_at, log_date, action, dest_code, link = parse_common(rec, "log", wip_index)
    fields = rec["fields"]
    qty = fields.get("qty_porsi")
    if isinstance(qty, bool) or not isinstance(qty, (int, float)) or qty <= 0:
        raise ParseSkip(f"invalid qty_porsi: {qty!r}")
    posted_raw = fields.get("posted_to_esb")
    if isinstance(posted_raw, bool):
        posted = posted_raw
    elif isinstance(posted_raw, str):
        posted = posted_raw.strip().lower() == "true"
    else:
        posted = False
    bom, porsi = esb_keys(fields, wip_index)
    return {
        "kind": "log", "src_id": src_id, "det_id": str(uuid.uuid5(NS, f"kitchen_log:{src_id}")),
        "log_date": log_date, "wip_link_id": link, "action": action, "dest_code": dest_code,
        "esb_bom_id": bom, "esb_pd_porsi": porsi,
        "qty": qty, "notes": as_text(fields.get("notes")),
        "reviewed_at": iso_ts(fields.get("reviewed_at")),
        "posted_to_esb": posted, "esb_doc_num": as_text(fields.get("esb_doc_num")),
        "posted_at": iso_ts(fields.get("posted_at")), "created_at": created_at,
        # source status/submitted_by/reviewed_by/batch_id are deliberately NOT carried:
        # imported rows land Approved, unattributed (AC-011) and batch-null.
    }


def parse_plan(rec: object, wip_index: dict[str, dict | None]) -> dict:
    src_id, created_at, log_date, action, dest_code, link = parse_common(rec, "plan", wip_index)
    fields = rec["fields"]
    qty = fields.get("planned_qty")
    if isinstance(qty, bool) or not isinstance(qty, (int, float)) or qty < 0:
        raise ParseSkip(f"invalid planned_qty: {qty!r}")
    bom, porsi = esb_keys(fields, wip_index)
    return {
        "kind": "plan", "src_id": src_id, "det_id": str(uuid.uuid5(NS, f"kitchen_plan:{src_id}")),
        "log_date": log_date, "wip_link_id": link, "action": action, "dest_code": dest_code,
        "esb_bom_id": bom, "esb_pd_porsi": porsi, "qty": qty,
        "notes": as_text(fields.get("notes")), "reviewed_at": None,
        "posted_to_esb": None, "esb_doc_num": None, "posted_at": None,
        "created_at": created_at,
    }


def wip_link(fields: dict, wip_index: dict[str, dict | None]) -> dict | None:
    return wip_index.get(wip_link_id(fields.get("wip_item")))


def build_wip_index(records: list[dict]) -> tuple[dict[str, dict | None], list[tuple[str, str, str]]]:
    index: dict[str, dict | None] = {}
    skips: list[tuple[str, str, str]] = []
    for rec in records:
        if not isinstance(rec, dict) or not isinstance(rec.get("id"), str) or not isinstance(rec.get("fields"), dict):
            skips.append(("<no-id>", "wip", "malformed record (no id or fields)"))
            continue
        fields = rec["fields"]
        index[rec["id"]] = {"esb_bom_id": as_text(fields.get("esb_bom_id")),
                            "esb_product_detail_id_porsi": as_text(fields.get("esb_product_detail_id_porsi"))}
    return index, skips


# ── row assembly: per-file src_id dedupe, then the plans natural-key supersede ─────────────────

def collect(records: list[dict], kind: str, wip_index: dict[str, dict | None]):
    rows: list[dict] = []
    skips: list[tuple[str, str, str]] = []
    seen: set[str] = set()
    for rec in records:
        try:
            row = parse_log(rec, wip_index) if kind == "log" else parse_plan(rec, wip_index)
        except ParseSkip as exc:
            src = rec.get("id") if isinstance(rec, dict) else None
            skips.append((src if isinstance(src, str) else "<no-id>", kind, str(exc)))
            continue
        if row["src_id"] in seen:
            skips.append((row["src_id"], kind, "duplicate_src_id"))
            continue
        seen.add(row["src_id"])
        rows.append(row)
    return rows, skips


def supersede_plans(rows: list[dict]) -> tuple[list[dict], list[tuple[str, str, str]]]:
    # Teable's plan upserts left same-key rows; the prior import dropped them the same
    # way — keep the newest createdTime (ties: greatest src_id), report the losers.
    groups: dict[tuple, list[dict]] = {}
    for row in rows:
        key = (row["log_date"], row["wip_link_id"], row["action"], row["dest_code"])
        groups.setdefault(key, []).append(row)
    kept: list[dict] = []
    skips: list[tuple[str, str, str]] = []
    for group in groups.values():
        group.sort(key=lambda r: (r["created_at"] or "", r["src_id"]))
        kept.append(group[-1])
        skips.extend((r["src_id"], "plan", "superseded_duplicate") for r in group[:-1])
    return kept, skips


# ── SQL generation (this exact text is both --dry-run output and the psql -f input) ────────────

def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def build_sql(rows: list[dict], org_slug: str, bu_code: str) -> str:
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    if "$json$" in payload:
        # A note containing the dollar-quote tag would end the literal early — refuse
        # rather than load a truncated payload.
        die("export contains the literal '$json$' (dollar-quote collision) — inspect the notes fields")
    return f"""\\set ON_ERROR_STOP on
begin;
-- environment: resolve org by slug, BU by stable code, the two stream branches by code.
-- Exactly-one is enforced below; a short count means the canonical catalog is not loaded.
create temp table _imp_env on commit drop as
select o.id as org_id, bu.id as bu_id, rr.id as br_rr, rad.id as br_rad
  from shared.orgs o
  join shared.business_units bu on bu.org_id = o.id and bu.code = {sql_literal(bu_code)}
  join shared.branches rr  on rr.org_id  = o.id and rr.code  = 'rumah_rames'
  join shared.branches rad on rad.org_id = o.id and rad.code = 'radiant'
 where o.slug = {sql_literal(org_slug)};
do $$
begin
  if (select count(*) from _imp_env) <> 1 then
    raise exception 'kitchen history import: environment resolution failed — expected exactly one org={org_slug} BU={bu_code} branch rumah_rames+radiant; is the canonical catalog loaded?';
  end if;
end $$;

create temp table _imp_payload on commit drop as
select * from jsonb_to_recordset($json$
{payload}
$json$) as (kind text, src_id text, det_id uuid, log_date date, wip_link_id text, action text,
  dest_code text, esb_bom_id text, esb_pd_porsi text, qty numeric, notes text,
  reviewed_at timestamptz, posted_to_esb boolean, esb_doc_num text,
  posted_at timestamptz, created_at timestamptz);

-- item resolution through the canonical catalog, keyed by ERP identifier, never by name.
-- n_matches = 0 → not in catalog; > 1 → ambiguous (no unique index on esb_bom_id). Both are
-- reported below and never loaded. flag_active is deliberately not filtered: history may name a
-- retired item, and the catalog never hard-deletes.
create temp table _imp_resolved on commit drop as
select p.*, w.id as wip_item_id,
       count(w.id) over (partition by p.kind, p.src_id)::int as n_matches
  from _imp_payload p
  left join ops.wip_items w
    on w.org_id = (select org_id from _imp_env)
   and (    p.esb_bom_id  is not null and p.esb_bom_id  = w.esb_bom_id
       or (p.esb_bom_id is null and p.esb_pd_porsi is not null
           and p.esb_pd_porsi = w.esb_product_detail_id_porsi));

-- the load. Status is ALWAYS Approved (final — never Submitted), submitted_by/reviewed_by/plan_by
-- and batch_id are NULL (AC-011 + the prior owner call), posting history verbatim. ON CONFLICT DO
-- NOTHING (no target) makes the deterministic-PK re-run and any natural-key supersede a no-op.
-- NOTE WHAT IS ABSENT: nothing in this file writes the outbox. The sole creator of outbox rows
-- is ops.approve_kitchen_log, which refuses anything not Submitted (P0003) — so imported history
-- (landed Approved) can never reach it. Statically pinned by the self-test's regex.
with ins_logs as (
  insert into ops.kitchen_logs
    (id, org_id, business_unit_id, log_date, branch_id, activity, action,
     destination_branch_id, wip_item_id, qty_porsi, notes, status, source,
     submitted_by, reviewed_by, reviewed_at, batch_id, posted_to_esb, esb_doc_num,
     posted_at, created_at)
  select r.det_id, e.org_id, e.bu_id, r.log_date, e.br_rr, 'kitchen', r.action,
         case r.dest_code when 'radiant' then e.br_rad when 'rumah_rames' then e.br_rr end,
         r.wip_item_id, r.qty, r.notes, 'Approved', 'teable_import',
         null, null, r.reviewed_at, null, coalesce(r.posted_to_esb, false),
         r.esb_doc_num, r.posted_at, coalesce(r.created_at, now())
    from _imp_resolved r, _imp_env e
   where r.kind = 'log' and r.n_matches = 1
  on conflict do nothing
  returning 1
), ins_plans as (
  insert into ops.kitchen_plans
    (id, org_id, log_date, wip_item_id, branch_id, activity, action,
     destination_branch_id, qty_porsi, notes, source, plan_by, created_at)
  select r.det_id, e.org_id, r.log_date, r.wip_item_id, e.br_rr, 'kitchen', r.action,
         case r.dest_code when 'radiant' then e.br_rad when 'rumah_rames' then e.br_rr end,
         r.qty, r.notes, 'teable_import', null, coalesce(r.created_at, now())
    from _imp_resolved r, _imp_env e
   where r.kind = 'plan' and r.n_matches = 1
  on conflict do nothing
  returning 1
)
select jsonb_build_object(
  'logs_loaded',   (select count(*) from ins_logs),
  'plans_loaded',  (select count(*) from ins_plans),
  'unresolved', coalesce((select jsonb_agg(jsonb_build_object(
      'src_id', src_id, 'kind', kind,
      'reason', case when n_matches = 0 then 'wip_item_not_in_catalog'
                     else 'wip_item_ambiguous' end)
    order by src_id) from _imp_resolved where n_matches <> 1), '[]'::jsonb));
commit;
"""


# ── the localhost guard (fail-closed; the seeds' guard pattern at the URL layer) ───────────────

def guard_db_url(url: str, allow_remote: bool) -> None:
    try:
        parts = urlsplit(url)
        host = (parts.hostname or "").strip("[]")
        port = parts.port or 5432
    except ValueError:
        die("refusing non-local database URL: malformed URL — pass a valid postgresql:// URL")
    if parts.scheme not in ("postgresql", "postgres"):
        die(f"refusing non-local database URL: {parts.scheme or '<none>'}://{host or '??'}:… — "
            "only postgresql:// URLs are supported")
    if host in LOCAL_HOSTS:
        return
    if not allow_remote:
        # host only, never credentials
        die(f"refusing non-local database URL: {parts.scheme}://{host}:{port}/… — "
            "this import is owner-gated for anything beyond localhost; pass --allow-remote to override")
    print("WARNING: --allow-remote set — running against a NON-LOCAL database. "
          "This is the owner-gated path; history lands final and is never re-enqueued.",
          file=sys.stderr)


# ── main ──────────────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="import-kitchen-history.py",
        description="Import the old kitchen app's Teable history into ops.kitchen_plans / ops.kitchen_logs (#349).")
    parser.add_argument("--wip", required=True, help="wip items export (JSON)")
    parser.add_argument("--logs", required=True, help="kitchen logs export (JSON)")
    parser.add_argument("--plans", required=True, help="kitchen plans export (JSON)")
    parser.add_argument("--db-url", help="target database URL (fallback env KITCHEN_IMPORT_DB_URL)")
    parser.add_argument("--org-slug", default="gordi", help="org slug in shared.orgs (default gordi)")
    parser.add_argument("--bu-code", default="retail_ops", help="business unit code (default retail_ops)")
    parser.add_argument("--allow-remote", action="store_true",
                        help="override the localhost-only guard (the owner-gated staging/prod run)")
    parser.add_argument("--allow-unresolved", action="store_true",
                        help="exit 0 even when rows were skipped or unresolved")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the generated SQL to stdout; no database contact")
    args = parser.parse_args()

    db_url = args.db_url or os.environ.get("KITCHEN_IMPORT_DB_URL", "")
    if not db_url and not args.dry_run:
        die("--db-url (or env KITCHEN_IMPORT_DB_URL) is required for a real run")
    if db_url:
        guard_db_url(db_url, args.allow_remote)

    wip_records = load_records(args.wip, "wip")
    log_records = load_records(args.logs, "logs")
    plan_records = load_records(args.plans, "plans")

    wip_index, wip_skips = build_wip_index(wip_records)
    log_rows, log_skips = collect(log_records, "log", wip_index)
    plan_rows, plan_skips = collect(plan_records, "plan", wip_index)
    plan_rows, superseded = supersede_plans(plan_rows)

    rows = log_rows + plan_rows
    skips = wip_skips + log_skips + plan_skips + superseded
    for src_id, kind, reason in skips:
        print(f"SKIP {src_id} ({kind}): {reason}", file=sys.stderr)

    sql = build_sql(rows, args.org_slug, args.bu_code)
    print(f"REPORT: {len(skips)} parse-skipped, {len(rows)} rows emitted", file=sys.stderr)

    if args.dry_run:
        sys.stdout.write(sql)
        report = None
    else:
        report = run_load(sql, db_url)

    unresolved = 0
    if report is not None:
        unresolved = len(report.get("unresolved", []))
        for item in report.get("unresolved", []):
            print(f"UNRESOLVED {item['src_id']} ({item['kind']}): {item['reason']}", file=sys.stderr)
        print(f"REPORT: logs_loaded={report['logs_loaded']} "
              f"plans_loaded={report['plans_loaded']} unresolved={unresolved}", file=sys.stderr)

    if (skips or unresolved) and not args.allow_unresolved:
        sys.exit(3)
    sys.exit(0)


def run_load(sql: str, db_url: str) -> dict:
    with tempfile.NamedTemporaryFile("w", suffix=".sql", encoding="utf-8", delete=False) as fh:
        fh.write(sql)
        path = fh.name
    try:
        # -q and the unaligned/tuples-only print flags only make the final JSON line
        # parseable; the SQL sent is byte-identical to the --dry-run output.
        proc = subprocess.run(
            ["psql", db_url, "-q", "-v", "ON_ERROR_STOP=1",
             "-P", "format=unaligned", "-P", "tuples_only=on", "-f", path],
            capture_output=True, text=True)
    except FileNotFoundError:
        die("psql not found on PATH — the import loads through psql")
    finally:
        os.unlink(path)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr)
        sys.stderr.write(proc.stdout)
        die(f"psql failed with exit code {proc.returncode} — the transaction rolled back, nothing was loaded")
    for line in proc.stdout.splitlines():
        if line.startswith("{"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                die(f"could not parse the load report from psql output: {line[:200]!r}")
    die("psql produced no load report — did the SQL file change shape?")


if __name__ == "__main__":
    main()
