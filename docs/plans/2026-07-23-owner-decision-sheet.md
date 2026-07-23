# Owner decision sheet — one sitting (assembled 2026-07-23)

> Every item below survived the grill-corpus check (nothing here is answered by OD-1..90, the
> experience contract, or the provenance transcripts). Each carries the Director's recommendation —
> answering **"approve all recommendations except …"** is a complete response. Sources:
> component interrogation (annotated) · interaction-consistency §3 (GAP-1..10) · census sweep r2 §5
> (FLAG-1..18) · Money/Kitchen censuses · journey audit (in flight). Items already resolved by
> rounds since their ledger are struck with the resolving reference, not re-asked.

> ## Verification method (four-source sweep, 2026-07-23)
>
> Every OPEN item below was checked against FOUR sources before its **VERIFY:** line was written:
> **(1) codebase** at this worktree tip (`mos-app/src`, cited `file:line`); **(2) distilled authority**
> — `docs/decisions.md` (all OD families incl. OD-REDESIGN-1..90), `docs/adr/`, `docs/experience-contract.md`,
> `docs/interaction-contract.md`, `DESIGN.md`, `docs/jtbd.md`; **(3) curated provenance** —
> `docs/reference/provenance/{01,02,03}-*.md` + `owner-directives-index.md`; **(4) raw prior-agent
> threads** — grep-only, owner-turn (`role:user`) windows, secret-suppressed.
> **Raw transcripts (all FOUND on disk, none missing):** Codex grill `…/07/10/…019f4955….jsonl` (28 MB),
> Codex pickup `…/07/11/…019f4ede….jsonl` (11 MB), Codex critique `…/07/08/…019f3fea….jsonl` (6.4 MB),
> Codex follow-up `…/07/13/…019f58f9….jsonl` (264 KB), Claude frustration `…/7e03ff90….jsonl` (15 MB),
> Claude pre-redesign `…/da880767….jsonl` (43 MB), Claude MOS-origin `…/92581b7f….jsonl` (31 MB).
> **Verdict tags:** CONFIRMED-OPEN · ALREADY-ANSWERED · ALREADY-IMPLEMENTED · ⚠️ CONFLICT.
> **Headline:** the owner never spoke to the micro-interaction items (Enter-to-send, avatar-drop,
> success-toast, expand-verb, amber-fill, pricing block/warn) in ANY raw thread — those are genuinely
> CONFIRMED-OPEN. Two items are already the law/build (GAP-1, E6); F8 is answered by newer OD-90.

## A · Mockup pick (1)

**A1 · Deputy panel bubble chrome** (interrogation #10). The proposal drops the two-tone chat-bubble
chrome for assistant replies. Flagship-surface identity change → per your rules this is a **mockup
pick, not a prose yes/no**. **Cards DELIVERED** — the side-by-side comparison (A current bubbles vs
B calm document, same conversation, app tokens verbatim) was rendered to the owner's side panel
(`scratchpad/deputy-bubble-pick.html`). **Answer: A or B.** Recommend: **B** — matches the record
grammar; the labeled-turn structure keeps speaker clarity without the tinted-bubble chrome.

> **VERIFY: CONFIRMED-OPEN.** No owner statement on bubble-vs-document Deputy chrome in any raw thread
> (0 owner hits). Code: Deputy replies render through `AssistantPanel`/`OverlayCompanionSlot`
> (`components/assistant/AssistantPanel.tsx`); `docs/interaction-contract.md` (Deputy row) says Deputy
> content is "chrome-free" but does not fix bubble vs calm-document. Legitimate open mockup pick.

## B · One-line product rulings (3)

**B1 · Stale-cost pricing pre-flight: block or warn-only in MVP?** (interrogation #6 residual;
ADR-0022 says warn-only generally.) **Recommend: warn-only in MVP**, blocking policy later.

> **VERIFY: CONFIRMED-OPEN.** No owner word on block-vs-warn / "stale cost" in any raw thread (0 owner
> hits for `stale cost`, `warn-only`, `block the`). Distilled authority (ADR-0022) leans warn-only —
> the sheet's own citation — but there is no owner ruling. Stands; recommendation aligns with ADR-0022.

**B2 · ⌘K record search v1: Tasks-only honestly labeled, or widen to Signals?** (interrogation #8
residual.) **Recommend: widen to Signals** — the endpoint exists post-redesign; a lying label is
banned anyway.

> **VERIFY: CONFIRMED-OPEN.** Code confirms the premise: `components/command/command-menu.tsx:126`
> calls `searchTasksByTitle` ONLY — record search is Tasks-only today. Provenance 03:737 (assistant
> note): "the header search field is a palette trigger, not live record search — universal search is
> full-build scope." No owner ruling on widening to Signals. Stands.

**B3 · FLAG-18 · Budget/Pricing: ship enabled in this V3 cut, or keep `SHOW_PLAN_BUDGET` gated?**
They render fully against seeded scenarios now. **Recommend: ship enabled** — Money is a first-look
surface and both pages passed their census.

> **VERIFY: CONFIRMED-OPEN.** Code confirms the flag is still live + gated OFF:
> `config/features.ts:27` (`SHOW_PLAN_BUDGET` reads `VITE_SHOW_PLAN_BUDGET === 'true'`, default false);
> `router.tsx:144-145` redirects `money/budget` + `money/pricing` to `/` when the flag is off. No owner
> word flips it. Owner decision required. Stands.

## C · Interaction contract gaps (GAP-1..10, ledger §3 verbatim questions)

| # | Question | Recommendation |
|---|---|---|
| GAP-1 | Home-feed Signal open: addressable `?record=` form or explicitly ambient? | **Addressable** (journey audit independently hit this as a HIGH finding) |
| GAP-2 | "Expand-in-place": retire into "Open full page", or promote app-wide with a URL bit? | **Retire** — one escalation verb |
| GAP-3 | Which surfaces ARE RecordCollections (owe toolbar/saved-views/URL-sync)? | **Migrate People + Inbox; exempt Kitchen + Follow-ups by decision** |
| GAP-4 | Kitchen LOG batch form: route-leave dirty-guard? (20 staged dishes vanish today) | **Yes** — any edit-shaped surface with pending values guards |
| GAP-5 | Composer Enter: send vs newline (Deputy and Signal disagree) | **Enter=send, Shift+Enter=newline** on both |
| GAP-6 | After-create destination (Task navigates away; 4 surfaces stay) | **Return to originating collection, new row highlighted** |
| GAP-7 | One success-feedback channel (five today) | **Inline "Saved" at the locus for edits; promoted toast only for cross-surface creates** |
| GAP-8 | Listbox keyboard contract: build `useListboxPopover` or downgrade pickers to menus? | **Build it once**, route all four pickers; mention-picker = combobox idiom |
| GAP-9 | j/k row-cursor keys: shared collection contract or Tasks-only? | **Promote to the shared engine** (keyboard parity for identical tables) |
| GAP-10 | Phone `+` launcher opens full ⌘K vs prescribed reduced set | **Filter the `+` set** per OD-46's wording as written |

**VERIFY — GAP-1..10:**
- **GAP-1 — ~~open question~~ → ALREADY-IMPLEMENTED.** The recommended addressable `?record=` form is
  already the grammar: `components/signals/signal-feed-section.tsx:63` (`navigate(?record=…)`) and the
  unified Task door `components/tasks/tasks-workspace.tsx:41-43,194` ("unify on `?record=`"). Disposition:
  ratify as built.
- **GAP-2 — CONFIRMED-OPEN.** No owner word on the escalation verb (0 owner hits for `expand`/`open full`).
  Code still carries BOTH verbs: `record-panel-host.tsx:38` "Open full page" AND
  `task-surface.tsx:573` "Expand to full width" (standalone-page collapse). The redundancy the GAP
  flags is real; "Open full page" is the dominant escalation (decisions.md:1251) but "Expand" is not
  retired. Stands.
- **GAP-3 — CONFIRMED-OPEN.** Engine (`components/record-collection/record-collection.tsx`) is consumed
  by Tasks / Signals / Catalog adapters only; **People (`components/admin`) and Inbox
  (`components/inbox/inbox-triage.tsx`) are NOT on it.** No prior owner ruling. Migration recommendation stands.
- **GAP-4 — CONFIRMED-OPEN.** The overlay `leaveGuard` (`shell/overlay-host.tsx`) covers record
  overlays only; the Kitchen LOG batch is a full route (`pages/kitchen-log-page.tsx`) with per-line
  `dirty` flags but **no route-leave blocker** (0 `useBlocker`/`beforeunload` hits in kitchen). OD-83's
  retain/discard guard is for record fields, not this page. Stands.
- **GAP-5 — CONFIRMED-OPEN (partial).** No owner word on Enter-to-send (0 owner hits). The disagreement
  is real in code: Deputy composer ALREADY does Enter=send / Shift+Enter=newline
  (`components/assistant/AssistantPanel.tsx:89-95`); the Signal composer does NOT — Enter inserts a
  newline, submit is button-only (`components/signals/signal-composer.tsx:145-156,206-212`). Recommendation
  would bring Signal to parity with Deputy. Stands.
- **GAP-6 — CONFIRMED-OPEN.** No owner word. Code: Task create fires `onTaskCreated(newId)` to refetch
  the collection so the new row appears (`task-surface.tsx:910`), but there is no unified
  "return-to-collection + highlight-new-row" grammar across the five create surfaces. Stands.
- **GAP-7 — CONFIRMED-OPEN.** No owner ruling on inline-vs-toast (0 owner hits for `toast`). Code is the
  mixed state the GAP describes: inline `role=status` "Saved" (`components/records/record-field.tsx:146,460`)
  vs `onShowToast` (`components/admin/role-editor.tsx`) vs `--z-toast` token. Provenance 02:3520-3965
  (assistant audit) neutralized false-affordance toasts but set no channel policy. Stands.
- **GAP-8 — CONFIRMED-OPEN.** No shared `useListboxPopover` exists; only `useMenuPopover` (menus). The
  four pickers each hand-roll `role="listbox"`: `components/tasks/person-picker.tsx:18`,
  `components/signals/signal-category-picker.tsx:35`, `components/signals/signal-mention-picker.tsx:59`.
  The GAP's build-once recommendation is unbuilt. Stands.
- **GAP-9 — CONFIRMED-OPEN (partial).** `j/k` row-cursor is IMPLEMENTED but **Tasks-only**
  (`components/tasks/use-tasks-keyboard.ts:44,91-96`, OD-P3-4/AC-109); not promoted to the shared
  collection engine. Recommendation (promote to shared engine) stands.
- **GAP-10 — CONFIRMED-OPEN.** OD-REDESIGN-46/D32 says the mobile `+` and desktop `+ Create` "share one
  prescribed Action Launcher" — code satisfies *shared* (both open the same `CommandMenu`,
  `shell/bottom-tab-bar.tsx:33` + `shell/top-bar.tsx:237`), but that menu is the FULL palette (universal
  actions + Navigate + Tasks record search), not a filtered phone subset. Whether to filter the phone
  `+` set is undecided by any owner word. Stands.

## D · Census flags (sweep r2 §5; two since resolved)

| # | Question | Recommendation |
|---|---|---|
| F1 | Co-located solid CTAs: demote the universal top-bar Create to secondary when a page has its own solid CTA? | **Yes — demote to ghost** (one-solid-primary generalizes) |
| F2 | Rail badge `Tasks 9` (open) vs page `11 tasks` (total): which number? | **Open count in both**, page meta says "9 open · 11 total" |
| F3 | Signal attention: may Needs-attention rows carry the amber row-fill, or Urgent only? | **Urgent only** — keep the escalation ladder steep |
| F4 | Signal composer default owning team for multi-team posters (today: arbitrary first team — journey audit confirmed mis-target risk) | **No default — require an explicit pick** when >1 team |
| F5 | Composer datetime: keep native picker (locale-formatted) or custom WIB-labeled field? | **Keep native**, add a WIB hint label |
| F6 | Signals: `Needs attention` chip duplicates the Attention filter — keep both? | **Chip only** (saved-view axis owns it); filter stays in disclosure |
| F7 | Tasks overdue: two doors (view chip + attention line) — keep both? | **Keep both** — chip = axis, line = triage; different jobs |
| F8 | Task record page: OD-P4-11 two-column vs V3 single-column document | **Ratify single-column document** (OD-90 anatomy supersedes) |
| F9 | Task-record header: Deputy spark vs collapse glyph too similar | **Give collapse a distinct chevron form** (mechanical, approve = done) |
| ~~F10~~ | ~~Signal record title truncation~~ | **RESOLVED** — OD-90 anatomy, title wraps (luna-floor lane) |
| F11 | Money awaiting `↻` glyph looks clickable but isn't | **Make it non-interactive-styled** (static badge) |
| F12 | Money phone: window + cut axes merge into one scroll strip — separate? | **Separated already by r5's range-row work; approve as landed** |
| F13 | Inbox empty copy is filter-blind ("all caught up" while Unread filter hides read items) | **Filter-aware empty copy** |
| ~~F14~~ | ~~Cafe sub-tab naked count badges~~ | **RESOLVED** — kitchen r2 labeled-meta fix (in flight) |
| F15 | Home ambient tail label "SIGNALS" vs distinct ambient label | **Rename ambient tail "FYI"** — the attention band keeps SIGNALS |
| F16 | Home my-work rows front the PIC avatar (it's always *you*) — drop it? | **Drop avatar in my-work rows** — zero information |
| F17 | Task-create: optional Project/Objective pickers hidden when empty — discoverable enough? | **Keep hidden + one "Add context" affordance** |

**VERIFY — F1..F17:**
- **F1 — CONFIRMED-OPEN.** No owner word. Code: the top-bar Create is an unconditional filled primary
  (`shell/top-bar.tsx:232-246`, `CreateButton`) with no page-aware demotion. (Distinct from the oracle's
  action-verb-family conflict, ratify-19.) Stands.
- **F2 — CONFIRMED-OPEN.** No owner word. Code: rail badge = OPEN count, wired for Tasks only
  (`shell/rail-nav.tsx:18-30`); page toolbar surfaces overdue/attention counts
  (`components/tasks/tasks-toolbar.tsx:207-217`), not a reconciled "9 open · 11 total" meta. Stands.
- **F3 — CONFIRMED-OPEN.** No owner word on Urgent-only fill. Code: **both** tiers carry amber fill today
  — `components/signals/signal-feed-rows.css:149-169` groups `--urgent` and `--needs-attention`; Urgent
  only adds a leading dot (`signal-card.css:36-37`). Recommendation (Urgent-only) is a real change. Stands.
- **F4 — CONFIRMED-OPEN.** Code confirms the auto-default: `components/signals/signal-composer.tsx:64`
  (`teamOptions.find(is_primary) ?? teamOptions[0]`) always pre-selects a team. No owner word on
  "no-default when >1 team". Stands.
- **F5 — CONFIRMED-OPEN (partial).** Native `datetime-local` is ALREADY kept
  (`signal-composer.tsx:183-188`); the WIB hint label is NOT present (`occurredLabel` = "Occurred at",
  i18n:590). Only the hint half remains. Stands.
- **F6 — CONFIRMED-OPEN.** Code: both the `needs-attention` saved-view AND the Attention filter axis
  coexist (`components/signals/signal-collection-adapter.tsx:44,61,64,227`). No owner word. Stands.
- **F7 — CONFIRMED-OPEN (ratify keep-both).** No owner word; both doors exist. Recommendation is a
  keep-as-is ratification. Stands.
- **F8 — ALREADY-ANSWERED (newer owner decision resolves an old conflict).** OD-P4-11 (owner 2026-06-19,
  decisions.md:550-561) described a "full two-column page"; **OD-REDESIGN-90 (owner 2026-07-23,
  decisions.md:2102-2116)** mandates a JTBD-ordered single **document** anatomy, and the build already
  renders single-column (`components/records/record-viewer.css:1-2,289-290` "reads as a calm document…
  the ONE shared record-page grammar (Task + Signal)"). The two owner statements conflict by date; the
  newer redesign-era OD-90 wins. Disposition = ratify single-column per OD-90 (as the recommendation says).
- **F9 — CONFIRMED-OPEN (mechanical).** No owner word. Code confirms the adjacency the flag names: the
  Deputy spark (`components/records/ask-deputy-action.tsx` `DeputySparkIcon`, mounted at
  `task-surface.tsx:693`) and the expand/collapse control (`task-surface.tsx:588-589`) sit in the SAME
  record-actions row. Distinct-chevron recommendation stands (approve = done).
- **F11 — CONFIRMED-OPEN (partial — already structurally inert).** The `↻` awaiting glyph is already a
  static `aria-hidden` span, NOT a button (`components/ui/state-kit.tsx:62,93-94`). The flag is purely
  the VISUAL "looks clickable" restyle; no owner word. Stands as a styling ratify.
- **F12 — VERIFIED LANDED (Director re-check).** The verifier's "range-row not found" was the two-tree trap (it checked the repo-root old branch): in the v3-redesign worktree `.global-toolbar-range-row` exists in `global-toolbar.css` (2 rules) and `WindowRangeFields` is live in toolbar + selector + stories. Approve as landed.
- **F13 — CONFIRMED-OPEN.** Code confirms filter-blind copy: `components/inbox/InboxList.tsx:31` and
  `inbox-triage.tsx:103` both render a single static `EmptyState` (`inbox.empty`/`inbox.emptyCopy`),
  not filter-aware. No owner word. Stands.
- **F15 — CONFIRMED-OPEN.** Code: the Home ambient tail labels itself `t('nav.signals')` = "Signals"
  (`components/signals/signal-feed-section.tsx:80`), not "FYI". CAUTION for the owner: the owner uses
  "FYI" as the *attention level* (FYI/Needs attention/Urgent, OD-43) in the grill (02) — reusing "FYI"
  as the section label could collide with that established meaning. No prior decision on the label. Stands.
- **F16 — CONFIRMED-OPEN.** Code confirms the always-you avatar: `lib/home-stream.ts:88-96` populates
  `pic` from `responsible_person_id`, rendered as an avatar in `components/home/home-stream.tsx:101-104`.
  No owner word on dropping it. Stands.
- **F17 — CONFIRMED-OPEN.** No owner word; no "Add context" affordance in code (0 hits). Task
  Project/Objective fields exist as record inline-edits (`task-surface.tsx:307-308`) but the create-time
  hidden-when-empty + single "Add context" affordance is unbuilt. Stands.

**B4 · The 15px type rung.** The final token sweep pinned ~65 uses of 15px (TaskSurface ×19+,
TasksWorkspace ×15, auth pages ×10…) — the app's biggest off-ladder size, sitting between body
(14) and none. One ruling: **mint `--font-size-body-lg: 15px`** as a sanctioned rung, or collapse
all to body 14? **Recommend: mint the rung** — 65 organic uses is a de-facto rung; collapsing
risks density regressions across the record grammar.

## E · Ratify register (deviations awaiting formal sign-off)

1. Pill radius rounded-rect vs DESIGN.md 999px (ledger RATIFY item). **Recommend: ratify rounded-rect.**
   > **VERIFY: CONFIRMED-OPEN (ratify — deviation live, DESIGN.md unamended).** Code carries the exact
   > flagged divergence: `components/ui/Pill.css:9-13` — "DESIGN.md §Shapes says 'Pills use full (999px)';
   > the shipped v3 Pill is a rounded-rect [`--radius-sm`, 8px]… Revert to `--radius-pill` only on owner
   > word." `DESIGN.md:326,342,634` still says 999px. So ratifying rounded-rect = amending DESIGN.md; the
   > alternative is revert. Genuinely awaiting owner word.
2. A12 re-expression — attention-worthy Signals inside the ranked Home stream. **Ratify.**
   > **VERIFY: CONFIRMED-OPEN (ratify — already built).** Built as OD-84.1/Luna P0-1: attention-worthy
   > Signals lead the Home stream as band 0 (`components/home/home-stream.tsx:63-65`,
   > `home-stream.test.tsx:64`). No owner word ratifies the A12 re-expression itself. Awaiting sign-off.
3. OD-18 re-expression — ranking preference over strict recency. **Ratify.**
   > **VERIFY: CONFIRMED-OPEN (ratify — already built).** OD-REDESIGN-18 (decisions.md:1237) sets Home
   > region order as a profile preference; ranking-over-recency is the built behavior. No owner word on
   > this specific re-expression. Awaiting sign-off.
4. Signals archive default presentation = feed. **Ratify.**
   > **VERIFY: CONFIRMED-OPEN (ratify — already built + self-flagged in code).**
   > `components/signals/signal-collection-adapter.tsx:418` "Feed-first default (see
   > SIGNAL_COLLECTION_NEUTRAL_QUERY RATIFY note)." The code itself parks this as awaiting ratify. Stands.
5. Phone View & filters wrapper non-dedup rationale. **Ratify.**
   > **VERIFY: CONFIRMED-OPEN (ratify).** Related to OD-REDESIGN-84 (owner 2026-07-23) toolbar
   > lean+disclosure; the non-dedup rationale itself has no explicit owner disposition. Awaiting sign-off.
6. **RecordViewer region order → content-first** (OD-90 adoption; the anatomy spec's flagged
   conformance debt; per-kind for Signal now, Task/Follow-up next). **Ratify.**
   > **VERIFY: ALREADY-ANSWERED.** This IS **OD-REDESIGN-90** (owner verbatim 2026-07-23,
   > decisions.md:2102-2116): "content first and unclipped → urgency with it → actions grouped → provenance
   > last, quiet, disclosed." The owner already made this the binding anatomy law (census Step 2.5). The
   > ratify item is redundant with the OD it cites — record it as ratified-by-OD-90, not a fresh ask.
7. **F-9 Money job sentences (drafts landed, approve or edit):**
   - Budget — EN "Capture certified-cost budget scenarios pricing can trust." · ID "Rekam skenario anggaran berbasis biaya tersertifikasi yang bisa dipercaya penetapan harga."
   - Pricing — EN "Check a candidate price against certified costs before it ships." · ID "Uji harga kandidat terhadap biaya tersertifikasi sebelum diberlakukan."
   **Recommend: approve as drafted.**
   > **VERIFY: CONFIRMED-OPEN (ratify — drafts ALREADY live in i18n, verbatim).** Both sentences (EN+ID)
   > are already shipped: `mos-app/src/i18n/messages.ts:548-549` (EN) and `:1290-1291` (ID), byte-identical
   > to the drafts above. No owner word approves the copy yet. Owner approves-or-edits; nothing to build.

## F · Pending slots (fill before the sitting closes)

- ~~Journey-audit flags~~ — **CLOSED, no new owner flags**: all 6 journeys walked; findings were DO (JQ-1 cafe tab gating, JQ-3 onboarding login handoff, JQ-4 inbox door — fix lane v3/jq-fixes) or DEFER (JQ-5 drill-through → backlog); JQ-2 = GAP-4 above.
- **Backfill-batch flags — LANDED (6 one-liners, docs/plans/2026-07-23-backfill-census.md §4):**
  - **G1** Phone bottom-tabs: carry the rail's at-a-glance counts, or count-free phone chrome? **Recommend: count-free** (phone chrome stays calm; Home carries the numbers).
  - **G2** `/cafe/log` deep-link from every persona's "Failed checks" band, or Café/Kitchen roles only? **Recommend: role-scoped** (matches the SEC-1 guard direction).
  - **G3** "Objective" in Bahasa: loanword everywhere, or "Tujuan" everywhere? (today it's mixed). **Recommend: "Objective" as loanword** — matches PIC/Supervisor loanword convention.
  - **G4** Stuck-run Deputy: two Stop buttons (banner + composer) or one? **Recommend: one** (banner owns it).
  - **G5** ⌘K keyboard hints on the 390px touch variant: render or hide? **Recommend: hide on coarse pointer.**
  - **G6** 404 page: keep the Home job-sentence or a 404-specific line? **Recommend: 404-specific line.**
  > **VERIFY (dark mode, incidental — not one of the enumerated items):** dark mode is ALREADY built and
  > user-reachable (appearance control + theme-provider, follows system; provenance 03:1139-1229,1820 —
  > "the whole app was repainted… in both light and dark mode"). Whatever the Step-2 backfill flag asks,
  > it is not "does dark mode exist" — it exists. Scope the flag before re-asking.
- ~~Deputy-bubble mockup cards~~ — DELIVERED (A1 above). **The sheet is COMPLETE — every slot closed.**
