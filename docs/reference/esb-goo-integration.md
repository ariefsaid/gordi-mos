# ESB GOO staging integration — reference (for future agents)

**Status:** verified live 2026-06-26. This doc exists so no future agent re-derives the GOO
coordinates, auth, or tenant quirks from scratch (it took a full session the first time). Authority
is `docs/specs/kitchen-module.spec.md` (FR-080..084) + `docs/adr/0012-…`; this is the operational
how-to + the hard-won gotchas. **De-reference firewall note:** ESB is Gordi's real ERP integration
partner — these are integration coordinates, not external design references.

## TL;DR
- **GOO Core API base = `https://stg7.esb.co.id/core-stg`.** NOT `stg-erp.esb.co.id` (that's the ESB
  ERP **web UI** — it 302s→`/site/login` and 500s on API paths). The old spec coordinate was wrong.
- **Auth = login (username/password)**, NOT a static token. Creds: `op-get.sh esb-staging Gordi username|password` (1Password vault **Gordi**). Live login on `…/core-stg/auth/login` → 357-char token, company **SAE**.
- **The `esb-staging-static-token` is NOT for the kitchen worker.** It's a Static Bearer for the ESB
  **OMS read API** (`core-api.esb.co.id`, `/corev1/*` — menu/sales/BOM), used by `gordi-esb-bak`. It
  **401s** on the Core API. The kitchen worker's manufacturing/transfer is the **Core API** → login.
- **Transfer path works on GOO; the actual-costing assembly path does NOT** (see Costing model below).

## ESB API hosts & auth (verified)
| Host | What | Auth | Used by |
|---|---|---|---|
| `services.esb.co.id/core` | **Core API, production (GKID)** | login (`ESB_GKID_*`) | kitchen worker (post-flip) |
| `stg7.esb.co.id/core-stg` | **Core API, Staging (branch GOO, company SAE)** | login (`esb-staging`) | kitchen worker (pre-flip) |
| `stg7.esb.co.id/core` | Core API, Staging-INT | login | — (we use `/core-stg`) |
| `core-api.esb.co.id` | **OMS read API**, prod | **Static Bearer** (`esb-staging-static-token`) | `gordi-esb-bak` warehouse sync |
| `stg-erp.esb.co.id` | ESB ERP **web UI** (Yii) — NOT an API | — | nothing (do not target) |

## Costing model — the load-bearing gotcha (flip-runbook critical)
ESB simple-manufacturing has two routes, **tenant-specific**:
- **`/production/simple-manufacturing/assembly-actual`** — **actual** costing. GKID is configured for this.
- **`/production/simple-manufacturing/assembly`** — **standard** costing.

The kitchen worker posts **`/assembly-actual`** (GKID actual-costing; `esb_client.post_assembly`). But
**GOO's `SAE` tenant is STANDARD-costing**: on GOO, `/assembly-actual` returns **`EC03100004 "page does
not exist"`**, and only `/assembly` exists (returns a normal `EC03100003` validation error → route present).

**Consequence:** the worker's **Production/assembly call cannot be validated on GOO at all.** GOO validates
auth + response-envelope + the **Transfer** path; the assembly real-proof is the **single-WIP GKID push at
the flip** (FR-083/AC-094) — there is no pre-flip live exercise of `/assembly-actual`. (This is the inverse
of the GKID note in the spec: on GKID, `/assembly` is the missing route.)

## Validated round-trip (evidence)
`POST /simple-transfer` to `stg7.esb.co.id/core-stg`, app's exact `post_simple_transfer` body, **GOO's own
sandbox IDs** (FR-084: never GKID-real IDs) → **HTTP 200, `simpleTransferNum STF202606260001`**, read back
via `GET /simple-transfer/STF202606260001` (Air Mineral ×1, test notes). The app's body structure is accepted by GOO.

## GOO sandbox recipe (the SAEGORDI user's own data)
- user **SAEGORDI** → branch **176 "Gordi Outlet"**
- locations: **510 "Gordi"** (valid transfer location), **511 "Production Gordi Outlet"** (⚠️ **511 is NOT a
  valid transfer origin** — returns `OriginLocationID data is not found`; use **510**)
- BOM **131 "(Test API Assembly)"** → output productDetailID **97** (SINGLETON); material productDetailID
  **69 "Air Mineral"** (has stock at 510)
- Discover more: `GET /branch/user`, `/location/user`, `/product/bom?limit=N`, `/product/bom/{id}`,
  `/product/stock-location?productDetailID=N`, `GET /simple-transfer?limit=N` (mirror an existing valid doc).

## Worker config (shipped — kitchen-app PRs #2, #3)
- `ESB_GOO_BASE_URL` (default `https://stg7.esb.co.id/core-stg`)
- `ESB_GOO_USERNAME` / `ESB_GOO_PASSWORD` — the GOO route's **own** creds. **Fail-closed:** a real goo push
  with these unset **dead-letters** (it will NOT fall back to the global `ESB_GKID_*` prod creds — those
  must never reach the untrusted multi-tenant GOO env, FR-084).
- `ESB_CORE_BASE_URL` + `ESB_GKID_USERNAME/PASSWORD` — prod GKID (Teable poller; post-flip MOS gkid route).
- `MOS_PUSH_ENABLED` gates real calls; `MOS_ALLOW_GKID` lifts the pre-flip gkid block (owner-gated flip).

## How to test GOO yourself (safe)
1. `op` must be reachable: `op-get.sh esb-staging Gordi username` (never read `.env`/`.op-token`; the
   wrapper handles the service-account token — vault scope: `AS` + `Gordi`).
2. Login → `POST stg7.esb.co.id/core-stg/auth/login {username,password}` → `result.accessToken`.
3. Use GOO's **own** sandbox IDs (recipe above) — **never** Gordi's GKID-real `wip_items` IDs (FR-084;
   GOO is open to all ESB tenants). Put creds/body in a temp file (not the command line); never print tokens.
4. Transfer round-trips; assembly does not (costing model). Confirm receipt with the matching `GET`.

## Source of truth for the API shapes
`~/Coding/gordi-esb-bak/api-docs/esb-core-api_data.js` (Core API) + `esb-oms-api_data.js` (OMS + the staging
base URLs). The kitchen worker's request bodies: `gordi-kitchen-app/app/esb_client.py`
(`post_assembly` / `post_simple_transfer` / `_fetch_bom_materials`).
