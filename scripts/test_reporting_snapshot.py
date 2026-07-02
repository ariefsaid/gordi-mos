import unittest

from reporting_snapshot import (
    REQUIRED_ENV,
    SnapshotConfig,
    build_source_query,
    build_upsert_sql,
    normalize_row,
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


if __name__ == "__main__":
    unittest.main()
