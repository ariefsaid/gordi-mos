import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommentThread, type TaskComment } from './CommentThread'
import type { PersonOption } from '@/lib/db/directory'

const people: PersonOption[] = [
  { id: 'p1', full_name: 'Arief Said' },
  { id: 'p2', full_name: 'Riri Kitchen' },
]

const comments: TaskComment[] = [
  { id: 'c1', author_id: 'p1', body: 'Please check this', created_at: '2026-07-05T01:00:00Z' },
]

describe('CommentThread (T28, AC-P3-CM-004)', () => {
  it('renders existing comments with author names', () => {
    render(<CommentThread comments={comments} people={people} canPost onPost={vi.fn()} />)

    expect(screen.getByRole('region', { name: /comments/i })).toBeInTheDocument()
    expect(screen.getByText('Arief Said')).toBeInTheDocument()
    expect(screen.getByText('Please check this')).toBeInTheDocument()
  })

  it('posts a typed comment', async () => {
    const onPost = vi.fn().mockResolvedValue(undefined)
    render(<CommentThread comments={[]} people={people} canPost onPost={onPost} />)

    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), {
      target: { value: 'Ship it' },
    })
    fireEvent.click(screen.getByRole('button', { name: /post comment/i }))

    await waitFor(() => expect(onPost).toHaveBeenCalledWith('Ship it'))
    expect(screen.getByRole('textbox', { name: /comment/i })).toHaveValue('')
  })

  it('typing @ shows a person picker and selecting a person inserts their slug', () => {
    render(<CommentThread comments={[]} people={people} canPost onPost={vi.fn()} />)

    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), {
      target: { value: 'Please ask @' },
    })

    expect(screen.getByRole('listbox', { name: /select person/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /riri kitchen/i }))

    expect(screen.getByRole('textbox', { name: /comment/i })).toHaveValue('Please ask @riri ')
  })
})
