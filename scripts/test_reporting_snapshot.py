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
        v_daily_revenue_unified filtered to channel='POS' joined with v_daily_cogs_comparison
        (the §7a corrected contract)."""
        sql = " ".join(build_margin_source_query().split())

        self.assertIn("from public.v_daily_revenue_unified r", sql)
        self.assertIn("left join public.v_daily_cogs_comparison c", sql)
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


if __name__ == "__main__":
    unittest.main()
