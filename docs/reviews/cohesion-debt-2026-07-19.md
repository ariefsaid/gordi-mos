# Cohesion debt map — 2026-07-19 (why it still "feels like several apps")

**Owner, verbatim:** "i'm also still seeing like there are few app thrown in together. there is no
consistency… still not seeing any cohesion in the design implementation grammar."

Two hunts on the pi substrate answered it from opposite sides. Neither is a style nit list: these are
the *mechanical* sources of the feeling — the same element implemented N times, N different ways.

- **glm-5.2 (code)** — read `mos-app/src` pairwise against `docs/interaction-contract.md`; found
  ~26 places where one concept has multiple implementations. Full output preserved in the run log.
- **minimax-m3 (NIM multimodal, sees pixels)** — fed 7 rendered surfaces at once (Home · Tasks ·
  Signals · Money · Inbox · ⌘K · Café) and asked "do these look like one app?"
- **gpt-5.6-luna (live visual/taste)** — **DID NOT RUN**: Codex provider error (request
  `b30604bf-497e-4de4-b0aa-749e8b6f8038`). Its dimension is partly covered by minimax; re-run when
  the provider is healthy. *(Recorded so "3 hunts ran" is never claimed.)*

## The headline duplications (glm — each = one concept, many implementations)

| Concept | How many ways it exists today | Unify on |
|---|---|---|
| **Modal/confirm** | 4 — ConfirmArchive, OccurrenceAssignDialog (class-renamed copy), admin ConfirmDialog, CreatePersonDialog | the admin `ConfirmDialog` primitive, moved to a shared path |
| **Scrim colour** | 4 — `--surface-overlay` 72%, `--scrim` 32%, `color-mix(foreground 45%)`, Tailwind `bg-foreground/40` | one `--scrim` token + one `.scrim` utility |
| **Close glyph** | 4 — raw `×`, raw `✕`, 16px SVG, 18px SVG | one `CloseIcon` in `shell/icons.tsx` via `IconButton` |
| **Loading** | 7 wrapper idioms + 3 visual shapes + 5 copy-pasted `LoadingState` fns | one `<LoadingShell>` + `SkeletonRows`; delete "Loading…" text |
| **Empty state** | kit + 3 locals (InboxList, chart-frame w/ hardcoded English, Assistant's own) | the kit `EmptyState` (+ a suggestions slot) |
| **Money format** | 2 — `Rp 1,000,000` (commas, en-US) vs `Rp 1.000.000` (dots, id-ID) **in the same app** | one `lib/format/money.ts` |
| **Date format** | 3 — locale-aware, hardcoded en-GB, hardcoded en-GB+year | one locale-aware `lib/format/date.ts` |
| **Tabs** | 2 — `ViewTabs` (brand-orange underline, arrow keys) vs `.rf-tab` (primary underline, ←→ only) | `ViewTabs`; delete `.rf-tab` |
| **Skeleton keyframe** | 3 identical definitions | one in `index.css` |
| **z-index** | ad-hoc 20/31/40/50/90/100/**9999**; an admin confirm (z-50) opens *behind* a drawer (z-90) | a documented tier scale via CSS vars |
| **Transition duration** | tokens exist and are used by NOTHING; hardcoded 120/150/160/180 (drawer scrim 150 vs its own sheet 180) | the token scale |
| **Button/segmented/select** | kit exists; Tasks ships standalone `.btn-ghost`/`.btn-outline-sm`, raw `<select>`s; CutToggle+WindowSelector ship identical `.seg` CSS | extend the kit, delete locals |
| **Feedback** | 3 — admin visual Toast, Tasks sr-only announce, Catalog its own announce | one `useFeedback()` + one shell-rooted Toast |
| **focus-visible** | global +2px outline overridden to −2px in 7 places, one swaps the token | +2 everywhere except documented dense-table exceptions |

Also: I3 popovers position two ways (portal+fixed for admin, in-place absolute everywhere else —
fragile inside `overflow:hidden`); Task rows emit `aria-current="true"` alongside the rail's
`aria-current="page"`, violating I7's "exactly one".

## The visual disagreements (minimax-m3, seeing 7 surfaces together)

1. **Three empty-state grammars** — Money/Inbox centered icon+title+subtitle; Café centered
   circle+CTA; Tasks/Signals plain text, no icon, not centred. *(Partly addressed today: Money → ↻
   awaiting, Events → — blank; Inbox's ✓ is a correct earned all-clear.)*
2. **Two list grammars** — Tasks/Home tabular with dividers vs Signals borderless-compact with
   right-aligned meta. Two ways to read "a list of records".
3. **Surface title icons** — Tasks/Signals/Money use `≡`, Inbox uses `✉`, Home/Café none.
4. **Eyebrow/section header** (`YOUR TEAM — WEEK OF …`) exists only on Home.
5. **Title-adjacent slot** carries a count badge on Inbox but a date on Café — same slot, different
   semantics.

**Confirmed cohesive (measured, not assumed):** top bar identical across all 7 · left rail · user
chip · status/attention pills · underlined tab grammar · primary button · breadcrumb+job-sentence row.

## Sequencing (this is a program, not a batch)

Highest pain-per-effort first; each is a small slice with a locking test:
1. **Format unification** (money, date) — user-visible wrongness, S effort, no design call.
2. **One scrim + one close glyph + one skeleton keyframe** — S each, pure deletion.
3. **Empty-state + loading primitives** — M, kills two of minimax's three grammars.
4. **Modal consolidation + z-index scale** — M, fixes a real bug (confirm behind drawer).
5. **List grammar** (Signals vs tabular) — needs an owner call: which is *the* list?
6. **Title icon / eyebrow / title-slot** — needs an owner call: does Home get an icon?

Items 5–6 are the only owner decisions here; 1–4 are settled-law cleanup.

Referenced from `docs/backlog.md` (standing cohesion program) and
`docs/interaction-contract.md` (the behavioural half of the same problem).
