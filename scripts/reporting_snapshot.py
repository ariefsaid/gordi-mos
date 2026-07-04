#!/usr/bin/env python3
"""Snapshot warehouse sales aggregates into Supabase reporting.

Secrets are provided by the caller environment, normally via `op run`.
This script deliberately does not load .env files.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import os
import sys
from typing import Any, Mapping


REQUIRED_ENV = ("WAREHOUSE_DB_URL", "SUPABASE_REPORTING_DB_URL", "REPORTING_ORG_ID")
DEFAULT_WINDOW_DAYS = 60
DEFAULT_SOURCE_CONTRACT_VERSION = "v_daily_revenue_unified.v1"
DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION = "pos_margin_interim.v1"


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


def run_snapshot(config: SnapshotConfig, *, snapshot_as_of: datetime | None = None) -> int:
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency: install psycopg on the VPS snapshot environment"
        ) from exc

    snapshot_as_of = snapshot_as_of or datetime.now(timezone.utc)
    with psycopg.connect(config.warehouse_db_url, row_factory=dict_row) as warehouse_conn:
        with warehouse_conn.cursor() as warehouse_cur:
            warehouse_cur.execute(build_source_query(), (config.window_days,))
            source_rows = warehouse_cur.fetchall()

    normalized_rows = [
        normalize_row(
            row,
            snapshot_as_of=snapshot_as_of,
            org_id=config.org_id,
            source_contract_version=config.source_contract_version,
        )
        for row in source_rows
    ]

    with psycopg.connect(config.supabase_reporting_db_url) as reporting_conn:
        with reporting_conn.cursor() as reporting_cur:
            reporting_cur.executemany(build_upsert_sql(), normalized_rows)
        reporting_conn.commit()

    return len(normalized_rows)


# --- reporting.sales_margin_daily (§7a AMENDMENT, ADR-0018 D6 prereq) ---------------------------
#
# v_daily_cogs_comparison is a diagnostic view with no revenue/channel/branch_name and covers POS
# only (COGS has no channel dimension upstream). Per the finance doctrine (gordi-esb-bak
# COGS-REPORT-WORKFLOW.md): the ONE actual COGS is the monthly GL reconciliation; BOM is a budget,
# never an actual; mid-month stock-movement COGS is INTERIM/not-yet-reconciled. This snapshot joins
# the POS slice of v_daily_revenue_unified with v_daily_cogs_comparison and computes only the
# labeled interim margin — never a fake/certified figure.


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
      left join public.v_daily_cogs_comparison c
        on c.cogs_date = r.revenue_date
       and c.esb_code::text = r.esb_code::text
       and c.branch_code = coalesce(nullif(btrim(coalesce(r.branch_code,'')),''), r.esb_code::text)
      where r.channel = 'POS'
        and r.revenue_date >= %(since)s
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
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency: install psycopg on the VPS snapshot environment"
        ) from exc

    since = (snapshot_as_of.date() - timedelta(days=config.window_days - 1)).isoformat()
    with psycopg.connect(config.warehouse_db_url, row_factory=dict_row) as warehouse_conn:
        with warehouse_conn.cursor() as warehouse_cur:
            warehouse_cur.execute(build_margin_source_query(), {"since": since})
            source_rows = warehouse_cur.fetchall()

    normalized_rows = [
        normalize_margin_row(
            row,
            snapshot_as_of=snapshot_as_of,
            org_id=config.org_id,
            source_contract_version=config.margin_source_contract_version,
        )
        for row in source_rows
    ]

    with psycopg.connect(config.supabase_reporting_db_url) as reporting_conn:
        with reporting_conn.cursor() as reporting_cur:
            reporting_cur.executemany(build_margin_upsert_sql(), normalized_rows)
        reporting_conn.commit()

    return len(normalized_rows)


def run_all_snapshots(config: SnapshotConfig) -> dict[str, int]:
    """Run the revenue + margin snapshots in one job run sharing one snapshot_as_of."""
    snapshot_as_of = datetime.now(timezone.utc)
    revenue_count = run_snapshot(config, snapshot_as_of=snapshot_as_of)
    margin_count = run_margin_snapshot(config, snapshot_as_of)
    return {"revenue": revenue_count, "margin": margin_count}


def main() -> int:
    config = SnapshotConfig.from_env(os.environ)
    counts = run_all_snapshots(config)
    print(
        "reporting_snapshot END "
        f"revenue={counts['revenue']} margin={counts['margin']} "
        f"window_days={config.window_days}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
