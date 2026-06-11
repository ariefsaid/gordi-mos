import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TasksPage from './TasksPage'
import UpdatesPage from './UpdatesPage'
import OpsPage from './OpsPage'

// AC-007: section empty shells render correct copy with no roadmap/phase wording
describe('AC-007: Section empty shells', () => {
  it('TasksPage: title "Tasks", empty headline, explainer, no phase wording', () => {
    render(
      <MemoryRouter>
        <TasksPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    expect(screen.getByText('No tasks yet.')).toBeInTheDocument()
    expect(
      screen.getByText('Tasks you\'re Responsible or Accountable for will show up here.'),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/phase|roadmap|coming soon|Phase 2/i)
  })

  it('UpdatesPage: title "Updates", empty headline, explainer, no phase wording', () => {
    render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Updates' })).toBeInTheDocument()
    expect(screen.getByText('No weekly updates yet.')).toBeInTheDocument()
    expect(
      screen.getByText('Weekly updates from you and your team will show up here.'),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/phase|roadmap|coming soon|Phase 2/i)
  })

  it('OpsPage: title "Ops", empty headline, explainer, no phase wording', () => {
    render(
      <MemoryRouter>
        <OpsPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Ops' })).toBeInTheDocument()
    expect(screen.getByText('No ops events yet.')).toBeInTheDocument()
    expect(
      screen.getByText('Events from the floor will show up here as they\'re logged.'),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/phase|roadmap|coming soon|Phase 2/i)
  })
})

// FIX-3: Empty states are NOT text-centered (left-aligned per mockup anti-slop note)
describe('FIX-3: Empty state containers are left-aligned (not text-center)', () => {
  it('TasksPage empty container does NOT have text-center class', () => {
    const { container } = render(
      <MemoryRouter>
        <TasksPage />
      </MemoryRouter>,
    )
    const emptyDiv = container.querySelector('.bg-card.border.border-border.rounded-md')
    expect(emptyDiv).toBeTruthy()
    expect(emptyDiv!.className).not.toMatch(/text-center/)
  })

  it('UpdatesPage empty container does NOT have text-center class', () => {
    const { container } = render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    )
    const emptyDiv = container.querySelector('.bg-card.border.border-border.rounded-md')
    expect(emptyDiv).toBeTruthy()
    expect(emptyDiv!.className).not.toMatch(/text-center/)
  })

  it('OpsPage empty container does NOT have text-center class', () => {
    const { container } = render(
      <MemoryRouter>
        <OpsPage />
      </MemoryRouter>,
    )
    const emptyDiv = container.querySelector('.bg-card.border.border-border.rounded-md')
    expect(emptyDiv).toBeTruthy()
    expect(emptyDiv!.className).not.toMatch(/text-center/)
  })
})

// AC-004 title portion: section pages set document.title
describe('AC-004: Document title per section page', () => {
  it('TasksPage sets document.title to "Tasks — Gordi MOS"', () => {
    render(
      <MemoryRouter>
        <TasksPage />
      </MemoryRouter>,
    )
    expect(document.title).toBe('Tasks — Gordi MOS')
  })

  it('UpdatesPage sets document.title to "Updates — Gordi MOS"', () => {
    render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    )
    expect(document.title).toBe('Updates — Gordi MOS')
  })

  it('OpsPage sets document.title to "Ops — Gordi MOS"', () => {
    render(
      <MemoryRouter>
        <OpsPage />
      </MemoryRouter>,
    )
    expect(document.title).toBe('Ops — Gordi MOS')
  })
})
