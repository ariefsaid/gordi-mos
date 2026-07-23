/**
 * EventsPage — redesign buildout Step 10 (spec `docs/specs/events-stub.spec.md`).
 * Replaces the generic SliceStubPage at `/events` (Step 2) with the Events destination's
 * own page: PageHead (job identity) + the sanctioned EmptyState (Rule 11 — no new
 * empty-state surface). No schema/DAL in this step (master plan row 10) — the empty
 * state IS the content until a future step wires a real collection + view renderer,
 * proving the Rule-10 extension path (destinations.tsx / job-sentences.ts / breadcrumb.tsx
 * are untouched by this file).
 */
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useT } from '@/i18n/use-t'
import { useDocumentTitle } from '@/shell/use-document-title'
import { EmptyState } from '@/components/ui/state-kit'

export function EventsPage() {
  const t = useT()
  const title = t('dest.events')
  useDocumentTitle(`${title} — Gordi MOS`)

  return (
    // V3 Workspace family (Issue 11): the shared frame owns the h1 + job sentence
    // (no surface-title glyph — consistent = none). The sanctioned EmptyState is the body.
    <PageFamilyFrame family="workspace" title={title} jobSentence={t('job.events')}>
      <EmptyState
        variant="blank"
        headingLevel={2}
        title={t('events.empty.title')}
        copy={t('events.empty.copy')}
      />
    </PageFamilyFrame>
  )
}
