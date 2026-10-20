#!/usr/bin/env python3
"""Expected-balance worker contract; fabricated ERP responses, no transport."""
import importlib.util
import sys
import unittest
import io
from unittest.mock import patch
from pathlib import Path
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('count_worker', Path(__file__).with_name('esb-worker.py'))
worker = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = worker
spec.loader.exec_module(worker)


class ExpectedBalance(unittest.TestCase):
    def test_ac_014_converts_only_with_erp_supplied_units(self):
        calls = []

        class Erp:
            def get(self, path, params):
                calls.append((path, params))
                return {'result': {'count': 2, 'data': [
                    {'productID': 71, 'productDetailID': 701, 'uomID': 1, 'qty': 1, 'qtySum': -2500},
                    {'productID': 71, 'productDetailID': 702, 'uomID': 2, 'qty': 1000, 'qtySum': -2.5},
                ], 'next': ''}}

        cfg = SimpleNamespace(id_map=SimpleNamespace(
            branches={'fixture': {'branch_id': 11, 'location_id': 12}},
            item_units={'unit': {'product_id': 71, 'product_detail_id': 702}},
        ))
        result = worker.read_count_expected(Erp(), cfg, {
            'branch_code': 'fixture', 'item_unit_id': 'unit', 'count_date': '2026-10-19',
        })
        self.assertEqual(result, {'balance': '-2.5', 'as_of': '2026-10-20T00:00:00+07:00'})
        self.assertEqual(calls, [('/inventory/stock-period/browse', {
            'locationID': 12, 'periodDate': '2026-10-19', 'showAllProduct': 1, 'page': 1, 'limit': 100,
        })])

    def test_ac_014_missing_conversion_is_unavailable_not_guessed(self):
        class Erp:
            def get(self, path, params):
                return {'result': {'count': 1, 'data': [
                    {'productID': 71, 'productDetailID': 701, 'uomID': 1, 'qtySum': 1000},
                ], 'next': ''}}

        cfg = SimpleNamespace(id_map=SimpleNamespace(
            branches={'fixture': {'branch_id': 11, 'location_id': 12}},
            item_units={'unit': {'product_id': 71, 'product_detail_id': 702}},
        ))
        with self.assertRaisesRegex(worker.Permanent, 'conversion'):
            worker.read_count_expected(Erp(), cfg, {
                'branch_code': 'fixture', 'item_unit_id': 'unit', 'count_date': '2026-10-19',
            })


class ExpectedTick(unittest.TestCase):
    def config(self):
        return SimpleNamespace(
            target_env='goo', supabase_url='https://db.example.invalid', supabase_key='fixture-key',
            esb_base_url='https://erp.example.invalid', esb_username='fixture', esb_password='fixture',
            timeout=1, max_rows=50,
            id_map=SimpleNamespace(branches={'fixture': {'branch_id': 11, 'location_id': 12}},
                                   item_units={'unit': {'product_id': 71, 'product_detail_id': 702}}),
        )

    def tick(self, *, claimed=True, error=False):
        calls = []
        def transport(method, url, **kwargs):
            body = kwargs.get('body')
            calls.append((method, url, body))
            if 'reap_esb_pushes' in url:
                return 200, 0
            if 'cafe_count_expected_queue' in url:
                return 200, [{'push_id': 'job', 'row_version': 7, 'branch_code': 'fixture',
                              'item_unit_id': 'unit', 'count_date': '2026-10-19'}]
            if 'claim_cafe_count_expected' in url:
                return 200, claimed
            if 'complete_cafe_count_expected' in url:
                return 200, {'applied': True}
            if '/auth/login' in url:
                return 200, {'status': 'ok', 'result': {'accessToken': 'fixture-token'}}
            if '/inventory/stock-period/browse?' in url:
                if error:
                    raise worker.Transient('fixture timeout')
                return 200, {'status': 'ok', 'result': {'count': 1, 'data': [
                    {'productID': 71, 'productDetailID': 702, 'uomID': 2, 'qtySum': -2.5},
                ], 'next': ''}}
            raise AssertionError(f'unexpected transport call: {method} {url}')
        with patch.object(worker, '_request', transport):
            result = worker.refresh_count_expected(self.config(), out=io.StringIO())
        return result, calls

    def test_ac_014_worker_stores_line_unit_snapshot_after_claim(self):
        bad, calls = self.tick()
        self.assertEqual(bad, 0)
        writes = [body for _, url, body in calls if 'complete_cafe_count_expected' in url]
        self.assertEqual(writes, [{'p_push_id': 'job', 'p_expected_version': 7, 'p_balance': '-2.5',
                                  'p_as_of': '2026-10-20T00:00:00+07:00', 'p_unavailable_reason': None}])
        self.assertFalse(any(method in ('PATCH', 'POST') and '/inventory/' in url for method, url, _ in calls))

    def test_ac_014_worker_marks_erp_failure_unavailable_with_no_figure(self):
        bad, calls = self.tick(error=True)
        self.assertEqual(bad, 1)
        write = next(body for _, url, body in calls if 'complete_cafe_count_expected' in url)
        self.assertIsNone(write['p_balance'])
        self.assertIsNone(write['p_as_of'])
        self.assertEqual(write['p_unavailable_reason'], 'erp_balance_or_conversion_unavailable')

    def test_a_lost_claim_never_contacts_erp(self):
        bad, calls = self.tick(claimed=False)
        self.assertEqual(bad, 0)
        self.assertFalse(any('erp.example.invalid' in url for _, url, _ in calls))
        self.assertFalse(any('complete_cafe_count_expected' in url for _, url, _ in calls))


if __name__ == '__main__':
    unittest.main()
