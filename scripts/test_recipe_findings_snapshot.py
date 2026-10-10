"""The reporting register copies evidence; it never recomputes warehouse rules."""
import json
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import reporting_snapshot as snapshot
from test_reporting_snapshot import _observed_run, WAREHOUSE_DSN, REPORTING_DSN, ORG_A

STAMP = datetime(2026, 10, 10, 7, tzinfo=timezone.utc)


def finding(**changes):
    return {
        "finding_id": "synthetic-finding", "day": date(2026, 10, 9), "esb_code": "TEST",
        "branch_code": "NEW", "menu_id": 101, "menu_name": "Synthetic lunch menu",
        "classification": "warehouse_artefact", "rule": "unit_comparison_unverified",
        "confidence": "candidate_current_recipe_not_historical_proof", "needs_human": True,
        "impact_idr": None, "impact_basis": "not_quantified", "recommended_check": "Check recorded units",
        "expected_qty_day_comparable": None, "actual_qty_day_comparable": Decimal("12.5"),
        "comparison_unit": "PCS", "conversion_evidence": {"recipe_units": [{"status": "conflicting_recorded_conversions"}]},
        "recipe_version_hash": "synthetic-hash", "source_checked_at": STAMP,
        "refreshed_at": STAMP, "replica_stale": False, "algorithm_version": "57.1",
        **changes,
    }


class RecipeFindingsSnapshotTests(unittest.TestCase):
    def test_projection_retains_nulls_units_source_time_and_only_allowlisted_evidence(self):
        normalize = getattr(snapshot, "normalize_recipe_finding", None)
        self.assertTrue(callable(normalize), "the recipe finding projection is missing")
        row = normalize(finding(raw_json={"private": "not copied"}), snapshot_as_of=STAMP,
                        org_id=ORG_A, source_contract_version="recipe_deduction_findings.v2")
        self.assertIsNone(row["expected_qty_day_comparable"])
        self.assertEqual(row["actual_qty_day_comparable"], Decimal("12.5"))
        self.assertIsNone(row["impact_idr"])
        self.assertEqual(row["source_checked_at"], STAMP)
        self.assertEqual(row["comparison_unit"], "PCS")
        self.assertEqual(row["org_id"], ORG_A)
        self.assertNotIn("raw_json", row)
        self.assertEqual(json.loads(row["conversion_evidence"]), finding()["conversion_evidence"])

    def run_snapshot(self, *, rows=(), states=None, **kwargs):
        states = states if states is not None else [{"esb_code": "TEST", "status": "completed", "completed_at": STAMP}]
        with _observed_run([], state_rows=states, finding_rows=rows, **kwargs) as connections:
            count = snapshot.run_recipe_findings_snapshot(
                snapshot.SnapshotConfig(WAREHOUSE_DSN, REPORTING_DSN, ORG_A), STAMP)
        return count, connections

    def test_completed_copy_replaces_exact_company_window_and_publishes_receipt_in_one_transaction(self):
        count, connections = self.run_snapshot(rows=[finding()])
        self.assertEqual(count, 1)
        target, source = connections
        self.assertIn("set_config('app.reporting_org'", target.calls[0][1])
        self.assertIn("pg_advisory_xact_lock", target.calls[1][1])
        delete = next(c for c in target.calls if "delete from" in c[1])
        self.assertEqual(delete[2], (ORG_A, "TEST", date(2026, 8, 12), date(2026, 10, 10)))
        insert = next(c for c in target.calls if c[0] == "executemany")
        self.assertEqual(insert[2][0]["finding_id"], "synthetic-finding")
        self.assertIn("v.first_seen <= %(day)s", insert[1])
        self.assertIn("v.source_observed_at <= %(source_checked_at)s", insert[1])
        receipt = target.calls[-2]
        self.assertIn("insert into reporting.recipe_finding_snapshots", receipt[1])
        self.assertTrue(receipt[2][-1])
        self.assertEqual(target.calls[-1][0], "commit")
        self.assertEqual([c[0] for c in target.calls].count("commit"), 1)
        self.assertIn("repeatable read, read only", source.calls[0][1])
        self.assertEqual(source.calls[-1][2], (date(2026, 8, 12), date(2026, 10, 10)))
        self.assertIn("s.status = 'completed'", source.calls[-1][1])

    def test_successful_empty_window_clears_old_findings_but_incomplete_pass_keeps_them(self):
        for status, replaces in [("completed", True), ("failed", False), ("running", False)]:
            with self.subTest(status=status):
                count, connections = self.run_snapshot(states=[{"esb_code": "TEST", "status": status, "completed_at": STAMP}])
                self.assertEqual(count, 0)
                calls = connections[0].calls
                self.assertEqual(any("delete from" in (c[1] or "") for c in calls), replaces)
                self.assertEqual(calls[-2][2][-1], replaces)

    def test_findings_newer_than_completed_pass_are_not_certified_as_empty(self):
        newer = datetime(2026, 10, 10, 8, tzinfo=timezone.utc)
        count, connections = self.run_snapshot(states=[{"esb_code": "TEST", "status": "completed", "completed_at": STAMP, "latest_findings_at": newer}])
        self.assertEqual(count, 0)
        self.assertFalse(any("delete from" in (c[1] or "") for c in connections[0].calls))
        self.assertFalse(connections[0].calls[-2][2][-1])

    def test_missing_target_does_not_open_source(self):
        for table in ("reporting.recipe_deduction_findings", "reporting.recipe_finding_snapshots"):
            with self.subTest(table=table):
                count, connections = self.run_snapshot(missing_target_table=table)
                self.assertIsNone(count)
                self.assertEqual(len(connections), 1)
                self.assertEqual(connections[0].calls, [])

    def test_older_run_cannot_replace_a_newer_receipt(self):
        later = datetime(2026, 10, 11, tzinfo=timezone.utc)
        count, connections = self.run_snapshot(reporting_rows=[{"snapshot_as_of": later}])
        self.assertIsNone(count)
        self.assertEqual(len(connections), 1)
        self.assertFalse(any("delete from" in c[1] for c in connections[0].calls))

    def test_bad_projection_aborts_without_deleting_or_committing(self):
        with _observed_run([], finding_rows=[finding(day=None)], state_rows=[{"esb_code": "TEST", "status": "completed", "completed_at": STAMP}]) as connections:
            with self.assertRaisesRegex(ValueError, "finding day"):
                snapshot.run_recipe_findings_snapshot(snapshot.SnapshotConfig(WAREHOUSE_DSN, REPORTING_DSN, ORG_A), STAMP)
        self.assertFalse(any(c[0] == "commit" or "delete from" in c[1] for c in connections[0].calls))

    def test_nightly_job_includes_findings_after_retaining_recipe_history(self):
        with patch.object(snapshot, "run_snapshot", return_value=0), \
             patch.object(snapshot, "run_margin_snapshot", return_value=0), \
             patch.object(snapshot, "run_usage_snapshot", return_value=0), \
             patch.object(snapshot, "run_recipe_history_snapshot", return_value=0) as history, \
             patch.object(snapshot, "run_recipe_findings_snapshot", return_value=3) as findings:
            counts = snapshot.run_all_snapshots(snapshot.SnapshotConfig(WAREHOUSE_DSN, REPORTING_DSN, ORG_A))
        self.assertEqual(counts["recipe_findings"], 3)
        self.assertEqual(history.call_args.args[1], findings.call_args.args[1])


if __name__ == "__main__":
    unittest.main()
