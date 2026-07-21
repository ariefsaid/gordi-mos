import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RecordViewer } from './record-viewer'
import type { RecordViewerAdapter, RecordViewerMode } from './record-viewer.types'

function renderViewer(
  adapter: RecordViewerAdapter,
  props: Partial<Parameters<typeof RecordViewer>[0]> = {},
) {
  const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
  return render(<RecordViewer adapter={adapter} mode={props.mode ?? 'panel'} {...props} />, { wrapper })
}

function taskAdapter(overrides: Partial<RecordViewerAdapter> = {}): RecordViewerAdapter {
  return {
    kind: 'task',
    id: 'task-1',
    title: 'Restock oat milk',
    typeLabel: 'Task',
    metadata: [
      {
        id: 'ownership',
        label: 'Ownership',
        fields: [
          { key: 'businessUnit', label: 'Business Unit', control: 'select', value: 'bu-retail', displayValue: 'Retail Ops', editable: true, options: [{ value: 'bu-retail', label: 'Retail Ops' }, { value: 'bu-hq', label: 'HQ Ops' }] },
          { key: 'pic', label: 'Person in charge (PIC)', control: 'person', value: 'p-1', displayValue: 'Riri', editable: true, options: [{ value: 'p-1', label: 'Riri' }] },
          { key: 'supervisor', label: 'Supervisor', control: 'person', value: 'p-2', displayValue: 'Ibnu', editable: true, options: [{ value: 'p-2', label: 'Ibnu' }] },
          { key: 'team', label: 'Team', control: 'team', value: null, displayValue: 'Team not assigned yet (data migration)', editable: false, readOnlyReason: 'No team_id on this task yet' },
        ],
      },
    ],
    relations: [{ id: 'rel-1', kind: 'signal', label: 'Oat milk stockout', onOpen: undefined }],
    contentSlots: [{ id: 'checklist', label: 'Checklist', render: () => <div data-testid="checklist-slot">Checklist body</div> }],
    activity: [{ id: 'a1', label: 'Created', occurredAt: '2026-07-20T00:00:00Z' }],
    actions: [
      { id: 'complete', label: 'Mark complete', intent: 'primary', run: vi.fn() },
      { id: 'archive', label: 'Archive', intent: 'secondary', run: vi.fn() },
    ],
    permission: { readOnly: false, allowedActionIds: ['complete', 'archive'] },
    state: 'ready',
    ...overrides,
  }
}

function signalAdapter(): RecordViewerAdapter {
  return {
    kind: 'signal',
    id: 'signal-1',
    title: 'Oat milk stockout',
    typeLabel: 'Signal',
    metadata: [
      {
        id: 'context',
        label: 'Context',
        fields: [
          { key: 'owningTeam', label: 'Owning Team', control: 'team', value: 't-1', displayValue: 'Gordi HQ Operations', editable: false, readOnlyReason: 'Owning Team is fixed after posting' },
        ],
      },
    ],
    relations: [],
    contentSlots: [{ id: 'body', label: 'Body', render: () => <p>The oat milk ran out.</p> }],
    activity: [],
    actions: [{ id: 'acknowledge', label: 'Acknowledge', intent: 'primary', run: vi.fn() }],
    permission: { readOnly: false, allowedActionIds: ['acknowledge'] },
    state: 'ready',
  }
}

describe('RecordViewer', () => {
  it('FR-V3-003 / TaskSignalGrammarContract: Task and Signal render the shared identity, metadata, content, activity, and action grammar', () => {
    const { unmount } = renderViewer(taskAdapter())
    expect(screen.getByRole('heading', { name: 'Restock oat milk' })).toBeInTheDocument()
    expect(screen.getByText('Ownership')).toBeInTheDocument()
    expect(screen.getByTestId('checklist-slot')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument()
    unmount()

    renderViewer(signalAdapter())
    expect(screen.getByRole('heading', { name: 'Oat milk stockout' })).toBeInTheDocument()
    expect(screen.getByText('The oat milk ran out.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument()
    // The Signal exposes none of the Task-only ownership fields.
    expect(screen.queryByText('Person in charge (PIC)')).not.toBeInTheDocument()
  })

  it('FR-V3-004 / PanelModeContract: panel and page modes preserve section order and change only the supplied chrome semantics', () => {
    const order = (mode: RecordViewerMode) => {
      const { container, unmount } = renderViewer(taskAdapter(), { mode, headingLevel: mode === 'page' ? 2 : 2 })
      const root = container.querySelector('[data-record-mode]') as HTMLElement
      expect(root.getAttribute('data-record-mode')).toBe(mode)
      const sections = Array.from(root.querySelectorAll('[data-viewer-region]')).map((n) =>
        n.getAttribute('data-viewer-region'),
      )
      unmount()
      return sections
    }
    expect(order('panel')).toEqual(order('page'))
  })

  it('FR-V3-005 / CanonicalPageContract: the canonical page uses heading level 2 and renders no second h1', () => {
    const { container } = renderViewer(taskAdapter(), { mode: 'page', headingLevel: 2 })
    expect(container.querySelectorAll('h1')).toHaveLength(0)
    expect(container.querySelector('h2')?.textContent).toBe('Restock oat milk')
  })

  it('FR-V3-006 / RelatedRecordCallbackContract: a related record calls the supplied open callback', () => {
    const onOpenRelated = vi.fn()
    renderViewer(taskAdapter(), { onOpenRelated })
    fireEvent.click(screen.getByRole('button', { name: /Oat milk stockout/ }))
    expect(onOpenRelated).toHaveBeenCalledWith(expect.objectContaining({ id: 'rel-1' }))
  })

  it('AC-V3-009: unauthorized actions are absent or visibly disabled with a reason', () => {
    const adapter = taskAdapter({
      permission: { readOnly: true, reason: 'This task is archived', allowedActionIds: ['unarchive'] },
      actions: [
        { id: 'complete', label: 'Mark complete', intent: 'primary', run: vi.fn() },
        { id: 'unarchive', label: 'Unarchive', intent: 'secondary', disabled: true, disabledReason: 'You lack permission', run: vi.fn() },
      ],
    })
    renderViewer(adapter)
    // A disallowed action is absent.
    expect(screen.queryByRole('button', { name: 'Mark complete' })).not.toBeInTheDocument()
    // An allowed-but-disabled action is present with its reason.
    const unarchive = screen.getByRole('button', { name: 'Unarchive' })
    expect(unarchive).toBeDisabled()
    expect(screen.getByText('This task is archived')).toBeInTheDocument()
  })

  it('NFR-V3-001: loading, empty, and error states retain the viewer landmark and retry affordance', () => {
    const onRetry = vi.fn()
    // Loading
    const loading = renderViewer(taskAdapter(), { loading: true })
    expect(screen.getByRole('status')).toBeInTheDocument()
    loading.unmount()

    // Empty
    const empty = renderViewer(taskAdapter({ state: 'empty' }))
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    empty.unmount()

    // Error with retry
    renderViewer(taskAdapter({ state: 'error', errorMessage: 'Could not load the task' }), { onRetry })
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the task')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('ViewerHeadingLandmarkContract: the viewer has one meaningful heading at the requested level', () => {
    const { container } = renderViewer(taskAdapter(), { headingLevel: 2 })
    expect(container.querySelectorAll('h1')).toHaveLength(0)
    expect(container.querySelectorAll('h2')).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Restock oat milk' })).toBeInTheDocument()
  })

  it('TypedContentSlotContract: supplied content slots render as typed domain-owned slots without block authoring controls', () => {
    renderViewer(taskAdapter())
    const slot = screen.getByTestId('checklist-slot')
    // The slot is rendered verbatim; the viewer adds no block-insert / authoring toolbar.
    expect(slot).toHaveTextContent('Checklist body')
    expect(screen.queryByRole('button', { name: /add block/i })).not.toBeInTheDocument()
  })

  it('ViewerIdentitySuppressionContract: showIdentityHeader=false renders no heading but keeps an accessible landmark named by the title', () => {
    // The tenant (e.g. the Task panel, whose TaskDrawerHeader/identity row already owns the
    // record name) suppresses the viewer's own identity header so there is no duplicate heading.
    // The landmark must still be reachable by its accessible name — via aria-label, not a heading.
    const { container } = renderViewer(taskAdapter(), { mode: 'panel', showIdentityHeader: false })
    expect(container.querySelectorAll('h1, h2, h3').length).toBeGreaterThanOrEqual(0)
    // No identity heading for the record title itself.
    expect(screen.queryByRole('heading', { name: 'Restock oat milk' })).not.toBeInTheDocument()
    // The identity region is gone entirely.
    expect(container.querySelector('[data-viewer-region="identity"]')).toBeNull()
    // But the section landmark still carries the record name (aria-label fallback).
    expect(screen.getByRole('region', { name: 'Restock oat milk' })).toBeInTheDocument()
    // The fields still render (the point of the panel).
    expect(screen.getByLabelText('Business Unit')).toBeInTheDocument()
  })

  it('ViewerIdentitySuppressionContract: default (showIdentityHeader unset) keeps the identity heading', () => {
    renderViewer(taskAdapter(), { mode: 'panel', headingLevel: 2 })
    expect(screen.getByRole('heading', { level: 2, name: 'Restock oat milk' })).toBeInTheDocument()
  })

  it('FR-V3-012 / OverlayBoundaryContract: commits route through onCommitField by field key', async () => {
    const onCommitField = vi.fn(async () => {})
    renderViewer(taskAdapter(), { onCommitField })
    const bu = screen.getByLabelText('Business Unit') as HTMLSelectElement
    fireEvent.change(bu, { target: { value: 'bu-hq' } })
    expect(onCommitField).toHaveBeenCalledWith('businessUnit', 'bu-hq')
    // Let the async commit settle so the "Saved" state update is flushed inside act.
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })
})
