/**
 * EventsPage — redesign buildout Step 10 (spec `docs/specs/events-stub.spec.md`).
 * Replaces the generic SliceStubPage at `/events` (Step 2) with the Events destination's
 * own page: PageHead (job identity) + the sanctioned EmptyState (Rule 11 — no new
 * empty-state surface). No schema/DAL in this step (master plan row 10) — the empty
 * state IS the content until a future step wires a real collection + view renderer,
 * proving the Rule-10 extension path (destinations.tsx / job-sentences.ts / breadcrumb.tsx
 * are untouched by this file).
 */
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { EventsIcon } from '@/shell/icons'
import { useT } from '@/i18n/use-t'
import { useDocumentTitle } from '@/shell/use-document-title'
import { EmptyState } from '@/components/ui/state-kit'

export function EventsPage() {
  const t = useT()
  const title = t('dest.events')
  useDocumentTitle(`${title} — Gordi MOS`)

  return (
    <PageFrame variant="data">
      <PageHead variant="content" title={title} icon={<EventsIcon />} />
      <EmptyState
        variant="blank"
        title={t('events.empty.title')}
        copy={t('events.empty.copy')}
      />
    </PageFrame>
  )
}
