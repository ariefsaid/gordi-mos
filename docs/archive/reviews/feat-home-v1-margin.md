# Review battery — `feat/home-v1-margin` (Home v1 + `reporting.sales_margin_daily`)

**Scope:** `git diff dev...feat/home-v1-margin` — the ADR-0019 D14-item-1 slice: margin read-model
(§7a-corrected contract) + snapshot extension + Home v1 at `/` (My Week → panel) + shell regroup
(DESTINATIONS, bottom tabs, rail) + i18n seam (ADR-0021, en/id) + specs/plan/ADR docs.
**Run:** 2026-07-04, Director-orchestrated. Build: 4 parallel role agents (sonnet ×2, ui-sonnet ×2),
reviews opus ×3 + Director render-verify.

### Machine-readable verdicts (parsed by `pre-merge-check.sh`)
- spec: SHIP — MATCHES SPEC (opus spec-reviewer): every AC-id (M01-07, SN01-06, H01-07, HK01-02, T01-03, D01, RG01, I01-03) owned at its specced layer, §7a contract shipped verbatim, no scope creep; its one note (migration test-grants) fixed in `23145ea`.
- code-quality: SHIP — no Critical (opus): "migration is textbook", §7a "unusual discipline"; 3 Important follow-ups (below), none blocking.
- design: SHIP — Director live render-verify (desktop 1280 + phone 380 + Bahasa + member persona): regrouped rail; bottom tabs w/ active state; populated KPIs ("Rp 97,4 jt", "Gross margin (interim) Rp 45,1 jt · 65.3% margin"); freshness chip; drills to /sales; id locale full-chrome ("Beranda/Kerja/Operasi", "Margin kotor (interim)"); member sees NO finance row + ZERO reporting fetches (live-proven) + My Week dominant; no h-scroll at 380px. Screenshots: home-v1-desktop-finance.jpeg, home-v1-phone-finance.jpeg.
- security: PASS — CLEAR (opus, post-fix): tenancy/RLS sound (FORCE RLS, unspoofable claims, cross-org + write-denial proven by pgTAP); no injection (parametrized SQL); cred discipline held. Both Mediums (test-only grants in prod migration) FIXED in `23145ea` — grants moved into the rolled-back pgTAP transaction; verified via `db reset` from cleaned migrations + full pgTAP.

## Evidence
- Suite: **1802 Vitest green** · **343 pgTAP green** (from-scratch reset post-fix) · **13 python green** ·
  typecheck clean · ESLint `--max-warnings=0` clean · coverage: all changed files ≥83% (most 100%).
- TDD: all four build agents red-green per task; AC-ids in owning test titles (`grep -r AC-` truthful).
- Live member-boundary proof: performance API showed 0 requests to `sales_daily_revenue`/`sales_margin_daily`
  for a member session; RLS remains the hard boundary regardless.

## Fixed during battery (Director close-review catches)
1. Cron script imported `run_snapshot` directly → margin would silently never load (`b998de4`).
2. Flag-gated `/updates`+`/ops` fell out of the rail in the SECTIONS→DESTINATIONS move (`00b535d`).
3. Security 2× Medium: test-only grants excised from the prod migration (`23145ea`).

## Follow-ups (tracked, non-blocking)
- **CQ-1/2/3 (dedup):** `trailingMargin`/`trailingWindow` + `daysAgoIsoDate`/`latest*` clones across
  `home-kpis.ts`·`sales-dashboard.ts`·`reporting-margin.ts`·`reporting.ts`; margin snapshot computes the
  window in Python (UTC) vs revenue in SQL (`current_date`) — consolidate before another consumer of
  trailing-window math (ideally pre-port small PR).
- **My Week panel table:** Due/Activity columns crowd at panel width ("Mon 29 Jun4d") — pre-existing
  table behavior, more visible in the panel; candidate for the phone-card pattern.
- **/sales doesn't display margin yet** — the margin KPI drill lands on a surface without the metric
  (plan §8.3, accepted interim; add a margin section to /sales as its own small slice).
- **Curated e2e** (`home-shell-mobile.spec.ts`) not authored — needs the shared auth fixture; visual
  layer covered this battery by Director render-verify.
- **Local dev seed:** demo "Finance" persona lacks the `finance` access role after `db reset`
  (Director had to grant ad hoc to render-verify) — add to `seed.dev-auth.sql` so the demo persona
  matches its label.
- **Deploy tail (owner-gated):** `supabase db push` (staging) for `20260704000002`; VPS cron already
  repo-updated (`b998de4`) — apply on-box after the staging push.

## Sign-off
- All four lenses green; three Director catches fixed + verified during the battery.
- Remaining before merge: `bash scripts/pre-merge-check.sh` exit 0 on this branch.
