from datetime import datetime, timezone
import unittest
from unittest import mock

import reporting_snapshot as snapshot
from test_reporting_snapshot import _observed_run, ORG_A, WAREHOUSE_DSN, REPORTING_DSN


class CancelVoidSnapshotTests(unittest.TestCase):
    NOW = datetime(2026, 10, 20, tzinfo=timezone.utc)
    ROW = dict(row_id="case-a", case_id="case-a", is_case=True, esb_code="TEST",
               branch_code="NEW", sales_date="2026-10-19", sales_num="SYNTHETIC",
               action_kind="sale_void", node_kind="sale", reason_text=None,
               reason_scope="sale_reason_not_exposed", review_value_idr=12500,
               review_value_basis="sale_grand_total", creator_account="shared-till",
               last_editor_account="shared-till", minutes_to_last_edit=42,
               source_contract_version="cancel_void_register.v1")

    def test_copy_preserves_source_nulls_and_identity_without_copying_private_payload(self):
        row = snapshot.normalize_cancel_void_row(
            dict(self.ROW, raw_json={"private": "not copied"}), snapshot_as_of=self.NOW,
            org_id=ORG_A, source_contract_version="cancel_void_register.v1")
        self.assertEqual(row["case_id"], "case-a")
        self.assertIsNone(row["reason_text"])
        self.assertEqual(row["reason_scope"], "sale_reason_not_exposed")
        self.assertNotIn("raw_json", row)
        self.assertEqual(row["org_id"], ORG_A)

    def test_copy_refuses_missing_identity_before_opening_target(self):
        config = snapshot.SnapshotConfig(WAREHOUSE_DSN, REPORTING_DSN, ORG_A)
        with _observed_run([], cancel_void_rows=[dict(self.ROW, case_id="")]) as connections:
            with self.assertRaises(ValueError):
                snapshot.run_cancel_void_snapshot(config, self.NOW)
        self.assertEqual(len(connections), 1)

    def test_bounded_nightly_copy_upserts_source_rows_only_and_never_erases_reviews(self):
        config = snapshot.SnapshotConfig(WAREHOUSE_DSN, REPORTING_DSN, ORG_A)
        with _observed_run([], cancel_void_rows=[self.ROW]) as connections:
            count = snapshot.run_cancel_void_snapshot(config, self.NOW)
        self.assertEqual(count, 1)
        source, target = connections
        query = next(sql for kind, sql, params in source.calls if kind == "execute")
        self.assertIn("public.cancel_void_register_rows", query)
        writes = [(sql, params) for kind, sql, params in target.calls if kind == "executemany"]
        self.assertEqual(len(writes), 1)
        self.assertIn("on conflict (org_id, esb_code, row_id)", writes[0][0])
        self.assertNotIn("delete", writes[0][0].lower())
        self.assertNotIn("mos.cancel_void_reviews", writes[0][0])
        self.assertEqual(writes[0][1][0]["review_value_idr"], 12500)
        self.assertEqual(target.calls[-1][0], "commit")
        self.assertLess(next(index for index, call in enumerate(target.calls) if "set_config" in (call[1] or "")),
                        next(index for index, call in enumerate(target.calls) if call[0] == "executemany"))

    def test_nightly_runner_includes_register(self):
        steps = ["run_snapshot", "run_margin_snapshot", "run_usage_snapshot",
                 "run_recipe_history_snapshot", "run_recipe_findings_snapshot", "run_stock_on_hand_snapshot"]
        patches = [mock.patch.object(snapshot, step, return_value=0) for step in steps]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        with mock.patch.object(snapshot, "run_cancel_void_snapshot", return_value=3) as register:
            counts = snapshot.run_all_snapshots(snapshot.SnapshotConfig(WAREHOUSE_DSN, REPORTING_DSN, ORG_A))
        self.assertEqual(counts["cancel_void"], 3)
        register.assert_called_once()


if __name__ == "__main__":
    unittest.main()
