#!/usr/bin/env python3
"""Reconcile stream items after an ERP sync. Dry-run SQL by default; no ERP writes.

--usage accepts enriched stock movements (array or JSON lines). Alternatively --erp-query-cmd
receives one SELECT as its final argument; --catalog supplies the same item/detail JSON used by
the item-reference importer. --branch-map is explicit ERP-code=MOS-code pairs; unknown codes
stay unknown so the private refresh reports them. Run the catalog import before this script.
Only --apply contacts MOS; --db-url is supplied at runtime. Run --dry-run SQL in a transaction
for reconciliation evidence before applying. No item settings, counts or memberships are deleted.
"""
import argparse
import json
import math
import shlex
import subprocess
import sys
from datetime import date, datetime, timedelta
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

EXCLUDED = {'Stock Opname', 'Stock Opname Minus Resolve', 'Inventory Revaluation', 'Purchase Invoice Adjustment'}


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def select_usage(rows, branch_map, as_of, days):
    start = as_of - timedelta(days=days)
    eligible = []
    for row in rows:
        if not isinstance(row, dict) or not {'branch_code', 'esb_product_id', 'activity', 'transaction_type', 'document_date', 'qty_in', 'qty_out', 'has_active_bom_output'} <= row.keys():
            raise ValueError('movement row is missing usage evidence')
        branch = row['branch_code']
        product = row['esb_product_id']
        activity = row['activity']
        movement = row['transaction_type']
        day = date.fromisoformat(row['document_date'][:10])
        incoming, outgoing = float(row['qty_in']), float(row['qty_out'])
        wip = row['has_active_bom_output']
        if not isinstance(wip, bool) or not branch or not product or not all(math.isfinite(q) and q >= 0 for q in (incoming, outgoing)):
            raise ValueError('invalid stock movement evidence')
        if activity not in ('kitchen', 'bar') or not start <= day < as_of or movement in EXCLUDED:
            continue
        production = movement == 'Simple Manufacturing' and ((wip and incoming > 0) or (not wip and outgoing > 0))
        eligible.append((branch, activity, str(product), production, movement, incoming + outgoing))
    producing = {(branch, activity) for branch, activity, _, _, movement, quantity in eligible
                 if movement == 'Simple Manufacturing' and quantity > 0}
    usage = {(branch_map.get(branch, branch), product)
             for branch, activity, product, production, movement, quantity in eligible
             if production or ((branch, activity) not in producing and movement != 'Simple Manufacturing' and quantity > 0)}
    return [{'esb_product_id': product, 'branch_code': branch} for branch, product in sorted(usage, key=lambda pair: (pair[1], pair[0]))]


def build_usage_sql(catalog, company, start, end):
    details = {(str(row['esb_product_detail_id']), str(row['esb_product_id']),
                row['category'].strip().lower(), row['has_active_bom_output'])
               for row in catalog if row.get('is_active') is True
               and row.get('erp_category_type_name', '').lower() == 'inventory'
               and row.get('category', '').strip().lower() in ('kitchen', 'bar')}
    if not details or any(not isinstance(row[3], bool) for row in details):
        raise ValueError('catalog needs active Inventory detail and BOM evidence')
    values = ',\n'.join('(' + ','.join([literal(detail), literal(product), literal(activity), 'true' if wip else 'false']) + ')'
                        for detail, product, activity, wip in sorted(details))
    return f"""SELECT row_to_json(usage) FROM (
  SELECT sm.branch_code, item.esb_product_id, item.activity, item.has_active_bom_output,
         sm.transaction_type, sm.document_date::text, sm.qty_in, sm.qty_out
    FROM public.stock_movement sm
    JOIN (VALUES {values}) AS item(detail_id,esb_product_id,activity,has_active_bom_output)
      ON sm.product_detail_id::text = item.detail_id
   WHERE sm.esb_code = {literal(company)}
     AND sm.document_date >= date '{start}' AND sm.document_date < date '{end}'
) usage;"""


def parse_rows(text):
    text = text.strip()
    if text.startswith('['):
        rows = json.loads(text)
    else:
        rows = [json.loads(line) for line in text.splitlines() if line.strip()]
    if not isinstance(rows, list):
        raise ValueError('expected a JSON array or JSON lines')
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--usage', help='enriched stock movements file; - reads stdin')
    source.add_argument('--erp-query-cmd', help='read-only replica query command')
    parser.add_argument('--catalog', help='item reference source JSON for replica query')
    parser.add_argument('--esb-code', help='ERP company code for replica query')
    parser.add_argument('--branch-map', required=True, help='ERP=MOS pairs, comma separated')
    parser.add_argument('--days', type=int, default=180)
    parser.add_argument('--as-of', type=date.fromisoformat, default=datetime.now(ZoneInfo('Asia/Jakarta')).date())
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--db-url', help='MOS database URL, supplied at runtime')
    parser.add_argument('--allow-remote', action='store_true', help='owner-authorized remote target')
    args = parser.parse_args()
    try:
        if args.days < 1 or args.days > 3660 or (args.apply and args.dry_run):
            raise ValueError('invalid window or conflicting run modes')
        pairs = [pair.split('=') for pair in args.branch_map.split(',')]
        if any(len(pair) != 2 or not all(pair) for pair in pairs):
            raise ValueError('branch map must contain ERP=MOS pairs')
        mapping = dict(pairs)
        if len(mapping) != len(pairs) or len(set(mapping.values())) != len(mapping):
            raise ValueError('branch map must be one-to-one')
        if args.usage:
            if args.usage == '-':
                text = sys.stdin.read()
            else:
                with open(args.usage, encoding='utf-8') as handle:
                    text = handle.read()
        else:
            if not args.catalog or not args.esb_code:
                raise ValueError('replica query requires --catalog and --esb-code')
            with open(args.catalog, encoding='utf-8') as handle:
                catalog = json.load(handle)
            query = build_usage_sql(catalog, args.esb_code, args.as_of - timedelta(days=args.days), args.as_of)
            result = subprocess.run(shlex.split(args.erp_query_cmd) + [query], capture_output=True, text=True, check=True)
            text = result.stdout
        rows = parse_rows(text)
        # Empty input is more likely a failed/stale replica query than a genuine full snapshot.
        if not rows:
            raise ValueError('empty movement feed refused; inspect the replica/window before reconciling')
        usage = select_usage(rows, mapping, args.as_of, args.days)
        sql = ('begin;\nset local lock_timeout = \'10s\';\nselect ops.refresh_cafe_stream_items('
               + literal(json.dumps(usage)) + '::jsonb);\n' + ('commit;' if args.apply else 'rollback;') + '\n')
        print(f'Window {args.as_of - timedelta(days=args.days)}..<{args.as_of}; {len(usage)} memberships', file=sys.stderr)
        if args.apply:
            if not args.db_url or urlsplit(args.db_url).scheme not in ('postgres', 'postgresql'):
                raise ValueError('--apply requires a PostgreSQL --db-url')
            if urlsplit(args.db_url).hostname not in ('localhost', '127.0.0.1', '::1') and not args.allow_remote:
                raise ValueError('remote target requires owner authorization and --allow-remote')
            subprocess.run(['psql', args.db_url, '-X', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, check=True)
        else:
            sys.stdout.write(sql)
    except (ValueError, KeyError, TypeError, OSError, subprocess.CalledProcessError) as error:
        # A subprocess failure includes its command, which may contain database credentials.
        message = f'external command failed (exit {error.returncode})' if isinstance(error, subprocess.CalledProcessError) else str(error)
        print(f'refresh-cafe-stream-items: {message}', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
