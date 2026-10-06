#!/usr/bin/env python3
"""Snapshot warehouse sales aggregates into Supabase reporting.

Secrets are provided by the caller environment, normally via `op run`.
This script deliberately does not load .env files.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import os
import sys
from typing import Any, Mapping


REQUIRED_ENV = ("WAREHOUSE_DB_URL", "SUPABASE_REPORTING_DB_URL", "REPORTING_ORG_ID")
DEFAULT_WINDOW_DAYS = 60
DEFAULT_SOURCE_CONTRACT_VERSION = "v_daily_revenue_unified.v1"
DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION = "pos_margin_interim.v1"
DEFAULT_PENDING_BILLS_WINDOW_DAYS = 730
DEFAULT_PENDING_BILLS_SOURCE_CONTRACT_VERSION = "pos_pending_bills.v1"
WIB = timezone(timedelta(hours=7))


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
    Both callers below open a connection, declare, write, commit, close; psycopg is not in
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
    transaction as the writes. Both call sites do, and scripts/test_reporting_snapshot.py asserts
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
            # Declare the run's org BEFORE any write, and in the SAME transaction as the write:
            # the reporting.* write policies admit only rows in the declared org, and the
            # declaration is transaction-scoped. No commit may separate these two statements.
            reporting_cur.execute(build_org_scope_sql(), (config.org_id,))
            reporting_cur.executemany(build_upsert_sql(), normalized_rows)
        reporting_conn.commit()

    return len(normalized_rows)


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
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency: install psycopg on the VPS snapshot environment"
        ) from exc

    with psycopg.connect(config.warehouse_db_url, row_factory=dict_row) as warehouse_conn:
        with warehouse_conn.cursor() as warehouse_cur:
            warehouse_cur.execute(build_margin_source_query(), (config.window_days,))
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
            # Second connection, second declaration — a run opens one per snapshot, and each
            # writing transaction must carry its own. Same ordering rule as the revenue path.
            reporting_cur.execute(build_org_scope_sql(), (config.org_id,))
            reporting_cur.executemany(build_margin_upsert_sql(), normalized_rows)
        reporting_conn.commit()

    return len(normalized_rows)


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
) -> dict[str, list[BillKey]]:
    """Which present rows tonight's run flags. Rows this run carries stay present."""
    gone = existing_present_keys - run_keys
    return {
        "void": sorted(gone & void_keys),
        "missing": sorted(gone - void_keys),
    }


def pending_bill_window_start(snapshot_as_of: datetime, window_days: int) -> date:
    return snapshot_as_of.astimezone(WIB).date() - timedelta(days=window_days - 1)


def build_pending_bill_source_query() -> str:
    # Void rows are read too, so a bill the till voided can be flagged rather than left present.
    return """
        select sales_num, bill_num, sales_date, esb_code::text as esb_code, branch_code,
               branch_name, counterparty_note, grand_total, status_name, payment_method_name
        from public.v_pos_pending_bills
        where sales_date >= %s::date
        order by sales_date, esb_code, branch_code, bill_num
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


def build_present_bill_keys_sql() -> str:
    return """
        select esb_code, branch_code, bill_no
        from reporting.pending_bills
        where org_id = %s and source_state = 'present' and bill_date >= %s::date
    """


def build_bill_flag_sql() -> str:
    return """
        update reporting.pending_bills
        set source_state = %(state)s, source_state_at = now()
        where org_id = %(org_id)s and esb_code = %(esb_code)s and branch_code = %(branch_code)s
          and bill_no = %(bill_no)s and source_state = 'present'
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


def run_pending_bill_snapshot(config: SnapshotConfig, snapshot_as_of: datetime) -> tuple[int, int]:
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
            # Same rule as the revenue path: declare first, in the transaction that writes.
            reporting_cur.execute(build_org_scope_sql(), (config.org_id,))
            reporting_cur.executemany(build_pending_bill_upsert_sql(), bills)
            reporting_cur.execute(build_present_bill_keys_sql(), (config.org_id, window_start))
            existing = {tuple(row) for row in reporting_cur.fetchall()}
            plan = plan_bill_flags(existing, run_keys, void_keys)
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


def run_all_snapshots(config: SnapshotConfig) -> dict[str, int | None]:
    """Run the revenue + margin (+ pending bills when enabled) snapshots sharing one snapshot_as_of."""
    snapshot_as_of = datetime.now(timezone.utc)
    revenue_count = run_snapshot(config, snapshot_as_of=snapshot_as_of)
    margin_count = run_margin_snapshot(config, snapshot_as_of)
    pending, skipped = (
        run_pending_bill_snapshot(config, snapshot_as_of)
        if config.pending_bills_enabled
        else (None, None)
    )
    return {
        "revenue": revenue_count,
        "margin": margin_count,
        "pending_bills": pending,
        "pending_bills_skipped": skipped,
    }


def main() -> int:
    config = SnapshotConfig.from_env(os.environ)
    counts = run_all_snapshots(config)
    def shown(key: str) -> object:
        return "off" if counts[key] is None else counts[key]

    print(
        "reporting_snapshot END "
        f"revenue={counts['revenue']} margin={counts['margin']} "
        f"pending_bills={shown('pending_bills')} "
        f"pending_bills_skipped={shown('pending_bills_skipped')} "
        f"window_days={config.window_days}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
