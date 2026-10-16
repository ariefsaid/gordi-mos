// Read-only browsing: block every database write from a playwright page (local data must never change).
// Allows reads (GET/HEAD), sign-in (/auth/v1/), and the listed read-only RPCs; aborts anything else and logs it.
// A new read-only RPC in the app shows up here as 'blocked' and an error state on the page — add it to READS.
// Exact read-only functions the app calls (from mos-app/src .rpc(...) calls); anything else is treated as a write.
const READS = new Set(['admin_list_agent_connections', 'admin_list_login_status', 'aggregate_compiled', 'cafe_countable_items',
  'cafe_held_receipts', 'cafe_open_po_identities', 'cafe_opening_team', 'cafe_receipt_esb_refused_portions', 'cafe_receipt_issue_open_pos',
  'cafe_receipt_po_differences', 'cafe_receivable_items', 'can_close_process_run_id', 'can_manage_cafe_item_settings',
  'can_manage_cafe_receipt_issues', 'can_retract_signal', 'can_start_process_for_team', 'default_stream', 'due_process_runs',
  'get_cafe_receipt_issue_access', 'get_signal_post_authority', 'get_work_write_scopes', 'is_cafe_affiliated', 'kitchen_stock_for_date',
  'list_cafe_receipt_halted_groups', 'list_cafe_receipt_photos', 'list_revenue_branches', 'list_role_authority',
  'list_team_lead_assignments', 'list_team_lead_candidates', 'role_authority_allows'])
const isReadRpc = (url) => READS.has((url.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/) || [])[1])
export async function readOnly(page, log = console.log) {
  await page.route(/\/(rest|functions|storage)\/v1\//, (route) => {
    const r = route.request(), m = r.method()
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS' || isReadRpc(r.url())) return route.continue()
    log(`readOnly: blocked ${m} ${r.url().replace(/\?.*/, '')}`)
    return route.abort('blockedbyclient')
  })
}
