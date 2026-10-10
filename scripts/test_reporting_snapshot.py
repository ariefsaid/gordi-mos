from contextlib import contextmanager, redirect_stdout
from datetime import date, datetime, timezone
import io
import json
import sys
import types
import unittest
from unittest import mock

from reporting_snapshot import (
    DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION,
    DEFAULT_PENDING_BILLS_SOURCE_CONTRACT_VERSION,
    REQUIRED_ENV,
    SnapshotConfig,
    main,
    normalize_pending_bill,
    plan_bill_flags,
    run_all_snapshots,
    run_pending_bill_snapshot,
    void_bill_keys,
    build_margin_source_query,
    build_pending_bill_source_query,
    build_margin_upsert_sql,
    build_source_query,
    build_upsert_sql,
    normalize_margin_row,
    normalize_row,
    run_margin_snapshot,
    run_snapshot,
)
from reporting_snapshot import (
    DEFAULT_USAGE_SOURCE_CONTRACT_VERSION,
    UnknownUnitError,
    build_usage_source_query,
    build_usage_upsert_sql,
    normalize_unit,
    normalize_usage_row,
    run_usage_snapshot,
)
from reporting_snapshot import plan_recipe_versions, run_recipe_history_snapshot


class ReportingSnapshotTests(unittest.TestCase):
    def test_config_defaults_to_60_day_window(self):
        """AC-009: Given no REPORTING_WINDOW_DAYS, when config loads, then the trailing window is 60 days."""
        env = {
            "WAREHOUSE_DB_URL": "postgresql://warehouse/db",
            "SUPABASE_REPORTING_DB_URL": "postgresql://supabase/db",
            "REPORTING_ORG_ID": "00000000-0000-0000-0000-0000000000a1",
        }

        config = SnapshotConfig.from_env(env)

        self.assertEqual(config.window_days, 60)
        self.assertEqual(config.source_contract_version, "v_daily_revenue_unified.v1")

    def test_config_fails_before_connections_when_required_env_is_missing(self):
        """AC-010: Given missing required environment, when config loads, then the job fails before
        opening database connections."""
        env = {
            "WAREHOUSE_DB_URL": "postgresql://warehouse/db",
            "REPORTING_ORG_ID": "00000000-0000-0000-0000-0000000000a1",
        }

        with self.assertRaises(SystemExit) as raised:
            SnapshotConfig.from_env(env)

        self.assertIn("SUPABASE_REPORTING_DB_URL", str(raised.exception))
        self.assertEqual(
            set(REQUIRED_ENV),
            {"WAREHOUSE_DB_URL", "SUPABASE_REPORTING_DB_URL", "REPORTING_ORG_ID"},
        )

    def test_normalize_row_uses_esb_code_branch_key_for_missing_b2b_branch_code(self):
        """AC-007: Given raw B2B warehouse rows with a missing branch code, when rows are
        normalized, then the upsert key uses esb_code."""
        row = {
            "revenue_date": "2026-07-01",
            "channel": "B2B",
            "esb_code": "GRI",
            "branch_code": None,
            "branch_name": "Gordi Roastery",
            "transactions": 3,
            "clean_revenue": "1500000.25",
        }

        normalized = normalize_row(
            row,
            snapshot_as_of="2026-07-01T04:00:00+07:00",
            org_id="00000000-0000-0000-0000-0000000000a1",
            source_contract_version="v_daily_revenue_unified.v1",
        )

        self.assertEqual(normalized["branch_code"], "GRI")
        self.assertEqual(normalized["branch_name"], "Gordi Roastery")
        self.assertEqual(normalized["snapshot_as_of"], "2026-07-01T04:00:00+07:00")

    def test_source_query_coalesces_null_branch_code_to_esb_code_before_grouping(self):
        sql = " ".join(build_source_query().split())

        self.assertIn(
            "coalesce(nullif(btrim(coalesce(branch_code, '')), ''), esb_code::text) as branch_code",
            sql,
        )

    def test_upsert_sql_uses_reporting_primary_key_and_refreshes_metrics(self):
        """AC-008: Given a snapshot run, when the upsert SQL is built, then it upserts by
        (org_id, revenue_date, channel, esb_code, branch_code) and updates mutable metrics/freshness."""
        sql = build_upsert_sql()

        self.assertIn(
            "on conflict (org_id, revenue_date, channel, esb_code, branch_code)",
            sql,
        )
        self.assertIn("transactions = excluded.transactions", sql)
        self.assertIn("clean_revenue = excluded.clean_revenue", sql)
        self.assertIn("snapshot_as_of = excluded.snapshot_as_of", sql)


class MarginSnapshotTests(unittest.TestCase):
    def test_config_fails_before_connections_when_required_env_is_missing(self):
        """AC-SN01: Given missing required env, when config loads, then it fails before opening
        DB connections (shared by both snapshot paths)."""
        env = {
            "WAREHOUSE_DB_URL": "postgresql://warehouse/db",
            "REPORTING_ORG_ID": "00000000-0000-0000-0000-0000000000a1",
        }

        with self.assertRaises(SystemExit) as raised:
            SnapshotConfig.from_env(env)

        self.assertIn("SUPABASE_REPORTING_DB_URL", str(raised.exception))

    def test_normalize_margin_row_uses_esb_code_branch_key_for_missing_branch_code(self):
        """AC-SN02: Given a B2B row with a missing branch code, when normalize_margin_row runs,
        then branch_code = esb_code."""
        row = {
            "margin_date": "2026-07-01",
            "esb_code": "GRI",
            "branch_code": None,
            "branch_name": "Gordi Roastery",
            "revenue": "3000000",
            "cogs_interim_sm": "1800000",
            "cogs_budget_bom": "1700000",
            "bom_coverage_pct": "90",
        }

        normalized = normalize_margin_row(
            row,
            snapshot_as_of="2026-07-01T04:00:00+07:00",
            org_id="00000000-0000-0000-0000-0000000000a1",
            source_contract_version=DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION,
        )

        self.assertEqual(normalized["branch_code"], "GRI")
        self.assertEqual(normalized["branch_name"], "Gordi Roastery")
        self.assertEqual(normalized["margin_interim"], 1200000.0)
        self.assertEqual(normalized["margin_interim_pct"], 0.4)
        self.assertEqual(normalized["bom_coverage_pct"], 0.9)

    def test_normalize_margin_row_computes_margin_interim_and_pct(self):
        """AC-SN02/AC-HK02: Given revenue and cogs_interim_sm, when normalize_margin_row runs,
        then margin_interim = revenue - cogs_interim_sm rounded 2dp."""
        row = {
            "margin_date": "2026-07-01",
            "esb_code": "GKI",
            "branch_code": "BGR",
            "branch_name": "Bungur",
            "revenue": "1250000",
            "cogs_interim_sm": "750000",
            "cogs_budget_bom": "700000",
            "bom_coverage_pct": "95",
        }

        normalized = normalize_margin_row(
            row,
            snapshot_as_of="2026-07-01T04:00:00+07:00",
            org_id="00000000-0000-0000-0000-0000000000a1",
            source_contract_version=DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION,
        )

        self.assertEqual(normalized["margin_interim"], 500000.0)
        self.assertEqual(normalized["margin_interim_pct"], 0.4)
        self.assertEqual(normalized["bom_coverage_pct"], 0.95)

    def test_normalize_margin_row_converts_warehouse_percentage_points_to_ratio(self):
        for source_pct, expected_ratio in (("90", 0.9), ("112.5", 1.125), ("200", 2.0)):
            with self.subTest(source_pct=source_pct):
                row = {
                    "margin_date": "2026-07-01",
                    "esb_code": "GKI",
                    "branch_code": "BGR",
                    "branch_name": "Bungur",
                    "revenue": "1250000",
                    "cogs_interim_sm": "750000",
                    "cogs_budget_bom": "700000",
                    "bom_coverage_pct": source_pct,
                }

                normalized = normalize_margin_row(
                    row,
                    snapshot_as_of="2026-07-01T04:00:00+07:00",
                    org_id="00000000-0000-0000-0000-0000000000a1",
                    source_contract_version=DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION,
                )

                self.assertEqual(normalized["bom_coverage_pct"], expected_ratio)

    def test_normalize_margin_row_rejects_coverage_outside_ratio_range(self):
        for source_pct in ("-0.1", "1000.1"):
            with self.subTest(source_pct=source_pct):
                row = {
                    "margin_date": "2026-07-01",
                    "esb_code": "GKI",
                    "branch_code": "BGR",
                    "revenue": "1250000",
                    "bom_coverage_pct": source_pct,
                }

                with self.assertRaisesRegex(ValueError, "ratio must be between 0 and 10"):
                    normalize_margin_row(
                        row,
                        snapshot_as_of="2026-07-01T04:00:00+07:00",
                        org_id="00000000-0000-0000-0000-0000000000a1",
                        source_contract_version=DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION,
                    )

    def test_normalize_margin_row_pct_is_none_when_revenue_not_positive(self):
        """AC-HK02: Given revenue is 0, when pct is computed, then pct is None (not NaN)."""
        row = {
            "margin_date": "2026-07-01",
            "esb_code": "GKI",
            "branch_code": "BGR",
            "branch_name": "Bungur",
            "revenue": "0",
            "cogs_interim_sm": "0",
            "cogs_budget_bom": "0",
            "bom_coverage_pct": None,
        }

        normalized = normalize_margin_row(
            row,
            snapshot_as_of="2026-07-01T04:00:00+07:00",
            org_id="00000000-0000-0000-0000-0000000000a1",
            source_contract_version=DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION,
        )

        self.assertIsNone(normalized["margin_interim_pct"])
        self.assertIsNone(normalized["bom_coverage_pct"])

    def test_normalize_margin_row_nulls_unrepresentable_pct_without_dropping_margin(self):
        row = {
            "margin_date": "2026-07-01",
            "esb_code": "GKI",
            "branch_code": "BGR",
            "revenue": "1",
            "cogs_interim_sm": "10001",
            "cogs_budget_bom": "9000",
            "bom_coverage_pct": "0.95",
        }

        normalized = normalize_margin_row(
            row,
            snapshot_as_of="2026-07-01T04:00:00+07:00",
            org_id="00000000-0000-0000-0000-0000000000a1",
            source_contract_version=DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION,
        )

        self.assertEqual(normalized["margin_interim"], -10000.0)
        self.assertIsNone(normalized["margin_interim_pct"])

    def test_normalize_margin_row_margin_fields_none_when_cogs_missing(self):
        """AC-SN06: Given a day with revenue but NULL cogs_interim_sm, when normalize_margin_row
        runs, then margin_interim and margin_interim_pct are both None (no fake margin)."""
        row = {
            "margin_date": "2026-07-01",
            "esb_code": "GKI",
            "branch_code": "BGR",
            "branch_name": "Bungur",
            "revenue": "1250000",
            "cogs_interim_sm": None,
            "cogs_budget_bom": "700000",
            "bom_coverage_pct": "95",
        }

        normalized = normalize_margin_row(
            row,
            snapshot_as_of="2026-07-01T04:00:00+07:00",
            org_id="00000000-0000-0000-0000-0000000000a1",
            source_contract_version=DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION,
        )

        self.assertIsNone(normalized["cogs_interim_sm"])
        self.assertIsNone(normalized["margin_interim"])
        self.assertIsNone(normalized["margin_interim_pct"])
        self.assertEqual(normalized["bom_coverage_pct"], 0.95)

    def test_margin_source_query_reads_pos_only_join(self):
        """AC-SN03: Given the margin source query, when built, then it reads
        v_daily_revenue_unified filtered to channel='POS' joined with fact_daily_cogs_interim
        (the bounded §7a corrected contract)."""
        sql = " ".join(build_margin_source_query().split())

        self.assertIn("from public.v_daily_revenue_unified r", sql)
        self.assertIn("left join public.fact_daily_cogs_interim c", sql)
        self.assertIn("r.channel = 'POS'", sql)
        self.assertIn("c.sm_total", sql)
        self.assertIn("max(c.cogs_total) as cogs_budget_bom", sql)
        self.assertIn("c.bom_coverage_pct", sql)

    def test_margin_source_query_derives_window_in_sql_like_revenue_sibling(self):
        """Given the margin source query, when built, then it derives the trailing window
        with the in-SQL current_date idiom (matching build_source_query's revenue sibling)
        instead of a Python-computed UTC `since` — CQ-3 dedup (docs/reviews/feat-home-v1-margin.md)."""
        sql = " ".join(build_margin_source_query().split())

        self.assertIn(
            "r.revenue_date >= current_date - ((%s::int - 1) * interval '1 day')",
            sql,
        )
        self.assertNotIn("%(since)s", sql)

    def test_margin_upsert_sql_uses_primary_key_and_refreshes_metrics(self):
        """AC-SN04: Given the margin upsert SQL, when built, then it upserts by
        (org_id, margin_date, esb_code, branch_code) and refreshes mutable metrics + freshness."""
        sql = build_margin_upsert_sql()

        self.assertIn(
            "on conflict (org_id, margin_date, esb_code, branch_code)",
            sql,
        )
        self.assertIn("margin_interim = excluded.margin_interim", sql)
        self.assertIn("margin_interim_pct = excluded.margin_interim_pct", sql)
        self.assertIn("snapshot_as_of = excluded.snapshot_as_of", sql)

    def test_default_margin_source_contract_version(self):
        """AC-SN05: Given the default config, when source_contract_version for margin is unset,
        then it is pos_margin_interim.v1."""
        self.assertEqual(DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION, "pos_margin_interim.v1")


# ── observing a run without a database ────────────────────────────────────────────────────────
#
# AC-133e is a claim about what a RUN DOES — it declares its org before its first write — and the
# only way to assert that is to run one and watch. These fakes record every statement the run
# issues on each connection, so deleting the declaration from reporting_snapshot.py turns the
# assertions below red instead of leaving them green against a constant that nothing executes.
#
# What is deliberately NOT faked: whether the database then honours the declaration. That is not
# this layer's to assert and a fake would only ever agree with itself. The refusals — undeclared,
# empty, unparseable, wrong org, on all four fed tables — are owned by
# supabase/tests/reporting_07_writer_org_scope.sql against real policies and the real writer role.

WAREHOUSE_DSN = "postgresql://warehouse/db"
REPORTING_DSN = "postgresql://supabase/db"
ORG_A = "00000000-0000-0000-0000-0000000000a1"
ORG_B = "00000000-0000-0000-0000-0000000000b1"

REVENUE_SOURCE_ROW = {
    "revenue_date": "2026-08-03",
    "channel": "POS",
    "esb_code": "GKI",
    "branch_code": "RRS",
    "branch_name": "Rumah Rames",
    "transactions": 11,
    "clean_revenue": "1300000.00",
}
MARGIN_SOURCE_ROW = {
    "margin_date": "2026-08-03",
    "esb_code": "GKI",
    "branch_code": "RRS",
    "branch_name": "Rumah Rames",
    "revenue": "1000000",
    "cogs_interim_sm": "600000",
    "cogs_budget_bom": "550000",
    "bom_coverage_pct": "90",
}


class _UndefinedTableError(Exception):
    sqlstate = "42P01"

    def __init__(self):
        # Postgres names no table in the error fields for a missing relation.
        self.diag = types.SimpleNamespace(table_name=None)


class _RecordingCursor:
    def __init__(self, connection):
        self._connection = connection

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def execute(self, sql, params=None):
        # The table-exists probe is read-only; kept out of calls so write-order assertions stay exact.
        if sql.startswith("select to_regclass"):
            self._connection.probed = params[0]
            return
        self._connection.calls.append(("execute", sql, params))

    def executemany(self, sql, params_seq):
        missing = self._connection.missing_target_table
        if missing and f"insert into {missing}" in sql.lower():
            raise _UndefinedTableError()
        self._connection.calls.append(("executemany", sql, list(params_seq)))

    def fetchone(self):
        regclass = self._connection.probed
        value = None if regclass == self._connection.missing_target_table else regclass
        return {"target": value} if self._connection.dict_rows else (value,)

    def fetchall(self):
        sql = self._connection.calls[-1][1] if self._connection.calls else ""
        if "from public.recipe_observations" in sql:
            return list(self._connection.recipe_rows)
        if "from public.sync_state" in sql:
            return list(self._connection.state_rows)
        if "from public.v_recipe_deduction_findings" in sql:
            return list(self._connection.finding_rows)
        return list(self._connection.source_rows)


class _RecordingConnection:
    def __init__(self, dsn, source_rows, missing_target_table=None):
        self.dsn = dsn
        self.source_rows = source_rows
        self.missing_target_table = missing_target_table
        self.probed = None
        self.dict_rows = False
        self.recipe_rows = ()
        self.state_rows = ()
        self.finding_rows = ()
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def cursor(self, **_kwargs):
        return _RecordingCursor(self)

    def commit(self):
        self.calls.append(("commit", None, None))


@contextmanager
def _observed_run(source_rows, reporting_rows=(), missing_target_table=None, recipe_rows=(),
                  state_rows=(), finding_rows=()):
    """Stand in for psycopg for the duration of a run, and hand back the connections it opened.

    reporting_snapshot imports psycopg inside its run functions, so substituting the module in
    sys.modules is enough — and it is restored afterwards, so a machine that really has psycopg
    installed is left exactly as it was found.
    """
    connections = []

    def connect(dsn, **_kwargs):
        rows = reporting_rows if dsn == REPORTING_DSN else source_rows
        connection = _RecordingConnection(
            dsn,
            rows,
            missing_target_table if dsn == REPORTING_DSN else None,
        )
        connection.dict_rows = "row_factory" in _kwargs
        connection.recipe_rows = recipe_rows
        connection.state_rows = state_rows
        connection.finding_rows = finding_rows
        connections.append(connection)
        return connection

    psycopg_module = types.ModuleType("psycopg")
    psycopg_module.connect = connect
    rows_module = types.ModuleType("psycopg.rows")
    rows_module.dict_row = object()
    psycopg_module.rows = rows_module

    saved = {name: sys.modules.get(name) for name in ("psycopg", "psycopg.rows")}
    sys.modules["psycopg"] = psycopg_module
    sys.modules["psycopg.rows"] = rows_module
    try:
        yield connections
    finally:
        for name, module in saved.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module


class OrgScopedRunTests(unittest.TestCase):
    """AC-133e: the run declares its org before its first write, and writes only that org."""

    def _reporting_calls(self, connections):
        reporting = [c for c in connections if c.dsn == REPORTING_DSN]
        self.assertEqual(len(reporting), 1, "expected exactly one reporting connection per run")
        return reporting[0].calls

    def _config(self, org_id):
        return SnapshotConfig(
            warehouse_db_url=WAREHOUSE_DSN,
            supabase_reporting_db_url=REPORTING_DSN,
            org_id=org_id,
        )

    def _run_revenue(self, org_id=ORG_A):
        with _observed_run([dict(REVENUE_SOURCE_ROW)]) as connections:
            run_snapshot(self._config(org_id))
        return self._reporting_calls(connections)

    def _run_margin(self, org_id=ORG_A):
        with _observed_run([dict(MARGIN_SOURCE_ROW)]) as connections:
            run_margin_snapshot(self._config(org_id), snapshot_as_of="2026-08-03T20:30:00+00:00")
        return self._reporting_calls(connections)

    def _run_usage(self, org_id=ORG_A):
        with _observed_run([dict(USAGE_SOURCE_ROW)]) as connections:
            run_usage_snapshot(self._config(org_id), "2026-08-03T20:30:00+00:00")
        return self._reporting_calls(connections)

    def _assert_declares_then_writes(self, calls, org_id):
        # The whole statement sequence, not just its first element: an exact match is what pins
        # "declaration, then write, and no COMMIT between them" — the declaration is transaction
        # scoped, so a commit slipped in here would discard it and the write would be refused.
        self.assertEqual(
            [kind for kind, _sql, _params in calls],
            ["execute", "executemany", "commit"],
            calls,
        )

        kind, sql, params = calls[0]
        self.assertIn("set_config('app.reporting_org'", sql)
        self.assertEqual(params, (org_id,), "the org rides as a bound parameter")
        self.assertNotIn(org_id, sql, "the org is never interpolated into the statement text")
        self.assertTrue(
            sql.rstrip().endswith("true)"),
            f"the declaration must be transaction scoped, so it cannot outlive the run on a "
            f"pooled backend: {sql}",
        )

        # And the write it authorises is stamped with the same org it declared.
        _kind, _write_sql, written_rows = calls[1]
        self.assertTrue(written_rows, "the run wrote nothing, so it proved nothing")
        self.assertEqual({row["org_id"] for row in written_rows}, {org_id})

    def test_revenue_run_declares_its_org_in_the_transaction_that_writes(self):
        """Given a revenue snapshot run, when it reaches its reporting connection, then the org
        declaration is the first statement and shares a transaction with the upsert."""
        self._assert_declares_then_writes(self._run_revenue(), ORG_A)

    def test_margin_run_declares_its_org_in_the_transaction_that_writes(self):
        """Given a margin snapshot run — the second connection a run opens — then it declares its
        own org too, on its own transaction."""
        self._assert_declares_then_writes(self._run_margin(), ORG_A)

    def test_each_run_declares_and_writes_only_its_configured_org(self):
        """AC-133e, two-org half: given two runs configured for different orgs, when each runs,
        then it declares its own org and stamps only that org on what it writes — neither run
        mentions the other's org anywhere on its reporting connection.

        The database-side half of this clause — that a run which declares one org is refused when
        it aims at another — needs real policies and lives in reporting_07_writer_org_scope.sql,
        which plants a second org's row and asserts the refusal on all four fed tables.
        """
        for run, org, other in (
            (self._run_revenue, ORG_A, ORG_B),
            (self._run_revenue, ORG_B, ORG_A),
            (self._run_margin, ORG_A, ORG_B),
            (self._run_margin, ORG_B, ORG_A),
            (self._run_usage, ORG_A, ORG_B),
            (self._run_usage, ORG_B, ORG_A),
        ):
            with self.subTest(run=run.__name__, org=org):
                calls = run(org)
                self._assert_declares_then_writes(calls, org)
                self.assertNotIn(other, repr(calls))


# ── pending bills (#1464) ─────────────────────────────────────────────────────────────────────

def _bill(bill_num, *, tender="PENDING BILL", status="Paid", total="250000.00", **extra):
    row = {
        "sales_num": f"S-{bill_num}",
        "bill_num": bill_num,
        "sales_date": "2026-09-01",
        "esb_code": "GKI",
        "branch_code": "RRS",
        "branch_name": "Rumah Rames",
        "counterparty_note": "  table 4, office order  ",
        "grand_total": total,
        "status_name": status,
        "payment_method_name": tender,
    }
    row.update(extra)
    return row


def _normalise_all(rows, snapshot_as_of="2026-10-06T19:05:00+00:00"):
    out = []
    for row in rows:
        bill = normalize_pending_bill(
            row,
            snapshot_as_of=snapshot_as_of,
            org_id=ORG_A,
            source_contract_version=DEFAULT_PENDING_BILLS_SOURCE_CONTRACT_VERSION,
        )
        if bill is not None:
            out.append(bill)
    return out


def _keys(bills):
    return [(b["esb_code"], b["branch_code"], b["bill_no"]) for b in bills]


PENDING_SOURCE_ROWS = [
    _bill("B-001"),
    _bill("B-002", tender=" pending  bill "),
    _bill("B-003", tender="CASH"),
    _bill("B-004", status="Void"),
    _bill("B-005", tender="QRIS"),
]


class PendingBillSourceQueryTests(unittest.TestCase):
    def test_pending_bill_source_query_uses_the_live_sales_contract(self):
        sql = " ".join(build_pending_bill_source_query().split())

        self.assertIn("from public.oms_sales_clean s", sql)
        self.assertIn("left join public.oms_sales o on o.sales_num = s.sales_num", sql)
        self.assertIn("o.additional_info as counterparty_note", sql)
        self.assertIn("s.payment_method_name", sql)
        self.assertIn("s.status_name", sql)


class PendingBillNormaliserTests(unittest.TestCase):
    def test_ac1101_only_non_void_deferred_payment_bills_come_out(self):
        """AC-1101: Given till rows of every tender and status, when they are normalised, then only
        the non-void deferred-payment bills come out."""
        self.assertEqual(
            _keys(_normalise_all(PENDING_SOURCE_ROWS)),
            [("GKI", "RRS", "B-001"), ("GKI", "RRS", "B-002")],
        )

    def test_ac1101_rerun_yields_the_same_keys(self):
        """AC-1101: Given the same bills on a later night — new snapshot time, a re-numbered sale,
        an edited note and a corrected total — when normalised again, then the keys are the till's
        own bill identity and unchanged, so the re-run upserts the rows it wrote, never new ones."""
        tonight = _normalise_all(PENDING_SOURCE_ROWS)
        later = [
            dict(r, sales_num=f"S2-{r['bill_num']}", counterparty_note="edited", grand_total="999.00")
            for r in PENDING_SOURCE_ROWS
        ]
        tomorrow = _normalise_all(later, snapshot_as_of="2026-10-07T19:05:00+00:00")
        expected = [("GKI", "RRS", "B-001"), ("GKI", "RRS", "B-002")]
        self.assertEqual(_keys(tonight), expected)
        self.assertEqual(_keys(tomorrow), expected)

    def test_note_is_kept_as_given_and_branch_falls_back_to_esb_code(self):
        """Given a bill with a blank branch code and a padded note, when normalised, then the note
        is only stripped and the branch key is the ESB code."""
        bill = _normalise_all([_bill("B-010", branch_code="  ", counterparty_note="  Ibu A, 2 box  ")])[0]
        self.assertEqual(bill["branch_code"], "GKI")
        self.assertEqual(bill["counterparty_note"], "Ibu A, 2 box")
        self.assertEqual(bill["amount"], "250000.00")
        self.assertEqual(bill["bill_date"], "2026-09-01")
        self.assertEqual(bill["sales_no"], "S-B-010")

    def test_empty_note_is_none(self):
        bill = _normalise_all([_bill("B-011", counterparty_note="   ")])[0]
        self.assertIsNone(bill["counterparty_note"])

    def test_void_keys_are_the_deferred_tender_void_rows_only(self):
        """Given rows with void bills of several tenders, then only the deferred-payment ones are
        void keys — a voided cash sale was never a pending bill."""
        rows = PENDING_SOURCE_ROWS + [_bill("B-006", tender="CASH", status="Void")]
        self.assertEqual(void_bill_keys(rows), {("GKI", "RRS", "B-004")})


class PendingBillNonPositiveTests(unittest.TestCase):
    def test_zero_and_negative_totals_are_dropped_by_the_normaliser(self):
        """Given deferred-payment bills totalling zero or less, when normalised, then they are
        dropped — they owe nothing, or are refunds the copy does not model."""
        self.assertEqual(_normalise_all([_bill("B-020", total="0"), _bill("B-021", total="-5000.00")]), [])

    def test_run_counts_the_skipped_bills_and_writes_the_rest(self):
        """Given a run whose source holds one zero and one negative deferred bill, then the run
        writes the payable bills and reports the two it skipped instead of failing."""
        rows = [dict(r) for r in PENDING_SOURCE_ROWS] + [_bill("B-020", total="0"), _bill("B-021", total="-5000")]
        config = SnapshotConfig(warehouse_db_url=WAREHOUSE_DSN, supabase_reporting_db_url=REPORTING_DSN, org_id=ORG_A)
        with _observed_run(rows):
            written, skipped = run_pending_bill_snapshot(config, datetime(2026, 10, 6, 19, 5, tzinfo=timezone.utc))
        self.assertEqual((written, skipped), (2, 2))

    def test_end_line_prints_the_skipped_count(self):
        env = {
            "WAREHOUSE_DB_URL": WAREHOUSE_DSN,
            "SUPABASE_REPORTING_DB_URL": REPORTING_DSN,
            "REPORTING_ORG_ID": ORG_A,
            "REPORTING_PENDING_BILLS": "1",
        }
        rows = [_bill("B-020", total="0")]
        with _observed_run(rows), mock.patch.dict("os.environ", env, clear=True), \
                mock.patch("reporting_snapshot.normalize_row", return_value={}), \
                mock.patch("reporting_snapshot.normalize_margin_row", return_value={}), \
                mock.patch("reporting_snapshot.normalize_usage_row", return_value={}):
            out = io.StringIO()
            with redirect_stdout(out):
                main()
        self.assertIn("usage=1 pending_bills=0 pending_bills_skipped=1", out.getvalue())


class PendingBillFlagTests(unittest.TestCase):
    def test_ac1102_a_bill_that_disappears_is_flagged_missing(self):
        """AC-1102: Given a present bill that is absent from tonight's run, then it is flagged
        missing."""
        plan = plan_bill_flags(
            existing_present_keys={("GKI", "RRS", "B-001"), ("GKI", "RRS", "B-009")},
            run_keys={("GKI", "RRS", "B-001")},
            void_keys=set(),
        )
        self.assertEqual(plan, {"void": [], "missing": [("GKI", "RRS", "B-009")]})

    def test_ac1102_a_bill_that_turns_void_is_flagged_void(self):
        """AC-1102: Given a present bill that the source now reports void, then it is flagged void,
        not missing."""
        plan = plan_bill_flags(
            existing_present_keys={("GKI", "RRS", "B-001"), ("GKI", "RRS", "B-004")},
            run_keys={("GKI", "RRS", "B-001")},
            void_keys={("GKI", "RRS", "B-004")},
        )
        self.assertEqual(plan, {"void": [("GKI", "RRS", "B-004")], "missing": []})

    def test_a_bill_flagged_missing_that_returns_void_becomes_void(self):
        """Given a bill already flagged missing that the source now reports void, then it is
        flagged void; a missing bill that stays absent is left as it is."""
        plan = plan_bill_flags(
            existing_present_keys=set(),
            run_keys=set(),
            void_keys={("GKI", "RRS", "B-004")},
            existing_missing_keys={("GKI", "RRS", "B-004"), ("GKI", "RRS", "B-009")},
        )
        self.assertEqual(plan, {"void": [("GKI", "RRS", "B-004")], "missing": []})

    def test_ac1102_a_void_bill_never_seen_before_flags_nothing(self):
        plan = plan_bill_flags(
            existing_present_keys=set(), run_keys=set(), void_keys={("GKI", "RRS", "B-004")}
        )
        self.assertEqual(plan, {"void": [], "missing": []})


class MissingTargetTableTests(unittest.TestCase):
    def test_missing_target_table_skips_its_snapshot_and_other_steps_write(self):
        config = SnapshotConfig(
            warehouse_db_url=WAREHOUSE_DSN,
            supabase_reporting_db_url=REPORTING_DSN,
            org_id=ORG_A,
        )
        source_row = {
            **REVENUE_SOURCE_ROW,
            **MARGIN_SOURCE_ROW,
            **USAGE_SOURCE_ROW,
        }

        with _observed_run(
            [source_row],
            missing_target_table="reporting.sales_margin_daily",
        ) as connections:
            output = io.StringIO()
            try:
                with redirect_stdout(output):
                    counts = run_all_snapshots(config)
            except _UndefinedTableError:
                counts = None

        self.assertIsNotNone(counts, "a missing target table must not abort later snapshots")
        self.assertIsNone(counts["margin"])
        self.assertEqual(
            output.getvalue().splitlines(),
            ["skipped reporting.sales_margin_daily: not on target"],
        )
        written_tables = [
            sql.split("(", 1)[0].strip().lower()
            for connection in connections
            for kind, sql, _params in connection.calls
            if kind == "executemany"
        ]
        self.assertEqual(
            written_tables,
            ["insert into reporting.sales_daily_revenue", "insert into reporting.ingredient_usage_daily",
             "insert into reporting.recipe_versions"],
        )

        with _observed_run(
            [],
            missing_target_table="reporting.sales_margin_daily",
        ):
            output = io.StringIO()
            with redirect_stdout(output):
                count = run_margin_snapshot(config, datetime(2026, 10, 10, tzinfo=timezone.utc))
        self.assertIsNone(count)
        self.assertEqual(
            output.getvalue().splitlines(),
            ["skipped reporting.sales_margin_daily: not on target"],
        )


class PendingBillRunTests(unittest.TestCase):
    def _config(self, **overrides):
        return SnapshotConfig(
            warehouse_db_url=WAREHOUSE_DSN,
            supabase_reporting_db_url=REPORTING_DSN,
            org_id=ORG_A,
            **overrides,
        )

    def _run(self, existing_present):
        snapshot = datetime(2026, 10, 6, 19, 5, tzinfo=timezone.utc)
        with _observed_run([dict(r) for r in PENDING_SOURCE_ROWS], existing_present) as connections:
            count, _skipped = run_pending_bill_snapshot(self._config(), snapshot)
        reporting = [c for c in connections if c.dsn == REPORTING_DSN]
        self.assertEqual(len(reporting), 1, "one reporting connection, one transaction")
        return count, reporting[0].calls

    def test_ac1102_run_flags_and_never_deletes(self):
        """AC-1102: Given yesterday's copy holds a bill that is now void and one that is gone, when
        the run writes, then it flags both with UPDATE and issues no DELETE."""
        count, calls = self._run(
            [("GKI", "RRS", "B-001", "present"), ("GKI", "RRS", "B-004", "missing"),
             ("GKI", "RRS", "B-009", "present")]
        )
        self.assertEqual(count, 2)
        statements = " ".join(sql.lower() for _k, sql, _p in calls if sql)
        self.assertNotIn("delete", statements)
        flags = {
            (p["state"], p["esb_code"], p["branch_code"], p["bill_no"])
            for kind, sql, params in calls
            if kind == "executemany" and "source_state = %(state)s" in sql
            for p in params
        }
        self.assertEqual(flags, {("void", "GKI", "RRS", "B-004"), ("missing", "GKI", "RRS", "B-009")})
        # B-004 is currently 'missing': the flag UPDATE must reach it, so its predicate may exclude
        # only rows already void — a predicate of source_state = 'present' would match 0 rows.
        flag_sql = next(
            " ".join(sql.split()) for kind, sql, _p in calls
            if kind == "executemany" and "source_state = %(state)s" in sql
        )
        self.assertIn("and source_state <> 'void'", flag_sql)
        self.assertNotIn("source_state = 'present'", flag_sql)

    def test_missing_pending_bill_table_skips_without_writing(self):
        snapshot = datetime(2026, 10, 6, 19, 5, tzinfo=timezone.utc)
        output = io.StringIO()
        with _observed_run(
            [dict(r) for r in PENDING_SOURCE_ROWS], missing_target_table="reporting.pending_bill_snapshots"
        ) as connections, redirect_stdout(output):
            result = run_pending_bill_snapshot(self._config(), snapshot)
        self.assertEqual(result, (None, None))
        self.assertEqual(output.getvalue().splitlines(), ["skipped reporting.pending_bill_snapshots: not on target"])
        self.assertEqual([c.calls for c in connections if c.dsn == REPORTING_DSN], [[]])

    def test_run_declares_org_before_writes_in_the_same_transaction(self):
        """Given a pending-bill run, then the org declaration is the first statement, every write
        follows it, and the only commit is the last call."""
        _count, calls = self._run([("GKI", "RRS", "B-009", "present")])
        kind, sql, params = calls[0]
        self.assertIn("set_config('app.reporting_org'", sql)
        self.assertEqual(params, (ORG_A,))
        self.assertEqual([c[0] for c in calls].count("commit"), 1)
        self.assertEqual(calls[-1][0], "commit")
        upserts = [p for k, s, p in calls if k == "executemany" and "reporting.pending_bills (" in s]
        self.assertEqual({r["org_id"] for r in upserts[0]}, {ORG_A})
        snapshot_rows = [p for k, s, p in calls if "reporting.pending_bill_snapshots" in (s or "")]
        self.assertEqual(len(snapshot_rows), 1)
        self.assertEqual(snapshot_rows[0]["bill_count"], 2)
        self.assertEqual(snapshot_rows[0]["window_start"].isoformat(), "2024-10-08")

    def test_step_is_off_by_default(self):
        """Given no REPORTING_PENDING_BILLS, when config loads and the job runs, then the pending
        step opens no connection and the END line says pending_bills=off."""
        env = {
            "WAREHOUSE_DB_URL": WAREHOUSE_DSN,
            "SUPABASE_REPORTING_DB_URL": REPORTING_DSN,
            "REPORTING_ORG_ID": ORG_A,
        }
        config = SnapshotConfig.from_env(env)
        self.assertFalse(config.pending_bills_enabled)
        self.assertEqual(config.pending_bills_window_days, 730)
        with _observed_run([]) as connections, mock.patch.dict("os.environ", env, clear=True):
            out = io.StringIO()
            with redirect_stdout(out):
                main()
        self.assertEqual(len(connections), 10, "revenue, margin, usage, recipe history and findings")
        self.assertIn("usage=0 pending_bills=off pending_bills_skipped=off", out.getvalue())

    def test_step_runs_after_margin_when_enabled(self):
        env = {
            "WAREHOUSE_DB_URL": WAREHOUSE_DSN,
            "SUPABASE_REPORTING_DB_URL": REPORTING_DSN,
            "REPORTING_ORG_ID": ORG_A,
            "REPORTING_PENDING_BILLS": "1",
        }
        config = SnapshotConfig.from_env(env)
        with _observed_run([]) as connections:
            counts = run_all_snapshots(config)
        self.assertEqual(len(connections), 12, "revenue, margin, usage, pending bills, recipe history and findings")
        self.assertIn("reporting.pending_bill_snapshots", repr(connections[7].calls))
        self.assertEqual(counts["pending_bills"], 0)


USAGE_SOURCE_ROW = {
    "usage_date": "2026-08-03",
    "esb_code": "GKI",
    "branch_code": "RRS",
    "ingredient_detail_id": 4711,
    "ingredient_name": "Fresh Milk",
    "source_unit": "ML",
    "source_qty": "3600.0000",
    "menu_units": "20",
    "units_sold": "50",
    "units_with_recipe": "45",
}


class UsageSnapshotTests(unittest.TestCase):
    """#1473: the nightly ingredient-usage copy. Nothing in here touches the ERP; the source rows
    are the deterministic fake below and the query is asserted by its text."""

    def _normalize(self, **overrides):
        row = dict(USAGE_SOURCE_ROW, **overrides)
        return normalize_usage_row(
            row,
            snapshot_as_of="2026-08-03T20:30:00+00:00",
            org_id=ORG_A,
            source_contract_version=DEFAULT_USAGE_SOURCE_CONTRACT_VERSION,
        )

    def test_unit_normaliser_converts_gram_millilitre_kilogram_and_carton_units(self):
        """AC: gram, millilitre, kilogram and carton-style units normalise to kg or litres."""
        cases = {
            "GR": ("kg", 0.001),
            "g": ("kg", 0.001),
            "KG": ("kg", 1.0),
            "ML": ("l", 0.001),
            "L": ("l", 1.0),
            "CARTON @ 12 L": ("l", 12.0),
            "BOTTLE @ 250 ml": ("l", 0.25),
            "JERIGEN @ 5 L": ("l", 5.0),
            "Jerigen @ 6,7Kg": ("kg", 6.7),
            "Jerigen @5Kg": ("kg", 5.0),
            "POUCH @ 250 GR": ("kg", 0.25),
        }
        for unit, (basis, factor) in cases.items():
            with self.subTest(unit=unit):
                got_basis, got_factor = normalize_unit(unit)
                self.assertEqual(got_basis, basis)
                self.assertAlmostEqual(got_factor, factor)

    def test_unit_normaliser_counts_portions_and_pieces_without_inventing_a_weight(self):
        """Count units are kept as counts: a cup or a portion has no weight to convert to."""
        for unit, factor in (("PCS", 1.0), ("Porsi", 1.0), ("Batch @10porsi", 10.0),
                             ("CARTON @ 24 BTL", 24.0), ("PACK", 1.0)):
            with self.subTest(unit=unit):
                self.assertEqual(normalize_unit(unit), ("each", factor))

    def test_unit_normaliser_refuses_an_unknown_unit_by_name(self):
        """AC: an unknown unit is refused with a named error that names the unit."""
        for unit in ("GALLON", "CARTON @ 2 SOMETHING", "", None):
            with self.subTest(unit=unit):
                with self.assertRaises(UnknownUnitError) as raised:
                    normalize_unit(unit)
                self.assertIn(repr(unit), str(raised.exception))

    def test_usage_row_keeps_the_source_unit_and_converts_the_quantity(self):
        normalized = self._normalize()

        self.assertEqual(normalized["org_id"], ORG_A)
        self.assertEqual(normalized["ingredient_detail_id"], "4711")
        self.assertEqual(normalized["source_unit"], "ML")
        self.assertEqual(normalized["unit_basis"], "l")
        self.assertAlmostEqual(normalized["source_qty"], 3600.0)
        self.assertAlmostEqual(normalized["qty_used"], 3.6)
        self.assertAlmostEqual(normalized["menu_units"], 20.0)

    def test_usage_row_coverage_is_units_with_a_recipe_over_units_sold(self):
        """AC: coverage = units with a recipe / units sold, per branch and day."""
        self.assertAlmostEqual(self._normalize()["recipe_coverage"], 0.9)
        self.assertIsNone(self._normalize(units_sold="0", units_with_recipe="0")["recipe_coverage"])

    def test_usage_row_refuses_a_row_without_an_ingredient_id(self):
        """Identity is the product detail id, never the name: a row without one is refused."""
        with self.assertRaises(ValueError):
            self._normalize(ingredient_detail_id=None)

    def test_usage_query_counts_finished_and_excludes_void_and_print_cancelled_lines(self):
        """Finished/Preparing items count; warehouse eligibility excludes voids and cancellations."""
        sql = " ".join(build_usage_source_query().split())

        self.assertIn("cogs_item_eligibility", sql)
        self.assertIn("cogs_recipe_lines", sql)
        self.assertIn("where e.eligible", sql)
        self.assertIn("where r.eligible", sql)
        self.assertNotIn("status_name", sql)
        self.assertNotIn("Print Cancelled", sql)

    def test_usage_row_without_a_unit_is_refused_by_the_named_error(self):
        with self.assertRaises(UnknownUnitError):
            self._normalize(source_unit=None)

    def test_usage_query_joins_ingredients_by_product_detail_id_never_by_name(self):
        sql = " ".join(build_usage_source_query().split())

        self.assertIn("r.product_detail_id::text as ingredient_detail_id", sql)
        self.assertIn("group by r.sales_date, r.esb_code, r.branch_code, r.product_detail_id, r.source_unit", sql)
        self.assertNotIn("product_name =", sql)
        self.assertNotIn("menu_name", sql)
        self.assertIn("current_date - (%s::int - 1)", sql)

    def test_usage_upsert_is_keyed_on_the_table_grain(self):
        """AC: re-running a day yields the same rows — the upsert key is the table grain."""
        sql = build_usage_upsert_sql()

        self.assertIn(
            "on conflict (org_id, usage_date, esb_code, branch_code, ingredient_detail_id, source_unit)",
            sql,
        )
        self.assertIn("qty_used = excluded.qty_used", sql)
        self.assertIn("recipe_coverage = excluded.recipe_coverage", sql)

    def test_rerunning_a_day_writes_the_same_rows(self):
        """AC: re-running a day yields the same rows (idempotent)."""
        def written():
            with _observed_run([dict(USAGE_SOURCE_ROW)]) as connections:
                run_usage_snapshot(
                    SnapshotConfig(WAREHOUSE_DSN, REPORTING_DSN, ORG_A),
                    "2026-08-03T20:30:00+00:00",
                )
            [reporting] = [c for c in connections if c.dsn == REPORTING_DSN]
            return [call for call in reporting.calls if call[0] == "executemany"]

        self.assertEqual(written(), written())

    def test_an_unknown_unit_stops_the_run_before_it_writes(self):
        with _observed_run([dict(USAGE_SOURCE_ROW, source_unit="GALLON")]) as connections:
            with self.assertRaises(UnknownUnitError):
                run_usage_snapshot(
                    SnapshotConfig(WAREHOUSE_DSN, REPORTING_DSN, ORG_A),
                    "2026-08-03T20:30:00+00:00",
                )
        self.assertEqual([c.dsn for c in connections], [WAREHOUSE_DSN])


class RecipeHistorySnapshotTests(unittest.TestCase):
    SNAPSHOT = datetime(2026, 10, 10, 21, tzinfo=timezone.utc)
    OBSERVED = datetime(2026, 10, 10, 20, tzinfo=timezone.utc)

    def _source(self, **changes):
        return {
            "esb_code": "TEST", "menu_id": 101, "bom_id": 201,
            "observed_at": self.OBSERVED, "recipe_version_hash": "a" * 32,
            "recipe": {"active": True, "lines": [
                {"detail_id": 301, "qty": 25, "unit": "Batch @10porsi", "detail_active": True},
            ]},
            **changes,
        }

    def _previous(self, **changes):
        return {
            "esb_code": "TEST", "menu_id": 101, "version": 1,
            "warehouse_version_hash": "a" * 32,
            "source_observed_at": datetime(2026, 10, 9, 20, tzinfo=timezone.utc),
            **changes,
        }

    def _plan(self, source, previous=()):
        return plan_recipe_versions(
            source, previous, org_id=ORG_A, snapshot_as_of=self.SNAPSHOT,
        )

    def test_changed_ingredient_quantity_unit_or_active_flag_adds_a_version(self):
        for field, value in (("detail_id", 302), ("qty", 30), ("unit", "GR"),
                             ("detail_active", False)):
            with self.subTest(field=field):
                recipe = self._source()["recipe"]
                recipe["lines"][0][field] = value
                versions = self._plan(
                    [self._source(recipe=recipe, recipe_version_hash="b" * 32)],
                    [self._previous()],
                )
                self.assertEqual(len(versions), 1)
                self.assertEqual(versions[0]["version"], 2)
                self.assertEqual(versions[0]["warehouse_version_hash"], "b" * 32)
                self.assertEqual(json.loads(versions[0]["recipe"]), recipe)
                self.assertEqual(versions[0]["source_observed_at"], self.OBSERVED)

    def test_unchanged_recipe_adds_nothing_on_a_later_observation(self):
        self.assertEqual(self._plan([self._source()], [self._previous()]), [])

    def test_return_to_an_earlier_hash_is_a_new_version(self):
        versions = self._plan(
            [self._source()], [self._previous(version=2, warehouse_version_hash="b" * 32)],
        )
        self.assertEqual([(v["version"], v["warehouse_version_hash"]) for v in versions],
                         [(3, "a" * 32)])

    def test_stale_observation_cannot_replace_a_newer_mos_version(self):
        versions = self._plan(
            [self._source(recipe_version_hash="b" * 32)],
            [self._previous(source_observed_at=self.SNAPSHOT)],
        )
        self.assertEqual(versions, [])

    def test_first_import_starts_on_mos_observation_day_not_source_edit_day(self):
        versions = self._plan([self._source(bom_id=None)])
        self.assertEqual(versions[0]["version"], 1)
        self.assertEqual(versions[0]["first_seen"], date(2026, 10, 11))
        self.assertEqual(versions[0]["org_id"], ORG_A)
        self.assertIsNone(versions[0]["bom_id"])
        self.assertEqual(json.loads(versions[0]["recipe"])["lines"][0]["unit"], "Batch @10porsi")

    def test_menu_identity_is_company_scoped(self):
        versions = self._plan([self._source(esb_code="OTHER")], [self._previous()])
        self.assertEqual(versions[0]["version"], 1)

    def test_missing_target_skips_before_opening_the_warehouse(self):
        output = io.StringIO()
        with _observed_run([], missing_target_table="reporting.recipe_versions") as connections, \
                redirect_stdout(output):
            result = run_recipe_history_snapshot(
                SnapshotConfig(WAREHOUSE_DSN, REPORTING_DSN, ORG_A), self.SNAPSHOT,
            )
        self.assertIsNone(result)
        self.assertEqual([c.dsn for c in connections], [REPORTING_DSN])
        self.assertEqual(connections[0].calls, [])
        self.assertEqual(output.getvalue().splitlines(),
                         ["skipped reporting.recipe_versions: not on target"])

    def test_run_declares_org_and_serializes_before_reading_and_appending_versions(self):
        with _observed_run([], recipe_rows=[self._source()]) as connections:
            count = run_recipe_history_snapshot(
                SnapshotConfig(WAREHOUSE_DSN, REPORTING_DSN, ORG_A), self.SNAPSHOT,
            )
        self.assertEqual(count, 1)
        reporting = connections[0]
        self.assertEqual([c[0] for c in reporting.calls],
                         ["execute", "execute", "execute", "executemany", "commit"])
        self.assertIn("set_config('app.reporting_org'", reporting.calls[0][1])
        self.assertEqual(reporting.calls[0][2], (ORG_A,))
        self.assertIn("pg_advisory_xact_lock", reporting.calls[1][1])
        self.assertEqual(reporting.calls[1][2], (ORG_A,))
        self.assertIn("where org_id = %s", reporting.calls[2][1])
        self.assertEqual(reporting.calls[2][2], (ORG_A,))
        write_sql, rows = reporting.calls[3][1:]
        self.assertEqual(rows[0]["org_id"], ORG_A)
        self.assertNotIn("update", write_sql.lower())
        self.assertNotIn("delete", write_sql.lower())
        source_sql, params = connections[1].calls[0][1:]
        self.assertIn("s.status = 'completed'", source_sql)
        self.assertIn("o.observed_at <= s.completed_at", source_sql)
        self.assertEqual(params, (self.SNAPSHOT,))

    def test_unchanged_run_submits_no_insert_rows(self):
        with _observed_run([], [self._previous()], recipe_rows=[self._source()]) as connections:
            count = run_recipe_history_snapshot(
                SnapshotConfig(WAREHOUSE_DSN, REPORTING_DSN, ORG_A), self.SNAPSHOT,
            )
        self.assertEqual(count, 0)
        self.assertEqual(connections[0].calls[-2][2], [])

    def test_nightly_job_copies_a_recipe_observation(self):
        source_row = {
            **REVENUE_SOURCE_ROW,
            **MARGIN_SOURCE_ROW,
            **USAGE_SOURCE_ROW,
            "menu_id": 101,
            "bom_id": 201,
            "observed_at": datetime(2026, 10, 10, 21, tzinfo=timezone.utc),
            "recipe_version_hash": "a" * 32,
            "recipe": {"lines": [{"detail_id": 301, "qty": 25, "unit": "GR"}]},
        }
        config = SnapshotConfig(WAREHOUSE_DSN, REPORTING_DSN, ORG_A)
        with _observed_run([source_row], recipe_rows=[source_row]) as connections:
            counts = run_all_snapshots(config)
        self.assertEqual(counts.get("recipe_history"), 1)
        writes = [
            params for connection in connections for kind, sql, params in connection.calls
            if kind == "executemany" and "reporting.recipe_versions" in sql
        ]
        self.assertEqual(len(writes), 1)
        self.assertEqual(json.loads(writes[0][0]["recipe"]), source_row["recipe"])


class LocalSnapshotEnvTests(unittest.TestCase):
    """AC-030: Given local targets, when reporting-snapshot-local.sh runs, then it sets the
    correct WAREHOUSE_DB_URL / SUPABASE_REPORTING_DB_URL / REPORTING_ORG_ID for the local
    gordi-esb-pg (:5432) and local Supabase (:44322). The bash wrapper delegates env-var
    construction to this helper so it stays unit-testable."""

    def test_defaults_target_local_gordi_esb_pg_and_local_supabase(self):
        """Given no overrides, when build_local_env runs, then it points at the local
        gordi-esb-pg container (:5432, trust auth, no password) and local Supabase (:44322)."""
        from reporting_local_env import build_local_env

        env = build_local_env({})

        self.assertEqual(
            env["WAREHOUSE_DB_URL"], "postgresql://gordi@127.0.0.1:5432/gordi_esb"
        )
        self.assertEqual(
            env["SUPABASE_REPORTING_DB_URL"],
            "postgresql://postgres@127.0.0.1:44322/postgres",
        )
        # trust auth — no password in the local DSNs
        self.assertNotIn(":", env["WAREHOUSE_DB_URL"].split("@")[0].rsplit("//", 1)[-1])
        self.assertNotIn(
            ":", env["SUPABASE_REPORTING_DB_URL"].split("@")[0].rsplit("//", 1)[-1]
        )

    def test_org_id_falls_back_to_canonical_gordi_org_from_seed(self):
        """Given no REPORTING_ORG_ID, when build_local_env runs, then REPORTING_ORG_ID is the
        canonical Gordi org id from supabase/seed.sql (10000000-...-001)."""
        from reporting_local_env import build_local_env, DEFAULT_GORDI_ORG_ID

        env = build_local_env({})

        self.assertEqual(env["REPORTING_ORG_ID"], DEFAULT_GORDI_ORG_ID)
        self.assertEqual(DEFAULT_GORDI_ORG_ID, "10000000-0000-0000-0000-000000000001")

    def test_org_id_override_via_report_env_takes_precedence(self):
        """Given REPORTING_ORG_ID is set in the environment, when build_local_env runs, then the
        override wins over the canonical fallback."""
        from reporting_local_env import build_local_env

        env = build_local_env({"REPORTING_ORG_ID": "00000000-0000-0000-0000-0000000000a1"})

        self.assertEqual(env["REPORTING_ORG_ID"], "00000000-0000-0000-0000-0000000000a1")

    def test_env_returns_exactly_the_three_snapshot_required_keys(self):
        """Given build_local_env runs, then the returned dict carries exactly the three keys that
        reporting_snapshot.py's SnapshotConfig.from_env requires (no more, no less)."""
        from reporting_local_env import build_local_env

        env = build_local_env({})

        self.assertEqual(
            set(env), {"WAREHOUSE_DB_URL", "SUPABASE_REPORTING_DB_URL", "REPORTING_ORG_ID"}
        )


if __name__ == "__main__":
    unittest.main()
