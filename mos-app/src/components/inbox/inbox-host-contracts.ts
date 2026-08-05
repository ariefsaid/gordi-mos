/**
 * inbox-host-contracts — TYPES ONLY. The Issue 4 shared-overlay-host + router types that Issue 7
 * (Inbox triage + Deputy host adoption) consumes, plus the `OverlayEntryDraft` projection the
 * notification-target resolver produces.
 *
 * Formerly a forward-declared seam (Issues 4/5/6 were built on parallel branches). Now pinned to the
 * REAL landed exports: `@/shell/overlay-host` (OverlayEntry/OverlayTenant) and
 * `@/shell/overlay-navigation` (OverlayOwner). Issue 7's resolver/triage behavior is unchanged — it
 * only ever *authors* the identity/label/route/content fields; the host owns `leaveGuard`, history,
 * and the modal regime.
 *
 * WIRING RECONCILIATION (2026-07-20): the seam previously declared `OverlayOwner = 'shell' | 'record'`.
 * That was wrong: in the real model `'record'` is an OverlayEntry *tenant*, not an owner, and the real
 * `OverlayOwner` now includes the page-owned `'inbox'` slot as well as the shell quick-triage slot;
 * page and bell doors therefore share the host without sharing the wrong geometry regime.
 */
import type { To } from 'react-router-dom'
import type { OverlayEntry, OverlayTenant } from '@/shell/overlay-host'
import type { OverlayOwner } from '@/shell/overlay-navigation'

export type { To, OverlayOwner, OverlayTenant, OverlayEntry }

/** The subset of `OverlayEntry` a notification target resolves to (identity + canonical door + content). */
export type OverlayEntryDraft = Pick<
  OverlayEntry,
  'key' | 'owner' | 'tenant' | 'label' | 'title' | 'pageTo' | 'content'
>
