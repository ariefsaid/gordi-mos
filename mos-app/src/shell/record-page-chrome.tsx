import type { ReactNode } from 'react'
import { Link, type To } from 'react-router-dom'
import { BackIcon } from './icons'
import { useT } from '@/i18n/use-t'
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
// NO CALLER YET (#190). v4's version of this note names TaskRecordPage and SignalRecordPage as the
// two that render it; neither is on this line, and claiming them would be a comment that lies. This
// ships as the seam each record page adopts as it ports — the same deliberate parking `BackIcon`
// had before this PR, and its own test file holds the shared contract in the meantime.

// PORT NOTE (#190): v4 also renders a record-scoped `AskDeputyAction` here, which seeds the Deputy
// composer with a reference to the open record — `openPanel(draft)`. This line's agent runtime takes
// `openPanel()` with no seed, so the affordance would open an EMPTY composer and quietly lose the
// record reference. Porting the button without the seam it needs would be a control that misleads,
// so it is left to the ticket that lands the seeded composer. `trailing` is the seam it plugs into.

export interface RecordPageChromeProps {
  /** Source-aware Back target — the collection this record belongs to (search preserved by caller). */
  backTo: To
  /** The collection name for the "Back to {collection}" label (E7 grammar). */
  backLabel: string
  /** Extra trailing controls (e.g. Task's collapse-to-split). */
  trailing?: ReactNode
}

export function RecordPageChrome({ backTo, backLabel, trailing }: RecordPageChromeProps) {
  const t = useT()
  return (
    <div className="record-page-chrome" data-viewer-region="page-chrome">
      <Link to={backTo} className="record-page-back">
        <BackIcon />
        <span>{t('record.backToCollection', { collection: backLabel })}</span>
      </Link>
      <span className="record-page-chrome__spacer" />
      {trailing}
    </div>
  )
}
