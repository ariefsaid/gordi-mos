import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CafeStreamBar } from './cafe-stream-bar'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'

afterEach(cleanup)

const hq = { id: 'b1', code: 'ghq', name: 'Gordi HQ' }
const cikal = { id: 'b2', code: 'cikal', name: 'Cikal' }
const hqBar: ProductionStream = { branch: hq, activity: 'bar', produces: true }
const hqKitchen: ProductionStream = { branch: hq, activity: 'kitchen', produces: true }
const cikalBar: ProductionStream = { branch: cikal, activity: 'bar', produces: true }

describe('Café switch menu', () => {
  it('lists the current stream, marked, under "This branch", and other branches under their own heading', () => {
    const onChange = vi.fn()
    render(<CafeStreamBar options={[hqBar, hqKitchen, cikalBar]} stream={hqBar} locationBranchId="b1" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch bar' }))
    const list = screen.getByRole('listbox')
    expect(within(list).getByText('This branch')).toBeInTheDocument()
    expect(within(list).getByText('Other branches')).toBeInTheDocument()
    const options = within(list).getAllByRole('option')
    expect(options.map(option => option.textContent)).toEqual(['Gordi HQ · Bar', 'Gordi HQ · Kitchen', 'Cikal · Bar'])
    expect(options.map(option => option.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    // Choosing where you already are changes nothing; choosing another stream switches.
    fireEvent.click(options[0])
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Switch bar' }))
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Cikal · Bar'))
    expect(onChange).toHaveBeenCalledWith(cikalBar)
  })

  it('offers one entry per stream, bar-only and receiving-only ones included, headed "Branch · Activity"', () => {
    const receiving: ProductionStream = { branch: cikal, activity: 'kitchen', produces: false }
    render(<CafeStreamBar options={[hqKitchen, hqBar, cikalBar, receiving]} stream={hqKitchen} locationBranchId="b1" onChange={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Gordi HQ · Kitchen' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Switch kitchen' }))
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options.map(option => option.textContent)).toEqual([
      'Gordi HQ · Bar', 'Gordi HQ · Kitchen', 'Cikal · Bar', expect.stringMatching(/^Cikal · Kitchen/),
    ])
  })
})
