#!/usr/bin/env python3
"""Café item settings from recent ERP usage (OD-2026-10-09-REAL-ORG-USAGE-SEED, follows #1561).

Marks each item a Café stream actually used in the last 30 complete Jakarta dates Active, gives it
the ERP unit it was used in most as its default (shown first, as the setting guard requires), and
copies the item's catalog kind into the stream setting when the setting has none. Only settings
rows nobody has touched are written: a missing row, or an existing row with updated_at=created_at,
inactive, no default, no kind, no MOS name, no multiples and no shown units. Any other row is
skipped and counted, so manager choices are never changed. Nothing is ever deactivated.

"Used" means an ERP stock movement on a mapped branch whose product sits in an Inventory
BAR/KITCHEN subcategory (the subcategory is the activity): POS Sales with qty_out > 0, or Simple
Manufacturing / Simple Transfer with qty_in or qty_out > 0. Receipts, journals and stock counts
are not usage. The default unit is the product detail with the most movement rows (then the latest
date, then the lowest detail id); it must match exactly one active unit of the same item, else the
item is activated without a default and reported. Units are matched by ERP id, never by name.

Every row a run writes is identifiable without a schema change:
  * a new settings row's id is md5('mos-cafe-usage-seed:<label>:<org>:<branch>:<activity>:<item>');
  * a shown-unit row's id is md5('mos-cafe-usage-seed:<label>:shown:<setting>:<unit>');
  * an existing untouched row the run updated is listed in the run report (updated_existing),
    which a real run saves to --manifest; its before-image is the untouched baseline by definition.
--rollback emits the reversal for one label: it deletes the label's rows and resets the listed
existing rows, but only rows still exactly as the run left them (same write time, no later edit).

Inputs, all at run time (no real data or coordinates live in this file):
  --usage FILE           JSON lines or array from the ERP usage query, or
  --erp-query-cmd CMD    a read-only command that takes the SQL as its last argument and prints
                         JSON lines (e.g. the warehouse replica's SELECT-only wrapper);
  --esb-code / --branch-map   the ERP company code and ERP branch id → MOS branch code pairs.
--print-usage-sql prints the ERP query; --dry-run prints the exact MOS SQL a run sends to psql.

The target is refused unless it is localhost, or --allow-remote is passed (owner-gated).
Exit codes: 0 done · 2 usage/guard/input error (nothing written) · 3 psql failed (rolled back).
Python 3 stdlib only — same shape as scripts/import-kitchen-history.py.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta
from urllib.parse import unquote, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

JAKARTA = ZoneInfo("Asia/Jakarta")
WINDOW_DAYS = 30
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
LABEL_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
CODE_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")


def die(msg: str, code: int = 2) -> None:
    print(f"seed-cafe-usage-settings: {msg}", file=sys.stderr)
    sys.exit(code)


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


# ── window and inputs ─────────────────────────────────────────────────────────────────────────

def usage_window(as_of: date) -> tuple[date, date]:
    """[start, end): the 30 complete Jakarta dates before as_of (as_of itself is partial)."""
    return as_of - timedelta(days=WINDOW_DAYS), as_of


def parse_branch_map(raw: str) -> dict[int, str]:
    mapping: dict[int, str] = {}
    for pair in filter(None, (p.strip() for p in raw.split(","))):
        erp_id, sep, code = pair.partition("=")
        if not sep or not erp_id.strip().isdigit() or not CODE_RE.match(code.strip()):
            die(f"--branch-map entry {pair!r} must look like <erp branch id>=<MOS branch code>")
        if int(erp_id) in mapping:
            die(f"--branch-map names ERP branch {erp_id} twice")
        mapping[int(erp_id)] = code.strip()
    if not mapping:
        die("--branch-map needs at least one <erp branch id>=<MOS branch code> pair")
    if len(set(mapping.values())) != len(mapping):
        die("--branch-map maps two ERP branches to one MOS branch")
    return mapping


def build_usage_sql(esb_code: str, branch_ids: list[int], start: date, end: date) -> str:
    # Uppercase leading SELECT and no mutating keywords: the replica's SELECT-only wrapper accepts it.
    ids = ",".join(str(i) for i in sorted(branch_ids))
    return f"""SELECT row_to_json(u) FROM (
  SELECT sm.branch_id AS branch_erp_id, lower(p.sub_category_name) AS activity,
         pd.product_id::text AS erp_product_id, sm.product_detail_id::text AS erp_detail_id,
         count(*) AS use_count, max(sm.document_date)::text AS last_used
    FROM public.stock_movement sm
    JOIN public.dim_product_details pd
      ON pd.esb_code = sm.esb_code AND pd.product_detail_id = sm.product_detail_id
    JOIN public.dim_products p
      ON p.esb_code = pd.esb_code AND p.product_id = pd.product_id
   WHERE sm.esb_code = {sql_literal(esb_code)}
     AND sm.branch_id IN ({ids})
     AND sm.document_date >= date '{start.isoformat()}'
     AND sm.document_date < date '{end.isoformat()}'
     AND p.category_type_name = 'Inventory'
     AND lower(p.sub_category_name) IN ('bar','kitchen')
     AND ((sm.transaction_type = 'POS Sales' AND sm.qty_out > 0)
       OR (sm.transaction_type IN ('Simple Manufacturing','Simple Transfer')
           AND (sm.qty_in > 0 OR sm.qty_out > 0)))
   GROUP BY 1,2,3,4
) u;
"""


def parse_usage(text: str, branch_map: dict[int, str], start: date, end: date) -> list[dict]:
    stripped = text.strip()
    if stripped.startswith("["):
        try:
            raw_rows = json.loads(stripped)
        except json.JSONDecodeError as exc:
            die(f"usage input is not valid JSON: {exc}")
    else:
        raw_rows = []
        for line in stripped.splitlines():
            line = line.strip()
            if line.startswith("{"):
                try:
                    raw_rows.append(json.loads(line))
                except json.JSONDecodeError as exc:
                    die(f"usage line is not valid JSON: {exc}")
    rows: list[dict] = []
    seen: set[tuple] = set()
    for row in raw_rows:
        try:
            branch = int(row["branch_erp_id"])
            activity = str(row["activity"])
            product = str(row["erp_product_id"])
            detail = str(row["erp_detail_id"])
            count = int(row["use_count"])
            last_used = date.fromisoformat(str(row["last_used"])[:10])
        except (KeyError, TypeError, ValueError) as exc:
            die(f"usage row is malformed ({exc}): {str(row)[:200]}")
        if branch not in branch_map:
            die(f"usage row names ERP branch {branch}, which --branch-map does not map")
        if activity not in ("bar", "kitchen"):
            die(f"usage row has activity {activity!r}; only bar and kitchen are Café streams")
        if not (product.isdigit() and detail.isdigit()) or count <= 0:
            die(f"usage row needs numeric product/detail ids and a positive count: {str(row)[:200]}")
        if not (start <= last_used < end):
            die(f"usage row last_used {last_used} is outside the window {start}..{end}")
        key = (branch, activity, product, detail)
        if key in seen:
            die(f"usage row repeats {key}; the query groups by these columns")
        seen.add(key)
        rows.append({"branch_erp_id": branch, "activity": activity, "erp_product_id": product,
                     "erp_detail_id": detail, "use_count": count, "last_used": last_used.isoformat()})
    if not rows:
        die("usage input has no rows — wrong window, code or branch map?")
    return rows


# ── MOS SQL (this exact text is both --dry-run output and the psql -f input) ──────────────────

SETTING_ID = ("md5('mos-cafe-usage-seed:' || {label} || ':' || {org} || ':' || {branch}"
              " || ':' || {activity} || ':' || {item})::uuid")
SHOWN_ID = "md5('mos-cafe-usage-seed:' || {label} || ':shown:' || {setting} || ':' || {unit})::uuid"


def build_seed_sql(rows: list[dict], branch_map: dict[int, str], org_slug: str, label: str,
                   start: date, end: date, commit: bool) -> str:
    payload = json.dumps(rows, separators=(",", ":"))
    mapping = json.dumps([{"branch_erp_id": k, "code": v} for k, v in sorted(branch_map.items())],
                         separators=(",", ":"))
    lab = sql_literal(label)
    new_id = SETTING_ID.format(label=lab, org="c.org_id", branch="c.branch_id",
                               activity="c.activity", item="c.wip_item_id")
    shown_id = SHOWN_ID.format(label=lab, setting="t.setting_id", unit="t.default_unit_id")
    return f"""\\set ON_ERROR_STOP on
begin;
set local lock_timeout = '10s';
-- Freeze catalog, stream lists and settings so eligibility and writes see one state.
lock table shared.orgs, shared.branches, ops.wip_items, ops.item_units, ops.stream_items,
           ops.cafe_item_settings, ops.cafe_item_setting_units in share row exclusive mode;

create temp table _seed_org on commit drop as
select id as org_id from shared.orgs where slug = {sql_literal(org_slug)} and not shared.is_sample_org(id);
create temp table _seed_map on commit drop as
select m.branch_erp_id, b.id as branch_id, m.code
  from jsonb_to_recordset($json${mapping}$json$) as m(branch_erp_id int, code text)
  left join shared.branches b
    on b.org_id = (select org_id from _seed_org) and b.code = m.code and b.archived_at is null;
do $$
begin
  if (select count(*) from _seed_org) <> 1 then
    raise exception 'usage seed refused: expected exactly one non-sample org with slug {org_slug}';
  end if;
  if exists (select 1 from _seed_map where branch_id is null) then
    raise exception 'usage seed refused: a mapped MOS branch code is missing or archived: %',
      (select string_agg(code, ', ') from _seed_map where branch_id is null);
  end if;
end $$;

create temp table _seed_usage on commit drop as
select * from jsonb_to_recordset($json${payload}$json$)
  as u(branch_erp_id int, activity text, erp_product_id text, erp_detail_id text,
       use_count bigint, last_used date);

-- One winner per stream and product: most movement rows, then latest date, then lowest detail id.
create temp table _seed_used on commit drop as
select m.branch_id, w.activity, w.erp_product_id, w.erp_detail_id, w.use_count
  from (select u.*, row_number() over (
               partition by u.branch_erp_id, u.activity, u.erp_product_id
               order by u.use_count desc, u.last_used desc, u.erp_detail_id::bigint) as rank
          from _seed_usage u) w
  join _seed_map m using (branch_erp_id)
 where w.rank = 1;

-- Every used product with its outcome. An ERP product id held by two active catalog items is
-- ambiguous and skipped rather than guessed.
create temp table _seed_candidates on commit drop as
select u.branch_id, u.activity, u.erp_product_id, u.erp_detail_id,
       (select org_id from _seed_org) as org_id,
       item.id as wip_item_id, item.kind as item_kind, item_count.n as item_matches,
       (stream.wip_item_id is not null and stream.source = 'esb') as on_stream,
       unit_match.n as unit_matches, unit_match.unit_id as default_unit_id
  from _seed_used u
  cross join lateral (
    select count(*)::int as n from ops.wip_items i
     where i.org_id = (select org_id from _seed_org) and i.esb_product_id = u.erp_product_id
       and i.reference_source = 'erp_catalog' and i.flag_active) item_count
  left join ops.wip_items item
    on item_count.n = 1 and item.org_id = (select org_id from _seed_org)
   and item.esb_product_id = u.erp_product_id
   and item.reference_source = 'erp_catalog' and item.flag_active
  left join ops.stream_items stream
    on stream.org_id = item.org_id and stream.wip_item_id = item.id
   and stream.branch_id = u.branch_id and stream.activity = u.activity
  left join lateral (
    select count(*)::int as n, (array_agg(unit.id))[1] as unit_id
      from ops.item_units unit
     where unit.org_id = item.org_id and unit.wip_item_id = item.id
       and unit.esb_product_id = item.esb_product_id
       and unit.esb_product_detail_id = u.erp_detail_id and unit.source_active) unit_match on true;

-- New rows start at the untouched baseline under a run-derived id, then pass the same fence.
create temp table _seed_inserted on commit drop as
with ins as (
  insert into ops.cafe_item_settings (id, org_id, branch_id, activity, wip_item_id, kind, is_active)
  select {new_id}, c.org_id, c.branch_id, c.activity, c.wip_item_id, null, false
    from _seed_candidates c
   where c.on_stream
  on conflict (org_id, branch_id, activity, wip_item_id) do nothing
  returning id
) select id from ins;

-- The untouched fence (the sample seed's rule): anything a person or an earlier run set is skipped.
create temp table _seed_targets on commit drop as
select s.id as setting_id, c.branch_id, c.activity, c.default_unit_id, c.item_kind,
       (s.id in (select id from _seed_inserted)) as is_new
  from _seed_candidates c
  join ops.cafe_item_settings s
    on s.org_id = c.org_id and s.branch_id = c.branch_id
   and s.activity = c.activity and s.wip_item_id = c.wip_item_id
 where c.on_stream
   and s.updated_at = s.created_at
   and s.default_item_unit_id is null and s.kind is null and not s.is_active
   and s.mos_name is null and s.unit_multiples = array[]::numeric[]
   and not exists (select 1 from ops.cafe_item_setting_units shown
                    where shown.org_id = s.org_id and shown.cafe_item_setting_id = s.id);

-- The default must already be shown for the setting guard to accept it.
create temp table _seed_shown on commit drop as
with ins as (
  insert into ops.cafe_item_setting_units (id, org_id, cafe_item_setting_id, item_unit_id)
  select {shown_id}, (select org_id from _seed_org), t.setting_id, t.default_unit_id
    from _seed_targets t
   where t.default_unit_id is not null
  on conflict (cafe_item_setting_id, item_unit_id) do nothing
  returning cafe_item_setting_id
) select cafe_item_setting_id as setting_id from ins;

update ops.cafe_item_settings s
   set is_active = true,
       default_item_unit_id = t.default_unit_id,
       kind = t.item_kind
  from _seed_targets t
 where s.id = t.setting_id;

select jsonb_build_object(
  'label', {lab},
  'window', jsonb_build_object('from', '{start.isoformat()}', 'before', '{end.isoformat()}'),
  'run_at', now(),
  'updated_existing', coalesce((select jsonb_agg(setting_id order by setting_id)
                                  from _seed_targets where not is_new), '[]'::jsonb),
  'streams', coalesce((select jsonb_agg(r order by r.branch, r.activity) from (
    select m.code as branch, c.activity,
           count(*) as used_products,
           count(*) filter (where c.item_matches = 0) as no_catalog_item,
           count(*) filter (where c.item_matches > 1) as ambiguous_catalog_item,
           count(*) filter (where c.item_matches = 1 and not c.on_stream) as not_on_stream,
           count(t.setting_id) as written,
           count(t.setting_id) filter (where t.is_new) as new_rows,
           count(t.setting_id) filter (where not t.is_new) as updated_untouched_rows,
           count(t.setting_id) filter (where t.default_unit_id is not null) as defaults_set,
           count(sh.setting_id) as shown_units_added,
           count(t.setting_id) filter (where t.item_kind is not null) as kinds_set,
           count(t.setting_id) filter (where t.default_unit_id is null) as active_without_unit,
           count(t.setting_id) filter (where t.item_kind is null) as active_without_kind,
           count(*) filter (where c.on_stream and t.setting_id is null
                              and s.updated_at = s.created_at) as skipped_set_earlier,
           count(*) filter (where c.on_stream and t.setting_id is null
                              and s.updated_at > s.created_at) as skipped_edited
      from _seed_candidates c
      join _seed_map m on m.branch_id = c.branch_id
      left join ops.cafe_item_settings s
        on s.org_id = c.org_id and s.branch_id = c.branch_id
       and s.activity = c.activity and s.wip_item_id = c.wip_item_id
      left join _seed_targets t on t.setting_id = s.id
      left join _seed_shown sh on sh.setting_id = s.id
     group by m.code, c.activity) r), '[]'::jsonb));
{'commit' if commit else 'rollback'};
"""


def build_rollback_sql(org_slug: str, label: str, run_at: str, updated_existing: list[str],
                       commit: bool) -> str:
    lab = sql_literal(label)
    marked = SETTING_ID.format(label=lab, org="s.org_id", branch="s.branch_id",
                               activity="s.activity", item="s.wip_item_id")
    shown_marked = SHOWN_ID.format(label=lab, setting="shown.cafe_item_setting_id",
                                   unit="shown.item_unit_id")
    existing = json.dumps(updated_existing)
    return f"""\\set ON_ERROR_STOP on
begin;
set local lock_timeout = '10s';
lock table ops.cafe_item_settings, ops.cafe_item_setting_units in share row exclusive mode;

-- Rows of this run still exactly as it left them: written at run_at, never edited since, no
-- MOS name or multiples, and every shown unit is one this run added. Anything else is kept.
create temp table _undo on commit drop as
select s.id, (s.id = {marked}) as is_new
  from ops.cafe_item_settings s
  join shared.orgs o on o.id = s.org_id and o.slug = {sql_literal(org_slug)}
 where (s.id = {marked} or s.id = any (array(select jsonb_array_elements_text($json${existing}$json$::jsonb)::uuid)))
   and s.updated_at = {sql_literal(run_at)}::timestamptz
   and s.is_active and s.mos_name is null and s.unit_multiples = array[]::numeric[]
   and not exists (select 1 from ops.cafe_item_setting_units shown
                    where shown.cafe_item_setting_id = s.id and shown.id <> {shown_marked});
create temp table _undo_kept on commit drop as
select s.id
  from ops.cafe_item_settings s
  join shared.orgs o on o.id = s.org_id and o.slug = {sql_literal(org_slug)}
 where (s.id = {marked} or s.id = any (array(select jsonb_array_elements_text($json${existing}$json$::jsonb)::uuid)))
   and s.id not in (select id from _undo);

-- Clear the default first: the shown-unit guard refuses to hide a unit that is still the default.
update ops.cafe_item_settings s
   set default_item_unit_id = null, is_active = false, kind = null
  from _undo u where s.id = u.id;
create temp table _undo_shown on commit drop as
with gone as (
  delete from ops.cafe_item_setting_units shown
   where shown.cafe_item_setting_id in (select id from _undo)
     and shown.id = {shown_marked}
  returning 1
) select count(*) as n from gone;
create temp table _undo_dropped on commit drop as
with gone as (
  delete from ops.cafe_item_settings s where s.id in (select id from _undo where is_new) returning 1
) select count(*) as n from gone;
select jsonb_build_object(
  'label', {lab},
  'settings_deleted', (select n from _undo_dropped),
  'settings_reset', (select count(*) from _undo where not is_new),
  'shown_units_deleted', (select n from _undo_shown),
  'kept_edited_since', (select count(*) from _undo_kept));
{'commit' if commit else 'rollback'};
"""


# ── the localhost guard (same rule as scripts/import-kitchen-history.py) ──────────────────────

def guard_db_url(url: str, allow_remote: bool) -> None:
    try:
        parts = urlsplit(url)
        host = (parts.hostname or "").strip("[]")
        port = parts.port or 5432
    except ValueError:
        die("refusing database URL: malformed — pass a valid postgresql:// URL")
    if parts.scheme not in ("postgresql", "postgres"):
        die(f"refusing database URL: only postgresql:// URLs are supported (got {parts.scheme or '<none>'}://)")
    if host in LOCAL_HOSTS:
        return
    if not allow_remote:
        die(f"refusing non-local database URL: {parts.scheme}://{host}:{port}/… — "
            "writing beyond localhost is owner-gated; pass --allow-remote to override")
    print("WARNING: --allow-remote set — writing to a NON-LOCAL database.", file=sys.stderr)


def separate_password(url: str) -> tuple[str, str | None]:
    try:
        parts = urlsplit(url)
        netloc = parts.netloc
        password = None
        if "@" in netloc:
            userinfo, host = netloc.rsplit("@", 1)
            if ":" in userinfo:
                user, encoded = userinfo.split(":", 1)
                password = unquote(encoded)
                netloc = user + "@" + host
        query = []
        for item in parts.query.split("&") if parts.query else []:
            key, separator, value = item.partition("=")
            if unquote(key) == "password":
                password = unquote(value) if separator else ""
            else:
                query.append(item)
        if password is not None and any(c in password for c in "\r\n\0"):
            die("database password contains unsupported characters")
        return urlunsplit((parts.scheme, netloc, parts.path, "&".join(query), parts.fragment)), password
    except ValueError:
        die("refusing database URL: malformed — pass a valid postgresql:// URL")


def run_psql(psql: str, sql: str, db_url: str) -> dict:
    safe_url, password = separate_password(db_url)
    with tempfile.NamedTemporaryFile("w", suffix=".sql", encoding="utf-8", delete=False) as fh:
        fh.write(sql)
        path = fh.name
    credential_path = None
    try:
        env = os.environ.copy()
        if password is not None:
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as credentials:
                credential_path = credentials.name
                escaped = password.replace("\\", "\\\\").replace(":", "\\:")
                credentials.write(f"*:*:*:*:{escaped}\n")
            env.pop("PGPASSWORD", None)
            env["PGPASSFILE"] = credential_path
        proc = subprocess.run([psql, safe_url, "-q", "-X", "-v", "ON_ERROR_STOP=1",
                               "-P", "format=unaligned", "-P", "tuples_only=on", "-f", path],
                              capture_output=True, text=True, env=env)
    except FileNotFoundError:
        die(f"psql not found ({psql}) — pass --psql <path>")
    finally:
        os.unlink(path)
        if credential_path is not None:
            os.unlink(credential_path)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr + proc.stdout)
        die(f"psql failed with exit code {proc.returncode} — the transaction rolled back", 3)
    for line in proc.stdout.splitlines():
        if line.startswith("{"):
            return json.loads(line)
    die("psql produced no report — did the SQL change shape?", 3)


def print_report(report: dict) -> None:
    if "streams" not in report:
        print(json.dumps(report), file=sys.stderr)
        return
    cols = ["used_products", "written", "new_rows", "updated_untouched_rows", "defaults_set",
            "shown_units_added", "kinds_set", "active_without_unit", "active_without_kind",
            "skipped_set_earlier", "skipped_edited", "no_catalog_item", "ambiguous_catalog_item",
            "not_on_stream"]
    print(f"REPORT label={report['label']} window={report['window']['from']}..<{report['window']['before']} "
          f"run_at={report['run_at']}", file=sys.stderr)
    print("stream\t" + "\t".join(cols), file=sys.stderr)
    for row in report["streams"]:
        print(f"{row['branch']}/{row['activity']}\t" + "\t".join(str(row[c]) for c in cols), file=sys.stderr)


# ── main ──────────────────────────────────────────────────────────────────────────────────────

def main() -> None:
    p = argparse.ArgumentParser(prog="seed-cafe-usage-settings.py",
                                description="Café item settings from the last 30 days of ERP usage.")
    p.add_argument("--db-url", help="target MOS database (fallback env CAFE_USAGE_SEED_DB_URL)")
    p.add_argument("--org-slug", default="gordi", help="target org slug (default gordi; never a sample org)")
    p.add_argument("--esb-code", help="ERP company code the usage is read for")
    p.add_argument("--branch-map", help="ERP branch id=MOS branch code pairs, comma separated")
    p.add_argument("--as-of", help="run date (Jakarta, YYYY-MM-DD); default today in Jakarta")
    p.add_argument("--label", help="run label used in written-row ids (default usage-seed-<as-of>)")
    p.add_argument("--usage", help="usage rows file (JSON lines or array) from the ERP query")
    p.add_argument("--erp-query-cmd", help="read-only command run as: CMD '<usage sql>'")
    p.add_argument("--manifest", help="real runs write the report here (needed for --rollback)")
    p.add_argument("--rollback", metavar="MANIFEST", help="reverse the run recorded in MANIFEST")
    p.add_argument("--psql", default="psql", help="psql binary (default psql on PATH)")
    p.add_argument("--allow-remote", action="store_true", help="allow a non-local --db-url (owner-gated)")
    p.add_argument("--no-commit", action="store_true", help="run everything, then ROLLBACK (rehearsal)")
    p.add_argument("--dry-run", action="store_true", help="print the MOS SQL; no database contact")
    p.add_argument("--print-usage-sql", action="store_true", help="print the ERP usage query and exit")
    args = p.parse_args()

    if args.db_url and separate_password(args.db_url)[1] is not None:
        die("passwords in --db-url are not accepted; use CAFE_USAGE_SEED_DB_URL")
    db_url = args.db_url or os.environ.get("CAFE_USAGE_SEED_DB_URL", "")
    if not db_url and not (args.dry_run or args.print_usage_sql):
        die("--db-url (or env CAFE_USAGE_SEED_DB_URL) is required for a real run")
    if db_url and not args.print_usage_sql:
        guard_db_url(db_url, args.allow_remote)

    if args.rollback:
        try:
            with open(args.rollback, encoding="utf-8") as fh:
                manifest = json.load(fh)
            label, run_at, existing = manifest["label"], manifest["run_at"], manifest["updated_existing"]
            datetime.fromisoformat(run_at)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            die(f"--rollback manifest unreadable ({exc})")
        if not LABEL_RE.match(label) or not all(re.fullmatch(r"[0-9a-f-]{36}", i) for i in existing):
            die("--rollback manifest has an invalid label or id")
        sql = build_rollback_sql(args.org_slug, label, run_at, existing, commit=not args.no_commit)
        if args.dry_run:
            sys.stdout.write(sql)
            return
        print(json.dumps(run_psql(args.psql, sql, db_url)), file=sys.stderr)
        return

    if not args.esb_code or not CODE_RE.match(args.esb_code):
        die("--esb-code is required (letters, digits, _ or -)")
    if not args.branch_map:
        die("--branch-map is required")
    branch_map = parse_branch_map(args.branch_map)
    try:
        as_of = date.fromisoformat(args.as_of) if args.as_of else datetime.now(JAKARTA).date()
    except ValueError:
        die(f"--as-of must be YYYY-MM-DD (got {args.as_of!r})")
    start, end = usage_window(as_of)
    label = args.label or f"usage-seed-{as_of.isoformat()}"
    if not LABEL_RE.match(label):
        die("--label must be lowercase letters, digits and dashes")
    usage_sql = build_usage_sql(args.esb_code, list(branch_map), start, end)
    if args.print_usage_sql:
        sys.stdout.write(usage_sql)
        return

    if bool(args.usage) == bool(args.erp_query_cmd):
        die("pass exactly one of --usage FILE or --erp-query-cmd CMD")
    if args.usage:
        try:
            with open(args.usage, encoding="utf-8") as fh:
                text = fh.read()
        except OSError as exc:
            die(f"--usage file unreadable ({exc})")
    else:
        proc = subprocess.run(shlex.split(args.erp_query_cmd) + [usage_sql], capture_output=True, text=True)
        if proc.returncode != 0:
            sys.stderr.write(proc.stderr)
            die(f"--erp-query-cmd failed with exit code {proc.returncode}")
        text = proc.stdout
    rows = parse_usage(text, branch_map, start, end)
    print(f"USAGE: {len(rows)} stream/product/detail rows, window {start}..<{end}", file=sys.stderr)

    sql = build_seed_sql(rows, branch_map, args.org_slug, label, start, end, commit=not args.no_commit)
    if "$json$" in json.dumps(rows):
        die("usage contains the literal '$json$' (dollar-quote collision)")
    if args.dry_run:
        sys.stdout.write(sql)
        return
    if not args.no_commit and not args.manifest:
        die("a real run needs --manifest <path> so it can be rolled back")
    report = run_psql(args.psql, sql, db_url)
    print_report(report)
    if not args.no_commit:
        with open(args.manifest, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
            fh.write("\n")
        print(f"MANIFEST written: {args.manifest}", file=sys.stderr)


if __name__ == "__main__":
    main()
