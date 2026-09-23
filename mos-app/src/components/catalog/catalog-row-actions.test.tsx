import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CatalogRowActions } from './catalog-row-actions'

describe('CatalogRowActions', () => {
  it('shows management actions in the desktop group', () => {
    render(<CatalogRowActions name="Quarterly plan" archived={false} canManage onRename={() => {}} onArchive={() => {}} onUnarchive={() => {}} />)
    expect(screen.getByRole('button', { name: 'Rename Quarterly plan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archive Quarterly plan' })).toBeInTheDocument()
  })

  it('opens an accessible compact menu and returns focus after Escape', async () => {
    const user = userEvent.setup()
    render(<CatalogRowActions name="Quarterly plan" archived={false} canManage onRename={() => {}} onArchive={() => {}} onUnarchive={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'More actions for Quarterly plan' })
    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Rename Quarterly plan' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(trigger).toHaveFocus()
  })

  it('only offers Unarchive for archived rows and no actions without permission', () => {
    const { rerender } = render(<CatalogRowActions name="Old plan" archived canManage onRename={() => {}} onArchive={() => {}} onUnarchive={() => {}} />)
    expect(screen.getByRole('button', { name: 'Unarchive Old plan' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Old plan' }))
    expect(screen.getByRole('menuitem', { name: 'Unarchive Old plan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive Old plan' })).toBeNull()
    rerender(<CatalogRowActions name="Old plan" archived={false} canManage={false} onRename={() => {}} onArchive={() => {}} onUnarchive={() => {}} />)
    expect(screen.queryByRole('button', { name: /actions for Old plan/i })).toBeNull()
  })
})
