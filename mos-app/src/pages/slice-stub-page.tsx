/**
 * SliceStubPage — Redesign Step 2 (spec §3.1 / D-PLN). One parameterized
 * placeholder for not-in-this-slice routes (`/ecommerce`, `/roastery`).
 * Renders the route's job sentence + a labelled "not in this slice" body.
 * (`/work/signals` graduated off this stub — C3a routed it to the real
 * SignalsArchivePage; `/events` and `/profile` graduated too.)
 *
 * Distinct from `not-found-page.tsx` (a 404): this is a real route placeholder
 * — a future build step fills it in. One component for all 5 stub routes (Rule 11).
 */
import type { MessageKey } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'
import { useDocumentTitle } from '@/shell/use-document-title'
import { PageFamilyFrame } from '@/shell/page-family-frame'

type Props = { jobKey: MessageKey; nameKey: MessageKey }

export function SliceStubPage({ jobKey, nameKey }: Props) {
  const t = useT()
  const name = t(nameKey)
  useDocumentTitle(`${name} — Gordi MOS`)
  return (
    // V3 Workspace family (Issue 11): the shared frame owns the h1 + job sentence;
    // the "not in this slice" line is the placeholder body.
    <PageFamilyFrame family="workspace" title={name} jobSentence={t(jobKey)}>
      <p className="text-muted-foreground" style={{ marginTop: 16 }}>
        {t('stub.notInSlice')} — {t('stub.comingLater', { name })}
      </p>
    </PageFamilyFrame>
  )
}
