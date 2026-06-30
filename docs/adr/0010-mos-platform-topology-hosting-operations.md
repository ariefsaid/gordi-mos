# ADR-0010 — MOS platform topology, hosting & operations

- Status: **Proposed** (2026-06-19; awaiting owner spec sign-off — the specs that consume this ADR
  follow later)
- Deciders: Owner (Arief) + Director, in grill-with-docs session (2026-06-19)
- Related:
  - **OD-DIR-3** (one self-hosted Supabase, schema-separated — this ADR **amends** the schema canon
    4 → 5, see D5 + `docs/decisions.md` OD-DIR-3 amendment) ·
    **OD-DIR-2/5** (production URL · path-based umbrella) · **OD-DIR-6** (kitchen-stays-put —
    **superseded** by the sequencing in D10, see `docs/decisions.md` OD-P4-1) ·
    **OD-P1-11** (Resend for auth email) · **OD-DIR-4** (Supabase Auth is the long-term model;
    CF Access is not the app gate) ·
    **OD-P4-7** (security hardening is gating work — the D11 decision) ·
    **OD-P4-8** (secrets via `op` + the secret-zero bootstrap — the D9/D12 decisions)
  - **ADR-0011** (auth + RBAC — the access roles `finance`/`admin` that gate the `reporting`
    schema in D5; the provisioning endpoints that share the thin backend in D6; the auth/RLS surface
    the D11 security review covers) ·
    **ADR-0012** (the ESB-outbox — the second concern of the thin backend in D6; the
    `integrations` schema's first tenant; its staging-first ESB target, ADR-0012 D5, referenced from D10)
  - **ADR-0001** (org seam + read posture — the RLS/`org_id` pattern every new schema inherits) ·
    **ADR-0004 / ADR-0006** (the PostgREST `[api].schemas` exposure + per-schema client mechanism
    that D5 reuses to expose `reporting`)
  - `docs/project-brief.md` · `docs/roadmap.md` (Phase 2 complete, Phase 3 rollout current) ·
    `CONTEXT.md` (vocabulary — **Module** / **App** / **Feature** are canonical there; "kitchen
    app" / "roastery app" are legacy, see the `docs/decisions.md` "legacy naming to reconcile" note) ·
    the project's **never-read-secrets rule** (memory: never open `~/.op-token` or any `.env`; use
    `op-get.sh` / committed coordinates — the rule D9/D12 operationalize on the server)
  - `supabase/migrations/20260611000001_schemas.sql` (the four schemas; `integrations` reserved for
    "inbound mirrors from ops apps") · `supabase/migrations/20260612000004_ops_log_entries.sql`
    (`ops.log_entries` shape — the Daily Log mirror seam D-references in ADR-0012 D3)
- Scope note: **This ADR records platform topology, hosting, and operations decisions only.** It
  authorizes no migration, no RLS policy, and no code by itself — the specs and plans that consume it
  follow. It is binding *direction* for those specs, not their implementation.

## Context

MOS (built; Phase 2 complete; **not yet production-deployed**) is becoming Gordi's Management
Operating System: beyond the first slice (tasks · RACI · weekly updates · Daily Log) it will
incorporate dashboards, operational-data display, and operational **Modules** (kitchen first; see
`CONTEXT.md` — one **App**, MOS; kitchen/roastery are **Modules** of it, not separate apps). Deploying
MOS forces a set of platform decisions because three pre-existing systems already occupy the same
small budget and the same single server, and a wrong call here is expensive to reverse:

- **(a) The ESB analytics warehouse** — `gordi-esb-bak` repo; `gordi-esb-pg` Postgres-16 Docker
  container, currently on Arief's Mac. OLAP: batch ESB sync → `esb_raw` JSONB + flattened facts +
  curated `v_*` views; read by AI agents (OpenClaw, GPTs) over a `gordi_readonly` role via psql. It
  needs none of Supabase's Auth/Realtime/Storage.
- **(b) The kitchen App** — FastAPI + Teable on the `ris-dev` Hetzner box (8 GB) behind
  `ops.gordi.id`; live ESB write-back since 2026-05-18 (Phase 4).
- **(c) Teable** + its Postgres + Redis on `ris-dev`. `ris-dev` (`/opt/stacks/core/`, compose project
  `core`, Caddy reverse-proxy) hosts Caddy + the Teable stack + kitchen.

The charter (`docs/product-expectations.md`) requires a production-grade system that is **minimal for
one client yet architected to scale** — and the binding constraint is a single 8 GB box and a
near-zero incremental budget. The decisions below resolve where each layer lives, how it is hosted on
free tiers, what backend tier MOS gains, how it is observed and backed up, how it is **hardened and
secured before exposure**, how its **secrets bootstrap onto the box**, and — critically — a
**sequencing** that dissolves the RAM contention without a forced resize.

## Decision

### D1 — Three-layer model, never merged

Three layers, distinguished by **OLTP-vs-OLAP**, not by Gordi-data-vs-Gordi-data:

- **System of record = the ESB** (vendor ERP). Immutable; corrections are memorial journals, never
  edits. Not ours to host.
- **Analytics read-model = the warehouse** (OLAP). Batch / heavy-read, rebuildable from the ESB;
  read by AI agents over SQL.
- **System of engagement = MOS Supabase** (OLTP). Tasks / RACI / weekly updates / Daily Log /
  dashboards; RLS-governed, latency-sensitive, **sacred user data**.

The principle, stated verbatim so it is not re-litigated:

> **Consolidate the system of engagement; federate the system of analysis; never merge OLTP and OLAP.**

### D2 — Separate Postgres instances (OLTP ≠ OLAP)

- **OLTP** = the **self-hosted Supabase** on `ris-dev` (Postgres + Auth + RLS — the build the whole
  app already targets).
- **OLAP** = the **warehouse brought online**: lift the existing `gordi-esb-pg` container off the Mac
  onto a server. It stays **plain Postgres** (no Supabase wrapper — it needs none of
  Auth/Realtime/Storage). Agents keep their `gordi_readonly` psql access to it.
- The warehouse runs as a **memory-capped container co-located on `ris-dev` now**, with a documented
  **split trigger**: peel it onto its own ~€8/mo Hetzner box **when the warehouse grows or OLTP
  latency degrades** (the trigger is the same RAM/swap threshold as D7/D10, not a calendar date).
  *(Amended 2026-06-30 — Amendment A1: the warehouse's online home is the **Tencent VPS
  `tencent-OpenClaw`**, co-located with the agentic layer, NOT `ris-dev`. See Amendments below.)*

### D3 — A free-tier "edge" layer ($0 incremental, verified 2026-06-18)

- Frontend SPA → **Cloudflare Pages** (unlimited bandwidth; commercial use permitted).
- Ingress to self-hosted services → **Cloudflare Tunnel** (outbound-only; **no inbound ports opened on
  `ris-dev`** — promoted to a hardening invariant in D11).
- OLTP backups → **Cloudflare R2** (10 GB free, zero egress).
- Auth email / SMTP → **Resend** (3k/mo, 100/day — the OD-P1-11 account, already domain-verified).
- Warehouse ESB-sync cron → **GitHub Actions** (2,000 min/mo).

### D4 — No Metabase (MOS-native dashboards; BI tool deferred behind a concrete trigger)

Metabase was proposed (Apr 2026) and deferred twice. The actual ad-hoc-analysis path became
**AI-agents-over-SQL** against the warehouse (`gordi_readonly`), which needs no hosting. Management
dashboards are **MOS-native**, rendered over **materialized snapshots** (D5). Revisit a BI tool only
on a concrete trigger: *a non-technical user needs recurring visual self-serve.* Guardrail: keep MOS
dashboards opinionated/fixed — **if MOS dashboards drift toward a generic charting/pivot playground,
that drift is itself the signal that a dedicated BI tool would be cheaper than maintaining one.**

### D5 — A fifth schema, `reporting` (curated financial read-model, copied not read-through)

Add **`reporting`** to the Supabase schema canon. It holds curated ESB financial summaries **copied
into Supabase** by a scheduled **snapshot job** (warehouse → Supabase). Properties:

- It is a **read-model**: the snapshot job is its **only writer**; the app and agents only read it.
- **RLS gated to the `finance` + `admin` access roles only** (ADR-0011 D5) — financial data is not
  org-readable.
- Exposed to PostgREST by the **same mechanism as ADR-0004 / ADR-0006**: add `"reporting"` to
  `config.toml [api].schemas`, with a per-schema client profile (`supabase.schema('reporting')`),
  RLS enabled + forced on every table from its creating migration.
- This **amends OD-DIR-3** (schema canon **4 → 5**); recorded in `docs/decisions.md` (OD-DIR-3
  amendment).

**Why copy, not read-through:** copying **decouples dashboard latency and uptime from the warehouse**
(the warehouse can be down, mid-resync, or split onto its own box without breaking a dashboard); gives
**fast local reads** on the same Postgres as the rest of MOS; and makes the financial rows **RLS-able**
under the MOS access-role model. A live cross-database read-through would couple uptime, defeat RLS,
and put dashboard latency at the mercy of OLAP batch load.

### D6 — A thin backend tier (one FastAPI service on `ris-dev`, two concerns)

> **SUPERSEDED 2026-06-29 — the "new thin FastAPI service" is retired; both concerns left it.**
> (1) The ESB-outbox worker was built by **extending the existing `gordi-kitchen-app`**, not a new service
> (ADR-0012 amendment; `docs/platform-workstream-status.md` §3). (2) Admin/user provisioning is served by
> **`SECURITY DEFINER` RPCs promoted to prod** (ADR-0016 amendment, 2026-06-29 — gated on the D11 audit),
> not backend endpoints. Net production shape: **SPA (Cloudflare Pages; prod self-hosted) + Supabase
> (data / auth / RLS + provisioning RPCs)** — no bespoke MOS backend tier. The rest of D6 below is the
> original reasoning, kept for context.

MOS gains a **small FastAPI service on `ris-dev`** — **one service, two concerns**:

1. The **ESB-outbox worker** (ADR-0012) — drains `integrations.esb_push` and pushes to the ESB.
2. **Admin / user-provisioning endpoints** (`service_role`, server-side only; ADR-0011 D5) — the
   privileged operations that must never run from the browser.

So the production shape is: **MOS = SPA (Cloudflare Pages) + Supabase (data / auth / RLS) + a thin
backend service on `ris-dev`.** This **reuses the proven kitchen FastAPI deploy path** (the kitchen
poller logic, repointed Teable → Supabase). Edge Functions / `pg_cron` are rejected (would rewrite the
Python/BOM logic in TypeScript; awkward for external-API calls + heavy compute), as is
GitHub-Actions-for-push (no event-fire low latency). The thin backend is the home for exactly the work
that is *server-trust* or *long-running external I/O* — nothing that RLS already handles moves into it.
Its `service_role` surface is one of the seams the D11 gating security review must cover before
exposure.

### D7 — Observability (product + server, tiered alerting) — with data-protection guardrails

- **PostHog** for product analytics + frontend error tracking. **Sentry is deferred** until PostHog's
  error grouping / source-maps prove insufficient.
- **PostHog must not capture financial data or PII.** Session-replay + autocapture are configured with
  **input masking on every financial dashboard surface and all auth fields** (passwords, magic-link
  tokens, email entry); financial figures from the `reporting` schema (D5) are **masked from replay**.
  The default posture is mask-then-allowlist, not capture-then-redact.
- A **lightweight server signal**: an SSH-run monitor script (`free -m` · `df -h` · `docker stats` ·
  `systemctl` · pg connection count · last-backup age) + **Healthchecks.io** as a dead-man's-switch on
  the backup + sync crons.
- A **scheduled Claude routine** pulls PostHog + the server snapshot + Healthchecks, applies
  thresholds, and **notifies** (Telegram / Slack / email) — **silent when healthy**. **It runs with
  least-privilege credentials and must NOT read sensitive/financial rows** — it reads metrics and
  operational health, never `reporting`/warehouse financial data (this is the operational expression of
  open-question #2 on agent access to financial data; the monitor is a non-financial agent and stays
  that way).
- **All observability tokens** (PostHog project keys, Healthchecks ping URLs, any notifier webhooks) are
  fetched via **1Password `op`** (D9/D12) — never inlined in a script or committed.
- **Tiered alerting:** instant *machine* alerts for hard failures (Healthchecks / uptime); the *agent*
  for judgment, trend, and the periodic digest.
- The **"time to upsize" signal = the monitor's RAM/swap threshold** — the same mechanism as the D2
  warehouse-split trigger and the D10 resize trigger. One number drives all three.

### D8 — Backup / DR + reproducibility

- **OLTP DB:** `pg_dump` + WAL → R2, **with tested restores** (a backup that has never been restored
  is not a backup).
- **Transition-window data:** also back up kitchen / Teable operational data during the migration
  window (until the cutover is proven, per ADR-0012 D4).
- **Box config as IaC:** compose files, Caddyfile, `.env` shape (no secrets — see D9), init-SQL kept
  in git; **Hetzner snapshots** on a schedule.
- **The warehouse is rebuildable** from the ESB (backup optional; accept a multi-hour re-sync as its
  RTO).
- **Single-box SPOF** is mitigated by IaC + a written **rebuild runbook** + a stated rough **RTO**
  (not by a hot standby — that is over-engineered for a ~15–30-user internal tool).

### D9 — Secrets & environments (all secrets via `op`; the bootstrap is D12)

- Secrets flow **1Password → box `.env`** (via `op-get.sh`, per the project's never-read-secrets rule)
  **+ GitHub Actions secrets**. **Every project `.env` is rendered from `op`** — secrets are never
  committed and never baked into an image layer; the repo carries only **committed coordinates** (the
  `op://` references / `op.*.env` shape, e.g. `supabase/op.resend.env`), not values. The Supabase
  **`service_role` key never reaches the frontend** (it is used only by the thin backend, D6).
  **Rotation** is a documented operation.
- **The chicken-and-egg this leaves — secret-zero — is resolved in D12.** ("Everything is fetched via
  `op`" is only complete once the *op token itself* has a safe path onto the box.)
- **Environments:** **local Supabase for dev**, `ris-dev` for prod. **Migrations are promoted dev →
  prod**; the live DB is **never schema-changed directly** (every schema change is a reviewed
  migration, consistent with the existing migration discipline).

### D10 — Sequencing dissolves the RAM problem (no forced resize)

The only RAM-pressure window is the **transient Teable + Supabase overlap**. Sequence the work so that
window is brief and the warehouse arrives only **after** Teable leaves:

1. This ADR (direction).
2. Stand up **production Supabase on `ris-dev`**.
3. **Build kitchen as MOS's first ops Module + migrate it** (ADR-0012) → **retire Teable** (~2 GB
   freed). The kitchen ESB write logic + the migration's `posted_to_esb`-survival proof are validated
   against the **ESB Staging Sandbox first** (ADR-0012 D5: branch `GOO`, Core API `stg7.esb.co.id/core-stg`
   — `stg-erp.esb.co.id` was the web UI, corrected 2026-06-26); production GKID is cut over only via the
   single-WIP proof-push gate.
4. **Bring the warehouse online** into the freed headroom (D2).
5. **Then** MOS user rollout — **gated by the D11 security review** (no internet exposure / rollout
   until the hardened box + the auth/RLS/provisioning + outbox surfaces have passed audit).

Because the warehouse comes online only *after* Teable retires, **no box resize is required**. An
8 GB → 16 GB resize (~+€10/mo; a 5-minute, reversible Hetzner reboot) stays a **documented trigger**
— pulled *before rollout* / *on memory pressure* / *if Supabase Realtime + Storage are re-enabled* —
**not** a planned action. During the overlap, **trim Supabase** (disable Realtime / Storage /
analytics) and **memory-cap the warehouse** container.

### D11 — Security hardening & a gating security review (before any exposure or rollout)

**Security is a priority, and the security review is gating work — it happens *before* internet
exposure and user rollout, not after.** Two parts: a hardening baseline for the box, and a security
audit that must pass before the D10 step-5 rollout.

**Server hardening baseline (the invariants):**

- **`ufw` default-deny inbound; zero inbound ports opened.** All ingress is via **Cloudflare Tunnel**
  (outbound-only — D3); the box opens no listening port to the internet. *No open ports* is a hardening
  invariant, not merely a Tunnel side-effect.
- **Postgres bound to `localhost`** (and/or the Docker-internal network) — **never published to a host
  port reachable from outside.** The **Teable-port-exposure incident in `ris-dev` history** (a service
  port left bound to `0.0.0.0`) is the explicit anti-pattern to avoid; every container's port mapping is
  reviewed against this.
- **Supabase Studio is never publicly exposed** — it is gated (accessed over the Tunnel / an
  authenticated path), never placed on a public route.
- **SSH key-only + hardened** (password auth disabled, root login disabled) + **`fail2ban`** on SSH (and
  any other authenticated surface).
- **A patching cadence** — **unattended security upgrades** + a **scheduled review/reboot window**.
  Rationale from `ris-dev` history: the box carried **~50 pending updates**, and the **n8n-CVE
  retirement** is the precedent for "an unpatched service is a liability we retire or update on a
  schedule, not let drift."
- **Least-privilege DB roles** — **`gordi_readonly` for the AI agents on the warehouse** (read-only, no
  write, no financial rows per D7), and the Supabase **`service_role` confined to the thin backend**
  (D6) and never to the browser (D9).

**The gating security review (security-auditor):**

- A **security-auditor pass** covers: the **auth / RLS / provisioning** model (ADR-0011 — the access
  roles, the `member`-insert / `ops_lead`-approve gates, the synthetic-email path, the first-admin
  seed), the **thin backend's `service_role` surface** (D6), the **ESB-outbox** (ADR-0012 — incl. the
  staging-vs-prod target seam, ADR-0012 D5), and the **hardened box** (the invariants above).
- This pass is **a gate before D10 step 5** — MOS is not exposed to the internet and not rolled out to
  users until it passes. (OWASP/STRIDE on the auth + RLS + schema seams, per the operating model.)

### D12 — Secret-zero bootstrap (a single least-privilege resident `op` token, rotatable)

D9 says everything is fetched via `op`. The remaining gap is **secret-zero**: the **op service-account
token itself** is a secret that must reach the box before any other secret can be fetched. Resolution:

- **Recommended (lean) — a single resident secret-zero token.** One **op service-account token**,
  scoped **least-privilege / read-only to just the MOS vault items**, stored in a **root-only `0600`
  file** (e.g. a systemd `EnvironmentFile`), **injected once at provisioning over a secure channel**,
  and **rotatable** on a documented cadence. **Everything else is fetched via `op` at deploy/runtime**
  from that token. It is **never in git and never in an image layer.** This suits a **long-running
  backend** (D6) that needs runtime secrets without a human present to re-authenticate.
- **Recorded alternative — deploy-time injection from the authenticated Mac.** The deploy script, run
  from Arief's already-`op`-authenticated machine, **renders secrets into the container env at deploy
  time so the server never stores the op token at all** — a cleaner blast radius. But **rotation =
  redeploy**, and a long-running backend that needs runtime-fetched secrets (re-fetch on rotation, on
  new integrations) favors the resident token. Recorded so the choice is reversible (see Open
  questions).
- This is the on-box realization of the project's **never-read-secrets rule** (the agent never opens
  `~/.op-token` or any `.env`; `op-get.sh` / committed coordinates are the only path). The secret-zero
  token is the one secret that exists outside `op`, deliberately minimized in scope and blast radius.

## Alternatives considered

- **Managed Supabase Free.** Rejected — pauses after 7 days idle + no backups; unsafe for production
  user data.
- **Managed Supabase Pro ($25/mo).** Rejected *for now* — self-host + R2 backups is sufficient; DIY
  backups (D8, with tested restores) are acceptable at this scale. (Revisit if ops burden exceeds the
  cost.)
- **Neon free + external auth.** Rejected — discards the Supabase-Auth/RLS build the whole app already
  depends on (ADR-0001, ADR-0011).
- **Oracle / GCP always-free VMs for the warehouse.** Rejected — Oracle signup is blocked for the
  owner and was recently halved to 12 GB; GCP `e2-micro` (1 GB) is too small for an OLAP Postgres.
- **Warehouse-inside-Supabase / one Postgres for everything.** Rejected — merges OLTP + OLAP
  (D1 violation): resource contention, the wrong backup cadence for each, and it would expose the auth
  DB to the external AI agents that read the warehouse.
- **Metabase now.** Deferred (D4) behind a concrete trigger.
- **Open inbound ports + a host firewall allowlist** (the conventional VPS posture). Rejected (D11) —
  the Cloudflare Tunnel already gives outbound-only ingress; opening any inbound port is strictly worse
  blast radius for zero benefit. *Zero open ports* is the stronger invariant.
- **Secret-zero by baking the op token into the image / committing an `.env`.** Rejected (D12) — defeats
  the never-read-secrets rule and puts a long-lived credential in a layer/history. The resident `0600`
  token (or deploy-time render) is the only acceptable path.
- **1Password Connect (a self-hosted secrets API on the box).** Deferred (D12 open question) —
  more moving parts than a single read-only service-account token needs at this scale; revisit if the
  number of secret-consuming services grows.

## Consequences

- **Positive — the three layers can scale and fail independently.** OLTP latency is insulated from
  OLAP batch load; the warehouse can be split onto its own box (D2) or be down for a re-sync without
  touching dashboards (because `reporting` is a *copy*, D5); the SPA scales on Cloudflare's edge for $0.
- **Positive — near-zero incremental cost with a clear upgrade ladder.** Cloudflare Pages / Tunnel /
  R2 + Resend + GitHub Actions are all free tiers (D3); the only paid step is a triggered, reversible
  resize (D10) or the eventual warehouse box (D2) — each gated by the *same* monitor threshold (D7).
- **Positive — one place for server-trust work.** The thin backend (D6) is the single home for the
  outbox worker and provisioning; nothing RLS already governs leaks into it.
- **Positive — security is structural, not bolted on.** Zero open ports + localhost Postgres + gated
  Studio + key-only SSH + fail2ban + a patching cadence (D11) make the single box a hard target; PostHog
  masking + a least-privilege non-financial monitor (D7) keep financial data and PII out of
  observability; the gating audit (D11) means the first user logs in to a reviewed system.
- **Negative / accepted — `ris-dev` is a single point of failure.** Mitigated by IaC + a rebuild
  runbook + a stated RTO + Hetzner snapshots (D8); a hot standby is deliberately *not* built (YAGNI at
  this user count). The risk is recorded, not eliminated.
- **Negative / accepted — the snapshot job is a new moving part.** `reporting` freshness depends on it
  running; it gets a Healthchecks dead-man's-switch (D7) and is one of the open questions below
  (cadence + contract versioning).
- **Negative / accepted — the migration window has a RAM-pressure overlap.** Bounded by the D10
  sequence (Teable retires *before* the warehouse arrives) + the trim/memory-cap measures; the resize
  trigger is the safety valve if the overlap bites.
- **Negative / accepted — hardening + a security audit are now *gating* work before rollout (D11).**
  This adds a required pre-exposure step (it cannot be deferred to "after launch"); the cost is real
  schedule weight in the D10 sequence, accepted as the price of a production-grade, internet-exposed
  system holding sacred user + financial data.
- **Negative / accepted — a resident bootstrap secret exists on the box (D12).** The single
  least-privilege, read-only, rotatable secret-zero token is the one credential outside `op`; its blast
  radius is deliberately minimized (vault-scoped, `0600`, root-only) but it is a real on-box secret —
  the accepted cost of a long-running backend that needs runtime-fetched secrets without a human
  present. (The deploy-time-render alternative trades it away at the cost of redeploy-to-rotate.)

## Reversibility

- **The `reporting` schema is additive** (a fifth schema + a snapshot job), reversible by dropping the
  schema and the job; the existing four schemas are untouched.
- **The thin backend is additive** (a new service on the existing deploy path); it can be removed once
  its two concerns retire (they will not, but the seam is clean).
- **The edge layer is configuration** (Cloudflare Pages / Tunnel / R2 / Resend / GH Actions) — each
  swappable for a paid equivalent without an app change.
- **The warehouse co-location is reversible by the documented split** (D2): moving it to its own box
  is a container move + a connection-string change, not a rewrite.
- **The hardening baseline (D11) is configuration** — `ufw` rules, port bindings, SSH config, fail2ban,
  unattended-upgrades are all declarative box config (IaC, D8); tightenable or relaxable without an app
  change. The *gating* nature of the audit is a process decision, reversible only by an explicit owner
  call to ship-before-audit (not a silent default).
- **The secret-zero choice (D12) is reversible** — resident token ↔ deploy-time render is a deploy-script
  change, not an app change; either can be swapped for 1Password Connect later. Rotation is a documented
  operation under both.
- **The sequencing (D10) is the reversible heart of the plan** — the resize is a 5-minute Hetzner
  reboot in either direction.

## Open questions (recorded, not resolved here)

1. **`reporting` snapshot cadence / freshness.** Recommended default: **daily** (overnight, off-peak)
   — *confirm at spec*. A finer cadence trades warehouse load against dashboard staleness.
2. **Agent access to financial data.** May AI agents query `reporting` / warehouse financial rows,
   given inference goes to a model provider? Current lean: **only via a reliable/secure inference
   provider chosen later**; *until then, agents do not read financial rows* (and the D7 monitor agent
   never does). (Intersects ADR-0011 D5's `finance` access role.) *Confirm before any agent is pointed
   at `reporting`.*
3. **Warehouse → `reporting` data-contract versioning ownership.** A warehouse `v_*` view column change
   must not silently break a dashboard. Who owns the contract, and how is a breaking change signalled?
   *Confirm at spec* (lean: a thin, versioned view contract the snapshot job pins to).
4. **Secret-zero: resident token vs deploy-time render (D12).** Lean is the **resident least-privilege
   `0600` service-account token** (a long-running backend needs runtime secrets); the deploy-time-render
   alternative gives a cleaner blast radius but rotation = redeploy. *Confirm at the provisioning /
   deploy spec.* Sub-question: **is 1Password Connect worth it later** (when the number of
   secret-consuming services grows)? — *revisit on that trigger, not now.*

## Amendments

### Amendment 2026-06-30 — warehouse online home, server observability, job orchestration

- Status: **Proposed** (owner + Director, grill-with-docs 2026-06-30; awaiting owner spec sign-off).
- Related: **ADR-0017** (agent-native / user-composed UI) — its **deputy** reads the `reporting`
  read-model and its **server-side analyst agent** reads the raw warehouse over `gordi_readonly`
  (ADR-0017 D3), which makes the OLAP warehouse a first-class consumer plane and forces the three
  operations decisions below.
- Context: ADR-0017 elevates the warehouse from "batch store a few agents poll" to "the analytics plane
  a co-located agentic layer queries continuously," forcing three decisions D2/D7 left open: *where the
  warehouse runs online*, *how the box is observed beyond liveness*, and *how the recurring jobs avoid
  contending on a small box*.

#### A1 — Warehouse online home = the Tencent VPS (`tencent-OpenClaw`), co-located with the agentic layer

**This amends D2's** "warehouse currently on Arief's Mac / co-located on `ris-dev` now." The warehouse
(`gordi-esb-pg`, **807 MB**) is brought online on the **Tencent VPS `tencent-OpenClaw`**
(`43.153.213.28`; ~3.7 GB / 2 vCPU), **co-located with the agentic layer** (OpenClaw + the vault MCP) it
already hosts.

- **Rationale.** The agentic layer is the OLAP's **main consumer** (ADR-0017 D3's server-side analyst
  agent over `gordi_readonly`), so co-location keeps those queries **local — no cross-box hop**; and it
  keeps OLAP **off the OLTP box** (`ris-dev`), honoring **D2's isolation principle** (OLTP ≠ OLAP, never
  on the same instance).
- **No backup needed** (refines D8's "warehouse is rebuildable"): the warehouse is **rebuildable from
  the ESB**, and the **human-curated decision/review tables are being dropped** — that curation
  workflow **moves into MOS OLTP later** (where D7/D8's R2 backup covers it). So the only thing worth
  keeping is rebuildable, and the only thing not rebuildable moves to the backed-up plane.
- **Deploy on the current box** (Docker is already present). **Resize to 8 GB only if OpenClaw
  stutters** — a Tencent CVM vertical resize is a ~5-minute reboot, the same reversible-trigger posture
  as D10 (resize is a documented trigger, not a planned action).
- The **cross-box snapshot job** this introduces (warehouse, Singapore → MOS Supabase `ris-dev`) is the
  D5 `reporting` snapshot, now **cross-box**; it is **tiny** (revenue-by-branch/day aggregates —
  dimensions × grain, not transaction volume, per ADR-0017 D3/D11), so the cross-box hop is cheap.

#### A2 — Server/resource observability (new ops decision, extends D7)

**Gap:** D7 gives only **liveness** (the Healthchecks dead-man's-switch on the crons) — there is **no
resource telemetry**, so OLAP ↔ agentic RAM/CPU contention on the 2-vCPU Tencent box is invisible.
**Decision (lazy-correct, low-footprint — explicitly do NOT deploy Prometheus/Grafana on a RAM-tight
box):**

- **(a)** Enable **Tencent CloudMonitor host alarms** (the box already runs Tencent's agents) on
  **swap-in-active** and **available-RAM-below-threshold** — the same RAM/swap signal D7's monitor
  threshold uses, now host-level.
- **(b)** A small **`resource-watch.sh` cron** reusing the box's existing cron + the **OpenClaw →
  Telegram** delivery path (the `cron-status.sh` pattern), sampling `free` / load + `pg_stat_activity`
  long-runners — silent when healthy, like D7's monitor.
- **(c)** Make the **ESB sync cooperative**: check load / RAM **before** heavy aggregation and **defer
  if OpenClaw is busy** (the agentic layer is the latency-sensitive consumer; batch sync yields to it).
- **Same posture for `ris-dev` (OLTP):** host alarms + a `pg_stat_activity` sampler — so both boxes have
  resource telemetry, not just liveness.

This stays inside **D7's data-protection guardrail**: the resource watcher reads **operational health
metrics only** (`free` / load / pg-activity), **never** `reporting`/warehouse financial rows — it is a
non-financial monitor, exactly as D7 requires.

#### A3 — Job orchestration (stagger + cooperative scheduling on the 2-vCPU box)

The **ESB → warehouse sync**, the **warehouse → MOS reporting snapshot** (A1), and **OpenClaw** must not
contend on 2 vCPUs. Decision: **stagger the crons** (no overlapping heavy windows) **+ cooperative
scheduling** (A2c — defer batch work when the agentic layer is active). This is the operational
expression of D10's "sequencing dissolves RAM pressure," applied to the Tencent box's recurring jobs
rather than the one-time migration window.

#### Amendment reversibility & verification

- **Reversible:** the warehouse home is a **container move + connection-string change** (the D2 split
  trigger, now applied *to* the Tencent box rather than *off* `ris-dev`); CloudMonitor alarms and the
  `resource-watch.sh`/cooperative-scheduling cron are **configuration**, addable/removable without an app
  change; the cross-box snapshot job is the D5 job repointed, reversible by the same drop.
- **Verification:** the cross-box snapshot lands `reporting` rows on `ris-dev` with an **as-of**
  timestamp (ADR-0017 D11); a deliberate RAM-pressure test fires the CloudMonitor swap/RAM alarm + the
  Telegram notice; the cooperative ESB sync **defers** when OpenClaw load is high (logged, not silently
  skipped); `gordi_readonly` remains read-only and **financial-row-blocked for the D7 monitor agent**
  (unchanged).
