/**
 * compose-view — Deno Edge Function entry point.
 *
 * Integration-only: this file is NOT unit-tested (D7). All business logic lives in
 * handler.ts (pure, importable in Vitest).
 *
 * Responsibilities of this wrapper:
 *   1. CORS for the configured app origins (_shared/cors.ts).
 *   2. requireVerifiedClaims (_shared/claims.ts): Bearer token, agent tokens refused, JWT verified
 *      by the service-role client (D3 — service_role ONLY for auth.getUser(jwt), never business
 *      data), then org_id + person_id read from it (D1 — no profiles lookup); 401 otherwise.
 *   3. Read AGENT_MODEL_API_KEY / AGENT_MODEL_BASE_URL / AGENT_MODEL_DEFAULT (or
 *      AGENT_MODEL_COMPOSE) from Deno.env (function secrets). Unset/empty model id →
 *      fail loud with 502 MODEL_NOT_CONFIGURED (D4 — no hardcoded default).
 *   4. Parse the JSON body into ComposeViewRequest.
 *   5. Call composeViewHandler(body, {...}).
 *   6. Return JSON response.
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
import { requireVerifiedClaims } from '../_shared/claims.ts'
import { appOrigins, corsHeaders as corsHeadersFor } from '../_shared/cors.ts'
import type { ComposeViewRequest } from './types.ts'

const origins = appOrigins(Deno.env.get('APP_ALLOWED_ORIGINS'))

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = corsHeadersFor(req, origins)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── 1. Verify the caller and read its claims (the shared gate) ─────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const verdict = await requireVerifiedClaims(req, () => createClient(supabaseUrl, serviceRoleKey))
  if (!verdict.ok) {
    return new Response(
      JSON.stringify({ status: 401, error: 'UNAUTHORIZED', detail: verdict.detail }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  const { userId, orgId, personId } = verdict.claims

  // ── 2. Read the model config from function secrets (D4) ────────────────────
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

  // ── 3. Parse request body ─────────────────────────────────────────────────
  let body: ComposeViewRequest
  try {
    body = await req.json() as ComposeViewRequest
  } catch {
    return new Response(
      JSON.stringify({ status: 400, error: 'BAD_REQUEST', detail: 'invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // ── 4. Delegate to the pure handler ───────────────────────────────────────
  const result = await composeViewHandler(body, {
    modelClient,
    model,
    userId,
    personId,
    callerOrgId: orgId,
  })

  // ── 5. Return JSON response ───────────────────────────────────────────────
  return new Response(
    JSON.stringify(result.body),
    {
      status: result.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})
