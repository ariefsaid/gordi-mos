import PageFrame from '../shell/PageFrame'
import PageHead from '../shell/PageHead'
import { useDocumentTitle } from '../shell/useDocumentTitle'

export default function UpdatesPage() {
  useDocumentTitle('Updates — Gordi MOS')

  return (
    <PageFrame>
      <PageHead title="Updates" />
      <div className="bg-card border border-border rounded-md p-8 text-center">
        <p className="font-semibold text-foreground" style={{ fontSize: 14 }}>
          No weekly updates yet.
        </p>
        <p className="text-muted-foreground mt-2" style={{ fontSize: 14 }}>
          Weekly updates from you and your team will show up here.
        </p>
      </div>
    </PageFrame>
  )
}
