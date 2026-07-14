/**
 * SliceStubPage — Redesign Step 2 (spec §3.1 / D-PLN). One parameterized
 * placeholder for not-in-this-slice routes (`/work/signals`, `/events`,
 * `/ecommerce`, `/roastery`, `/profile`). Renders the route's job sentence +
 * a labelled "not in this slice" body.
 *
 * Distinct from `not-found-page.tsx` (a 404): this is a real route placeholder
 * — a future build step fills it in. One component for all 5 stub routes (Rule 11).
 */
import type { MessageKey } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'
import { useDocumentTitle } from '@/shell/use-document-title'
import { PageFrame } from '@/shell/page-frame'

type Props = { jobKey: string; name: string }

export function SliceStubPage({ jobKey, name }: Props) {
  const t = useT()
  useDocumentTitle(`${name} — Gordi MOS`)
  return (
    <PageFrame>
      <h1 className="font-semibold text-foreground" style={{ fontSize: 26 }}>{name}</h1>
      <p className="text-muted-foreground" style={{ marginTop: 8 }}>
        <b>{t(jobKey as MessageKey)}</b>
      </p>
      <p className="text-muted-foreground" style={{ marginTop: 16 }}>
        {t('stub.notInSlice')} — {t('stub.comingLater', { name })}
      </p>
    </PageFrame>
  )
}
