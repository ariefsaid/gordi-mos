/**
 * SliceStubPage — Redesign Step 2 (spec §3.1 / D-PLN). One parameterized
 * placeholder for not-in-this-slice routes (`/ecommerce`, `/roastery`).
 * Renders the route's job sentence + the sanctioned EmptyState (Rule 11 — no
 * new empty-state surface) as the body.
 * (`/work/signals` graduated off this stub — C3a routed it to the real
 * SignalsArchivePage; `/events` and `/profile` graduated too — both onto this
 * exact `state="empty"` + `variant="blank"` pairing, see `events-page.tsx`.)
 *
 * Distinct from `not-found-page.tsx` (a 404): this is a real route placeholder
 * — a future build step fills it in. One component for all 5 stub routes (Rule 11).
 *
 * impeccable layout/distill/operate pass (v4, 2026-07-27): the previous body was
 * a bare `<p>` with no measure cap — it ran the full page-content width (~984px
 * at desktop, unbounded past Read-mode's 65–75ch prose line length) and left an
 * orphaned sentence trailing into ~700px of dead viewport below it (layout.md's
 * "Extremes" empty-state check). Swapped for the app's one EmptyState kit, which
 * every other stub-shaped surface already uses — same title/copy split, same
 * centered/measure-capped frame, no new visual language.
 */
import type { MessageKey } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'
import { useDocumentTitle } from '@/shell/use-document-title'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { EmptyState } from '@/components/ui/state-kit'

type Props = { jobKey: MessageKey; nameKey: MessageKey }

export function SliceStubPage({ jobKey, nameKey }: Props) {
  const t = useT()
  const name = t(nameKey)
  useDocumentTitle(t('common.docTitle', { page: name }))
  return (
    // V3 Workspace family (Issue 11): the shared frame owns the h1 + job sentence.
    // The route is ALWAYS empty — nothing is ever wired here, it graduates to its
    // own page instead — so state="empty" matches the V3 conformance matrix's
    // Workspace/empty cell (same convention as events-page.tsx / kitchen-log-page.tsx).
    <PageFamilyFrame family="workspace" title={name} jobSentence={t(jobKey)} state="empty">
      <EmptyState
        variant="blank"
        headingLevel={2}
        title={t('stub.notInSlice')}
        copy={t('stub.comingLater', { name })}
      />
    </PageFamilyFrame>
  )
}
