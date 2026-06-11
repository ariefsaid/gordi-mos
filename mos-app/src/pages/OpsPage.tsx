import PageFrame from '../shell/PageFrame'
import PageHead from '../shell/PageHead'
import { useDocumentTitle } from '../shell/useDocumentTitle'

export default function OpsPage() {
  useDocumentTitle('Ops — Gordi MOS')

  return (
    <PageFrame>
      <PageHead title="Ops" />
      <div className="bg-card border border-border rounded-md p-8">
        <p className="font-semibold text-foreground" style={{ fontSize: 14 }}>
          No ops events yet.
        </p>
        <p className="text-muted-foreground mt-2" style={{ fontSize: 14 }}>
          Events from the floor will show up here as they're logged.
        </p>
      </div>
    </PageFrame>
  )
}
