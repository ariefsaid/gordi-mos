/**
 * EventsPage — the Events destination.
 *
 * Events is owner-named and in scope, but WHAT IT IS FOR is still unruled: external happenings
 * versus internal calendar is an open decision (#158). So this page deliberately claims NO model.
 * It renders the destination's job sentence and the sanctioned empty state, and nothing else —
 * no collection, no schema, no data access, no "Add event" affordance that would imply one.
 *
 * That is why it is a page rather than the shared `SliceStubPage`: the stub says "not in this
 * slice yet", which is a statement about BUILD ORDER. Events is not waiting on build order, it is
 * waiting on a ruling, and its own copy says the honest version of that. When the ruling lands,
 * this file grows a collection; nothing else in the shell has to move.
 */
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useT } from '@/i18n/use-t'
import { useDocumentTitle } from '@/shell/use-document-title'
import { EmptyState } from '@/components/ui/state-kit'

export function EventsPage() {
  const t = useT()
  const title = t('dest.events')
  useDocumentTitle(t('common.docTitle', { page: title }))

  return (
    // Workspace family: the shared frame owns the h1 + job sentence, so this page introduces no
    // new page grammar and ContextRow suppresses its own copy of the sentence (the route is
    // registered in page-family-migration.ts, which is what drives that suppression).
    //
    // state="empty" rather than the default: this destination has no collection wired, so it is
    // ALWAYS empty — never 'default'. The `blank` variant is the matching honesty. `quiet` would
    // draw a ✓ and read as an earned all-clear ("nothing on today"); `awaiting` would draw a ↻
    // and read as data on its way. Neither is true when there is no source at all.
    <PageFamilyFrame family="workspace" title={title} jobSentence={t('job.events')} state="empty">
      <EmptyState
        variant="blank"
        // The empty state is the first content region under the page h1, so its title is an h2 —
        // the outline reads h1 → h2 with no skipped level. (The kit defaults to 3 for call sites
        // that sit deeper.)
        headingLevel={2}
        title={t('events.empty.title')}
        copy={t('events.empty.copy')}
      />
    </PageFamilyFrame>
  )
}
