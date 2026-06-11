// AC-coverage: TaskNewPlaceholder renders title + back-to-tasks link
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TaskNewPlaceholder from './TaskNewPlaceholder'

describe('TaskNewPlaceholder', () => {
  it('renders the "Create task" heading and a back-to-tasks link', () => {
    render(
      <MemoryRouter>
        <TaskNewPlaceholder />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /create task/i })).toBeTruthy()
    const backLink = screen.getByRole('link', { name: /back to tasks/i })
    expect(backLink).toBeTruthy()
    expect(backLink.getAttribute('href')).toContain('/tasks')
  })
})
