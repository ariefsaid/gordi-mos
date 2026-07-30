# Review ledger — v4-redesign

Diff scope: `git diff $(git merge-base origin/main HEAD)..HEAD` — **1037 files**. This branch
carries the whole v4 redesign, not one slice. Two distinct bodies of work sit inside it:

- **The v4 redesign at large** — 25 `supabase/migrations/` (Signals, process definitions/runs,
  team re-home, kitchen BU membership, objective-lead write), the auth shell + `require-capability`,
  and the redesigned surfaces that landed before 2026-07-28.
- **The Home layout preference slice** (`09ee7d8..HEAD`, ~45 commits, 2026-07-28/29) — `OD-V4-9`
  (Focused / Overview / List, per-person, chosen in Personal profile) and `OD-V4-10` (the region-order
  toggle retired). Spec `docs/specs/home-layout-preference.spec.md`, plan
  `docs/plans/2026-07-28-home-layout-preference.md`.

The battery below states which body each verdict covers. A verdict scoped to the slice alone is
**not** a verdict on the branch.

## Verdicts

- spec: FIX-THEN-SHIP — spec-reviewer (opus), 2026-07-29. Scope: Home slice. Per-AC evidence table
  produced by reading code, not by trusting implementer reports. §7 error-handling table verified to
  hold in code (a failed or in-flight read renders `ErrorState`+Retry, never an all-clear; a count is
  `null`, never `0`, unless its read succeeded). Findings: 4 ACs had no owning test (AC-926/931/933/934)
  and 3 asserted less than they claimed (AC-921/928/929); `FR-931` (work regions through
  `RecordCollection`) NOT MET — the plan waived it on a false premise, mitigated because there is
  exactly one row renderer, not one per layout. Remediation in flight (see Open items).
- code-quality: FIX-THEN-SHIP — code-quality-reviewer (opus), 2026-07-29. Scope: Home slice.
  Two Criticals, both remediated: `HomeFocused` shipped `role="tablist"` with no roving tabindex,
  no arrow keys and no `tabpanel` — on the default layout, re-implementing a contract this repo had
  already learned and fixed in `cut-toggle.tsx`; and `hidePic` was documented, prop-tested and never
  wired, so every my-work row named the viewer to themselves. Also fixed: ~340 lines of dead
  `HomeStream` keeping its own test alive, orphaned `initials` helpers, dead `.home-order-seg*` rules,
  an `Intl.DateTimeFormat` built per Done task, and four files stating four inconsistent things about
  two font sizes. Remediation commits `b031a1e`, `b34796b`, `0550a2f`, `080dfb5`, `46aa0a1`, `d060e4b`.
- design: NOT-RUN — **the layered design battery (`OD-REDESIGN-89`) has not run on this branch.**
  What did run is recorded below as evidence, not as a verdict: the standalone four-lens essay review
  is **retired**, and the OFFICIAL verdict is Luna's, on fresh renders, cross-family. A Director- or
  Claude-authored design verdict is not one (`never-self-score-design-gates`). Still owed: mechanical
  guards green (2 real failures remain, see Gates), census protocol Steps 1–6, Storybook states + axe,
  interaction-contract conformance, then Luna. **This line blocks merge until replaced.**

  *Evidence gathered so far (not a verdict)* — design-reviewer (opus), 2026-07-29, four-lens plus a
  rendered mockup-vs-shipped divergence audit at 11 widths. Scope: Home slice.
  Found 14 divergences from the signed mockup `docs/design-mockups/home-priority-2026-07-28/index.html`;
  root cause recorded: **the plan ported the mockup's three arrangements and dropped its decisions**,
  which lived in CSS comments no test reads. Two were blocking and are fixed — regions rendered a
  confident `0` under a failed read, and breakpoints keyed off the viewport instead of the container
  (measured: row titles squeezed to 99px at 1100px, and a work column of 488px@1100 vs 572px@1024).
  The rest shipped in `1b27536`, `95633c6`, `d725152`, `beb9e40`, `2e407f1`, `b59e86e`, `5d074ef`,
  `d9eb26a`, `b59ea15`. Three divergences were judged justified adaptations, not regressions
  (`+ Signal` at secondary weight, the tile's resting shadow, and the repaired List structure — the
  mockup's own C direction is broken at desktop).
- security: FIX-THEN-SHIP — security-auditor (opus), 2026-07-29. No Critical, no High. All 13 new
  tables have RLS enabled **and forced** with org-scoped policies; every `SECURITY DEFINER` pins
  `search_path = ''`, revokes PUBLIC, and derives org from the JWT rather than trusting a
  client-supplied `org_id`/`team_id` — no cross-org read or write path was constructible. No secrets
  committed, no injection or XSS sink, and the client capability map agrees exactly with the
  `shared.role_capabilities` seed. Test-seed guard verified sound (no seed data ships; the deny path
  is proven by pgTAP 83/91, not merely asserted). `.sql.HOLD` correctly held — the un-enforced
  invariant is data-integrity only, since no RLS policy references `mos.tasks.team_id`.
  Three Mediums, all fixed in `c910e21`: **M-1** the documented "`revoked_at` only" rule on the
  `mos.signal_mentions` UPDATE grant had no column guard enforcing it (forward migration
  `20260729000001` adds one; regression proof `supabase/tests/104_signal_mention_update_guard.sql`);
  **M-2** a forward migration seeded dev-fixture person uuids into `shared.team_memberships`, which on
  a real deploy either aborts on the FK or grants demo principals kitchen-write; **M-3** `config.toml`
  shipped self-signup enabled. 10 Lows logged in the audit, not yet actioned.

  **⚠ M-1 and M-3 are fixed in source but NOT DEPLOYED.** `config.toml` is not authoritative for what
  is running, so the live projects need to be checked and changed by hand. Owner actions, in order:
  apply `20260729000001_mos_signal_mention_update_guard.sql` to staging and to self-hosted prod;
  confirm self-signup is disabled on both, verified by a live probe rather than by reading the file;
  then audit `auth.users` for accounts that were not provisioned through
  `shared.admin_create_login`, including any `*.dev@example.test` persona.

  **Disclosure note (2026-07-30).** This repo is public. The tree has been scrubbed of step-by-step
  weakness descriptions, but commit `c910e21`'s *message* was already pushed and remains readable in
  the public history, forks, and the GitHub events API. Scrubbing the tree stops the detail being
  re-read by anyone browsing the code today; it does not un-publish it. Treat the fixes above as
  time-sensitive for that reason, not as optional cleanup.

## Gates

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS — `tsc -b --noEmit`, exit 0 |
| `npm run lint` | PASS — eslint `--max-warnings=0` + stylelint, exit 0 |
| `npm test` (Vitest) | SEE NOTE — 105 failing, all pre-existing |
| mechanical guard battery | **FAIL** — 2 remaining, see below |
| `supabase test db` (pgTAP) | NOT RUN |
| audit-register | **FAIL** — 7 unlocked surfaces touched |

**Mechanical guards.** Three of the five failures were the *guards* being stale, not the app being
wrong, and are fixed in `66ef90e`: `FONT_SIZE_TOKENS` omitted `kpi-value` and `touch-input` — two
tokens `index.css` genuinely declares — so every consumer that spoke the vocabulary **correctly** was
reported as raw-value debt; 32 ledger entries pinned debt that had already been paid by earlier token
migrations (exactly what the ratchet exists to catch); and `DO-16(a)` pinned `.home-order-disclosure`,
a selector retired with the toggle under `OD-V4-10`. Two **real** failures remain and are NOT this
slice's: `GUARD-R2/cafe-plan` and `GUARD-R2/cafe-review` — naked count chips in the Café Plan and
Review heads. They block the gate and need their own fix.

**Audit register.** Seven surfaces this branch touches are neither LOCKED nor BUMPED: `events`,
`profile`, `login-recovery`, `chrome-top-bar`, `chrome-command-menu`, `chrome-deputy-panel`,
`chrome-signal-composer`. Each needs its once-per-generation battery plus pins, or an explicitly
recorded bump. This is branch-wide scope, not Home-slice scope.

**Note on `npm test`.** 105 tests fail on this branch from the deferred decision `OD-V4-4`. That
baseline predates the Home slice. Every agent working in this slice captured the sorted failing-test
**names** before starting and diffed them at the end; the set is byte-identical from `09ee7d8` to
HEAD. Counting is not evidence here — two runs can both say "105" while holding different failures,
so the name diff is what was checked.

## Open items

1. **RESOLVED (2026-07-30, owner ruling).** Owner, verbatim: "agree. remove any requirements for what
   needs my attention." The Director recommendation below was accepted as stated: Home keeps the
   status row, Experience-Contract Rule 1 is amended (`docs/experience-contract.md`) so a page whose
   head carries a qualifying status row satisfies orientation with that row instead of the literal
   job sentence — never both, never neither — and the dead guard at
   `src/shell/context-row.test.tsx:75` (old numbering) is rebuilt to compose the head the way `/`
   actually does (a `statusRow`, no `jobSentence`), with the amended invariant proved to fail both
   when the render carries both signals and when it carries neither. `RATIFY-5`,
   `docs/specs/home-layout-preference.spec.md` §10, records the artifact-trail entry. `DESIGN.md`
   (ratified `509c6ae`) was left untouched — its existing "one clear job sentence/context" wording
   already reads compatibly; no edit was needed.
   <details><summary>Original finding (superseded)</summary>
   Owner ratification owed — the job sentence. Home no longer renders `job.home` ("What needs my
   attention right now?"); the day-status row took its row in the header block. Experience-Contract
   Rule 1 requires the job sentence exactly once per page; on `/` it is now zero. Aggravating: the
   guard at `src/shell/context-row.test.tsx:75` still passes only because its fixture composes a
   `PageHead` **without** a `statusRow`, so the AC-013 oracle has stopped guarding the real `/`.
   Director recommendation: keep the status row and amend the contract so a page carrying one
   satisfies the orientation requirement with it — then repair the guard to compose the head the way
   `/` actually composes it.
   </details>
2. **AC coverage in flight** — AC-926, AC-931 (a measured width sweep at 390/620/768/940/1100/1280,
   with a viewport>400px abort), AC-933, AC-934 (e2e), plus re-scoped AC-921/928/929/932.
3. **AC-929 / NFR-924 amendment.** Overview caps each tile at `OVERVIEW_TILE_ROWS` (5, raised from 4
   by owner ruling 2026-07-30 — `RATIFY-4`) with an "N more →" link, so it renders strictly fewer
   records than List above 5 items. Director ruling: the cap plus its link is the intended behaviour
   and the ACs are amended to the honest invariant — *no layout is the reason a record is
   unreachable; a truncated region always offers the way through.* Recorded as `RATIFY-3` in the spec
   (owner-signed artifact).
4. **Deviation logged, accepted** — the Signals feed shows all Signals rather than the plan's literal
   FYI-only `ambientSignals`. No region carries Signals under the new model, so the literal reading
   would have made Urgent Signals vanish from Home entirely. Feed ordering (Urgent → Needs-attention →
   FYI) means the cap-6 tail cannot push an Urgent Signal off the page.
5. **Deviation logged, accepted** — the layout picker's List description was re-cast to carry a
   "Best when…" clause. The signed mockup's own List string lacks one; `FR-920` requires a description
   "of who it suits". The requirement binds over the artifact.

## Decision

HOLD — the security review has not run. Item 1 is resolved (owner ruling, 2026-07-30, see above).
Everything else is either merged or in flight. Re-run `bash scripts/pre-merge-check.sh` once the
security verdict is recorded.
