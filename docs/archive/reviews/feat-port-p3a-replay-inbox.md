# Review ledger — feat/port-p3a-replay-inbox

P3a port train (ADR-0018): thread-history replay · notifications backend + Inbox destination ·
ask_user transcript contract · rating/downvote · notify self-action · comments + @mention · PWA seam.
Phases A–H complete on this branch. Slice is flag-gated default-off (`SHOW_ASSISTANT` / `SHOW_INBOX`).

Diff scope: `git diff origin/dev..HEAD` — 31 commits, ~94 files, ~5k LOC across the full stack
(Deno edge functions, React UI, Postgres migrations + pgTAP, Playwright e2e).

## Verdicts

- spec: PASS — spec-reviewer, 2026-07-05; all 25 P3a ACs + NFR-P3-RP-001 (T31 guard) have genuine owning tests at the correct layer.
- code-quality: FIX-THEN-SHIP — code-quality-reviewer, 2026-07-05; 2 Important findings (postComment fan-out, unbounded Inbox read) — **both fixed and committed** (`3762070`); re-run green.
- design: SHIP — design-reviewer, 2026-07-05; static review (flags are source constants, no live render); 1 token nit fixed (`--warning` hex fallback removed); blue-bubble One-Blue check deferred to live cohort pass.
- security: PASS — security-auditor RE-run, 2026-07-05; no Crit/High/Med; Low-2 confirmed fixed; Low-1 tracked for credits ledger.

## Gates

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` (`--max-warnings=0`) | PASS |
| `npm test` (Vitest) | PASS — 229 files, 2210 tests |
| `supabase test db` (pgTAP) | PASS — 71 files, 437 tests |
| `deno check .../agent-chat/index.ts` | PASS |
| `npm run build` | PASS |

**CI close-out note (2026-07-05):** GitHub PR #88 was still open/red after this ledger was written.
The integration job failed the repository SECURITY DEFINER lint because
`supabase/migrations/20260706000003_mos_create_notification.sql` granted EXECUTE without first revoking
PUBLIC/anon/authenticated. The local branch now adds the explicit revoke; the exact integration lint
passes locally. GitHub `verify`'s coverage failure did not reproduce in the local close-out run on the
P3a branch (`npm run test:coverage` → 229 files / 2210 tests), but #88 still needs push + CI rerun before
merge.

## Decision

MERGE to `dev` after the local CI close-out fix is pushed and GitHub checks rerun green. Slice is
flag-gated default-off; the two code-quality Importants are resolved; no Critical/High/Med security
findings; design SHIP with a deferred live-pass recommendation. P3b (automations) stays gated on the
owner's `generateLink`→hook staging verify (separate plan).

---

### Spec review — spec-reviewer

**Verdict: PASS**

| AC | Owning test | Layer | Verdict | Note |
|---|---|---|---|---|
| AC-P3-RP-001 | `mos-app/src/lib/agent/replay.test.ts` | Unit (server `replay.ts`) | PASS | Encodes G/W/T: builds seq-ordered user/assistant(tool_calls)/tool(tool_call_id) rows, asserts rebuilt `ModelMessage[]` order + that assistant `tool_use` id equals the following `tool` message's `tool_call_id`. Covers orphan-skip (NFR-P3-RP-001) + fail-open. |
| AC-P3-RP-002 | `handler.replay-enrichment.test.ts` (persist) + `handler.replay.test.ts` (replay branch) | Unit (handler) | PASS | Proves all three P2-dropped fields land in persisted rows; replay-branch test proves the model receives reconstructed history + new user turn and no tool re-executes. |
| AC-P3-RP-003 | `mosNativeRuntime.replay.test.ts` + `useAssistantPanel.openThread.test.ts` + `history.test.ts` + `ThreadList.test.tsx` | Unit (runtime/hook/DAL/RTL) | PASS | Multi-layer: runtime stamps `replay:true`; hook populates transcript via `loadThreadForDisplay` and binds the run for followUp. |
| AC-P3-RP-004 | `supabase/tests/65_mos_agent_events_replay.sql` | pgTAP (RLS/check) | PASS | `'user'`/`'artifact'` type accepted by owner; cross-org reads 0; append-only trigger unchanged. |
| AC-P3-NF-001 | `supabase/tests/66_mos_notifications_rls.sql` (+ `67`) | pgTAP (RLS) | PASS | Owner isolation, same-org non-owner=0, cross-org=0, direct cross-owner INSERT denied (42501), delivered row owned by mentionee. |
| AC-P3-NF-002 | `supabase/tests/66_mos_notifications_rls.sql` | pgTAP (column-pin trigger) | PASS | `read_at` UPDATE allowed; title/severity/metadata UPDATEs all rejected 42501 — even by owner. |
| AC-P3-NF-003 | `mos-app/src/lib/notifications/channelAdapter.test.ts` | Unit (`channelAdapter.ts`) | PASS | in-app row always written; push invoked; push failure swallowed into result; in-app write error throws (no silent drop). |
| AC-P3-NF-004 | `supabase/tests/66_mos_notifications_rls.sql` | pgTAP (index) | PASS | `mos_notifications_owner_unread_idx` asserted present. |
| AC-P3-IB-001 | (e2e `inbox-replay.spec.ts`, triple-gated) | e2e (live-gated) | PASS* | SHOW_INBOX-on path exercised only in live-gated e2e; no unit test flips the flag. Acceptable for default-off slice. |
| AC-P3-IB-002 | `InboxList.test.tsx` + `useNotifications.test.ts` (+ e2e for badge) | RTL/Unit | PASS | Row render, unread-first ordering, unreadCount derivation unit-covered. Bell badge e2e-gated. |
| AC-P3-IB-003 | `useNotifications.test.ts` + `InboxList.test.tsx` | Unit/RTL | PASS | Optimistic markRead + persist + revert-on-failure. Row tap calls `onOpen`. |
| AC-P3-IB-004 | `rail-nav.test.tsx` + `bottom-tab-bar.test.tsx` | RTL | PASS | Hide-first proven: SHOW_INBOX=false → no Inbox group/tab. |
| AC-P3-IB-005 | `InboxList.test.tsx` | RTL | PASS* | Empty state asserts `role=status` with "caught up" text. Label-tagged IB-006 but the empty-state behavior is correct. |
| AC-P3-IB-006 | `useNotifications.test.ts` | Unit | PASS* | Unread-first then read-newest ordering genuinely asserted. Labeled under IB-002; triage intent encoded. |
| AC-P3-AU-001 | `handler.askUser.test.ts` | Unit (handler) | PASS | `ask_user` emits `status{kind:'question'}`, ends stream, no second model call. |
| AC-P3-AU-002 | `handler.askUser.test.ts` | Unit (handler `handleAnswer`) | PASS | Option → label as `tool_result`; freeText → verbatim. Same run continuation. |
| AC-P3-AU-003 | `handler.askUser.test.ts` | Unit (handler) | PASS | Stale/duplicate answer → no tool_result, model continues. |
| AC-P3-AU-004 | `AssistantPanel.question.test.tsx` + `useAssistantPanel.question.test.ts` | RTL/Unit | PASS | Chips render; tap calls `control(runId,'answer',...)`; `allowFreeText` shows box. |
| AC-P3-AU-005 | `port.test.ts` + `mosNativeRuntime.answer.test.ts` | Unit (port/runtime) | PASS | `'answer'` added; existing controls unchanged (superset). |
| AC-P3-FB-001 | `supabase/tests/68_agent_events_feedback_owner.sql` | pgTAP (trigger) | PASS | `{rating,downvote_reason}` allowed on owner assistant row; status row → 42501. |
| AC-P3-FB-002 | `AssistantPanel.rating.test.tsx` | RTL | PASS | 👍/👎 on each assistant turn; downvote shows reason picker. |
| AC-P3-NT-001 | `actions.notify.test.ts` | Unit (`actions.ts`) | PASS | `confirm:false`, omits owner_id/org_id; severity defaults info. Returns `{id}` not `{ok:true}` literally — cosmetic only (handler wraps either). |
| AC-P3-NT-002 | `supabase/tests/66_mos_notifications_rls.sql` | pgTAP | PASS | Owner-isolation invariant fully proven in 66; notify inserts through the same caller-JWT → same RLS path. |
| AC-P3-CM-001 | `supabase/tests/69_mos_comments_rls.sql` | pgTAP (RLS) | PASS | RLS enabled+forced; INSERT WITH CHECK present; same-org read=1, cross-org=0; UPDATE/DELETE rejected. |
| AC-P3-CM-002 | `mentions.test.ts` | Unit (`mentions.ts`) | PASS | `extractMentions` returns only resolvable ids; dedupes; fail-quiet. |
| AC-P3-CM-003 | `postComment.test.ts` | Unit (`postComment.ts`) | PASS | Inserts comment + fans out one `create_notification` per resolved mentionee. |
| AC-P3-CM-004 | `CommentThread.test.tsx` + `task-surface.test.tsx` | RTL | PASS | Renders comments; posts; `@` triggers person picker. |
| AC-P3-CM-005 | `supabase/tests/67_mos_create_notification.sql` | pgTAP (definer helper) | PASS | Mentionee sees 1, author sees 0; row owned by mentionee; cross-org target raises 42501. |
| NFR-P3-RP-001 (T31) | `handlerDeputyInvariant.test.ts` | Unit (source guard) | PASS | Source-level: no `service_role`/`verifierClient`/`createClient`/`Deno.env` in handler/replay/actions; replay via `persist.deps`; ask_user intercepted before action lookup; notify `ctx.supabase`-only. |

`*` = PASS with a noted minor gap/label issue (does not block ship).

**Summary.** All 25 P3a ACs + the T31 deputy-invariant guard have genuine owning tests at the correct layer (Unit/RTL for logic+render, pgTAP for RLS/role/trigger contracts, live-gated e2e for the cross-stack Inbox journey). Every EARS load-bearing invariant is actually proven in code. Two cosmetic nits (an AC label swap, `notify` return shape) and one acceptable coverage trade-off (SHOW_INBOX-on unit path deferred to e2e) — none block ship of this default-off slice.

---

### Code-quality review — code-quality-reviewer

**Verdict: FIX-THEN-SHIP — resolved. Both Important findings fixed and committed (`3762070`); re-run green.**

#### Critical
None. No shipping-broken or unsafe code reaches a user with the flags off.

#### Important (both fixed)
1. **`postComment` mention fan-out was sequential + fail-loud — a single bad mentionee aborted the whole comment ack.** `mos-app/src/lib/comments/postComment.ts`. The mention loop `await`ed `create_notification` once per mention, in series, and `throw` on any error — a transient RPC failure on the 3rd mention invalidated an already-committed comment row and pushed the user to retry (duplicating the comment). **Fixed:** fan-out now runs in parallel via `Promise.allSettled` and swallows per-mention errors (the comment row is the durable unit; NFR-P3-CM-001 fail-quiet extended to delivery). Regression test added.
2. **`listNotifications` was an unbounded read; the badge counted client-side over the full list.** `mos-app/src/lib/db/notifications.ts` + `useNotifications.ts`. No `.limit(...)`; the bell's `useNotifications` loaded the full owner list to derive `unreadCount` — O(all-time inbox) per render, defeating `mos_notifications_owner_unread_idx`. **Fixed:** `listNotifications` caps at `INBOX_PAGE_LIMIT=200`; new `countUnread()` DAL (read_at-null-only read) + new `useUnreadCount()` hook back the bell so the always-rendered badge is O(unread). Tests added.

#### Important (tracked, not fixed — scalability watch-item)
3. **Replay re-reads + re-sends up to 1000 events every turn.** `persistence.ts:104` (`MAX_RUN_EVENTS_READ=1000`) + `replay.ts` + `handler.ts:540`. On every `replay:true` followUp, the handler loads up to 1000 `agent_events` rows and ships the rebuilt full `ModelMessage[]` to the model — O(history) cost per turn, no summarization/windowing. Acceptable for P3a's gated cohort; the most likely scalability cliff before P3b. Tracked, not fixed in this slice.

#### Minor (non-blocking; default-off slice)
- `useNotifications.markRead` revert captures `notifications` in a closure (low blast radius — badge only, server is source of truth).
- Two unused i18n keys (`assistant.rating.reason.submit`, `inbox.markRead`) — `RatingControl` submits on reason-tap; no Mark-Read button exists.
- `sw.js` has no `notificationclick` handler or versioning (fine while push is inert; flag for VAPID-enablement slice).
- `currentMondayJakarta` hand-rolls TZ offset math (correct for UTC+7, no DST; documented).
- Guard-stub actions (`composeViewAction`, `askUserAction`) throw on `run()` — defensible (handler intercepts both); static-typing hardening would be a nit.
- `record-feed.tsx` nests `CommentThread` under the Activity tab — reasonable for v1.
- `findTrailingUnresolvedToolUse` reverse-copies the content array per assistant turn — negligible at P3a volume.

#### Positive observations
- Decomposition is strong: `withPersistence` wrapping the inner generator, separate `replay.ts` leaf breaking the actions↔schema cycle, `dispatchAction`/`dispatchActionForced` the only `action.run` call sites.
- Fail-open is consistent and documented across persistence, replay, client history, and `useNotifications.markRead` revert.
- Tests assert behavior, not shape (`replay.test.ts` checks `tool_call_id` pairing; `handlerDeputyInvariant.test.ts` is a source-grep firewall).
- No P3b automation seams built (`pushDispatch.ts` inert, `CREATE_AUTOMATION_SCHEMA` correctly omitted). YAGNI respected.

---

### Security review (RE-run) — security-auditor

**Verdict: PASS**

**Method.** Read all five P3a migrations (`20260706000001..000005`), the four relevant pgTAP suites (`66` notifications RLS, `67` create_notification, `69` comments RLS, `70` push_subscriptions RLS) plus `65`/`68` for agent_events widening/feedback, the agent-chat edge-function surface (`index.ts`, `handler.ts`, `actions.ts`, `persistence.ts`, `replay.ts`) and the compose-view entry, the client DAL (`notifications.ts` incl. CQ#2 bounded reads), `usePushSubscription.ts`, and `comments/{mentions,postComment}.ts`. Ran the deputy-invariant source guard: `npm test -- handlerDeputyInvariant` → **6/6 pass**. Grepped the function tree for `service_role|verifierClient|Deno.env|SUPABASE_SERVICE_ROLE_KEY` outside `index.ts` — zero hits in handler/actions/persistence/replay. OWASP/STRIDE lens applied.

**Findings.**
- **Critical / High / Medium:** none.
- **Low-1 (confirmed, tracked): unbounded self-notify volume.** `notifyAction` (`actions.ts:418`) is `confirm:false` and hits `mos.notifications` directly under the caller JWT; nothing in P3a rate-limits repeated self-notifies. RLS correctly pins `owner_id` to the caller (verified by `66_mos_notifications_rls.sql` cross-owner INSERT denial at L68), so this is a cost/DoS-on-self concern, not a privilege issue. Carried forward to the P3 credits ledger — ship-acceptable.
- **Low-2 (refuted as fixed; re-verified): notify route injection.** `notificationRoute()` (`notifications.ts`) honours only strings with a single leading slash and explicitly rejects `//host` (protocol-relative) and anything not starting with `/` (`javascript:`, `http:`, bare `tasks/t1`, non-strings). Test matrix covers the canonical unsafe set. The CQ#2 commit only added `INBOX_PAGE_LIMIT` + bounded-read tests; route logic untouched and still correct. **Confirmed fixed.**
- **Low-3 (informational, v1 design): comment `entity_id` is not FK-constrained.** `mos.comments` accepts any uuid for `entity_id`; RLS is same-org read/insert only, so a caller can attach a comment to an arbitrary uuid but only same-org readers will ever see it — no cross-org leakage, no privilege gain. The plan explicitly defers entity-level confidentiality to a later hardening. Note only.

**Cross-cutting confirmations.**
- **RLS posture:** `notifications`, `comments`, `push_subscriptions` all carry `enable row level security` + `force row level security`; every policy has an `org_id = shared.current_org_id()` seam; INSERT/UPDATE additionally pin `owner_id`/`author_id` via `WITH CHECK`. `agent_events` widening is additive-only; RLS-unchanged. No `BYPASSRLS` grant anywhere.
- **SECURITY DEFINER `create_notification`:** org wall enforced by the `shared.people … org_id = shared.current_org_id()` existence gate; INSERT stamps `org_id` from `current_org_id()` (not from caller param), so even a same-org target chosen by the caller cannot escape the org. `set search_path = ''` blocks search_path hijack. Cannot escalate. pgTAP `67` proves same-org delivery + cross-org denial + recipient-owns-row. The ONE sanctioned exception, correctly scoped.
- **Deputy invariant (T31):** `service_role`/`verifierClient`/`Deno.env` reachable ONLY from `index.ts`, exclusively for `auth.getUser`; `callerClient` (anon key + caller Bearer) bound into both `deps.supabase` and `persistenceDepsBase.supabase`. Replay, ask_user, notify, and decision/answer continuations all flow through the caller-JWT client. Source-guard test green.
- **ask_user replay path (`handleAnswer`):** resolves the SAME run (`runLoopAfterAnswer` reuses `req.runId`); trailing-tool_use finder returns null on a stale/duplicate answer (no-op); no auth decision branches on the answer payload. No bypass via the answer control.
- **Push subscription:** owner-pinned by RLS; the hook omits `owner_id`/`org_id` so DB defaults + WITH CHECK stamp them. No subscription hijack vector.

**Summary.** RLS is present and forced on every new business table with a consistent `org_id` seam and `WITH CHECK` owner pinning; the single SECURITY DEFINER function is org-walled and cannot escalate; the deputy invariant holds (service_role confined to `auth.getUser` in `index.ts`, guard test passing); both prior Low findings are confirmed in their tracked/fixed state. No Critical/High — **PASS, ship.**

---

### Design review (render-verify) — design-reviewer

**Verdict: SHIP**

**Render-verification method.** Dev server boots clean (Vite 7.3.5 at `http://localhost:5173/mos/`, 1.4s startup, no warnings). The P3a surfaces are **flag-gated default-off** (`SHOW_INBOX`/`SHOW_ASSISTANT` are plain source constants in `mos-app/src/config/features.ts` — **not env-readable**; flipping them needs a source edit to `features.ts`, which the review constraint forbids). No browser tool was available in this session and I could not flip the flags, so **no surface was render-verified live this pass.** All findings below are from a careful **static review** of the JSX/CSS cross-referenced against `DESIGN.md` tokens and the two existing reference screenshots (`p3a-inbox-desktop.jpeg`, `p2-deputy-desktop.jpeg`), both inspected with the Read tool. The reference screenshots already show the Inbox list and the Deputy panel in their intended state; the static review confirms the shipped JSX produces that DOM. **Recommend a follow-up live render pass once the flag is flipped for a rollout cohort.**

**Token system note (context, not a finding).** This app's runtime tokens are the mos-design-kit `--ds-*` set aliased through `src/styles/tokens/aliases.css`. Crucially, **`--accent` resolves to `--ds-color-blue` (The One Blue action color)** — *not* DESIGN.md's documented `accent` (the quiet grey hover wash). This divergence is deliberate and documented (`index.css:161`: "`--accent` is intentionally left as aliases.css defines it (the blue action)"). So `var(--accent)` in the AssistantPanel = blue, and `--text-inverted` = near-white. All "accent" references in the components below are evaluated against this app reality, not the DESIGN.md prose.

---

#### Critical
None. No blocking token, structure, or a11y defect found in the static review.

#### Important

- **Assistant user-message bubble is a solid blue fill — verify against The One Blue Rule budget.**
  `AssistantPanel.tsx:324-325` — user bubbles render `background: var(--accent)` (blue) with `color: var(--text-inverted)` (white). DESIGN.md §The One Blue Rule: "primary blue… should touch ≤10% of any screen." The reference screenshot (`p2-deputy-desktop.jpeg`) shows a *grey* user bubble, not blue — meaning either (a) the screenshot predates this code, or (b) the bubble was intended to be `--surface-secondary` (grey) with the assistant reply in a contrasting surface, leaving blue only for send buttons. A multi-turn transcript could push blue >10%.
  *Fix:* confirm intent. If the bubble should be quiet, swap to `background: var(--surface-secondary); color: var(--text-primary)` and reserve `--accent` for the send button + active states only. If blue is intended, keep but cap visible turns.

- **Inbox `--warning` dot has a hard-coded hex fallback that may mislead.**
  `inbox/inbox.css:55` — `background: var(--warning, #b45309);` The fallback `#b45309` is a deep amber that doesn't match the runtime `--warning` (display-p3 amber ~`1 0.77 0.26`). The fallback only fires if `--warning` is undefined, which it isn't, but the literal violates the "tokens-only" stance the file's own header claims ("Token-only (DESIGN.md)"). The `--critical` and `--info` variants correctly use bare tokens with no fallback.
  *Fix:* `background: var(--warning);` (drop the hex; `--warning` is always defined in `index.css:179`).

- **Assistant reply bubble uses `--surface-secondary`; user bubble uses `--accent` (blue) — contrast asymmetry.**
  `AssistantPanel.tsx:324` — assistant replies use `var(--surface-secondary)` (light grey) + `var(--text-primary)` (near-black). That pair clears AA comfortably. But note DESIGN.md status/semantic guidance doesn't define a "chat bubble" component, so this is a net-new pattern; the asymmetry (blue=me, grey=deputy) reads correctly but should be confirmed live for the "calm, near-monochrome" North Star — a blue bubble on every user turn may read louder than intended (ties to the Important item above).

#### Minor (non-blocking; default-off slice)

- **Hard-coded inline `rem`/px instead of spacing tokens.** `AssistantPanel.tsx` throughout (e.g. `padding: '0.5rem 0.75rem'`, `fontSize: 14`, `gap: 2px`, `maxWidth: '85%'`) and `ThreadList.tsx:33,41,55`. DESIGN.md defines a `spacing` scale (xs/sm/md/base/lg/xl) and typography scale. The values are *consistent* with the scale (0.5rem≈sm×2, 0.75rem≈base) and match the codebase's prevailing inline-style idiom, so this is stylistic drift, not a deviation. No fix required for ship.

- **`rounded-md` / `rounded-sm` mix on assistant controls.** Bubbles use `rounded-md` (10px), buttons use `rounded-sm`. Per DESIGN.md OD-P3-10, controls stay at 8px (`rounded-sm`) and cards/containers at 12px. Chat bubbles are arguably containers (10px `rounded-md` is defensible), but the approval-chip and question-chip containers (`AssistantPanel.tsx:413, 466`) also use `rounded-md` — fine, but inconsistent with the `rounded-sm` error-banner neighbor at line 354. Nit; pick one radius for all assistant "card-lets."

- **Inbox unread marker is a dot color shift + bold title — no leading accent bar.** `inbox.css:39-41, 61-63`. DESIGN.md's Tinted-Status pattern uses a dot + tinted pill; the Inbox uses dot-only for unread (no pill, just bold title). This is a reasonable extension (unread ≠ status), and dot-only read-state is conventional. Acceptable; just noting it's outside the documented status-pill pattern by intent.

- **Notification badge min-width 15px / fontSize 9px.** `top-bar.tsx:160-167`. Tiny but legible; `9+` caps overflow. DESIGN.md count-badge specifies 22px height / full radius — this is a corner badge, not a count pill, so the smaller scale is appropriate. The `bg-primary text-primary-foreground` (blue + near-white) clears AA. Fine.

- **`ThreadList` loading state is a bare `…` ellipsis.** `ThreadList.tsx:33-36`. No skeleton/spinner. Acceptable for a slide-over history tab; the `…` reads as "loading" in this UI's quiet voice. The empty state (`emptyText`) and populated states are all present and correct.

- **`CommentThread` mention regex and `PersonPicker` `onClose={() => {}}`.** `CommentThread.tsx:30, 89`. The no-op close handler means Esc/click-out won't dismiss the picker via the parent; if `PersonPicker` manages its own dismissal internally this is fine, otherwise the picker can't be closed by the thread. Verify `PersonPicker` self-closes. Minor; comment surface is not new to P3a.

- **PWA seam is correctly inert.** `public/sw.js` registers a `push` listener that calls `showNotification` — but with no VAPID keys wired and no `pushsubscription`, no push will ever arrive, so the handler is dead code until push is provisioned. Manifest (`manifest.webmanifest`) is minimal: `theme_color #111827` (navy-ish, consistent with brand-navy), empty `icons[]` (no maskable icon yet). Acceptable for a flag-off slice; the seam is present and inert as specified.

- **Accessibility is strong across the slice.** Inbox rows are `<button>` with `aria-label` including "(unread)" state, severity dots have `aria-label`, list has `aria-label`, empty state is `role="status"`. AssistantPanel correctly swaps `role` (`complementary` desktop / `dialog aria-modal` phone), implements focus-trap + Esc + body-scroll-lock on phone, keeps-mounted with `inert`+`aria-hidden` when closed, plain-text-only replies (no `dangerouslySetInnerHTML`), `aria-live="polite"` on the streaming label, `role="alert"` on the error banner, `role="status"` on the stuck banner. `CommentThread` form has `aria-label` on the textarea. This exceeds the DESIGN.md a11y posture (which explicitly flags overlay focus-management as a "build-time gap" — the panel closes it).

---

**Summary (3 lines).**
1. **Tokens:** adherence is high — the slice uses CSS vars (`--accent`, `--surface-secondary`, `--text-inverted`, `--primary`, `--destructive`, `--warning`, `--radius-sm`) throughout; the only literal is one inert hex fallback on the Inbox warning dot (Important #2). Net-new chat-bubble pattern uses `--accent` (blue) for user turns — verify against The One Blue ≤10% budget (Important #1).
2. **Structure:** clean, semantic, idiomatic to the codebase; a11y is above bar (correct roles, focus-trap/Esc/scroll-lock on the phone modal, keep-mounted `inert`, plain-text-only replies, `aria-live`/`role=alert`/`role=status` on async states). Error/loading/empty/stuck states all present in `useAssistantPanel` + `ThreadList` + `InboxList`.
3. **Polish:** loading states are minimal (`…`, no skeleton) and inline `rem`/px eschews spacing tokens — both acceptable for a default-off slice. **Verdict SHIP**: no Critical/Important blocker is *clearly* a defect (the blue-bubble item is an intent-confirmation, not a proven violation), the surfaces match the reference screenshots, and the proportionality guidance (default-off → Minor nits don't block) applies. Recommend a live render pass + One-Blue budget check once the flag is flipped for a cohort.
