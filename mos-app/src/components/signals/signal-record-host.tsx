import { useT } from '@/i18n/use-t'
import { EmptyState } from '@/components/ui/state-kit'

/**
 * SignalRecordHost — a MINIMAL placeholder, not the ported Signals record surface.
 *
 * The full Signals archive (route, record page, collection adapter) is a separate port ticket
 * (#193, Stage 3) and has not landed on `dev`. Inbox's own port (#195) needs SOMETHING real at this
 * import path: `inbox-record-door.tsx` mounts `SignalRecordHost` as the content for an opened
 * `signal`-typed notification, inside the shared overlay host — an import that resolves to nothing
 * would crash the door for any real signal notification, and `vi.mock` in the ported test suite
 * (`inbox-triage-connected.test.tsx`) still requires this module to exist on disk to intercept.
 *
 * Renders the same honest "not in this slice yet" grammar `SliceStubPage` uses for an unported
 * route (`stub.notInSlice` / `stub.comingLater`), chrome-free — the overlay host's
 * `RecordDoorTitle` already supplies the panel's heading, so this body owns no h1/h2 of its own.
 * Replace this file's body with the real record surface when #193 ports; the import path and
 * props stay the seam either way.
 */
export function SignalRecordHost({
  signalId,
}: {
  signalId: string
  mode?: 'panel' | 'page'
}) {
  const t = useT()
  return (
    <div data-signal-id={signalId}>
      <EmptyState
        variant="blank"
        title={t('stub.notInSlice')}
        copy={t('stub.comingLater', { name: t('inbox.target.type.signal') })}
      />
    </div>
  )
}
