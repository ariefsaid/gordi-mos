# mcp — per-person MOS MCP server

A stateless MCP Streamable HTTP endpoint (JSON-RPC over POST, JSON responses). One tool per `api_v1`
operation; each call is `POST /rest/v1/rpc/<operation>` on the data API with the caller's own token and
the `api_v1` profile. The function holds no authority and never reads a table.

- **Token rule:** signature verified against the login service's published keys (ES256 or RS256; a key is used
  only when its declared `use`, `alg` and `key_ops`, if any, allow verifying), `iss` is that service,
  unexpired, `aud` contains this resource, `role` is `authenticated`, and `client_id`, `person_id`, `org_id`
  present.
  Anything else is `401` with `WWW-Authenticate: Bearer resource_metadata="…"`. An app session token has no
  `client_id` and no MCP audience, so it never passes.
- **Discovery:** the challenge points at `<resource>/.well-known/oauth-protected-resource`, which this function
  answers itself. The RFC 9728 root-path form (`<origin>/.well-known/oauth-protected-resource<resource path>`,
  what a client derives when a challenge carries no pointer) is served too, but only where the gateway routes it.
- **Body size:** a signed-in request body over 1 MiB is answered `413` without being parsed.
- **Browser origins:** refused (`403`) unless listed in `MCP_ALLOWED_ORIGINS`; a listed origin gets CORS
  headers and its preflight is answered. Native and server clients send no `Origin`.
- **Key fetch:** the login service's key set is cached per isolate; one fetch at most every 30 s (success or
  failure), concurrent misses share it, and each is cut off at 5 s.
- **No client_id refusal here:** `agent-chat` and `compose-view` refuse tokens carrying `client_id`; this
  function is the one that requires them, so it verifies with its own agent-token check rather than
  `_shared/claims.ts`'s `requireVerifiedClaims`.
- **No passthrough:** the token goes only to the data API on the same instance. A `401` from the data API
  (session revoked, token expired) is returned as a `401` challenge so the client re-authenticates.
- **Errors:** a function or fence error becomes a tool result with `isError: true`, the message as text and
  `{code, message, field}` (`details`, `message`, `hint` of the data API body). Each call is cut off at 10 s.
- **Catalog:** `catalog.ts` is generated from the `api_v1` function comments by `scripts/mcp-catalog.sh`
  (`--check` runs in `db-contracts.yml`). Add an operation in a migration, regenerate, commit.
- **Configuration:** `MCP_RESOURCE` (equal to the `mcp_resource` the access-token hook stamps into `aud`),
  `MCP_AUTH_ISSUER` (the login service `iss`; also named in the metadata), optional `MCP_JWKS_URL` and
  `MCP_ALLOWED_ORIGINS`. Unset resource or issuer answers `503`.
- Not in v1: batching, server-to-client streams (`GET` is `405`), sessions.
