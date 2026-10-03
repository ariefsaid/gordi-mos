import { useRef, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ModalShell } from '@/components/ui/modal-shell'
import { useEscapeLayer } from './use-escape-layer'

function PrimaryEscapeLayer({ onClose }: { onClose: () => void }) {
  const elementRef = useRef<HTMLDivElement>(null)
  useEscapeLayer(true, elementRef, onClose, {}, 'primary')
  return <div ref={elementRef} role="region" aria-label="Record panel" />
}

describe('useEscapeLayer', () => {
  it('keeps an open modal above a primary layer mounted afterward', async () => {
    const user = userEvent.setup()

    function Fixture() {
      const [modalOpen, setModalOpen] = useState(true)
      const [recordOpen, setRecordOpen] = useState(false)
      return (
        <>
          <ModalShell open={modalOpen} onClose={() => setModalOpen(false)} ariaLabel="Command menu">
            <button type="button" onClick={() => setRecordOpen(true)}>Open record</button>
          </ModalShell>
          {recordOpen && <PrimaryEscapeLayer onClose={() => setRecordOpen(false)} />}
        </>
      )
    }

    render(<Fixture />)
    await user.click(screen.getByRole('button', { name: 'Open record' }))
    expect(screen.getByRole('region', { name: 'Record panel' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Command menu' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Record panel' })).toBeInTheDocument()
    expect(screen.queryByTestId('modal-shell-scrim')).not.toBeInTheDocument()
  })
})
