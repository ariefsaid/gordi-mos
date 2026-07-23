# Owner decision sheet — one sitting (assembled 2026-07-23)

> Every item below survived the grill-corpus check (nothing here is answered by OD-1..90, the
> experience contract, or the provenance transcripts). Each carries the Director's recommendation —
> answering **"approve all recommendations except …"** is a complete response. Sources:
> component interrogation (annotated) · interaction-consistency §3 (GAP-1..10) · census sweep r2 §5
> (FLAG-1..18) · Money/Kitchen censuses · journey audit (in flight). Items already resolved by
> rounds since their ledger are struck with the resolving reference, not re-asked.

## A · Mockup pick (1)

**A1 · Deputy panel bubble chrome** (interrogation #10). The proposal drops the two-tone chat-bubble
chrome for assistant replies. Flagship-surface identity change → per your rules this is a **mockup
pick, not a prose yes/no**. → I'll push 2 variant cards (current bubbles vs calm document style) to
review; pick there. *(Cards owed — slot.)*

## B · One-line product rulings (3)

**B1 · Stale-cost pricing pre-flight: block or warn-only in MVP?** (interrogation #6 residual;
ADR-0022 says warn-only generally.) **Recommend: warn-only in MVP**, blocking policy later.

**B2 · ⌘K record search v1: Tasks-only honestly labeled, or widen to Signals?** (interrogation #8
residual.) **Recommend: widen to Signals** — the endpoint exists post-redesign; a lying label is
banned anyway.

**B3 · FLAG-18 · Budget/Pricing: ship enabled in this V3 cut, or keep `SHOW_PLAN_BUDGET` gated?**
They render fully against seeded scenarios now. **Recommend: ship enabled** — Money is a first-look
surface and both pages passed their census.

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

## E · Ratify register (deviations awaiting formal sign-off)

1. Pill radius rounded-rect vs DESIGN.md 999px (ledger RATIFY item). **Recommend: ratify rounded-rect.**
2. A12 re-expression — attention-worthy Signals inside the ranked Home stream. **Ratify.**
3. OD-18 re-expression — ranking preference over strict recency. **Ratify.**
4. Signals archive default presentation = feed. **Ratify.**
5. Phone View & filters wrapper non-dedup rationale. **Ratify.**
6. **RecordViewer region order → content-first** (OD-90 adoption; the anatomy spec's flagged
   conformance debt; per-kind for Signal now, Task/Follow-up next). **Ratify.**
7. **F-9 Money job sentences (drafts landed, approve or edit):**
   - Budget — EN "Capture certified-cost budget scenarios pricing can trust." · ID "Rekam skenario anggaran berbasis biaya tersertifikasi yang bisa dipercaya penetapan harga."
   - Pricing — EN "Check a candidate price against certified costs before it ships." · ID "Uji harga kandidat terhadap biaya tersertifikasi sebelum diberlakukan."
   **Recommend: approve as drafted.**

## F · Pending slots (fill before the sitting closes)

- ~~Journey-audit flags~~ — **CLOSED, no new owner flags**: all 6 journeys walked; findings were DO (JQ-1 cafe tab gating, JQ-3 onboarding login handoff, JQ-4 inbox door — fix lane v3/jq-fixes) or DEFER (JQ-5 drill-through → backlog); JQ-2 = GAP-4 above.
- Backfill-batch flags (dark mode / id locale / finance persona / chrome surfaces — Step 2).
- Deputy-bubble mockup cards (A1).
