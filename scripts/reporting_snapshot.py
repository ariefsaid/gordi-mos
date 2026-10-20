#!/usr/bin/env python3
"""Snapshot warehouse sales aggregates into Supabase reporting.

Secrets are provided by the caller environment, normally via `op run`.
This script deliberately does not load .env files.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import os
import re
import sys
from typing import Any, Mapping
import uuid


REQUIRED_ENV = ("WAREHOUSE_DB_URL", "SUPABASE_REPORTING_DB_URL", "REPORTING_ORG_ID")
DEFAULT_WINDOW_DAYS = 60
DEFAULT_SOURCE_CONTRACT_VERSION = "v_daily_revenue_unified.v1"
DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION = "pos_margin_interim.v1"
DEFAULT_PENDING_BILLS_WINDOW_DAYS = 730
DEFAULT_PENDING_BILLS_SOURCE_CONTRACT_VERSION = "pos_pending_bills.v1"
WIB = timezone(timedelta(hours=7))
DEFAULT_USAGE_SOURCE_CONTRACT_VERSION = "ingredient_usage_daily.v1"


@dataclass(frozen=True)
class SnapshotConfig:
    warehouse_db_url: str
    supabase_reporting_db_url: str
    org_id: str
    window_days: int = DEFAULT_WINDOW_DAYS
    source_contract_version: str = DEFAULT_SOURCE_CONTRACT_VERSION
    margin_source_contract_version: str = DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION
    # Off until the warehouse contract view is confirmed; when off the step opens no connection.
    pending_bills_enabled: bool = False
    pending_bills_window_days: int = DEFAULT_PENDING_BILLS_WINDOW_DAYS
    pending_bills_source_contract_version: str = DEFAULT_PENDING_BILLS_SOURCE_CONTRACT_VERSION

    @classmethod
    def from_env(cls, environ: Mapping[str, str]) -> "SnapshotConfig":
        missing = [name for name in REQUIRED_ENV if not environ.get(name)]
        if missing:
            raise SystemExit(f"Missing required env: {', '.join(missing)}")

        window_days = _parse_window_days(environ.get("REPORTING_WINDOW_DAYS"))
        pending_bills_window_days = _parse_window_days(
            environ.get("REPORTING_PENDING_BILLS_WINDOW_DAYS"),
            name="REPORTING_PENDING_BILLS_WINDOW_DAYS",
            default=DEFAULT_PENDING_BILLS_WINDOW_DAYS,
        )
        return cls(
            warehouse_db_url=environ["WAREHOUSE_DB_URL"],
            supabase_reporting_db_url=environ["SUPABASE_REPORTING_DB_URL"],
            org_id=environ["REPORTING_ORG_ID"],
            window_days=window_days,
            source_contract_version=environ.get(
                "SOURCE_CONTRACT_VERSION",
                DEFAULT_SOURCE_CONTRACT_VERSION,
            ),
            margin_source_contract_version=environ.get(
                "SOURCE_MARGIN_CONTRACT_VERSION",
                DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION,
            ),
            pending_bills_enabled=environ.get("REPORTING_PENDING_BILLS", "").strip() == "1",
            pending_bills_window_days=pending_bills_window_days,
        )


def _parse_window_days(
    raw: str | None,
    *,
    name: str = "REPORTING_WINDOW_DAYS",
    default: int = DEFAULT_WINDOW_DAYS,
) -> int:
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise SystemExit(f"{name} must be an integer") from exc
    if value < 1:
        raise SystemExit(f"{name} must be >= 1")
    return value


def normalize_row(
    row: Mapping[str, Any],
    *,
    snapshot_as_of: Any,
    org_id: str,
    source_contract_version: str,
) -> dict[str, Any]:
    esb_code = _required_text(row.get("esb_code"), "esb_code")
    branch_code = _clean_text(row.get("branch_code")) or esb_code
    return {
        "org_id": org_id,
        "revenue_date": row["revenue_date"],
        "channel": _required_text(row.get("channel"), "channel"),
        "esb_code": esb_code,
        "branch_code": branch_code,
        "branch_name": _clean_text(row.get("branch_name")),
        "transactions": int(row.get("transactions") or 0),
        "clean_revenue": row.get("clean_revenue") or 0,
        "snapshot_as_of": snapshot_as_of,
        "source_contract_version": source_contract_version,
    }


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _required_text(value: Any, field: str) -> str:
    cleaned = _clean_text(value)
    if cleaned is None:
        raise ValueError(f"{field} is required")
    return cleaned


def build_source_query() -> str:
    return """
      with normalized as (
        select
          revenue_date,
          channel,
          esb_code::text as esb_code,
          coalesce(nullif(btrim(coalesce(branch_code, '')), ''), esb_code::text) as branch_code,
          nullif(btrim(coalesce(branch_name, '')), '') as branch_name,
          transactions,
          clean_revenue
        from public.v_daily_revenue_unified
        where revenue_date >= current_date - ((%s::int - 1) * interval '1 day')
      )
        select
          revenue_date,
          channel,
          esb_code,
          branch_code,
          branch_name,
          sum(transactions)::bigint as transactions,
          round(sum(clean_revenue)::numeric, 2) as clean_revenue
        from normalized
        group by revenue_date, channel, esb_code, branch_code, branch_name
        order by revenue_date, channel, esb_code, branch_code
    """


def build_org_scope_sql() -> str:
    """Declare the org this run writes, for the transaction that writes it.

    The third set_config argument is is_local, and `true` — TRANSACTION scope — is deliberate.
    _copy_window opens a connection, declares, writes, commits, closes; psycopg is not in
    autocommit, so the declaration and the writes it authorises already share one implicit
    transaction. Transaction scope therefore does exactly the work session scope would, with a
    strictly shorter lifetime, and that difference is the reason to prefer it:

    * The production DSN is a POOLED one, so the backend is handed on when the run's connection
      closes. A transaction-scoped declaration cannot survive to be inherited by whoever holds
      that backend next; a session-scoped one is only cleaned up if the pooler chooses to.
    * If a later change ever puts a write in a fresh transaction on the same connection, the
      declaration is gone and the write is REFUSED — loud, non-zero exit, alerted — rather than
      landing under a declaration that transaction never made. Same direction of failure as the
      rest of this design.

    The obligation this buys is small and local: the declaration must be executed in the same
    transaction as the writes. _copy_window does, and scripts/test_reporting_snapshot.py asserts
    the ordering with no commit in between.
    """
    return "select set_config('app.reporting_org', %s, true)"


def build_upsert_sql() -> str:
    return """
        insert into reporting.sales_daily_revenue (
          org_id, revenue_date, channel, esb_code, branch_code, branch_name,
          transactions, clean_revenue, snapshot_as_of, source_contract_version
        ) values (
          %(org_id)s, %(revenue_date)s, %(channel)s, %(esb_code)s, %(branch_code)s,
          %(branch_name)s, %(transactions)s, %(clean_revenue)s, %(snapshot_as_of)s,
          %(source_contract_version)s
        )
        on conflict (org_id, revenue_date, channel, esb_code, branch_code)
        do update set
          branch_name = excluded.branch_name,
          transactions = excluded.transactions,
          clean_revenue = excluded.clean_revenue,
          snapshot_as_of = excluded.snapshot_as_of,
          source_contract_version = excluded.source_contract_version,
          loaded_at = now()
    """


def _copy_window(
    config: SnapshotConfig,
    *,
    source_query: str,
    normalize: Any,
    upsert_sql: str,
    target_table: str,
    snapshot_as_of: Any,
    source_contract_version: str,
) -> int | None:
    """Read one trailing-window dataset from the warehouse and upsert it into reporting.

    Every row is normalised before the reporting connection opens, so a row the normaliser
    refuses stops the run before it writes anything.
    """
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency: install psycopg on the VPS snapshot environment"
        ) from exc

    with psycopg.connect(config.warehouse_db_url, row_factory=dict_row) as warehouse_conn:
        with warehouse_conn.cursor() as warehouse_cur:
            warehouse_cur.execute(source_query, (config.window_days,))
            source_rows = warehouse_cur.fetchall()

    normalized_rows = [
        normalize(
            row,
            snapshot_as_of=snapshot_as_of,
            org_id=config.org_id,
            source_contract_version=source_contract_version,
        )
        for row in source_rows
    ]

    with psycopg.connect(config.supabase_reporting_db_url) as reporting_conn:
        with reporting_conn.cursor() as reporting_cur:
            # Staging can lag dev: skip a table the target does not have yet. Checked up front
            # because Postgres reports a missing table without naming it in the error fields.
            reporting_cur.execute("select to_regclass(%s)", (target_table,))
            if reporting_cur.fetchone()[0] is None:
                print(f"skipped {target_table}: not on target")
                return None
            # Declare the run's org BEFORE any write, and in the SAME transaction as the write:
            # the reporting.* write policies admit only rows in the declared org, and the
            # declaration is transaction-scoped. No commit may separate these two statements.
            # Each snapshot opens its own connection, so each carries its own declaration.
            reporting_cur.execute(build_org_scope_sql(), (config.org_id,))
            reporting_cur.executemany(upsert_sql, normalized_rows)
        reporting_conn.commit()

    return len(normalized_rows)


def run_snapshot(config: SnapshotConfig, *, snapshot_as_of: datetime | None = None) -> int | None:
    return _copy_window(
        config,
        source_query=build_source_query(),
        normalize=normalize_row,
        upsert_sql=build_upsert_sql(),
        target_table="reporting.sales_daily_revenue",
        snapshot_as_of=snapshot_as_of or datetime.now(timezone.utc),
        source_contract_version=config.source_contract_version,
    )


# --- reporting.sales_margin_daily (§7a AMENDMENT, ADR-0018 D6 prereq) ---------------------------
#
# fact_daily_cogs_interim is the bounded nightly-refreshed POS interim COGS fact in the warehouse
# repo. Per the finance doctrine (gordi-esb-bak COGS-REPORT-WORKFLOW.md): the ONE actual COGS is
# the monthly GL reconciliation; BOM is a budget, never an actual; mid-month stock-movement COGS
# is INTERIM/not-yet-reconciled. This snapshot joins the POS slice of v_daily_revenue_unified with
# fact_daily_cogs_interim and computes only the labeled interim margin — never a fake/certified
# figure.


def normalize_margin_row(
    row: Mapping[str, Any],
    *,
    snapshot_as_of: Any,
    org_id: str,
    source_contract_version: str,
) -> dict[str, Any]:
    esb_code = _required_text(row.get("esb_code"), "esb_code")
    branch_code = _clean_text(row.get("branch_code")) or esb_code
    revenue = float(row.get("revenue") or 0)
    cogs_interim_sm_raw = row.get("cogs_interim_sm")
    cogs_budget_bom_raw = row.get("cogs_budget_bom")
    bom_coverage_pct_raw = row.get("bom_coverage_pct")

    cogs_interim_sm = float(cogs_interim_sm_raw) if cogs_interim_sm_raw is not None else None
    cogs_budget_bom = float(cogs_budget_bom_raw) if cogs_budget_bom_raw is not None else None
    bom_coverage_pct = float(bom_coverage_pct_raw) / 100 if bom_coverage_pct_raw is not None else None
    if bom_coverage_pct is not None and not 0 <= bom_coverage_pct <= 10:
        raise ValueError("bom_coverage_pct ratio must be between 0 and 10")

    if cogs_interim_sm is None:
        # AC-SN06: a sync gap (NULL COGS) yields NULL margin, never a fake margin.
        margin_interim = None
        margin_interim_pct = None
    else:
        margin_interim = round(revenue - cogs_interim_sm, 2)
        margin_interim_pct = round(margin_interim / revenue, 4) if revenue > 0 else None
        if margin_interim_pct is not None and abs(margin_interim_pct) >= 10**4:
            margin_interim_pct = None

    return {
        "org_id": org_id,
        "margin_date": row["margin_date"],
        "esb_code": esb_code,
        "branch_code": branch_code,
        "branch_name": _clean_text(row.get("branch_name")),
        "revenue": revenue,
        "cogs_interim_sm": cogs_interim_sm,
        "cogs_budget_bom": cogs_budget_bom,
        "margin_interim": margin_interim,
        "margin_interim_pct": margin_interim_pct,
        "bom_coverage_pct": bom_coverage_pct,
        "snapshot_as_of": snapshot_as_of,
        "source_contract_version": source_contract_version,
    }


def build_margin_source_query() -> str:
    return """
      select r.revenue_date               as margin_date,
             r.esb_code,
             coalesce(nullif(btrim(coalesce(r.branch_code,'')),''), r.esb_code::text) as branch_code,
             max(r.branch_name)           as branch_name,
             sum(r.clean_revenue)         as revenue,
             max(c.sm_total)              as cogs_interim_sm,
             max(c.cogs_total)            as cogs_budget_bom,
             max(c.bom_coverage_pct)      as bom_coverage_pct
      from public.v_daily_revenue_unified r
      left join public.fact_daily_cogs_interim c
        on c.cogs_date = r.revenue_date
       and c.esb_code::text = r.esb_code::text
       and c.branch_code = coalesce(nullif(btrim(coalesce(r.branch_code,'')),''), r.esb_code::text)
      where r.channel = 'POS'
        and r.revenue_date >= current_date - ((%s::int - 1) * interval '1 day')
      group by r.revenue_date, r.esb_code, 3
      order by r.revenue_date, r.esb_code, 3
    """


def build_margin_upsert_sql() -> str:
    return """
        insert into reporting.sales_margin_daily (
          org_id, margin_date, esb_code, branch_code, branch_name,
          revenue, cogs_interim_sm, cogs_budget_bom, margin_interim, margin_interim_pct,
          bom_coverage_pct, snapshot_as_of, source_contract_version
        ) values (
          %(org_id)s, %(margin_date)s, %(esb_code)s, %(branch_code)s, %(branch_name)s,
          %(revenue)s, %(cogs_interim_sm)s, %(cogs_budget_bom)s, %(margin_interim)s,
          %(margin_interim_pct)s, %(bom_coverage_pct)s, %(snapshot_as_of)s,
          %(source_contract_version)s
        )
        on conflict (org_id, margin_date, esb_code, branch_code)
        do update set
          branch_name = excluded.branch_name,
          revenue = excluded.revenue,
          cogs_interim_sm = excluded.cogs_interim_sm,
          cogs_budget_bom = excluded.cogs_budget_bom,
          margin_interim = excluded.margin_interim,
          margin_interim_pct = excluded.margin_interim_pct,
          bom_coverage_pct = excluded.bom_coverage_pct,
          snapshot_as_of = excluded.snapshot_as_of,
          source_contract_version = excluded.source_contract_version,
          loaded_at = now()
    """


def run_margin_snapshot(config: SnapshotConfig, snapshot_as_of: datetime) -> int | None:
    return _copy_window(
        config,
        source_query=build_margin_source_query(),
        normalize=normalize_margin_row,
        upsert_sql=build_margin_upsert_sql(),
        target_table="reporting.sales_margin_daily",
        snapshot_as_of=snapshot_as_of,
        source_contract_version=config.margin_source_contract_version,
    )


# --- reporting.ingredient_usage_daily (#1473) ---------------------------------------------------
#
# Recipe-based ingredient usage per branch and day. The warehouse eligibility and recipe-line
# functions own Finished-header, Preparing-line, and package-parent selection rules.


class UnknownUnitError(ValueError):
    """A recipe unit the normaliser has no rule for. Raised before the run writes anything."""

    def __init__(self, unit: Any):
        super().__init__(f"unknown recipe unit {unit!r}: add a rule to normalize_unit")
        self.unit = unit


_MASS_UNITS = {"G": 0.001, "GR": 0.001, "GRAM": 0.001, "KG": 1.0, "KILO": 1.0, "KILOGRAM": 1.0}
_VOLUME_UNITS = {
    "ML": 0.001, "MILLILITER": 0.001, "MILLILITRE": 0.001,
    "L": 1.0, "LT": 1.0, "LTR": 1.0, "LITER": 1.0, "LITRE": 1.0,
}
_COUNT_UNITS = {
    "PCS", "PC", "PIECE", "PORSI", "PORTION", "BATCH", "PACK", "BOTTLE", "BTL", "CAN", "BOX",
    "DUS", "LOAF", "SLICE", "POUCH", "ROLL", "SACK", "BAG", "SET", "JAR", "CUP", "SACHET",
    "BUNGKUS", "IKAT", "SISIR", "POTONG", "PAPAN", "BUAH", "BUTIR", "BTR", "LEMBAR", "CARTON",
    "JERIGEN",
}
_PACK_PATTERN = re.compile(r"^([A-Z ]+?)\s*@\s*([0-9]+(?:\.[0-9]+)?)\s*([A-Z]+)$")


def normalize_unit(unit: Any) -> tuple[str, float]:
    """Return (basis, factor): one `unit` is `factor` of `basis` (kg, l, or each).

    Pack units carry their content after an @ ("CARTON @ 12 L" is 12 l, "Batch @10porsi" is 10
    each). Count units with no weight stay counts; anything else is refused by name.
    """
    text = re.sub(r"\s+", " ", str(unit or "").strip().upper().replace(",", "."))
    pack = _PACK_PATTERN.match(text)
    if pack and pack.group(1).strip() in _COUNT_UNITS:
        size = float(pack.group(2))
        inner_basis, inner_factor = _base_unit(pack.group(3), unit)
        return inner_basis, size * inner_factor
    return _base_unit(text, unit)


def _base_unit(text: str, original: Any) -> tuple[str, float]:
    if text in _MASS_UNITS:
        return "kg", _MASS_UNITS[text]
    if text in _VOLUME_UNITS:
        return "l", _VOLUME_UNITS[text]
    if text in _COUNT_UNITS:
        return "each", 1.0
    raise UnknownUnitError(original)


def normalize_usage_row(
    row: Mapping[str, Any],
    *,
    snapshot_as_of: Any,
    org_id: str,
    source_contract_version: str,
) -> dict[str, Any]:
    esb_code = _required_text(row.get("esb_code"), "esb_code")
    unit_basis, factor = normalize_unit(row.get("source_unit"))
    source_unit = _required_text(row.get("source_unit"), "source_unit")
    source_qty = float(row.get("source_qty") or 0)
    units_sold = float(row.get("units_sold") or 0)
    units_with_recipe = float(row.get("units_with_recipe") or 0)
    return {
        "org_id": org_id,
        "usage_date": row["usage_date"],
        "esb_code": esb_code,
        "branch_code": _clean_text(row.get("branch_code")) or esb_code,
        "ingredient_detail_id": _required_text(
            row.get("ingredient_detail_id"), "ingredient_detail_id"
        ),
        "ingredient_name": _clean_text(row.get("ingredient_name")),
        "source_unit": source_unit,
        "unit_basis": unit_basis,
        "source_qty": round(source_qty, 6),
        "qty_used": round(source_qty * factor, 6),
        "menu_units": float(row.get("menu_units") or 0),
        "recipe_coverage": round(units_with_recipe / units_sold, 4) if units_sold > 0 else None,
        "snapshot_as_of": snapshot_as_of,
        "source_contract_version": source_contract_version,
    }


def build_usage_source_query() -> str:
    return """
      with date_window as (
        select current_date - (%s::int - 1) as from_date, current_date as to_date
      ),
      eligible_items as (
        select e.item_id, e.sales_date, e.esb_code::text as esb_code,
               coalesce(nullif(btrim(coalesce(e.branch_code, '')), ''), e.esb_code::text) as branch_code,
               e.menu_qty
        from date_window w
        cross join lateral cogs_item_eligibility(w.from_date, w.to_date) e
        where e.eligible
      ),
      recipe as (
        select r.item_id, r.sales_date, r.esb_code::text as esb_code,
               coalesce(nullif(btrim(coalesce(r.branch_code, '')), ''), r.esb_code::text) as branch_code,
               r.product_detail_id, max(r.ingredient) as ingredient_name,
               btrim(r.unit) as source_unit, sum(r.ingredient_qty) as source_qty,
               max(r.menu_qty) as menu_units
        from date_window w
        cross join lateral cogs_recipe_lines(w.from_date, w.to_date) r
        where r.eligible and r.product_detail_id is not null
        group by r.item_id, r.sales_date, r.esb_code, r.branch_code,
                 r.product_detail_id, btrim(r.unit)
      ),
      recipe_items as (
        select distinct item_id from recipe
      ),
      sold as (
        select i.sales_date, i.esb_code, i.branch_code,
               sum(i.menu_qty) as units_sold,
               sum(i.menu_qty) filter (where ri.item_id is not null) as units_with_recipe
        from eligible_items i
        left join recipe_items ri using (item_id)
        group by i.sales_date, i.esb_code, i.branch_code
      ),
      used as (
        select r.sales_date, r.esb_code, r.branch_code,
               r.product_detail_id::text as ingredient_detail_id,
               max(r.ingredient_name) as ingredient_name,
               r.source_unit, sum(r.source_qty) as source_qty,
               sum(r.menu_units) as menu_units
        from recipe r
        group by r.sales_date, r.esb_code, r.branch_code,
                 r.product_detail_id, r.source_unit
      )
      select u.sales_date as usage_date, u.esb_code, u.branch_code, u.ingredient_detail_id,
             u.ingredient_name, u.source_unit, u.source_qty, u.menu_units,
             s.units_sold, s.units_with_recipe
      from used u
      join sold s using (sales_date, esb_code, branch_code)
      order by 1, 2, 3, 4, 6
    """


def build_usage_upsert_sql() -> str:
    return """
        insert into reporting.ingredient_usage_daily (
          org_id, usage_date, esb_code, branch_code, ingredient_detail_id, ingredient_name,
          source_unit, unit_basis, source_qty, qty_used, menu_units, recipe_coverage,
          snapshot_as_of, source_contract_version
        ) values (
          %(org_id)s, %(usage_date)s, %(esb_code)s, %(branch_code)s, %(ingredient_detail_id)s,
          %(ingredient_name)s, %(source_unit)s, %(unit_basis)s, %(source_qty)s, %(qty_used)s,
          %(menu_units)s, %(recipe_coverage)s, %(snapshot_as_of)s, %(source_contract_version)s
        )
        on conflict (org_id, usage_date, esb_code, branch_code, ingredient_detail_id, source_unit)
        do update set
          ingredient_name = excluded.ingredient_name,
          unit_basis = excluded.unit_basis,
          source_qty = excluded.source_qty,
          qty_used = excluded.qty_used,
          menu_units = excluded.menu_units,
          recipe_coverage = excluded.recipe_coverage,
          snapshot_as_of = excluded.snapshot_as_of,
          source_contract_version = excluded.source_contract_version,
          loaded_at = now()
    """


def run_usage_snapshot(config: SnapshotConfig, snapshot_as_of: Any) -> int | None:
    return _copy_window(
        config,
        source_query=build_usage_source_query(),
        normalize=normalize_usage_row,
        upsert_sql=build_usage_upsert_sql(),
        target_table="reporting.ingredient_usage_daily",
        snapshot_as_of=snapshot_as_of,
        source_contract_version=DEFAULT_USAGE_SOURCE_CONTRACT_VERSION,
    )


# --- reporting.pending_bills (#1464) ------------------------------------------------------------
#
# A bill-grain copy of the till's deferred-payment ("PENDING BILL" tender) bills. The source has no
# open/closed signal, so the copy only ever adds, refreshes and flags: a bill the source voids or
# stops sending keeps its row with source_state 'void' or 'missing'. Nothing here deletes.

PENDING_BILL_TENDER = "PENDING BILL"
BillKey = tuple[str, str, str]


def _squash(value: Any) -> str:
    return " ".join(str(value or "").split()).upper()


def _is_deferred_tender(row: Mapping[str, Any]) -> bool:
    return _squash(row.get("payment_method_name")) == PENDING_BILL_TENDER


def _is_void(row: Mapping[str, Any]) -> bool:
    return _squash(row.get("status_name")) == "VOID"


def _bill_key(row: Mapping[str, Any]) -> BillKey:
    esb_code = _required_text(row.get("esb_code"), "esb_code")
    branch_code = _clean_text(row.get("branch_code")) or esb_code
    return (esb_code, branch_code, _required_text(row.get("bill_num"), "bill_num"))


def _is_payable(row: Mapping[str, Any]) -> bool:
    """A positive total. Zero owes nothing and a negative total is a refund the copy does not
    model; both are skipped and counted rather than refused by the table's amount check."""
    try:
        return Decimal(str(row.get("grand_total"))) > 0
    except (InvalidOperation, ValueError):
        return False


def is_skipped_pending_bill(row: Mapping[str, Any]) -> bool:
    return _is_deferred_tender(row) and not _is_void(row) and not _is_payable(row)


def normalize_pending_bill(
    row: Mapping[str, Any],
    *,
    snapshot_as_of: Any,
    org_id: str,
    source_contract_version: str,
) -> dict[str, Any] | None:
    if not _is_deferred_tender(row) or _is_void(row) or not _is_payable(row):
        return None
    esb_code, branch_code, bill_no = _bill_key(row)
    return {
        "org_id": org_id,
        "esb_code": esb_code,
        "branch_code": branch_code,
        "bill_no": bill_no,
        "sales_no": _clean_text(row.get("sales_num")),
        "bill_date": row["sales_date"],
        "branch_name": _clean_text(row.get("branch_name")),
        "counterparty_note": _clean_text(row.get("counterparty_note")),
        "amount": row.get("grand_total"),
        "snapshot_as_of": snapshot_as_of,
        "source_contract_version": source_contract_version,
    }


def void_bill_keys(rows: list[Mapping[str, Any]]) -> set[BillKey]:
    return {_bill_key(row) for row in rows if _is_deferred_tender(row) and _is_void(row)}


def plan_bill_flags(
    existing_present_keys: set[BillKey],
    run_keys: set[BillKey],
    void_keys: set[BillKey],
    existing_missing_keys: set[BillKey] = frozenset(),
) -> dict[str, list[BillKey]]:
    """Which rows tonight's run flags. Rows this run carries stay present; a present row that is
    gone becomes void or missing, and a missing row the source now reports void becomes void."""
    gone = existing_present_keys - run_keys
    return {
        "void": sorted((gone | (existing_missing_keys - run_keys)) & void_keys),
        "missing": sorted(gone - void_keys),
    }


def pending_bill_window_start(snapshot_as_of: datetime, window_days: int) -> date:
    return snapshot_as_of.astimezone(WIB).date() - timedelta(days=window_days - 1)


def build_pending_bill_source_query() -> str:
    # Void rows are read too, so a bill the till voided can be flagged rather than left present.
    return """
        select s.sales_num, s.bill_num, s.sales_date, s.esb_code::text as esb_code, s.branch_code,
               s.branch_name, o.additional_info as counterparty_note, s.grand_total,
               s.status_name, s.payment_method_name
        from public.oms_sales_clean s
        left join public.oms_sales o on o.sales_num = s.sales_num
        where s.sales_date >= %s::date
        order by s.sales_date, s.esb_code, s.branch_code, s.bill_num
    """


def build_pending_bill_upsert_sql() -> str:
    return """
        insert into reporting.pending_bills (
          org_id, esb_code, branch_code, bill_no, sales_no, bill_date, branch_name,
          counterparty_note, amount, snapshot_as_of, source_contract_version
        ) values (
          %(org_id)s, %(esb_code)s, %(branch_code)s, %(bill_no)s, %(sales_no)s, %(bill_date)s,
          %(branch_name)s, %(counterparty_note)s, %(amount)s, %(snapshot_as_of)s,
          %(source_contract_version)s
        )
        on conflict (org_id, esb_code, branch_code, bill_no)
        do update set
          sales_no = excluded.sales_no,
          bill_date = excluded.bill_date,
          branch_name = excluded.branch_name,
          counterparty_note = excluded.counterparty_note,
          amount = excluded.amount,
          source_state = 'present',
          source_state_at = case
            when reporting.pending_bills.source_state <> 'present' then now()
            else reporting.pending_bills.source_state_at
          end,
          snapshot_as_of = excluded.snapshot_as_of,
          source_contract_version = excluded.source_contract_version,
          loaded_at = now()
    """


def build_flaggable_bill_keys_sql() -> str:
    return """
        select esb_code, branch_code, bill_no, source_state
        from reporting.pending_bills
        where org_id = %s and source_state in ('present', 'missing') and bill_date >= %s::date
    """


def build_bill_flag_sql() -> str:
    return """
        update reporting.pending_bills
        set source_state = %(state)s, source_state_at = now()
        where org_id = %(org_id)s and esb_code = %(esb_code)s and branch_code = %(branch_code)s
          and bill_no = %(bill_no)s and source_state <> 'void'
    """


def build_bill_snapshot_insert_sql() -> str:
    return """
        insert into reporting.pending_bill_snapshots (
          org_id, snapshot_as_of, bill_count, window_start, source_contract_version
        ) values (
          %(org_id)s, %(snapshot_as_of)s, %(bill_count)s, %(window_start)s,
          %(source_contract_version)s
        )
    """


def run_pending_bill_snapshot(
    config: SnapshotConfig, snapshot_as_of: datetime
) -> tuple[int | None, int | None]:
    """Returns (bills written, non-positive bills skipped)."""
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency: install psycopg on the VPS snapshot environment"
        ) from exc

    window_start = pending_bill_window_start(snapshot_as_of, config.pending_bills_window_days)
    with psycopg.connect(config.warehouse_db_url, row_factory=dict_row) as warehouse_conn:
        with warehouse_conn.cursor() as warehouse_cur:
            warehouse_cur.execute(build_pending_bill_source_query(), (window_start,))
            source_rows = warehouse_cur.fetchall()

    bills = [
        bill
        for bill in (
            normalize_pending_bill(
                row,
                snapshot_as_of=snapshot_as_of,
                org_id=config.org_id,
                source_contract_version=config.pending_bills_source_contract_version,
            )
            for row in source_rows
        )
        if bill is not None
    ]
    skipped = sum(1 for row in source_rows if is_skipped_pending_bill(row))
    run_keys = {(b["esb_code"], b["branch_code"], b["bill_no"]) for b in bills}
    void_keys = void_bill_keys(source_rows)

    with psycopg.connect(config.supabase_reporting_db_url) as reporting_conn:
        with reporting_conn.cursor() as reporting_cur:
            # Same up-front check as _copy_window: Postgres names no table for a missing relation.
            for table in ("reporting.pending_bills", "reporting.pending_bill_snapshots"):
                reporting_cur.execute("select to_regclass(%s)", (table,))
                if reporting_cur.fetchone()[0] is None:
                    print(f"skipped {table}: not on target")
                    return None, None
            # Same rule as the revenue path: declare first, in the transaction that writes.
            reporting_cur.execute(build_org_scope_sql(), (config.org_id,))
            reporting_cur.executemany(build_pending_bill_upsert_sql(), bills)
            reporting_cur.execute(build_flaggable_bill_keys_sql(), (config.org_id, window_start))
            existing = [tuple(row) for row in reporting_cur.fetchall()]
            plan = plan_bill_flags(
                {row[:3] for row in existing if row[3] == "present"},
                run_keys,
                void_keys,
                {row[:3] for row in existing if row[3] == "missing"},
            )
            reporting_cur.executemany(
                build_bill_flag_sql(),
                [
                    {
                        "state": state,
                        "org_id": config.org_id,
                        "esb_code": key[0],
                        "branch_code": key[1],
                        "bill_no": key[2],
                    }
                    for state in ("void", "missing")
                    for key in plan[state]
                ],
            )
            reporting_cur.execute(
                build_bill_snapshot_insert_sql(),
                {
                    "org_id": config.org_id,
                    "snapshot_as_of": snapshot_as_of,
                    "bill_count": len(bills),
                    "window_start": window_start,
                    "source_contract_version": config.pending_bills_source_contract_version,
                },
            )
        reporting_conn.commit()

    return len(bills), skipped


def build_recipe_history_source_query() -> str:
    # Menu recipes come from the warehouse's recipe observations. WIP (Assembly BOM) recipes have
    # no menu, so they are built here from the BOM tables in the same envelope shape, keyed by
    # menu_id = -bom_id.
    # ponytail: negative menu_id marks a WIP chronology; add a kind column if a consumer must
    # tell them apart in SQL.
    return """
        with asof as (select %s::timestamptz as t),
        menus as (
          select distinct on (o.esb_code, o.menu_id)
                 o.esb_code::text as esb_code, o.menu_id, o.bom_id, o.observed_at,
                 o.recipe_version_hash, o.recipe
          from public.recipe_observations o
          cross join asof
          join public.sync_state s on s.esb_code = o.esb_code
            and s.api_source = 'core' and s.endpoint = 'recipe-observation-pass'
            and s.sync_key = 'nightly' and s.status = 'completed'
          where o.observed_at <= s.completed_at and o.observed_at <= asof.t
          order by o.esb_code, o.menu_id, o.observed_at desc
        ),
        lines as (
          select b.esb_code, b.bom_id,
            jsonb_agg(jsonb_build_object(
              'line_id', b.detail_id, 'product_id', b.product_id, 'detail_id', b.product_detail_id,
              'name', b.product_name, 'unit_id', b.uom_id, 'unit', b.uom_name, 'qty', b.qty,
              'product_active', p.flag_active, 'product_deleted', p.deleted_at is not null,
              'detail_active', pd.flag_active, 'detail_unit_id', pd.uom_id,
              'detail_unit', pd.uom_name, 'is_stock', pd.is_stock,
              'conversion_quantity', pd.raw_json -> 'qty', 'conversion', d.value -> 'convertionQty',
              'yield', d.value -> 'yieldPercent', 'tolerance', d.value -> 'tolerancePercent',
              'substitutes', d.value -> 'subtitution',
              'manufacturing_substitutes', d.value -> 'subtitutionManufacturing'
            ) order by b.detail_id, b.product_detail_id, b.id) as lines
          from public.core_bom_items b
          join public.core_bom h using (esb_code, bom_id)
          left join public.dim_products p
            on p.esb_code = b.esb_code and p.product_id = b.product_id
          left join public.dim_product_details pd
            on pd.esb_code = b.esb_code and pd.product_detail_id = b.product_detail_id
          left join lateral (
            select x.value from jsonb_array_elements(case
              when jsonb_typeof(h.raw_json -> 'bomDetails') = 'array' then h.raw_json -> 'bomDetails'
              else '[]'::jsonb end) x
            where x.value ->> 'ID' = b.detail_id::text limit 1
          ) d on true
          where h.bom_type_name = 'Assembly'
          group by b.esb_code, b.bom_id
        ),
        wip as (
          select h.esb_code::text as esb_code, -h.bom_id as menu_id, h.bom_id,
                 h.synced_at as observed_at,
                 jsonb_build_object(
                   'bom_id', h.bom_id, 'bom_name', h.bom_name, 'bom_type', h.bom_type_name,
                   'active', h.flag_active, 'output_detail_id', h.product_detail_id,
                   'output_unit', h.uom_name,
                   'replacements', coalesce(h.raw_json -> 'bomReplacements', '[]'::jsonb),
                   'lines', coalesce(l.lines, '[]'::jsonb)
                 ) as recipe
          from public.core_bom h
          cross join asof
          join public.sync_state s on s.esb_code = h.esb_code
            and s.api_source = 'core' and s.endpoint = 'recipe-observation-pass'
            and s.sync_key = 'nightly' and s.status = 'completed'
          left join lines l on l.esb_code = h.esb_code and l.bom_id = h.bom_id
          where h.bom_type_name = 'Assembly'
            and h.raw_json ->> '_detail_incomplete' is distinct from 'true'
            and jsonb_typeof(h.raw_json -> 'bomDetails') = 'array'
            and h.synced_at <= s.completed_at and h.synced_at <= asof.t
        )
        select * from menus
        union all
        select esb_code, menu_id, bom_id, observed_at, md5(recipe::text), recipe from wip
    """


def plan_recipe_versions(
    source_rows: list[Mapping[str, Any]],
    latest_versions: list[Mapping[str, Any]],
    *,
    org_id: str,
    snapshot_as_of: datetime,
) -> list[dict[str, Any]]:
    latest = {(r["esb_code"], r["menu_id"]): r for r in latest_versions}
    versions = []
    for row in source_rows:
        esb_code = _required_text(row.get("esb_code"), "esb_code")
        version_hash = _required_text(row.get("recipe_version_hash"), "recipe_version_hash")
        previous = latest.get((esb_code, row["menu_id"]))
        if previous and (
            previous["warehouse_version_hash"] == version_hash
            or row["observed_at"] <= previous["source_observed_at"]
        ):
            continue
        versions.append({
            "org_id": org_id,
            "esb_code": esb_code,
            "menu_id": row["menu_id"],
            "bom_id": row["bom_id"],
            "version": previous["version"] + 1 if previous else 1,
            "warehouse_version_hash": version_hash,
            "recipe": json.dumps(row["recipe"], allow_nan=False),
            "first_seen": snapshot_as_of.astimezone(WIB).date(),
            "source_observed_at": row["observed_at"],
        })
    return versions


def run_recipe_history_snapshot(config: SnapshotConfig, snapshot_as_of: datetime) -> int | None:
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency: install psycopg on the VPS snapshot environment"
        ) from exc

    with psycopg.connect(config.supabase_reporting_db_url, row_factory=dict_row) as reporting_conn:
        with reporting_conn.cursor() as reporting_cur:
            reporting_cur.execute("select to_regclass(%s) as target", ("reporting.recipe_versions",))
            if reporting_cur.fetchone()["target"] is None:
                print("skipped reporting.recipe_versions: not on target")
                return None
            with psycopg.connect(config.warehouse_db_url, row_factory=dict_row) as warehouse_conn:
                with warehouse_conn.cursor() as warehouse_cur:
                    warehouse_cur.execute(build_recipe_history_source_query(), (snapshot_as_of,))
                    source_rows = warehouse_cur.fetchall()
            reporting_cur.execute(build_org_scope_sql(), (config.org_id,))
            reporting_cur.execute(
                "select pg_advisory_xact_lock(hashtextextended('reporting.recipe_versions:' || %s, 0))",
                (config.org_id,),
            )
            reporting_cur.execute("""
                select distinct on (esb_code, menu_id)
                       esb_code, menu_id, version, warehouse_version_hash, source_observed_at
                from reporting.recipe_versions where org_id = %s
                order by esb_code, menu_id, version desc
            """, (config.org_id,))
            versions = plan_recipe_versions(
                source_rows, reporting_cur.fetchall(),
                org_id=config.org_id, snapshot_as_of=snapshot_as_of,
            )
            reporting_cur.executemany("""
                insert into reporting.recipe_versions (
                    org_id, esb_code, menu_id, bom_id, version, warehouse_version_hash,
                    recipe, first_seen, source_observed_at
                ) values (
                    %(org_id)s, %(esb_code)s, %(menu_id)s, %(bom_id)s, %(version)s,
                    %(warehouse_version_hash)s, %(recipe)s::jsonb, %(first_seen)s,
                    %(source_observed_at)s
                )
            """, versions)
        reporting_conn.commit()
    return len(versions)


RECIPE_FINDING_COLUMNS = (
    "finding_id", "day", "esb_code", "branch_code", "branch_name", "menu_id", "menu_name",
    "bom_id", "recipe_line_id", "expected_detail_id", "expected_name", "expected_unit",
    "expected_qty", "actual_detail_id", "actual_name", "actual_unit", "actual_qty_day",
    "actual_cost_day", "impact_idr", "impact_basis", "classification", "rule", "confidence",
    "needs_human", "recommended_check", "recipe_edited_at", "first_sale_at",
    "recipe_version_hash", "recipe_observed_at", "prior_recipe_version_hash",
    "prior_recipe_observed_at", "sale_time_precision", "eligibility_population",
    "eligibility_reason", "source_checked_at", "refreshed_at", "algorithm_version",
    "replica_stale", "expected_qty_day_comparable", "actual_qty_day_comparable",
    "comparison_unit", "conversion_evidence",
)


def normalize_recipe_finding(row: Mapping[str, Any], *, snapshot_as_of: Any,
                             org_id: str, source_contract_version: str) -> dict[str, Any]:
    result = {column: row.get(column) for column in RECIPE_FINDING_COLUMNS}
    for field in ("finding_id", "esb_code", "branch_code", "classification", "rule",
                  "confidence", "impact_basis", "recommended_check", "algorithm_version"):
        result[field] = _required_text(row.get(field), field)
    if row.get("day") is None or row.get("source_checked_at") is None:
        raise ValueError("finding day and source_checked_at are required")
    result["conversion_evidence"] = json.dumps(row.get("conversion_evidence") or {}, allow_nan=False)
    result.update(org_id=org_id, snapshot_as_of=snapshot_as_of,
                  source_contract_version=source_contract_version)
    return result


def build_recipe_findings_source_query() -> str:
    return f"""
        select {', '.join('f.' + c for c in RECIPE_FINDING_COLUMNS)}
        from public.v_recipe_deduction_findings f
        join public.sync_state s on s.esb_code = f.esb_code
          and s.api_source = 'core' and s.endpoint = 'recipe-observation-pass'
          and s.sync_key = 'nightly' and s.status = 'completed'
        where f.day between %s::date and %s::date
          and f.refreshed_at <= s.completed_at and f.source_checked_at <= s.completed_at
        order by f.esb_code, f.branch_code, f.day, f.finding_id
    """


def build_recipe_finding_state_query() -> str:
    return """
        select s.esb_code::text as esb_code, s.status, s.completed_at,
          (select max(greatest(f.refreshed_at, f.source_checked_at))
           from public.v_recipe_deduction_findings f
           where f.esb_code = s.esb_code and f.day between %s::date and %s::date) as latest_findings_at
        from public.sync_state s where s.api_source = 'core'
          and s.endpoint = 'recipe-observation-pass' and s.sync_key = 'nightly'
    """


def run_recipe_findings_snapshot(config: SnapshotConfig, snapshot_as_of: datetime) -> int | None:
    import psycopg
    from psycopg.rows import dict_row

    start = pending_bill_window_start(snapshot_as_of, config.window_days)
    end = snapshot_as_of.astimezone(WIB).date()
    with psycopg.connect(config.supabase_reporting_db_url, row_factory=dict_row) as target:
        with target.cursor() as cur:
            for table in ("reporting.recipe_deduction_findings", "reporting.recipe_finding_snapshots"):
                cur.execute("select to_regclass(%s) as target", (table,))
                if cur.fetchone()["target"] is None:
                    print(f"skipped {table}: not on target")
                    return None
            cur.execute(build_org_scope_sql(), (config.org_id,))
            cur.execute("select pg_advisory_xact_lock(hashtextextended('reporting.recipe_findings:' || %s, 0))",
                        (config.org_id,))
            cur.execute("select snapshot_as_of from reporting.recipe_finding_snapshots where org_id = %s",
                        (config.org_id,))
            if any(r["snapshot_as_of"] > snapshot_as_of for r in cur.fetchall()):
                return None
            with psycopg.connect(config.warehouse_db_url, row_factory=dict_row) as source:
                with source.cursor() as src:
                    src.execute("set transaction isolation level repeatable read, read only")
                    src.execute(build_recipe_finding_state_query(), (start, end))
                    states = src.fetchall()
                    src.execute(build_recipe_findings_source_query(), (start, end))
                    rows = [normalize_recipe_finding(r, snapshot_as_of=snapshot_as_of,
                            org_id=config.org_id, source_contract_version="recipe_deduction_findings.v2")
                            for r in src.fetchall()]
            count = 0
            for state in states:
                company = state["esb_code"]
                complete = (state["status"] == "completed" and state["completed_at"] is not None
                            and (state.get("latest_findings_at") is None
                                 or state["latest_findings_at"] <= state["completed_at"]))
                company_rows = [r for r in rows if r["esb_code"] == company]
                if complete:
                    cur.execute("""delete from reporting.recipe_deduction_findings
                        where org_id = %s and esb_code = %s and day between %s and %s""",
                        (config.org_id, company, start, end))
                    columns = ("org_id", *RECIPE_FINDING_COLUMNS, "snapshot_as_of", "source_contract_version")
                    # The version-on-date chronology is observed history, never backdated to a sale.
                    cur.executemany(f"""
                        insert into reporting.recipe_deduction_findings ({', '.join(columns)}, recipe_version)
                        values ({', '.join('%(' + c + ')s' + ('::jsonb' if c == 'conversion_evidence' else '') for c in columns)},
                          (select v.version from reporting.recipe_versions v
                           where v.org_id = %(org_id)s and v.esb_code = %(esb_code)s
                             and v.menu_id = %(menu_id)s and v.first_seen <= %(day)s
                             and v.source_observed_at <= %(source_checked_at)s
                           order by v.first_seen desc, v.version desc limit 1))
                    """, company_rows)
                    count += len(company_rows)
                cur.execute("""
                    insert into reporting.recipe_finding_snapshots
                      (org_id, esb_code, window_start, window_end, snapshot_as_of, source_completed_at, complete)
                    values (%s, %s, %s, %s, %s, %s, %s)
                    on conflict (org_id, esb_code) do update set
                      window_start = excluded.window_start, window_end = excluded.window_end,
                      snapshot_as_of = excluded.snapshot_as_of,
                      source_completed_at = excluded.source_completed_at, complete = excluded.complete
                """, (config.org_id, company, start, end, snapshot_as_of, state["completed_at"], complete))
        target.commit()
    return count if states else None


def build_stock_on_hand_source_query() -> str:
    return """
        with latest_dates as (
          select esb_code::text as esb_code, max(snapshot_date) as latest_date
          from public.stock_snapshot
          group by esb_code
        ), selected_dates as (
          select esb_code, latest_date as snapshot_date from latest_dates
          union
          select esb_code, latest_date - 1 from latest_dates
        )
        select stock.esb_code::text as esb_code,
               stock.branch_code::text as branch_code,
               stock.snapshot_date,
               stock.location::text as location,
               stock.product_detail_id::text as product_detail_id,
               null::text as product_code,
               stock.uom::text as uom,
               stock.qty_balance as qty_balance
        from public.stock_snapshot stock
        join selected_dates selected
          on selected.esb_code = stock.esb_code::text
         and selected.snapshot_date = stock.snapshot_date
        order by stock.esb_code, stock.snapshot_date, stock.branch_code,
                 stock.location, stock.product_detail_id
    """


def _stock_snapshot_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise ValueError("snapshot_date must be an ISO business date") from exc


def _stock_quantity(value: Any) -> Decimal:
    try:
        quantity = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("qty_balance must be a finite decimal") from exc
    if not quantity.is_finite():
        raise ValueError("qty_balance must be a finite decimal")
    return quantity


def _stable_uuid(value: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, value))


def plan_stock_on_hand_snapshots(
    source_rows: list[Mapping[str, Any]],
    *,
    org_id: str,
    snapshot_as_of: datetime,
) -> list[dict[str, Any]]:
    """Build deterministic published generations from complete warehouse date slices."""
    grouped: dict[tuple[str, date], list[dict[str, Any]]] = {}
    for source in source_rows:
        company = _required_text(source.get("esb_code"), "esb_code")
        branch = _required_text(source.get("branch_code"), "branch_code")
        business_date = _stock_snapshot_date(source.get("snapshot_date"))
        detail = _required_text(source.get("product_detail_id"), "product_detail_id")
        unit = _required_text(source.get("uom"), "uom")
        location = _required_text(source.get("location"), "location")
        row = {
            "org_id": org_id,
            "esb_code": company,
            "snapshot_date": business_date,
            "branch_code": branch,
            "location": location,
            "product_detail_code": detail,
            "product_code": _clean_text(source.get("product_code")),
            "unit_code": unit,
            "quantity": _stock_quantity(source.get("qty_balance")),
        }
        grouped.setdefault((company, business_date), []).append(row)

    plans: list[dict[str, Any]] = []
    for (company, business_date), rows in sorted(grouped.items()):
        rows.sort(key=lambda row: (
            row["branch_code"], row["location"], row["product_detail_code"], row["unit_code"]
        ))
        row_keys = [(
            row["branch_code"], row["location"], row["product_detail_code"], row["unit_code"]
        ) for row in rows]
        if len(row_keys) != len(set(row_keys)):
            raise ValueError("duplicate stock_snapshot source grain")
        branch_counts: dict[str, int] = {}
        for row in rows:
            branch_counts[row["branch_code"]] = branch_counts.get(row["branch_code"], 0) + 1

        fingerprint_rows = [{
            **row,
            "quantity": str(row["quantity"]),
        } for row in rows]
        fingerprint = hashlib.sha256(json.dumps(
            fingerprint_rows, sort_keys=True, separators=(",", ":"), allow_nan=False, default=str,
        ).encode()).hexdigest()
        snapshot_id = _stable_uuid(f"stock-on-hand:{org_id}:{company}:{business_date}:{fingerprint}")
        as_of = datetime.combine(business_date + timedelta(days=1), datetime.min.time(), tzinfo=WIB)
        as_of = as_of.astimezone(timezone.utc) - timedelta(microseconds=1)
        branch_codes = sorted(branch_counts)
        source_complete = True
        header = {
            "id": snapshot_id,
            "org_id": org_id,
            "source_system": "esb",
            "esb_code": company,
            "company_code": company,
            "source_snapshot_key": business_date.isoformat(),
            "revision": 1,
            "snapshot_date": business_date,
            "as_of": as_of,
            "business_date": business_date,
            "source_timezone": "Asia/Jakarta",
            "basis": "end_of_day",
            "scope": json.dumps({"branch_codes": branch_codes}, separators=(",", ":")),
            "source_complete": source_complete,
            "ingestion_complete": True,
            "state": "published",
            "started_at": snapshot_as_of,
            "ingested_at": snapshot_as_of,
            "published_at": snapshot_as_of,
            "watermark": business_date.isoformat(),
            "failure_code": None,
            "source_fingerprint": fingerprint,
        }
        coverage = [{
            "id": _stable_uuid(f"stock-coverage:{snapshot_id}:{branch}"),
            "org_id": org_id,
            "snapshot_id": snapshot_id,
            "branch_code": branch,
            "partition_key": "branch",
            "status": "complete",
            "expected_rows": count,
            "received_rows": count,
            "exhausted": True,
            "missing_rows_mean_zero": False,
            "source_evidence": json.dumps({"method": "full_snapshot_table_read"}),
        } for branch, count in sorted(branch_counts.items())]
        on_hand = []
        for row in rows:
            key = "|".join((row["branch_code"], row["location"], row["product_detail_code"], row["unit_code"]))
            row_fingerprint = hashlib.sha256(json.dumps({
                **row, "quantity": str(row["quantity"]),
            }, sort_keys=True, separators=(",", ":"), allow_nan=False, default=str).encode()).hexdigest()
            on_hand.append({
                **row,
                "id": _stable_uuid(f"stock-row:{snapshot_id}:{key}"),
                "snapshot_id": snapshot_id,
                "row_complete": True,
                "source_row_key": key,
                "raw_payload_hash": row_fingerprint,
            })
        plans.append({"header": header, "coverage": coverage, "on_hand": on_hand})
    return plans


def build_stock_on_hand_header_upsert_sql() -> str:
    return """
        insert into reporting.esb_stock_snapshots (
          id, org_id, source_system, esb_code, company_code, source_snapshot_key, revision,
          snapshot_date, as_of, business_date, source_timezone, basis, scope, source_complete,
          ingestion_complete, state, started_at, ingested_at, published_at, watermark,
          failure_code, source_fingerprint
        ) values (
          %(id)s, %(org_id)s, %(source_system)s, %(esb_code)s, %(company_code)s,
          %(source_snapshot_key)s, %(revision)s, %(snapshot_date)s, %(as_of)s,
          %(business_date)s, %(source_timezone)s, %(basis)s, %(scope)s::jsonb,
          %(source_complete)s, %(ingestion_complete)s, %(state)s, %(started_at)s,
          %(ingested_at)s, %(published_at)s, %(watermark)s, %(failure_code)s,
          %(source_fingerprint)s
        )
        on conflict (org_id, esb_code, snapshot_date) do update set
          id = excluded.id,
          source_system = excluded.source_system,
          company_code = excluded.company_code,
          source_snapshot_key = excluded.source_snapshot_key,
          revision = excluded.revision,
          as_of = excluded.as_of,
          business_date = excluded.business_date,
          source_timezone = excluded.source_timezone,
          basis = excluded.basis,
          scope = excluded.scope,
          source_complete = excluded.source_complete,
          ingestion_complete = excluded.ingestion_complete,
          state = excluded.state,
          started_at = excluded.started_at,
          ingested_at = excluded.ingested_at,
          published_at = excluded.published_at,
          watermark = excluded.watermark,
          failure_code = excluded.failure_code,
          source_fingerprint = excluded.source_fingerprint
    """


def run_stock_on_hand_snapshot(config: SnapshotConfig, snapshot_as_of: datetime) -> int | None:
    """Copy yesterday and the prior warehouse day as scoped, replaceable generations."""
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency: install psycopg on the VPS snapshot environment"
        ) from exc

    targets = (
        "reporting.esb_stock_snapshots",
        "reporting.esb_stock_coverage",
        "reporting.esb_stock_on_hand",
    )
    with psycopg.connect(config.supabase_reporting_db_url) as reporting_conn:
        with reporting_conn.cursor() as reporting_cur:
            for target in targets:
                reporting_cur.execute("select to_regclass(%s)", (target,))
                if reporting_cur.fetchone()[0] is None:
                    print(f"skipped {target}: not on target")
                    return None
            reporting_cur.execute(build_org_scope_sql(), (config.org_id,))
            reporting_cur.execute(
                "select pg_advisory_xact_lock(hashtextextended('reporting.esb_stock_on_hand:' || %s, 0))",
                (config.org_id,),
            )
            with psycopg.connect(config.warehouse_db_url, row_factory=dict_row) as warehouse_conn:
                with warehouse_conn.cursor() as warehouse_cur:
                    warehouse_cur.execute(build_stock_on_hand_source_query())
                    source_rows = warehouse_cur.fetchall()
            plans = plan_stock_on_hand_snapshots(
                source_rows, org_id=config.org_id, snapshot_as_of=snapshot_as_of,
            )
            if plans:
                reporting_cur.executemany(
                    build_stock_on_hand_header_upsert_sql(), [plan["header"] for plan in plans],
                )
            copied = 0
            for plan in plans:
                snapshot_id = plan["header"]["id"]
                scope = {"org_id": config.org_id, "snapshot_id": snapshot_id}
                reporting_cur.execute(
                    "delete from reporting.esb_stock_coverage where org_id = %(org_id)s and snapshot_id = %(snapshot_id)s",
                    scope,
                )
                reporting_cur.execute(
                    "delete from reporting.esb_stock_on_hand where org_id = %(org_id)s and snapshot_id = %(snapshot_id)s",
                    scope,
                )
                reporting_cur.executemany("""
                    insert into reporting.esb_stock_coverage (
                      id, org_id, snapshot_id, branch_code, partition_key, status, expected_rows,
                      received_rows, exhausted, missing_rows_mean_zero, source_evidence
                    ) values (
                      %(id)s, %(org_id)s, %(snapshot_id)s, %(branch_code)s, %(partition_key)s,
                      %(status)s, %(expected_rows)s, %(received_rows)s, %(exhausted)s,
                      %(missing_rows_mean_zero)s, %(source_evidence)s::jsonb
                    )
                """, plan["coverage"])
                reporting_cur.executemany("""
                    insert into reporting.esb_stock_on_hand (
                      id, org_id, snapshot_id, branch_code, product_code, product_detail_code,
                      unit_code, quantity, location, row_complete, source_row_key, raw_payload_hash
                    ) values (
                      %(id)s, %(org_id)s, %(snapshot_id)s, %(branch_code)s, %(product_code)s,
                      %(product_detail_code)s, %(unit_code)s, %(quantity)s, %(location)s,
                      %(row_complete)s, %(source_row_key)s, %(raw_payload_hash)s
                    )
                """, plan["on_hand"])
                copied += len(plan["on_hand"])
        reporting_conn.commit()
    return copied


CANCEL_VOID_COLUMNS = (
    "row_id", "case_id", "is_case", "esb_code", "branch_code", "sales_date", "sales_num",
    "action_kind", "node_kind", "menu_name", "review_value_idr", "review_value_basis",
    "line_total", "creator_account", "last_editor_account", "minutes_to_last_edit",
    "reason_text", "reason_scope", "source_evidence_hash",
)


def normalize_cancel_void_row(row: Mapping[str, Any], *, snapshot_as_of: Any,
                              org_id: str, source_contract_version: str) -> dict[str, Any]:
    result = {column: row.get(column) for column in CANCEL_VOID_COLUMNS}
    for field in ("row_id", "case_id", "esb_code", "branch_code", "sales_num", "action_kind",
                  "node_kind", "review_value_basis", "reason_scope"):
        result[field] = _required_text(row.get(field), field)
    if row.get("sales_date") is None or not isinstance(row.get("is_case"), bool):
        raise ValueError("register date and case flag are required")
    result.update(org_id=org_id, snapshot_as_of=snapshot_as_of,
                  source_contract_version=source_contract_version)
    return result


def run_cancel_void_snapshot(config: SnapshotConfig, snapshot_as_of: datetime) -> int | None:
    columns = ("org_id", *CANCEL_VOID_COLUMNS, "snapshot_as_of", "source_contract_version")
    mutable = [column for column in columns if column not in ("org_id", "esb_code", "row_id")]
    return _copy_window(
        config,
        source_query=f"""select {', '.join(CANCEL_VOID_COLUMNS)}
            from public.cancel_void_register_rows(current_date - (%s::int - 1), current_date)
            order by esb_code, row_id""",
        normalize=normalize_cancel_void_row,
        upsert_sql=f"""insert into reporting.cancel_void_register ({', '.join(columns)})
            values ({', '.join('%(' + column + ')s' for column in columns)})
            on conflict (org_id, esb_code, row_id) do update set
            {', '.join(column + ' = excluded.' + column for column in mutable)}
            where reporting.cancel_void_register.snapshot_as_of <= excluded.snapshot_as_of""",
        target_table="reporting.cancel_void_register",
        snapshot_as_of=snapshot_as_of,
        source_contract_version="cancel_void_register.v1",
    )


def run_all_snapshots(config: SnapshotConfig) -> dict[str, int | None]:
    """Run the reporting snapshots sharing one snapshot_as_of.

    Usage runs after revenue and margin: an unknown recipe unit fails the run loudly without holding
    back the revenue and margin figures, which have already committed. Findings follow recipe history.
    """
    snapshot_as_of = datetime.now(timezone.utc)
    revenue_count = run_snapshot(config, snapshot_as_of=snapshot_as_of)
    margin_count = run_margin_snapshot(config, snapshot_as_of)
    usage_count = run_usage_snapshot(config, snapshot_as_of)
    pending, skipped = (
        run_pending_bill_snapshot(config, snapshot_as_of)
        if config.pending_bills_enabled
        else (None, None)
    )
    recipe_history = run_recipe_history_snapshot(config, snapshot_as_of)
    recipe_findings = run_recipe_findings_snapshot(config, snapshot_as_of)
    stock_on_hand = run_stock_on_hand_snapshot(config, snapshot_as_of)
    cancel_void = run_cancel_void_snapshot(config, snapshot_as_of)
    return {
        "revenue": revenue_count,
        "margin": margin_count,
        "usage": usage_count,
        "pending_bills": pending,
        "pending_bills_skipped": skipped,
        "recipe_history": recipe_history,
        "recipe_findings": recipe_findings,
        "stock_on_hand": stock_on_hand,
        "cancel_void": cancel_void,
    }


def main() -> int:
    config = SnapshotConfig.from_env(os.environ)
    counts = run_all_snapshots(config)
    def shown(key: str) -> object:
        return "off" if counts[key] is None else counts[key]

    print(
        "reporting_snapshot END "
        f"revenue={counts['revenue']} margin={counts['margin']} usage={counts['usage']} "
        f"pending_bills={shown('pending_bills')} "
        f"pending_bills_skipped={shown('pending_bills_skipped')} "
        f"recipe_history={shown('recipe_history')} recipe_findings={shown('recipe_findings')} "
        f"stock_on_hand={shown('stock_on_hand')} cancel_void={shown('cancel_void')} window_days={config.window_days}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
