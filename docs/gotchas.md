# Gotchas — scar tissue worth keeping

Things that cost real time at least once. Everything else was archived.

## Secrets
- **Never** read `~/.op-token` or any `.env`. Secrets come from `op-get.sh <item> <vault> <field>`
  (1Password vaults **AS** and **Gordi**). To learn a value's *location*, read the committed
  coordinates (`.env.example`, `supabase/op.resend.env`, `docs/environments.md`) — never the live file.
- Never enter the owner's credentials anywhere.

## ESB / GOO
- **GOO is TEST DATA ONLY.** Never send Gordi's real GKID product/BOM IDs to it — it's a shared
  multi-tenant sandbox.
- **GOO ≠ `stg-erp`.** GOO Core API is `stg7.esb.co.id/core-stg`; `stg-erp.esb.co.id` is the ESB web UI.
  Auth is login, not the static token (that's the OMS read API's bearer).
- **Costing asymmetry:** GKID is actual-costing (`/assembly-actual`); GOO's SAE tenant is
  standard-costing (`/assembly`). The worker's assembly call can't be validated on GOO — a GKID flip
  is its only proof.
- Full coordinates: `docs/reference/esb-goo-integration.md`.

## Verification that lies
- **`npx tsc --noEmit -p tsconfig.json` in `mos-app/` checks nothing** (it's a solution file). Always
  `npm run typecheck` + `npm run build`. `tsc -b` includes tests, so a stale test breaks the build.
- **The lint gate false-greens on warnings** — npm eats `--max-warnings=0` unless it's passed as
  `npm run lint -- --max-warnings=0`.
- **Mocked unit tests miss DB reality.** A wrong column name or RPC signature passes mocked Vitest and
  then 400s against real PostgREST. Verify any DB-column/RPC change against a running stack.
- **jsdom/RTL computes no layout.** A UI change is not done until it's been rendered and looked at, at
  real widths including ≤380px phone.

## Local stack
- `supabase start --ignore-health-check -x studio,imgproxy,inbucket,edge-runtime,vector,analytics,realtime`
  — flaky health gates roll back the whole stack otherwise. Ports 44321/44322/44324.
- **Never touch the pmo-portal stack** — it shares this Docker host. `docker container/image prune` is
  safe; **never `volume prune`**.
- `supabase db reset` is global and reseeds the dev personas (pw `Passw0rd!dev`, Director = admin).
- **Docker port-forwarding dies after a daemon restart** — the container looks healthy and the port
  looks mapped, but the host can't reach `:4432x`. Fix: `docker restart <container>` for that service
  (e.g. `supabase_kong_gordi-mos`), not a full stack bounce.
- Dev-login lands on "Your account isn't set up yet" when `shared.people.user_id` loses its link after
  an e2e run. `supabase db reset` relinks it.

## Staging / Supabase Auth
- **`[auth.email] enable_signup` is a PROVIDER switch, not a signup switch.** Setting it `false` kills
  *all* email login, not just new signups.
- **`shared.people` has no unique constraint on email** — seed BY EMAIL or you'll get duplicates.
- SMTP is Resend (wired 2026-07-31). The built-in sender is capped at 2 mails/hour.
- Environment coordinates: `docs/environments.md`.

## Git
- `git push origin HEAD:main` from a feature branch is blocked — it pushed unmerged code to main twice
  before the block existed.
- Your **local `main` ref goes stale** after you merge a PR. `git fetch` before you rebase, or a
  worktree cut from local main will miss recent merges.
- Commit trailer names the model that wrote it: `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
