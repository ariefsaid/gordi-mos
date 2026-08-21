from contextlib import contextmanager
import sys
import types
import unittest

from reporting_snapshot import (
    DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION,
    REQUIRED_ENV,
    SnapshotConfig,
    build_margin_source_query,
    build_margin_upsert_sql,
    build_source_query,
    build_upsert_sql,
    normalize_margin_row,
    normalize_row,
    run_margin_snapshot,
    run_snapshot,
)


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
            "bom_coverage_pct": "0.9",
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
            "bom_coverage_pct": "0.95",
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
            "bom_coverage_pct": "0.95",
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

    def test_margin_source_query_reads_pos_only_join(self):
        """AC-SN03: Given the margin source query, when built, then it reads
        v_daily_revenue_unified filtered to channel='POS' joined with fact_daily_cogs_interim
        (the bounded §7a corrected contract)."""
        sql = " ".join(build_margin_source_query().split())

        self.assertIn("from public.v_daily_revenue_unified r", sql)
        self.assertIn("left join public.fact_daily_cogs_interim c", sql)
        self.assertIn("r.channel = 'POS'", sql)
        self.assertIn("c.sm_total", sql)
        self.assertIn("c.bom_total", sql)
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
    "bom_coverage_pct": "0.9",
}


class _RecordingCursor:
    def __init__(self, connection):
        self._connection = connection

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def execute(self, sql, params=None):
        self._connection.calls.append(("execute", sql, params))

    def executemany(self, sql, params_seq):
        self._connection.calls.append(("executemany", sql, list(params_seq)))

    def fetchall(self):
        return list(self._connection.source_rows)


class _RecordingConnection:
    def __init__(self, dsn, source_rows):
        self.dsn = dsn
        self.source_rows = source_rows
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
def _observed_run(source_rows):
    """Stand in for psycopg for the duration of a run, and hand back the connections it opened.

    reporting_snapshot imports psycopg inside its run functions, so substituting the module in
    sys.modules is enough — and it is restored afterwards, so a machine that really has psycopg
    installed is left exactly as it was found.
    """
    connections = []

    def connect(dsn, **_kwargs):
        connection = _RecordingConnection(dsn, source_rows)
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
        ):
            with self.subTest(run=run.__name__, org=org):
                calls = run(org)
                self._assert_declares_then_writes(calls, org)
                self.assertNotIn(other, repr(calls))


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
