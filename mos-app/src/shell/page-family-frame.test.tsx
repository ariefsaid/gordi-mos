import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  PAGE_FAMILIES,
  PAGE_FAMILY_CONTRACTS,
} from './page-families'
import { PageFamilyFrame } from './page-family-frame'

describe('PageFamilyFrame — V3 page-family contract', () => {
  it('defines exactly the three approved page families and their head grammar', () => {
    expect(PAGE_FAMILIES).toEqual(['workspace', 'focused-record', 'management'])
    expect(PAGE_FAMILY_CONTRACTS.workspace.headVariant).toBe('content')
    expect(PAGE_FAMILY_CONTRACTS['focused-record'].headVariant).toBe('prose')
    expect(PAGE_FAMILY_CONTRACTS.management.headVariant).toBe('content')
  })

  it('renders one shared main and h1 while preserving typed children and job copy', () => {
    const jobSentence = 'Find and update the tasks your Team owns.'
    const { container } = render(
      <PageFamilyFrame
        family="workspace"
        title="Tasks"
        subtitle="Roastery Team"
        jobSentence={jobSentence}
      >
        <section data-testid="typed-task-body">Task rows</section>
      </PageFamilyFrame>,
    )

    const main = container.querySelector('main')
    expect(container.querySelectorAll('main')).toHaveLength(1)
    expect(main).toHaveAttribute('data-page-family', 'workspace')
    expect(main).toHaveAttribute('data-page-state', 'default')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toBeInTheDocument()
    expect(screen.getByText(jobSentence)).toBeInTheDocument()
    expect(screen.getByText('Roastery Team')).toBeInTheDocument()
    expect(screen.getByTestId('typed-task-body')).toHaveTextContent('Task rows')

    for (const internalFamilyName of ['Workspace', 'Focused record', 'Management']) {
      expect(screen.queryByText(internalFamilyName, { exact: true })).not.toBeInTheDocument()
    }
  })

  it('marks saving state busy without replacing the domain body', () => {
    const { container } = render(
      <PageFamilyFrame
        family="focused-record"
        title="Open task"
        jobSentence="Review and update this task."
        state="saving"
      >
        <article data-testid="typed-record-body">Checklist</article>
      </PageFamilyFrame>,
    )

    const main = container.querySelector('main')
    expect(main).toHaveAttribute('data-page-family', 'focused-record')
    expect(main).toHaveAttribute('data-page-state', 'saving')
    expect(main).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByTestId('typed-record-body')).toHaveTextContent('Checklist')
    expect(screen.getByText('Review and update this task.')).toBeInTheDocument()
  })
})
