// RouteLeaveGuard — the route-level unsaved-changes guard for full PAGES (GAP-4 / OD-REDESIGN-91
// #9). It is the page-route sibling of the overlay/record seam `dirtyLeaveGuard` (which guards
// record drawers via OverlayEntry.leaveGuard): this one guards a whole route so that leaving with
// unsaved work asks the user to stay or discard, instead of silently dropping it (the live-
// reproduced Kitchen Log "20 dishes vanish on navigate" loss).
//
// harden (2026-07-28): the prompt was `window.confirm`. Three defects, all H9:
//   1. DESIGN.md (Overlays) prescribes ONE centered blocking dialog for consequential confirms,
//      and the app already ships it — so a page that confirmed one destructive action in the house
//      dialog and the other in a native alert used two grammars for one decision.
//      (RATIONALE CORRECTED ON THE WAY ACROSS, #190: v4 cites "Café Log's own Discard button uses
//      it" as the proof. On THIS line Café Log uses no ConfirmDialog at all — the shipped consumers
//      are the Admin people surfaces. The defect is the same; the witness named was not here.)
//   2. Its buttons are the BROWSER's, labelled in the browser's UI language, not the app's — an
//      Indonesian-locale user got "OK / Cancel" in whatever Chrome was installed as, on the one
//      prompt whose wrong answer discards their work. The whole point of `common.cancel` /
//      `common.retry` living in the catalog is defeated by a control the app cannot label.
//   3. `window.confirm` is blocking and, in a cross-origin iframe (and under some mobile
//      configurations), suppressed outright — in which case the old code's `leave = true` branch
//      silently discarded the work the guard exists to protect.
// The dialog is now the shared ConfirmDialog: house styling, localized labels, focus returned to
// the invoker, Esc = stay (the SAFE default — Esc must never be the discard path).
import { useCallback, useContext, useEffect, useState } from 'react'
import { UNSAFE_DataRouterContext, useBlocker, type BlockerFunction } from 'react-router-dom'
//
// PORT NOTE (#190): v4 imports `@/components/ui/confirm-dialog` — the same primitive promoted to a
// shared path and re-skinned on `ModalShell`. Neither the move nor `ModalShell` is on this line, and
// both belong to the surfaces that consume them, so this guard composes the ConfirmDialog exactly
// where it already lives. What it did need — localizable Cancel/busy labels defaulting against the
// catalog — is v4's own harden fix (defect 2 above) and landed on that component with this PR.
import { useT } from '@/i18n/use-t'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'

export interface RouteLeaveGuardProps {
  /** True while the page holds unsaved work that a navigation would discard. */
  when: boolean
  /** The stay/discard prompt body — plain language about what is lost. */
  message: string
}

export function RouteLeaveGuard({ when, message }: RouteLeaveGuardProps) {
  // useContext is always called (hook-safe); the blocking hook lives in a child that only mounts
  // when a data router is present, so useBlocker is never called outside a data router.
  const inDataRouter = useContext(UNSAFE_DataRouterContext) != null
  return inDataRouter ? <BlockingGuard when={when} message={message} /> : null
}

function BlockingGuard({ when, message }: RouteLeaveGuardProps) {
  const t = useT()
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname,
    [when],
  )
  const blocker = useBlocker(shouldBlock)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(blocker.state === 'blocked')
  }, [blocker.state])

  if (blocker.state !== 'blocked') return null

  return (
    <ConfirmDialog
      open={open}
      title={t('leaveGuard.title')}
      body={message}
      confirmLabel={t('leaveGuard.discard')}
      cancelLabel={t('leaveGuard.stay')}
      tone="destructive"
      onConfirm={async () => {
        setOpen(false)
        blocker.proceed()
      }}
      onCancel={() => {
        setOpen(false)
        blocker.reset()
      }}
    />
  )
}
