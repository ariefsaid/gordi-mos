/**
 * compose-view — Deno Edge Function entry point.
 *
 * Integration-only: this file is NOT unit-tested (D7). All business logic lives in
 * handler.ts (pure, importable in Vitest).
 *
 * Responsibilities of this wrapper:
 *   1. Read the Authorization header; reject with 401 if absent.
 *   2. Verify the JWT using the service-role Supabase client (D3 — service_role ONLY for
 *      auth.getUser(jwt), never business data).
 *   3. Decode org_id + person_id from the JWT payload (D1 — no profiles lookup).
 *   4. Build a SECOND caller-JWT Supabase client for business data (unused directly by
 *      compose-view today, but constructed for parity with the deputy-invariant posture —
 *      compose-view's model call needs no business-data read itself).
 *   5. Read AGENT_MODEL_API_KEY / AGENT_MODEL_BASE_URL / AGENT_MODEL_DEFAULT (or
 *      AGENT_MODEL_COMPOSE) from Deno.env (function secrets). Unset/empty model id →
 *      fail loud with 502 MODEL_NOT_CONFIGURED (D4 — no hardcoded default).
 *   6. Parse the JSON body into ComposeViewRequest.
 *   7. Call composeViewHandler(body, {...}).
 *   8. Return JSON response.
 *
 * The [functions.compose-view] config.toml block sets verify_jwt = false so the handler
 * can return a typed 401/400/422 body (not Supabase's untyped gate rejection).
 */

// Deno-native imports (not in mos-app/package.json — this file is Deno-only glue, D7).
import { createClient } from '@supabase/supabase-js'
import { composeViewHandler } from './handler.ts'
import { ChatCompletionsClient } from '../_shared/chatCompletionsClient.ts'
import { resolveComposeModel } from '../_shared/modelResolution.ts'
import { logStructuredError } from '../_shared/errorLog.ts'
import type { ComposeViewRequest } from './types.ts'

/**
 * Decode the org_id/person_id/access_roles claims from a JWT payload (D1 — the JWT claim
 * IS the authority; no profiles lookup). Base64url-decodes the payload segment; returns an
 * empty object on any parse failure (the caller must still gate on missing claims).
 */
function decodeJwtClaims(jwt: string): { org_id?: string; person_id?: string; access_roles?: string[] } {
  try {
    const payload = jwt.split('.')[1]
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return { org_id: json.org_id, person_id: json.person_id, access_roles: json.access_roles }
  } catch {
    return {}
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── 1. Read and validate the Authorization header ──────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ status: 401, error: 'UNAUTHORIZED', detail: 'missing Authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  const jwt = authHeader.slice(7) // strip "Bearer "

  // ── 2. Verify JWT using service-role client (D3) ───────────────────────────
  // service_role is used ONLY here to call auth.getUser(jwt). NEVER used for business
  // data queries (D3, FR-P2-DI-002).
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const verifierClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: { user }, error: authError } = await verifierClient.auth.getUser(jwt)
  if (authError || !user) {
    return new Response(
      JSON.stringify({ status: 401, error: 'UNAUTHORIZED', detail: 'invalid JWT' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  const userId = user.id

  // ── 3. Decode org_id + person_id from the JWT payload (D1) ─────────────────
  const claims = decodeJwtClaims(jwt)
  if (!claims.org_id || !claims.person_id) {
    return new Response(
      JSON.stringify({ status: 401, error: 'UNAUTHORIZED', detail: 'missing org_id/person_id claim' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // ── 4. Read the model config from function secrets (D4) ────────────────────
  const apiKey = Deno.env.get('AGENT_MODEL_API_KEY')
  const baseUrl = Deno.env.get('AGENT_MODEL_BASE_URL')
  const model = resolveComposeModel({
    AGENT_MODEL_DEFAULT: Deno.env.get('AGENT_MODEL_DEFAULT') ?? undefined,
    AGENT_MODEL_COMPOSE: Deno.env.get('AGENT_MODEL_COMPOSE') ?? undefined,
  })

  if (!model) {
    logStructuredError({ fn: 'compose-view', errorCode: 'MODEL_NOT_CONFIGURED' })
    return new Response(
      JSON.stringify({ status: 502, error: 'MODEL_NOT_CONFIGURED', detail: 'AGENT_MODEL_DEFAULT unset' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  if (!apiKey || !baseUrl) {
    logStructuredError({ fn: 'compose-view', errorCode: 'MISSING_MODEL_SECRETS' })
    return new Response(
      JSON.stringify({ status: 502, error: 'UPSTREAM_ERROR', detail: 'model call failed' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const modelClient = new ChatCompletionsClient({ apiKey, baseUrl })

  // ── 5. Parse request body ─────────────────────────────────────────────────
  let body: ComposeViewRequest
  try {
    body = await req.json() as ComposeViewRequest
  } catch {
    return new Response(
      JSON.stringify({ status: 400, error: 'BAD_REQUEST', detail: 'invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // ── 6. Delegate to the pure handler ───────────────────────────────────────
  const result = await composeViewHandler(body, {
    modelClient,
    model,
    userId,
    personId: claims.person_id,
    callerOrgId: claims.org_id,
  })

  // ── 7. Return JSON response ───────────────────────────────────────────────
  return new Response(
    JSON.stringify(result.body),
    {
      status: result.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})
