/**
 * agent-chat — Deno Edge Function entry point (T18).
 *
 * Integration-only: this file is NOT unit-tested (D7). All business logic lives in handler.ts
 * (pure, importable in Vitest).
 *
 * Responsibilities:
 *   1. CORS preflight handling.
 *   2. Read Authorization header; reject 401 if absent.
 *   3. Verify JWT using the service-role client (service_role ONLY for auth.getUser — D3,
 *      FR-P2-DI-002).
 *   4. Decode org_id/person_id/access_roles from the JWT payload (D1 — no profiles lookup),
 *      via the shared decodeJwtClaims (T18, extracted from compose-view's T10 helper).
 *   5. Build the caller-JWT Supabase client for ALL business data (deputy auth — D2/D3).
 *   6. Read AGENT_MODEL_API_KEY / AGENT_MODEL_BASE_URL / AGENT_MODEL_DEFAULT from function
 *      secrets — fail loud (502 MODEL_NOT_CONFIGURED) if the model id is unset (D4, FR-CF-001).
 *   7. Parse the JSON body into AgentChatRequest.
 *   8. Load journaledWrites/startSeq for a resumed run (body.runId present) — persistence gate.
 *   9. Delegate to agentChatHandler; pipe events into an SSE ReadableStream.
 */

// Deno-native imports (not in mos-app/package.json — this file is Deno-only glue, D7).
import { createClient } from '@supabase/supabase-js'
import { agentChatHandler } from './handler.ts'
import type { HandlerDeps } from './handler.ts'
import { loadJournaledWrites, loadMaxSeq } from './persistence.ts'
import { ChatCompletionsClient } from '../_shared/chatCompletionsClient.ts'
import { resolveDefaultModel } from '../_shared/modelResolution.ts'
import { logStructuredError } from '../_shared/errorLog.ts'
import { decodeJwtClaims } from '../_shared/jwt.ts'
import { encodeSse } from '../../../mos-app/src/lib/agent/runtime/transport.ts'
import type { AgentChatRequest } from '../../../mos-app/src/lib/agent/runtime/transport.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request): Promise<Response> => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── 1. Authorization header ──────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ status: 401, error: 'UNAUTHORIZED', detail: 'missing Authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  const jwt = authHeader.slice(7)

  // ── 2. Verify JWT using service-role client (D3) ─────────────────────────────
  // service_role is used ONLY here for auth.getUser(jwt). Never for business data.
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

  // ── 3. Decode org_id/person_id/access_roles from the JWT payload (D1) ────────
  const claims = decodeJwtClaims(jwt)
  if (!claims.org_id || !claims.person_id) {
    return new Response(
      JSON.stringify({ status: 401, error: 'UNAUTHORIZED', detail: 'missing org_id/person_id claim' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // ── 4. Build the caller-JWT Supabase client (deputy auth — D2/D3) ────────────
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })

  // ── 5. Read the model config from function secrets (D4) ──────────────────────
  const apiKey = Deno.env.get('AGENT_MODEL_API_KEY')
  const baseUrl = Deno.env.get('AGENT_MODEL_BASE_URL')
  const model = resolveDefaultModel({ AGENT_MODEL_DEFAULT: Deno.env.get('AGENT_MODEL_DEFAULT') ?? undefined })

  if (!model) {
    logStructuredError({ fn: 'agent-chat', errorCode: 'MODEL_NOT_CONFIGURED' })
    return new Response(
      JSON.stringify({ status: 502, error: 'MODEL_NOT_CONFIGURED', detail: 'AGENT_MODEL_DEFAULT unset' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  if (!apiKey || !baseUrl) {
    logStructuredError({ fn: 'agent-chat', errorCode: 'MISSING_MODEL_SECRETS' })
    return new Response(
      JSON.stringify({ status: 502, error: 'UPSTREAM_ERROR', detail: 'model call failed' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const modelClient = new ChatCompletionsClient({ apiKey, baseUrl })

  // ── 6. Parse request body ─────────────────────────────────────────────────────
  let body: AgentChatRequest
  try {
    body = (await req.json()) as AgentChatRequest
  } catch {
    return new Response(
      JSON.stringify({ status: 400, error: 'BAD_REQUEST', detail: 'invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // ── 7. Persistence deps (default ON; AGENT_PERSISTENCE='false' disables) ─────
  // Bound to the SAME callerClient (never verifierClient/service_role — the deputy invariant).
  const persistenceEnabled = Deno.env.get('AGENT_PERSISTENCE') !== 'false'

  const persistenceDepsBase = {
    // Cast: the real SupabaseClient structurally satisfies HandlerSupabaseLike at runtime
    // (both are minimal Supabase-like interfaces); checking full assignability against the
    // real client's generic type here is unnecessary ceremony — every other `supabase:
    // callerClient` site in this file relies on the same structural fit.
    supabase: callerClient as never,
    ownerId: claims.person_id,
    orgId: claims.org_id,
    now: () => new Date(),
  }

  const journaledWrites = persistenceEnabled && body.runId
    ? await loadJournaledWrites(persistenceDepsBase, body.runId)
    : undefined

  // Seq continuity (T15): a resumed run (body.runId already exists, e.g. a decision re-POST)
  // must continue the run's seq counter, never restart at 0.
  const startSeq = persistenceEnabled && body.runId
    ? (await loadMaxSeq(persistenceDepsBase, body.runId)) + 1
    : undefined

  // ── 8. Pipe agentChatHandler events into an SSE ReadableStream ────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      // Client-disconnect continuation: an enqueue error (dropped socket) is swallowed so the
      // `for await` loop below keeps draining the generator to completion server-side
      // (persisting the remaining journal/heartbeat/terminal-status writes) rather than
      // breaking early and leaving the run's durable-resume state incomplete.
      let socketLive = true
      const deps: HandlerDeps = {
        modelClient,
        model,
        supabase: callerClient as never,
        userId,
        personId: claims.person_id!,
        orgId: claims.org_id!,
        accessRoles: claims.access_roles ?? [],
        // A4 (compose_view): enabled by default in P2 — the panel gates rendering on
        // SHOW_ASSISTANT, so registering the tool is harmless when the flag is off client-side.
        composeEnabled: true,
        persistence: persistenceEnabled
          ? { ...persistenceDepsBase, journaledWrites, startSeq }
          : undefined,
      }
      try {
        for await (const ev of agentChatHandler(body, deps)) {
          if (!socketLive) continue
          try {
            controller.enqueue(enc.encode(encodeSse(ev)))
          } catch {
            socketLive = false
          }
        }
      } finally {
        try {
          controller.close()
        } catch {
          // Already closed/errored (e.g. socket dropped) — nothing further to do.
        }
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
})
