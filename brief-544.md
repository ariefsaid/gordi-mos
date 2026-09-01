# #544 — Restore the ruled Work-child order (Signals first) across rail, drawer, palette

## What to build

The shell's one Work-children declaration renders in the owner-ruled order — **Signals · Tasks ·
Projects & Processes · Objectives** (Events stays last, unnamed by the sketch) — and rail, phone
drawer, and ⌘K palette all follow it automatically (they already render the one declaration).

## The defect, precisely

`mos-app/src/shell/destinations.tsx` — the `work` destination's `children` array is currently
Tasks · Projects & Processes · Objectives · Signals · Events. The owner frame sketch
(OD-REDESIGN-57(ii), oracle row P-13 — owner-word) rules Signals first. The current order came
from a deleted desktop re-sort (#458) that #476 unified onto — the wrong one of the two. The
comment above the array (destinations.tsx:77-85) justifies the order as "the E7 Work family
sequence"; E7 has no vote on the frame (SALVAGE-INVENTORY explicit override #3).

## The change

1. Reorder `children`: Signals, Tasks, Projects & Processes, Objectives, Events. Keep every
   entry's own fields and inline comments (the Objectives OD-V4-1 comment block moves with its
   entry) exactly as they are.
2. Rewrite ONLY the order-claim portion of the array's comment: the order's authority is the
   owner frame sketch (OD-REDESIGN-57(ii) / oracle P-13), not the E7 sequence. Keep the
   one-declaration/no-re-sort architecture rationale (#446/#476) — that part is still true.
3. Extend `mos-app/src/shell/work-child-order.test.tsx` (the existing three-surface guard) to pin
   the RULED order explicitly: assert the emitted hrefs equal the literal expected sequence
   (signals, tasks, projects, objectives, events), not merely "all surfaces agree with the
   declaration" — agreement alone is what let the wrong order survive.

## Acceptance criteria

- AC-001 (unit): rail, drawer, and palette each render Work's children as Signals · Tasks ·
  Projects & Processes · Objectives (· Events), from the one declaration.
- AC-002: the declaration comment cites the owner sketch (OD-REDESIGN-57(ii)) as the order
  authority; no E7-as-authority claim survives.

## Scope fences

- Touch only `destinations.tsx` and `work-child-order.test.tsx`. No rail-nav/drawer/palette
  edits — they render the declaration and must keep doing so untouched.
- Do not add/remove children, capabilities, paths, or labels. Order + comment + guard only.
- `primaryPath` stays `/work/tasks` — the sketch rules nav ORDER, not the Work landing page.
  Changing the landing surface would be new scope; leave it.

## Verify

`npm run typecheck` + the guard test (`npx vitest run src/shell/work-child-order.test.tsx`) +
`npm run lint -- --max-warnings=0` from `mos-app/`. The guard must FAIL if the array is reverted
(prove-the-check-can-fail: it goes red on the old order by construction of the literal assert).
