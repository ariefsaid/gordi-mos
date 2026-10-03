import { useEffect, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalShell } from '@/components/ui/modal-shell'
import { RecordMenu } from './record-menu'

function MenuAndPalette() {
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <RecordMenu
        label="More actions"
        items={[
          { id: 'copy', label: 'Copy link', onSelect: () => {} },
          { id: 'archive', label: 'Archive', onSelect: () => {} },
        ]}
      />
      <ModalShell open={paletteOpen} onClose={() => setPaletteOpen(false)} ariaLabel="Command menu">
        <input aria-label="Search commands" onKeyDown={(event) => { if (event.key === 'ArrowDown') event.preventDefault() }} />
      </ModalShell>
    </>
  )
}

describe('record menu over the command palette', () => {
  it('Tab exits a portaled menu within its containing modal focus scope', async () => {
    const user = userEvent.setup()
    render(
      <ModalShell open onClose={() => {}} ariaLabel="Details">
        <RecordMenu
          label="Dialog actions"
          items={[
            { id: 'first', label: 'First action', onSelect: () => {} },
            { id: 'last', label: 'Last action', onSelect: () => {} },
          ]}
        />
        <button type="button">Next in dialog</button>
        <button type="button">Last in dialog</button>
      </ModalShell>,
    )
    const trigger = screen.getByRole('button', { name: 'Dialog actions' })
    await user.click(trigger)
    const menu = screen.getByRole('menu', { name: 'Dialog actions' })
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'First action' })).toHaveFocus())
    await user.keyboard('{End}{Tab}')
    await waitFor(() => expect(menu).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next in dialog' })).toHaveFocus())
  })

  it('keeps palette arrow navigation focused and Escape dismisses one layer at a time', async () => {
    const user = userEvent.setup()
    render(<MenuAndPalette />)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    await user.click(trigger)
    const menu = screen.getByRole('menu')
    const firstItem = screen.getByRole('menuitem', { name: 'Copy link' })
    await waitFor(() => expect(firstItem).toHaveFocus())

    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const palette = await screen.findByRole('dialog', { name: 'Command menu' })
    const search = screen.getByRole('textbox', { name: 'Search commands' })
    await waitFor(() => expect(search).toHaveFocus())

    await user.keyboard('{ArrowDown}')
    expect(search).toHaveFocus()
    expect(menu).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(palette).not.toBeInTheDocument()
    expect(menu).toBeInTheDocument()
    expect(firstItem).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
