# Fix round — step 2 review BLOCK (7 findings). Fix ALL, change nothing else.

Branch `feat/redesign-buildout` (already checked out — no git checkout/switch). Commit per fix; never
push/PR/merge. The step-2 review (docs/reviews/feat-redesign-buildout.md, "Step 2" section) BLOCKED
on these. Fix each exactly; keep the app behavior otherwise identical.

## READ FIRST
- `docs/specs/redesign-shell-routes.spec.md` (FR-005, FR-006, FR-024, NFR-007 are the ones in play).
- `mos-app/src/i18n/messages.ts` — the i18n system + existing key patterns (EN + ID, shape-identical).
  ALL new visible strings resolve through `useT()`; add EN+ID keys.

## Fixes (each with the review's line refs)
1. **FR-006 header (top-bar.tsx ~247-291):** REMOVE the header `UserChip`. Header ends at
   Search · Inbox · Deputy (left = logo + breadcrumb). Profile identity lives only in the rail footer.
   Update top-bar tests accordingly.
2. **FR-005 rail footer (rail-nav.tsx ~168-197):** render the footer identity as **"{Site} {role}"**
   (resolve site/team from the viewer), not full name + role. Then tighten `rail-nav.test.tsx:101-105`
   to assert the exact `{Site} {role}` shape (finding 7).
3. **FR-024 context-row (context-row.tsx ~20-33):** the scope label must be a resolved **scope/
   team/BU** signal from the viewer, NOT `person.full_name`. Compute a real scope label; render it.
   Update context-row.test.tsx to assert scope, not name.
4. **NFR-007 stub titles (router.tsx ~107/122/148-150 + slice-stub-page.tsx ~15-27):** pass message
   keys / destination ids (not hardcoded English) and resolve titles (H1 + document.title) through
   `useT()` so ID locale renders Indonesian.
5. **i18n chrome strings (command-menu.tsx ~70-87/119-135/205-241 + top-bar.tsx ~255-273):** move ALL
   new visible copy (Ask Deputy, Share Signal, Create Task, Navigate, Recent, Search, placeholders,
   empty/error copy) into messages.ts (EN+ID) and render via `useT()`.
6. **/kitchen redirect e2e (shell-routes-redirects.spec.ts ~8-29):** add the `/kitchen -> /cafe` case
   to the redirect assertion table (router already implements it).

## Discipline
TDD where a test exists (update the test to the correct contract first, then impl — never weaken to
pass). COMMIT AFTER EACH FIX. Do NOT touch anything outside these findings.

## Gates before done (from mos-app/)
`npm run typecheck` (0) · `npm run lint` (0) · `npm test` (green) · `npx playwright test` (green).
Paste the tail of each.

## Report
Per finding: fixed / files / how verified. Confirm EN+ID parity for every new key. End with: FIX-DONE
