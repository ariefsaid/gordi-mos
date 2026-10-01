// mcp: Deno Edge Function entry point: the per-person MOS MCP server.
//
// Unlike agent-chat and compose-view, this function REQUIRES a token carrying `client_id` (an
// agent token) and refuses an app session token, so the client_id refusal helper is deliberately
// not applied here. Business logic lives in handler.ts (pure, unit-tested).
//
// Environment (function secrets): MCP_RESOURCE (this server's resource identifier, equal to the
// `mcp_resource` setting the access-token hook stamps into `aud`), MCP_AUTH_ISSUER (the login
// service's `iss`), optional MCP_JWKS_URL (defaults to the login service's key endpoint on
// SUPABASE_URL) and MCP_ALLOWED_ORIGINS (comma-separated browser origins). SUPABASE_URL and
// SUPABASE_ANON_KEY come from the platform. No service key is read: data calls use the caller's token.
import { mcpHandler } from './handler.ts'

const env = (k: string) => Deno.env.get(k) ?? ''
const baseUrl = env('SUPABASE_URL').replace(/\/$/, '')

Deno.serve((req: Request) =>
  mcpHandler(req, {
    resource: env('MCP_RESOURCE'),
    issuer: env('MCP_AUTH_ISSUER'),
    jwksUrl: env('MCP_JWKS_URL') || `${baseUrl}/auth/v1/.well-known/jwks.json`,
    dataApiUrl: baseUrl,
    anonKey: env('SUPABASE_ANON_KEY'),
    allowedOrigins: env('MCP_ALLOWED_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean),
    fetch,
    now: () => Math.floor(Date.now() / 1000),
    log: (entry) => console.log(JSON.stringify(entry)),
  }),
)
