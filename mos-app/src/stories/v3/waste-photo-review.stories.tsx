import { useMemo, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { DataTable } from '@/components/dashboard/data-table'
import type { DataTableColumn } from '@/components/dashboard/data-table'
import { WastePhotoCapture } from '@/components/kitchen/waste-photo-capture'
import { WastePhotoStrip } from '@/components/kitchen/waste-photo-strip'
import type { KitchenWastePhoto } from '@/lib/db/kitchen-waste-photos'
import { useIsDesktop } from '@/shell/use-is-desktop'
import '@/pages/kitchen-review-page.css'
import './waste-photo-review.stories.css'

const meta = {
  title: 'Kitchen/Waste photo review',
  parameters: {
    docs: { description: { component: 'Development-only harnesses for the private photo capture component and the waste evidence row. Uploads and decisions are local simulations; no waste log is saved.' } },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function WastePhotoCaptureHarness() {
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  return (
    <main className="waste-harness">
      <header className="waste-harness-header">
        <span className="waste-harness-eyebrow">Development harness · not connected to storage</span>
        <h1>Record waste evidence</h1>
        <p>Photograph the item before submitting. Choose images from your device or open the phone camera.</p>
      </header>
      <WastePhotoCapture
        wasteLogId="storybook-only"
        onUpload={async () => new Promise<void>(resolve => window.setTimeout(() => resolve(), 350))}
        onCanSubmitChange={setReady}
      />
      <div className="waste-harness-submit">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!ready}
          onClick={() => setMessage('Harness only — no waste log was saved.')}
        >
          Submit waste log
        </button>
        {message && <p role="status">{message}</p>}
      </div>
    </main>
  )
}

function fixturePhotos(): KitchenWastePhoto[] {
  const styles = getComputedStyle(document.documentElement)
  const color = (token: string) => styles.getPropertyValue(token).trim() || 'currentColor'
  const background = color('--background')
  const foreground = color('--foreground')
  const accent = color('--accent')
  const warning = color('--warning')
  const artwork = (highlight: string, label: string) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240"><rect width="360" height="240" fill="${background}"/><circle cx="286" cy="42" r="86" fill="${accent}" opacity=".18"/><path d="M58 152h244l-24 42H82z" fill="${foreground}"/><ellipse cx="180" cy="148" rx="123" ry="38" fill="${background}"/><ellipse cx="180" cy="141" rx="104" ry="25" fill="${warning}"/><path d="M101 138c13-25 36-31 51-8 16-22 38-20 48 3 17-18 38-12 52 8-37 20-112 22-151-3" fill="${highlight}"/><circle cx="127" cy="130" r="7" fill="${accent}"/><circle cx="213" cy="134" r="6" fill="${accent}"/><text x="180" y="222" text-anchor="middle" fill="${foreground}" font-family="system-ui,sans-serif" font-size="12" letter-spacing="2">${label}</text></svg>`
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
  }
  return [
    { logId: 'story-waste-1', path: 'fixture/01.jpg', url: artwork(accent, 'BEFORE CLEANUP') },
    { logId: 'story-waste-1', path: 'fixture/02.jpg', url: artwork(warning, 'ITEM CONDITION') },
    { logId: 'story-waste-1', path: 'fixture/03.jpg', url: artwork(foreground, 'DISPOSAL') },
  ]
}

type WasteRow = {
  id: string
  item: string
  quantity: string
  submittedBy: string
  submittedAt: string
  evidence: KitchenWastePhoto[]
}

const row: Omit<WasteRow, 'evidence'> = {
  id: 'story-waste-1',
  item: 'Ayam Bakar · kitchen',
  quantity: '2.5 kg',
  submittedBy: 'Rani Puspita',
  submittedAt: '09:42',
}

const columns: DataTableColumn<WasteRow>[] = [
  {
    key: 'item',
    header: 'Waste item',
    cardLabel: '',
    render: (log) => (
      <>
        <span className="krow-name">{log.item}</span>
        <WastePhotoStrip photos={log.evidence} />
      </>
    ),
  },
  {
    key: 'quantity',
    header: 'Recorded quantity',
    render: (log) => <span className="krow-qty"><strong>{log.quantity}</strong><span className="krow-meta">· ESB unit</span></span>,
  },
  { key: 'submittedBy', header: 'Submitted by', render: log => <span className="krow-byname">{log.submittedBy}</span> },
  { key: 'submittedAt', header: 'Time', render: log => <span className="krow-time">{log.submittedAt}</span> },
  {
    key: 'decision',
    header: 'Review',
    render: () => <span className="waste-review-held">ESB posting held</span>,
  },
]

function ReviewRowHarness() {
  const isDesktop = useIsDesktop()
  const evidence = useMemo(fixturePhotos, [])
  const reviewRow = useMemo(() => ({ ...row, evidence }), [evidence])
  return (
    <main className="waste-harness">
      <header className="waste-harness-header waste-harness-header--review">
        <span className="waste-harness-eyebrow">Development fixture · no database data</span>
        <h1>Kitchen review</h1>
        <p>Waste evidence stays beside its item. ESB posting remains held while mapping is verified.</p>
      </header>
      <section className="kr-block waste-review-fixture" aria-labelledby="waste-review-group">
        <h2 id="waste-review-group">Waste <span>1 item · 3 photos</span></h2>
        <DataTable
          columns={columns}
          rows={[reviewRow]}
          isDesktop={isDesktop}
          caption="Waste review with private photo evidence"
          renderCard={(log) => (
            <div className="krow-card">
              <div className="krow-card-head"><span className="krow-name">{log.item}</span><span className="waste-review-held">ESB held</span></div>
              <WastePhotoStrip photos={log.evidence} />
              <div className="krow-card-meta"><strong>{log.quantity}</strong><span className="krow-meta">ESB unit · {log.submittedBy} · {log.submittedAt}</span></div>
            </div>
          )}
        />
      </section>
    </main>
  )
}

export const CaptureHarness: Story = { render: () => <WastePhotoCaptureHarness /> }
export const ReviewEvidenceRow: Story = { render: () => <ReviewRowHarness /> }
