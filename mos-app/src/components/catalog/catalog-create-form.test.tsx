// The ONE create form for Projects & Processes and Objectives (ui-855 defects 1-3, addendum C2):
// visible labels + a required marker on Name, per-field validation under its own control, and a
// primary button labelled by the actual action, not a generic "Save".
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { CatalogCreateForm } from './catalog-create-form'
import type { CatalogCreateDraft } from './catalog-collection-actions'

function workLineDraft(overrides: Partial<CatalogCreateDraft> = {}): CatalogCreateDraft {
  return {
    kind: 'work-line',
    open: true,
    name: '',
    type: 'project',
    objectiveId: null,
    adding: false,
    error: '',
    onNameChange: vi.fn(),
    onTypeChange: vi.fn(),
    onObjectiveChange: vi.fn(),
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
}

function renderForm(draft: CatalogCreateDraft) {
  return render(<I18nProvider><CatalogCreateForm draft={draft} /></I18nProvider>)
}

describe('CatalogCreateForm', () => {
  it('shows a visible Name label with a required marker, and no marker anywhere else', () => {
    renderForm(workLineDraft())
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('*')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
  })

  it('blocks submit on an empty Name, shows the error under Name, marks aria-invalid, and keeps the draft', () => {
    const onSubmit = vi.fn()
    renderForm(workLineDraft({ onSubmit }))
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))

    expect(onSubmit).not.toHaveBeenCalled()
    const name = screen.getByRole('textbox', { name: 'Name' })
    expect(name).toHaveAttribute('aria-invalid', 'true')
    const errorId = name.getAttribute('aria-describedby')
    expect(errorId).toBeTruthy()
    const error = document.getElementById(errorId!)
    expect(error).toHaveTextContent('Name is required')
    // The error sits immediately after the field it belongs to, not off in the footer.
    expect(name.closest('.ccf-field')).toContainElement(error)
    expect(name).toHaveFocus()
  })

  it('labels the primary action by the chosen Type — Create project, then Create process', () => {
    const { rerender } = render(
      <I18nProvider><CatalogCreateForm draft={workLineDraft({ type: 'project' })} /></I18nProvider>,
    )
    expect(screen.getByRole('button', { name: 'Create project' })).toBeInTheDocument()
    rerender(<I18nProvider><CatalogCreateForm draft={workLineDraft({ type: 'process' })} /></I18nProvider>)
    expect(screen.getByRole('button', { name: 'Create process' })).toBeInTheDocument()
  })

  it('labels the Objective primary action "Create objective"', () => {
    renderForm({
      kind: 'objective',
      open: true,
      name: '',
      adding: false,
      error: '',
      onNameChange: vi.fn(),
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
    })
    expect(screen.getByRole('button', { name: 'Create objective' })).toBeInTheDocument()
  })

  it('Escape cancels the whole draft without submitting', () => {
    const onCancel = vi.fn()
    const onSubmit = vi.fn()
    renderForm(workLineDraft({ name: 'Weekly stock opname', onCancel, onSubmit }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits once Name is filled', () => {
    const onSubmit = vi.fn()
    renderForm(workLineDraft({ name: 'Weekly stock opname', onSubmit }))
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('renders the Type picker as the second decision for a work-line draft, with a visible label', () => {
    renderForm(workLineDraft())
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeInTheDocument()
  })
})
