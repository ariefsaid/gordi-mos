import type { ReactNode } from 'react'
import { Link, type To } from 'react-router-dom'
import { BackIcon } from './icons'
import { useT } from '@/i18n/use-t'
import { AskDeputyAction } from '@/components/records/ask-deputy-action'
import './record-page-chrome.css'

// H3 (Luna floor) — the ONE shared chrome for a STANDALONE record page, for EVERY record kind.
//
// Task's full page carried a Back affordance baked into TaskSurface; the Signal full page carried
// none — the exact per-surface fork the record grammar exists to prevent. This is the shared
// record-page seam (mirror of E7 `renderRecordPageChrome`): a source-aware "Back to <collection>"
// link on the leading edge + the record-scoped Ask Deputy affordance trailing, plus any kind-
// specific trailing control (e.g. Task's collapse-to-split). Every record page renders THIS —
// whatever carries Task's Back carries Signal's. The record viewer stays free of history and
// navigation (its ownership boundary), so the Back lives here at the page host, not in the viewer.
//
// FIRST CALLER: TaskRecordPage (#192 — pages/tasks-layout.tsx). #190 parked this component with NO
// caller because the seeded-composer seam (`openPanel(draft)`) did not exist on this line yet;
// #192 lands that seam (AgentRuntimeContext's `pendingDraft`/`consumePendingDraft`, consumed by
// AssistantPanel), so `deputyDraft` is restored here rather than staying a control that misleads.

export interface RecordPageChromeProps {
  /** Source-aware Back target — the collection this record belongs to (search preserved by caller). */
  backTo: To
  /** The collection name for the "Back to {collection}" label (E7 grammar). */
  backLabel: string
  /** Record-scoped Ask Deputy composer seed; omitted while no draft is resolved yet. */
  deputyDraft?: string | null
  /** Extra trailing controls rendered before Ask Deputy (e.g. Task's collapse-to-split). */
  trailing?: ReactNode
}

export function RecordPageChrome({ backTo, backLabel, deputyDraft, trailing }: RecordPageChromeProps) {
  const t = useT()
  return (
    <div className="record-page-chrome" data-viewer-region="page-chrome">
      <Link to={backTo} className="record-page-back tap-floor">
        <BackIcon />
        <span>{t('record.backToCollection', { collection: backLabel })}</span>
      </Link>
      <span className="record-page-chrome__spacer" />
      {trailing}
      {deputyDraft ? <AskDeputyAction draft={deputyDraft} /> : null}
    </div>
  )
}
