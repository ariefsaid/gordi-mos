import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { BranchOption, KitchenMovement } from '@/lib/db/kitchen-logs.types'
import { MovementSeg } from './movement-seg'

const branches: BranchOption[] = [
  { id: 'branch-a', code: 'a', name: 'Rumah Rames' },
  { id: 'branch-b', code: 'b', name: 'Radiant' },
  { id: 'branch-c', code: 'c', name: 'Gordi HQ' },
]
const options: KitchenMovement[] = [
  { action: 'produce', destinationBranchId: null },
  { action: 'transfer', destinationBranchId: 'branch-b' },
  { action: 'transfer', destinationBranchId: 'branch-c' },
]

function Harness() {
  const [value, setValue] = useState(options[0])
  return <MovementSeg value={value} options={options} branches={branches} onChange={setValue} />
}

describe('MovementSeg keyboard contract', () => {
  it('uses one Tab stop and moves focus and selection with arrows, Home, and End', async () => {
    const user = userEvent.setup()
    render(<I18nProvider><Harness /></I18nProvider>)
    const tabs = screen.getAllByRole('tab')

    expect(tabs.map(tab => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
    tabs[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(tabs[1]).toHaveFocus()
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs.map(tab => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])

    await user.keyboard('{End}')
    expect(tabs[2]).toHaveFocus()
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Home}')
    expect(tabs[0]).toHaveFocus()
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })
})
