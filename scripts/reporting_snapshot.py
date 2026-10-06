#!/usr/bin/env python3
"""Snapshot warehouse sales aggregates into Supabase reporting.

Secrets are provided by the caller environment, normally via `op run`.
This script deliberately does not load .env files.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import os
import re
import sys
from typing import Any, Mapping


REQUIRED_ENV = ("WAREHOUSE_DB_URL", "SUPABASE_REPORTING_DB_URL", "REPORTING_ORG_ID")
DEFAULT_WINDOW_DAYS = 60
DEFAULT_SOURCE_CONTRACT_VERSION = "v_daily_revenue_unified.v1"
DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION = "pos_margin_interim.v1"
DEFAULT_USAGE_SOURCE_CONTRACT_VERSION = "ingredient_usage_daily.v1"


@dataclass(frozen=True)
class SnapshotConfig:
    warehouse_db_url: str
    supabase_reporting_db_url: str
    org_id: str
    window_days: int = DEFAULT_WINDOW_DAYS
    source_contract_version: str = DEFAULT_SOURCE_CONTRACT_VERSION
    margin_source_contract_version: str = DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION

    @classmethod
    def from_env(cls, environ: Mapping[str, str]) -> "SnapshotConfig":
        missing = [name for name in REQUIRED_ENV if not environ.get(name)]
        if missing:
            raise SystemExit(f"Missing required env: {', '.join(missing)}")

        window_days = _parse_window_days(environ.get("REPORTING_WINDOW_DAYS"))
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
        )


def _parse_window_days(raw: str | None) -> int:
    if raw is None or raw.strip() == "":
        return DEFAULT_WINDOW_DAYS
    try:
        value = int(raw)
    except ValueError as exc:
        raise SystemExit("REPORTING_WINDOW_DAYS must be an integer") from exc
    if value < 1:
        raise SystemExit("REPORTING_WINDOW_DAYS must be >= 1")
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
    snapshot_as_of: Any,
    source_contract_version: str,
) -> int:
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
            # Declare the run's org BEFORE any write, and in the SAME transaction as the write:
            # the reporting.* write policies admit only rows in the declared org, and the
            # declaration is transaction-scoped. No commit may separate these two statements.
            # Each snapshot opens its own connection, so each carries its own declaration.
            reporting_cur.execute(build_org_scope_sql(), (config.org_id,))
            reporting_cur.executemany(upsert_sql, normalized_rows)
        reporting_conn.commit()

    return len(normalized_rows)


def run_snapshot(config: SnapshotConfig, *, snapshot_as_of: datetime | None = None) -> int:
    return _copy_window(
        config,
        source_query=build_source_query(),
        normalize=normalize_row,
        upsert_sql=build_upsert_sql(),
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
    bom_coverage_pct = float(bom_coverage_pct_raw) if bom_coverage_pct_raw is not None else None

    if cogs_interim_sm is None:
        # AC-SN06: a sync gap (NULL COGS) yields NULL margin, never a fake margin.
        margin_interim = None
        margin_interim_pct = None
    else:
        margin_interim = round(revenue - cogs_interim_sm, 2)
        margin_interim_pct = round(margin_interim / revenue, 4) if revenue > 0 else None

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
             max(c.bom_total)             as cogs_budget_bom,
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


def run_margin_snapshot(config: SnapshotConfig, snapshot_as_of: datetime) -> int:
    return _copy_window(
        config,
        source_query=build_margin_source_query(),
        normalize=normalize_margin_row,
        upsert_sql=build_margin_upsert_sql(),
        snapshot_as_of=snapshot_as_of,
        source_contract_version=config.margin_source_contract_version,
    )


# --- reporting.ingredient_usage_daily (#1473) ---------------------------------------------------
#
# Recipe-based ingredient usage per branch and day: each sold menu line times its recipe, grouped
# by the ingredient's ERP product detail id (never its name). Unlike the warehouse's COGS views,
# this keeps menus the ERP has soft-deleted and zero-price add-on lines (package sub-items): both
# were really made and really used ingredients. The sale statuses are the warehouse's own
# consumption rule (v_transaction_cogs_total): Finished and Void count, because a voided order was
# prepared and refunded; Cancelled was never prepared.


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
      with lines as (
        select si.sales_date,
               si.esb_code::text as esb_code,
               coalesce(nullif(btrim(coalesce(si.branch_code, '')), ''), si.esb_code::text) as branch_code,
               si.qty,
               dm.bom_id
        from oms_sales_items si
        join oms_sales o
          on o.sales_num = si.sales_num
         and o.status_name in ('Finished', 'Void')
        left join dim_menus dm
          on dm.esb_code = si.esb_code
         and dm.menu_id = si.menu_id
        where si.sales_date >= current_date - ((%s::int - 1) * interval '1 day')
          and si.qty > 0
      ),
      recipe as (
        select bi.esb_code, bi.bom_id, bi.product_detail_id,
               max(bi.product_name) as ingredient_name,
               btrim(bi.uom_name) as source_unit,
               sum(bi.qty) as recipe_qty
        from core_bom_items bi
        where bi.qty > 0 and bi.product_detail_id is not null
        group by bi.esb_code, bi.bom_id, bi.product_detail_id, btrim(bi.uom_name)
      ),
      recipe_boms as (
        select distinct esb_code, bom_id from recipe
      ),
      sold as (
        select l.sales_date, l.esb_code, l.branch_code,
               sum(l.qty) as units_sold,
               sum(l.qty) filter (where rb.bom_id is not null) as units_with_recipe
        from lines l
        left join recipe_boms rb on rb.esb_code = l.esb_code and rb.bom_id = l.bom_id
        group by l.sales_date, l.esb_code, l.branch_code
      ),
      used as (
        select l.sales_date, l.esb_code, l.branch_code,
               b.product_detail_id::text as ingredient_detail_id,
               max(b.ingredient_name) as ingredient_name,
               b.source_unit,
               sum(l.qty * b.recipe_qty) as source_qty,
               sum(l.qty) as menu_units
        from lines l
        join recipe b on b.esb_code = l.esb_code and b.bom_id = l.bom_id
        group by l.sales_date, l.esb_code, l.branch_code, b.product_detail_id, b.source_unit
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


def run_usage_snapshot(config: SnapshotConfig, snapshot_as_of: Any) -> int:
    return _copy_window(
        config,
        source_query=build_usage_source_query(),
        normalize=normalize_usage_row,
        upsert_sql=build_usage_upsert_sql(),
        snapshot_as_of=snapshot_as_of,
        source_contract_version=DEFAULT_USAGE_SOURCE_CONTRACT_VERSION,
    )


def run_all_snapshots(config: SnapshotConfig) -> dict[str, int]:
    """Run the revenue, margin and usage snapshots in one job run sharing one snapshot_as_of.

    Usage runs last: an unknown recipe unit fails the run loudly without holding back the
    revenue and margin figures, which have already committed.
    """
    snapshot_as_of = datetime.now(timezone.utc)
    revenue_count = run_snapshot(config, snapshot_as_of=snapshot_as_of)
    margin_count = run_margin_snapshot(config, snapshot_as_of)
    usage_count = run_usage_snapshot(config, snapshot_as_of)
    return {"revenue": revenue_count, "margin": margin_count, "usage": usage_count}


def main() -> int:
    config = SnapshotConfig.from_env(os.environ)
    counts = run_all_snapshots(config)
    print(
        "reporting_snapshot END "
        f"revenue={counts['revenue']} margin={counts['margin']} usage={counts['usage']} "
        f"window_days={config.window_days}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
