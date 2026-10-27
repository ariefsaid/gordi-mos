import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('refresh-cafe-stream-items.py')


class StreamUsageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('stream_usage', SCRIPT)
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def test_psql_password_travels_in_the_environment_not_the_command_line(self):
        target, env = self.module.psql_target('postgresql://ops:s%40cret@db.example.test:5432/postgres')
        self.assertEqual(target, 'postgresql://ops@db.example.test:5432/postgres')
        self.assertEqual(env['PGPASSWORD'], 's@cret')
        self.assertEqual(self.module.psql_target('postgresql://localhost/postgres')[0], 'postgresql://localhost/postgres')

    def test_production_wins_per_branch_activity_not_globally(self):
        rows = [self.row('A', '1', 'Simple Manufacturing', 2, 0, True),
                self.row('A', '2', 'Simple Manufacturing', 0, 3, False),
                self.row('A', '3', 'POS Sales', 0, 1, True),
                self.row('B', '3', 'POS Sales', 0, 1, True),
                self.row('A', '4', 'POS Sales', 0, 1, True, 'bar')]
        self.assertEqual(self.select(rows), [
            {'esb_product_id': '1', 'branch_code': 'branch_a'},
            {'esb_product_id': '2', 'branch_code': 'branch_a'},
            {'esb_product_id': '3', 'branch_code': 'branch_b'},
            {'esb_product_id': '4', 'branch_code': 'branch_a'}])

    def test_window_counts_direction_dedup_and_unmapped(self):
        rows = [self.row('A', '1', 'Stock Opname', 1, 0, True),
                self.row('A', '2', 'Simple Manufacturing', 0, 1, True),
                self.row('A', '3', 'Simple Manufacturing', 1, 0, False),
                self.row('UNKNOWN', '4', 'Simple Manufacturing', 1, 0, True),
                self.row('A', '5', 'Simple Manufacturing', 1, 0, True, day='2026-04-22'),
                self.row('A', '5', 'Simple Manufacturing', 1, 0, True, day='2026-04-23'),
                self.row('A', '5', 'Simple Manufacturing', 1, 0, True),
                self.row('A', '6', 'Simple Manufacturing', 1, 0, True, day='2026-10-20')]
        self.assertEqual(self.select(rows), [
            {'esb_product_id': '4', 'branch_code': 'UNKNOWN'},
            {'esb_product_id': '5', 'branch_code': 'branch_a'}])

    def test_corrected_six_month_fixture_has_disjoint_wip_and_shared_raw(self):
        rows = []
        for branch, raw_count in [('A', 109), ('B', 114)]:
            rows += [self.row(branch, f'{branch}-wip-{n}', 'Simple Manufacturing', 1, 0, True) for n in range(61)]
            rows += [self.row(branch, f'raw-{n}', 'Simple Manufacturing', 0, 1, False) for n in range(raw_count)]
        usage = self.select(rows)
        a = {r['esb_product_id'] for r in usage if r['branch_code'] == 'branch_a'}
        b = {r['esb_product_id'] for r in usage if r['branch_code'] == 'branch_b'}
        self.assertEqual((len(a), len(b)), (170, 175))
        self.assertEqual(a & b, {f'raw-{n}' for n in range(109)})

    def test_secondary_movements_do_not_replace_observed_production(self):
        rows = [self.row('A', '1', 'Simple Manufacturing', 0, 1, True),
                self.row('A', '2', 'Purchase Receipt', 1, 0, True)]
        self.assertEqual(self.select(rows), [])

    def test_json_lines_reject_partial_garbage_instead_of_losing_memberships(self):
        with self.assertRaises(ValueError):
            self.module.parse_rows(json.dumps(self.row('A', '1', 'Simple Manufacturing', 1, 0, True)) + '\nnot-json')

    def test_replica_query_keeps_detail_identity_company_and_window(self):
        catalog = [dict(esb_product_id='product', esb_product_detail_id='detail', category='Kitchen',
                        has_active_bom_output=True, is_active=True, erp_category_type_name='Inventory')]
        query = self.module.build_usage_sql(catalog, "test'company", date(2026, 4, 23), date(2026, 10, 20))
        self.assertIn('sm.product_detail_id::text = item.detail_id', query)
        self.assertIn("'test''company'", query)
        self.assertIn("sm.document_date >= date '2026-04-23'", query)
        self.assertIn("sm.document_date < date '2026-10-20'", query)
        self.assertIn("'detail','product','kitchen',true", query)
        with self.assertRaises(ValueError):
            self.module.build_usage_sql([], 'test', date(2026, 4, 23), date(2026, 10, 20))

    def test_cli_refuses_empty_feed_and_invalid_mapping_or_window(self):
        for extra, rows in [([], []), (['--days', '0'], [{}]),
                            (['--branch-map', 'A=one,B=one'], [{}]),
                            (['--apply', '--dry-run'], [{}])]:
            with self.subTest(extra=extra):
                result = subprocess.run([sys.executable, str(SCRIPT), '--usage', '-', '--branch-map', 'A=branch_a', *extra],
                                        input=json.dumps(rows), text=True, capture_output=True)
                self.assertEqual(result.returncode, 2)
                self.assertNotIn('ops.refresh_cafe_stream_items', result.stdout)

    def test_bad_feed_is_refused_not_silently_reconciled(self):
        with self.assertRaises(ValueError):
            self.select([{'branch_code': 'A'}])
        with self.assertRaises(ValueError):
            self.select([self.row('A', '1', 'Simple Manufacturing', -1, 0, True)])

    def test_cli_defaults_to_dry_run_and_prints_private_refresh_sql(self):
        result = subprocess.run([sys.executable, str(SCRIPT), '--usage', '-', '--branch-map', 'A=branch_a', '--as-of', '2026-10-20'],
                                input=json.dumps([self.row('A', '1', 'Simple Manufacturing', 1, 0, True)]), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('ops.refresh_cafe_stream_items', result.stdout)
        self.assertIn('rollback;', result.stdout)
        self.assertIn('2026-04-23', result.stderr)

    def test_replica_command_reads_catalog_then_emits_reconciliation_dry_run(self):
        catalog = [dict(esb_product_id='1', esb_product_detail_id='detail-1', category='Kitchen',
                        has_active_bom_output=True, is_active=True, erp_category_type_name='Inventory')]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'catalog.json'
            path.write_text(json.dumps(catalog))
            with patch.object(self.module.subprocess, 'run', return_value=SimpleNamespace(stdout=json.dumps([
                    self.row('A', '1', 'Simple Manufacturing', 1, 0, True)]))) as run:
                result, output, _ = self.main(['--erp-query-cmd', 'replica-reader', '--catalog', str(path), '--esb-code', 'TEST'])
            self.assertEqual(result, 0)
            self.assertIn('sm.product_detail_id::text = item.detail_id', run.call_args.args[0][-1])
            self.assertIn('"branch_code": "branch_a"', output)
            self.assertIn('rollback;', output)

    def test_replica_database_password_only_reaches_psql_environment(self):
        catalog = [dict(esb_product_id='1', esb_product_detail_id='detail-1', category='Kitchen',
                        has_active_bom_output=True, is_active=True, erp_category_type_name='Inventory')]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'catalog.json'
            path.write_text(json.dumps(catalog))
            with patch.dict(self.module.os.environ, {
                    'WAREHOUSE_DB_URL': 'postgresql://reader:s%40cret@warehouse.example.test:5432/warehouse'}), \
                    patch.object(self.module.subprocess, 'run', return_value=SimpleNamespace(stdout=json.dumps([
                        self.row('A', '1', 'Simple Manufacturing', 1, 0, True)]))) as run:
                result, output, error = self.main([
                    '--erp-query-cmd', 'replica-reader', '--erp-db-url-env', 'WAREHOUSE_DB_URL',
                    '--catalog', str(path), '--esb-code', 'TEST'])
            self.assertEqual(result, 0, error)
            command = run.call_args.args[0]
            self.assertEqual(command, [
                'replica-reader', 'postgresql://reader@warehouse.example.test:5432/warehouse',
                '-c', command[-1]])
            self.assertNotIn('s%40cret', ' '.join(command))
            self.assertEqual(run.call_args.kwargs['env']['PGPASSWORD'], 's@cret')
            self.assertIn('rollback;', output)

    def test_replica_database_url_env_and_command_shape_fail_closed(self):
        catalog = [dict(esb_product_id='1', esb_product_detail_id='detail-1', category='Kitchen',
                        has_active_bom_output=True, is_active=True, erp_category_type_name='Inventory')]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'catalog.json'
            path.write_text(json.dumps(catalog))
            for env, command in [({}, 'replica-reader'),
                                 ({'WAREHOUSE_DB_URL': 'mysql://reader:secret@warehouse.example.test/db'}, 'replica-reader'),
                                 ({'WAREHOUSE_DB_URL': 'postgresql://reader:secret@warehouse.example.test/db'}, 'psql -c')]:
                with self.subTest(env=env, command=command), \
                        patch.dict(self.module.os.environ, env, clear=True), \
                        patch.object(self.module.subprocess, 'run') as run:
                    result, output, error = self.main([
                        '--erp-query-cmd', command, '--erp-db-url-env', 'WAREHOUSE_DB_URL',
                        '--catalog', str(path), '--esb-code', 'TEST'])
                self.assertEqual(result, 2)
                self.assertNotIn('secret', error)
                self.assertEqual(output, '')
                run.assert_not_called()

    def test_apply_prefers_environment_url_and_passes_password_only_to_psql_environment(self):
        url = 'postgresql://ops:s%40cret@localhost:5432/test'
        target = 'postgresql://ops@localhost:5432/test'
        with patch.dict(self.module.os.environ, {'CAFE_STREAM_ITEMS_DB_URL': url}), \
                patch.object(self.module.subprocess, 'run') as run:
            result, _, _ = self.main(['--usage', '-', '--apply', '--db-url', 'postgresql://localhost/fallback'])
        self.assertEqual(result, 0)
        self.assertEqual(run.call_args.args[0], ['psql', target, '-X', '-v', 'ON_ERROR_STOP=1'])
        self.assertEqual(run.call_args.kwargs['env']['PGPASSWORD'], 's@cret')
        self.assertIn('begin;', run.call_args.kwargs['input'])
        self.assertIn('commit;', run.call_args.kwargs['input'])

    def test_apply_uses_password_free_deprecated_fallback(self):
        target = 'postgresql://localhost/test'
        with patch.dict(self.module.os.environ, {}, clear=True), \
                patch.object(self.module.subprocess, 'run') as run:
            result, _, _ = self.main(['--usage', '-', '--apply', '--db-url', target])
        self.assertEqual(result, 0)
        self.assertEqual(run.call_args.args[0], ['psql', target, '-X', '-v', 'ON_ERROR_STOP=1'])

    def test_password_in_db_url_fallback_is_refused(self):
        with patch.dict(self.module.os.environ, {}, clear=True), \
                patch.object(self.module.subprocess, 'run') as run:
            result, _, error = self.main(['--usage', '-', '--apply', '--db-url', 'postgresql://ops:secret@localhost/test'])
        self.assertEqual(result, 2)
        self.assertIn('--db-url must not contain a password', error)
        run.assert_not_called()

    def test_apply_requires_an_environment_url_or_fallback(self):
        with patch.dict(self.module.os.environ, {}, clear=True), \
                patch.object(self.module.subprocess, 'run') as run:
            result, _, error = self.main(['--usage', '-', '--apply'])
        self.assertEqual(result, 2)
        self.assertIn('requires CAFE_STREAM_ITEMS_DB_URL', error)
        run.assert_not_called()

    def test_apply_uses_atomic_sql_and_psql_failure_does_not_print_target(self):
        target = 'postgresql://localhost/test'
        with patch.dict(self.module.os.environ, {}, clear=True), \
                patch.object(self.module.subprocess, 'run') as run:
            result, _, _ = self.main(['--usage', '-', '--apply', '--db-url', target])
            self.assertEqual(result, 0)
            self.assertEqual(run.call_args.args[0], ['psql', target, '-X', '-v', 'ON_ERROR_STOP=1'])
            self.assertIn('begin;', run.call_args.kwargs['input'])
            self.assertIn('commit;', run.call_args.kwargs['input'])
        with patch.dict(self.module.os.environ, {}, clear=True), \
                patch.object(self.module.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, ['psql', target])):
            result, _, error = self.main(['--usage', '-', '--apply', '--db-url', target])
            self.assertEqual(result, 2)
            self.assertNotIn(target, error)
            self.assertIn('external command failed', error)

    def test_apply_refuses_implicit_remote_target(self):
        with patch.dict(self.module.os.environ, {}, clear=True), \
                patch.object(self.module.subprocess, 'run') as run:
            result, _, error = self.main(['--usage', '-', '--apply', '--db-url', 'postgresql://example.invalid/test'])
            self.assertEqual(result, 2)
            self.assertIn('remote target requires owner authorization', error)
            run.assert_not_called()

    def main(self, arguments):
        output, error = io.StringIO(), io.StringIO()
        movement = json.dumps([self.row('A', '1', 'Simple Manufacturing', 1, 0, True)])
        with patch.object(sys, 'argv', [str(SCRIPT), '--branch-map', 'A=branch_a', '--as-of', '2026-10-20', *arguments]), \
                patch.object(sys, 'stdin', io.StringIO(movement)), redirect_stdout(output), redirect_stderr(error):
            result = self.module.main()
        return result, output.getvalue(), error.getvalue()

    def select(self, rows):
        return self.module.select_usage(rows, {'A': 'branch_a', 'B': 'branch_b'}, date(2026, 10, 20), 180)

    @staticmethod
    def row(branch, product, movement, incoming, outgoing, wip, activity='kitchen', day='2026-10-19'):
        return dict(branch_code=branch, esb_product_id=product, transaction_type=movement,
                    qty_in=incoming, qty_out=outgoing, has_active_bom_output=wip,
                    activity=activity, document_date=day)


if __name__ == '__main__':
    unittest.main()
