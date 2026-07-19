# Record Panel Host — ONE overlay grammar for records (owner-directed 2026-07-19)

**Owner's words:** "there are few app thrown in together… inbox drawer opens on top, task drawer
open on the side. still not seeing any cohesion in the design implementation grammar."

**Law this closes (all standing, all repeatedly audit-confirmed):** Experience Contract **Rule 6**
("the drawer holds the stack-navigated record, Inbox quick triage, or deputy — **never competing
drawers**"), **OD-REDESIGN-20** (one canonical Inbox: bell = quick panel, rail = full page, one
shared right-panel host + one navigation stack), **OD-REDESIGN-63** (in-list click → shared split
drawer; direct URL → full canonical page), ADR-0025 **D3b** (shared Record Panel).

**Reference implementation:** the Task drawer (`task-drawer.tsx` + `task-page-mode`) — dual regime
(≥1100px inline non-modal `aside` split; below that `role=dialog aria-modal` + focus trap + Esc +
return-focus), audit-verified "exemplary." It BECOMES the host; nothing else re-invents it.

## FR-1 — Extract `RecordPanelHost`
One component owning: the dual modal regime; chrome (header: title zone · "Open full page ⤢" when a
canonical page exists · ✕ Close); width `var(--record-panel-w)` (task drawer's current); tokens,
border, shadow identical to the task drawer today; the focus contract; `prefers-reduced-motion`.
Phone: panel becomes a page-stack per Rule 4 §phone without changing URLs/Back.

## FR-2 — Task record consumes the host (zero behavior change)
Pure extraction. Every existing task-drawer test passes unmodified (the proof of "no change").

## FR-3 — Signal record moves INTO the host + gets its canonical page (closes OD-63 item 6)
- In-list click (feed or archive): Signal record opens in the SAME host — same side, same width,
  same chrome as a Task. The bespoke route-local `aside` in `signals-archive-page.tsx` is deleted.
- NEW route `/work/signals/:signalId` → full canonical page, same renderer `mode="page"` (mirror of
  `task-page-mode`): direct URL / refresh / new-tab escalates to page. `?record=` deep-links redirect
  to the canonical route.
- The record host keeps existing fetch/mutate logic (`signal-record-host.tsx` becomes the panel's
  content, not its chrome).

## FR-4 — Inbox two-door (closes OD-20)
- Top-bar bell → the SAME host opens in quick-triage mode: the inbox list (unread first) rendered in
  the panel; clicking an item PUSHES that record in the host (stack), Back returns to the list,
  Close returns to the underlying page. No URL change (ephemeral quick-door).
- Rail/bottom-nav Inbox → `/inbox` full canonical page, unchanged. Read/handled state shared between
  doors (same DAL).
- Phone: bell opens the full page (OD-20 letter: "On phone Inbox opens as a full page").

## FR-5 — Deputy aligns to the host contract
Deputy panel adopts identical width/chrome/focus contract (may remain its own mounted instance —
Rule 6 lists deputy as a host tenant; visual + interaction parity is the requirement this slice).

## FR-6 — One stack, never two
Opening any host tenant closes/replaces the current one (never two panels). Esc/Close/Back semantics
identical across tenants. `aria-current`/URL rules unchanged (Rule 4/5).

## NFRs
No new component library; extraction + reuse only (Rule 11). Coverage ≥80% changed lines. All
existing suites stay green except tests updated for deliberate grammar changes (each cited to this
spec). Computed-style parity: Signal panel chrome measures IDENTICAL to Task panel chrome.

## ACs (owning layer)
- AC-RPH-1 (unit): Task drawer renders via RecordPanelHost; full existing task-drawer test file green unmodified.
- AC-RPH-2 (unit): Signal in-list click mounts in the host; chrome computed-styles equal Task's (width/border/shadow/header).
- AC-RPH-3 (unit + e2e): direct `/work/signals/:id` renders the full page; in-list click renders the panel; same renderer both modes.
- AC-RPH-4 (unit): bell opens quick-triage panel; item click pushes record; Back returns to list; Close returns to page; unread state shared with `/inbox`.
- AC-RPH-5 (unit): only one host tenant open at a time (opening Deputy closes a record panel and vice versa).
- AC-RPH-6 (e2e, curated): Inbox journey — bell → triage → open record → Back → Close (desktop); phone bell → `/inbox` page.
