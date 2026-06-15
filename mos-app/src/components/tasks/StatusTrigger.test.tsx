import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatusTrigger } from './StatusTrigger'

describe('StatusTrigger', () => {
  it('renders the current status pill and opens a listbox of the 4 statuses', () => {
    render(<StatusTrigger status="Open" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /change status/i }))
    const opts = screen.getAllByRole('option')
    expect(opts).toHaveLength(4)
  })

  it('calls onChange with the picked status', () => {
    const onChange = vi.fn()
    render(<StatusTrigger status="Open" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /change status/i }))
    fireEvent.click(screen.getByRole('option', { name: /blocked/i }))
    expect(onChange).toHaveBeenCalledWith('Blocked')
  })
})
