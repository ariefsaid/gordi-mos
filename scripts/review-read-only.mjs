// Playwright guard for reviews against a shared database. Install on a context before navigation.
// Supabase reads may use POST for RPCs, so HTTP method alone is not a write classifier.
const READ_RPCS = new Set([
  'admin_list_login_status',
  'aggregate_compiled',
  'cafe_opening_team',
  'can_close_process_run_id',
  'can_retract_signal',
  'can_start_process_for_team',
  'default_stream',
  'due_process_runs',
  'get_signal_post_authority',
  'get_work_write_scopes',
  'is_cafe_affiliated',
  'kitchen_stock_for_date',
  'list_revenue_branches',
  'list_role_authority',
  'list_team_lead_assignments',
  'list_team_lead_candidates',
])

export function classifyReviewRequest(method, rawUrl, backendOrigin) {
  const verb = method.toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(verb)) return { allowed: true }

  const url = new URL(rawUrl)
  const trustedBackend = backendOrigin && url.origin === new URL(backendOrigin).origin
  const rpc = url.pathname.match(/\/rest\/v1\/rpc\/([^/]+)\/?$/)
  if (trustedBackend && verb === 'POST' && rpc && READ_RPCS.has(decodeURIComponent(rpc[1]))) {
    return { allowed: true }
  }
  // A saved Playwright session may refresh its token while a review is running.
  if (trustedBackend && verb === 'POST' && url.pathname.endsWith('/auth/v1/token') &&
      url.searchParams.get('grant_type') === 'refresh_token') {
    return { allowed: true }
  }
  return { allowed: false, reason: rpc ? 'unclassified RPC' : 'non-read request' }
}

export async function installReadOnlyReviewGuard(context, backendOrigin) {
  if (!backendOrigin) throw new Error('read-only review guard requires the exact backend origin')
  const blocked = []
  await context.route('**/*', async (route) => {
    const request = route.request()
    const result = classifyReviewRequest(request.method(), request.url(), backendOrigin)
    if (result.allowed) return route.continue()
    blocked.push({ method: request.method(), url: request.url(), reason: result.reason })
    return route.abort('blockedbyclient')
  })
  return blocked
}
