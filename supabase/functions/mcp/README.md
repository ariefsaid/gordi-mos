# mcp — per-person MOS MCP server

A stateless MCP Streamable HTTP endpoint (JSON-RPC over POST, JSON responses). One tool per `api_v1`
operation; each call is `POST /rest/v1/rpc/<operation>` on the data API with the caller's own token and
the `api_v1` profile. The function holds no authority and never reads a table.

- **Token rule:** signature verified against the login service's published keys (ES256 or RS256), `iss` is
  that service, unexpired, `aud` contains this resource, and `client_id`, `person_id`, `org_id` present.
  Anything else is `401` with `WWW-Authenticate: Bearer resource_metadata="…"`. An app session token has no
  `client_id` and no MCP audience, so it never passes.
- **No client_id refusal here:** `agent-chat` and `compose-view` refuse tokens carrying `client_id`; this
  function is the one that requires them, so `_shared/jwt.ts`'s `carriesClientId` is not used.
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
