/**
 * SliceStubPage — one parameterized placeholder for a route whose surface has not been built or
 * ported yet (`/ecommerce`, `/roastery`, `/cafe`, `/events`, `/profile`, `/work/signals/:signalId`).
 *
 * Distinct from `not-found-page.tsx`. A 404 says "this path will never exist"; this says "this
 * path is real, the rail links to it, and a later build step fills it in". Routing a real
 * destination at the not-found surface would teach viewers that the rail lies.
 *
 * One component for every stub route rather than one file each: nothing here varies except the
 * destination's name and its job sentence, both of which come from the shared catalogue.
 */
import type { MessageKey } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'
import { useDocumentTitle } from '@/shell/use-document-title'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { EmptyState } from '@/components/ui/state-kit'
import type { PageFamily } from '@/shell/page-families'

type Props = {
  jobKey: MessageKey
  nameKey: MessageKey
  /** Defaults to the workspace family; a record-shaped stub passes `focused-record`. */
  family?: PageFamily
}

export function SliceStubPage({ jobKey, nameKey, family = 'workspace' }: Props) {
  const t = useT()
  const name = t(nameKey)
  useDocumentTitle(`${name} — Gordi MOS`)
  return (
    // The shared frame owns the h1 + job sentence, so the stub introduces no new page grammar.
    // The route is ALWAYS empty — nothing is ever wired here, it graduates to its own page — so
    // `state="empty"` and the `blank` variant are the honest pairing: not an earned all-clear
    // (`quiet`), not work that is pending (`awaiting`).
    <PageFamilyFrame family={family} title={name} jobSentence={t(jobKey)} state="empty">
      <EmptyState
        variant="blank"
        headingLevel={2}
        title={t('stub.notInSlice')}
        copy={t('stub.comingLater', { name })}
      />
    </PageFamilyFrame>
  )
}
