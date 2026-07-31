# Review ledger — release/staging-bu-remap (dev→main→staging promotion, up to BU remap)

Promotion of `dev` **up to and including the BU taxonomy remap** (`ae357cb`) to `main`, then `staging`
— owner-directed 2026-07-06. Everything after the cut (agent port P2/P3a/P2.1) stays on `dev`.

This is an **aggregate** ledger: the promoted range is three already-reviewed slices, each with a full
battery recorded in its own ledger. Verdicts below are carried forward verbatim-in-substance from those
ledgers (all SHIP/PASS). No new code is introduced by this branch beyond this ledger file.

**Promoted slices + source ledgers:**
- Home v1 + `sales_margin_daily` — `docs/reviews/feat-home-v1-margin.md`
- Port P1 substrate (viewspec; dark behind `SHOW_USER_VIEWS`) — `docs/reviews/feat-port-p1-substrate.md`
- BU taxonomy remap (ADR-0019 D1) — `docs/reviews/feat-bu-taxonomy-remap.md`
- (+ pre-port helper dedup / demo-Finance seed fix — CQ follow-ups, no user surface)

**Migrations promoted** (present at `ae357cb`): through `20260705000002_bu_taxonomy_remap.sql`
inclusive — reporting revenue/margin read-models, `mos.user_views`, and the BU remap.
⚠️ `20260705000002_bu_taxonomy_remap` **mutates real staging BU rows** on `db push` (dual-path org
guard verified BOTH directions; DOWN restores).

## Verdicts (aggregate — all green in source ledgers)

- spec: SHIP — all three slices matched their specs at every AC layer (Home M/SN/H/HK/T/D/RG/I ids; P1 all 20 AC-UV ids; BU remap mapping byte-for-byte vs ADR-0019 D1 oracle). No scope creep.
- code-quality: SHIP — no Critical across all three; every Important fixed in-battery (Home 3 follow-ups noted; P1 3 Importants fixed; BU remap 4 items fixed in `1ae8381`).
- design: SHIP — Director live render-verify: Home v1 desktop 1280 + phone 380 + Bahasa + member-persona (no finance bleed, zero reporting fetches); P1 harness real-primitive hydration + phone-card mode; BU remap = DB/test-literal only, nil visual impact. Screenshots: home-v1-desktop-finance.jpeg, home-v1-phone-finance.jpeg, p1-harness-hydrated-desktop.jpeg.
- security: PASS — auditor CLEAR on all three: tenancy/RLS sound (FORCE RLS, cross-org + write-denial pgTAP-proven), no injection, cred discipline held; Home 2 Mediums (test-grants in prod migration) fixed in `23145ea`; P1 M1 save-time compile gate + hardening landed same-battery; BU remap Medium (org_id predicate on re-point UPDATEs) fixed in `1ae8381`. Pre-existing cross-org BU-FK gap tracked as a spawned follow-up (close before a second tenant — not triggered on single-tenant staging).

## Gate
`bash scripts/pre-merge-check.sh` → expect exit 0 (spec + code-quality + design + security all SHIP/PASS).
